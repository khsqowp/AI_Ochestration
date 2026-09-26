#!/usr/bin/env python3
"""Auto-decode / hash-identify / crack an unknown-looking value.

Given a string that "looks encoded or hashed", this tool:
  1. Tries a chain of reversible decodings (base64/base64url/hex/base32/
     URL-encoding/ROT13) up to a small recursion depth, and reports any
     that produce printable text.
  2. Identifies likely hash/digest formats from length + charset + prefix
     (md5/sha1/sha256/sha512, bcrypt, md5-crypt, sha256-crypt, sha512-crypt,
     phpBB/phpass, Django PBKDF2, NTLM-shaped, etc.) -- heuristic, like the
     classic "hashid" tool.
  3. For fast unsalted digests (md5/sha1/sha256/sha384/sha512), runs a local
     dictionary attack directly in Python (bounded, no GPU needed).
  4. For anything hashcat/john would be a better fit for (bcrypt, crypt
     formats, salted/keyed formats, or when you want GPU speed), prints a
     ready-to-run hashcat and john command line using the local installs
     under ../hashcat and ../john -- it does NOT execute them itself,
     since those can run for a very long time and should be started
     deliberately by you.

No real rainbow-table files are bundled here (those are large precomputed
files this toolset never downloaded) -- dictionary attacks via hashcat/john
against the bundled SecLists wordlists are the practical equivalent for
unsalted fast hashes, and the only sane approach for salted ones.

Usage:
    python crypto_identifier.py "aGVsbG8gd29ybGQ="
    python crypto_identifier.py "5d41402abc4b2a76b9719d911017c592" --crack
    python crypto_identifier.py "$2b$12$abc..." --crack
    python crypto_identifier.py --file value.txt
"""
from __future__ import annotations

import argparse
import base64
import binascii
import codecs
import json
import logging
import re
import shutil
import sys
import time
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger("crypto_identifier")

TOOLS_DIR = Path(__file__).resolve().parent.parent
SECLISTS_PASSWORDS_DIR = TOOLS_DIR / "SecLists-master" / "Passwords"
DEFAULT_WORDLIST = SECLISTS_PASSWORDS_DIR / "Common-Credentials" / "10k-most-common.txt"
DEFAULT_CRACK_LIMIT = 500_000
MAX_DECODE_DEPTH = 3

HASHCAT_EXE = TOOLS_DIR / "hashcat" / "hashcat-7.1.2" / "hashcat.exe"
JOHN_EXE = TOOLS_DIR / "john" / "john-1.9.0-jumbo-1-win64" / "run" / "john.exe"


# ---------------------------------------------------------------------------
# 1. Decoding chain
# ---------------------------------------------------------------------------
@dataclass
class DecodeStep:
    method: str
    result: str


def _is_mostly_printable(data: bytes) -> bool:
    if not data:
        return False
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        return False
    printable = sum(1 for ch in text if ch.isprintable() or ch in "\r\n\t")
    return printable / len(text) > 0.9


def _try_decoders(value: str) -> list[DecodeStep]:
    candidates: list[DecodeStep] = []
    stripped = value.strip()

    if re.fullmatch(r"[0-9a-fA-F]{2,}", stripped) and len(stripped) % 2 == 0:
        try:
            data = bytes.fromhex(stripped)
            if _is_mostly_printable(data):
                candidates.append(DecodeStep("hex", data.decode("utf-8")))
        except ValueError:
            pass

    for method, fn in (
        ("base64", lambda s: base64.b64decode(s + "=" * (-len(s) % 4))),
        ("base64url", lambda s: base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))),
    ):
        if re.fullmatch(r"[A-Za-z0-9+/_\-]{4,}=*", stripped):
            try:
                data = fn(stripped)
                if _is_mostly_printable(data):
                    candidates.append(DecodeStep(method, data.decode("utf-8")))
            except (binascii.Error, ValueError):
                pass

    if re.fullmatch(r"[A-Z2-7=]{8,}", stripped, re.IGNORECASE):
        try:
            data = base64.b32decode(stripped.upper())
            if _is_mostly_printable(data):
                candidates.append(DecodeStep("base32", data.decode("utf-8")))
        except (binascii.Error, ValueError):
            pass

    if "%" in stripped:
        from urllib.parse import unquote

        decoded = unquote(stripped)
        if decoded != stripped:
            candidates.append(DecodeStep("url-encoding", decoded))

    if re.fullmatch(r"[A-Za-z ]+", stripped):
        rot13 = codecs.encode(stripped, "rot_13")
        if rot13 != stripped:
            candidates.append(DecodeStep("rot13", rot13))

    return candidates


def decode_chain(value: str, depth: int = MAX_DECODE_DEPTH) -> list[list[DecodeStep]]:
    """Returns every distinct chain of decode steps (up to `depth` deep)
    that ends in mostly-printable text, shortest first."""
    results: list[list[DecodeStep]] = []
    seen: set[str] = set()

    def _walk(current: str, chain: list[DecodeStep], remaining: int) -> None:
        if remaining <= 0:
            return
        for step in _try_decoders(current):
            new_chain = chain + [step]
            key = "|".join(f"{s.method}:{s.result}" for s in new_chain)
            if key in seen:
                continue
            seen.add(key)
            results.append(new_chain)
            _walk(step.result, new_chain, remaining - 1)

    _walk(value.strip(), [], depth)
    return results


# ---------------------------------------------------------------------------
# 2. Hash / digest identification (heuristic, hashid-style)
# ---------------------------------------------------------------------------
@dataclass
class HashGuess:
    name: str
    hashcat_mode: int | None
    john_format: str | None
    confidence: str  # "likely" / "possible"
    crackable_locally: bool  # fast unsalted digest we can brute force in pure python


_PREFIX_RULES: list[tuple[str, HashGuess]] = [
    (r"^\$2[aby]\$", HashGuess("bcrypt", 3200, "bcrypt", "likely", False)),
    (r"^\$1\$", HashGuess("md5crypt", 500, "md5crypt", "likely", False)),
    (r"^\$5\$", HashGuess("sha256crypt", 7400, "sha256crypt", "likely", False)),
    (r"^\$6\$", HashGuess("sha512crypt", 1800, "sha512crypt", "likely", False)),
    (r"^\$argon2(i|d|id)\$", HashGuess("argon2", 13000, "argon2", "likely", False)),
    (r"^\$P\$", HashGuess("phpass (WordPress/phpBB)", 400, "phpass", "likely", False)),
    (r"^\$H\$", HashGuess("phpass (phpBB3 old)", 400, "phpass", "likely", False)),
    (r"^pbkdf2_sha256\$", HashGuess("Django PBKDF2-SHA256", 10000, "django", "likely", False)),
    (r"^\$apr1\$", HashGuess("Apache apr1-md5", 1600, "apr1crypt", "likely", False)),
    (r"^\{SSHA\}", HashGuess("Salted SHA1 (LDAP SSHA)", 111, "ssha", "likely", False)),
    (r"^\$krb5", HashGuess("Kerberos ticket hash", None, "krb5", "possible", False)),
]

_LENGTH_RULES: list[tuple[int, str, HashGuess]] = [
    (32, "hex", HashGuess("MD5 (or NTLM -- same length/charset)", 0, "raw-md5", "possible", True)),
    (40, "hex", HashGuess("SHA1 (or MySQL4.1+ without leading '*')", 100, "raw-sha1", "possible", True)),
    (56, "hex", HashGuess("SHA224", 1300, "raw-sha224", "possible", True)),
    (64, "hex", HashGuess("SHA256", 1400, "raw-sha256", "possible", True)),
    (96, "hex", HashGuess("SHA384", 10800, "raw-sha384", "possible", True)),
    (128, "hex", HashGuess("SHA512", 1700, "raw-sha512", "possible", True)),
]


def identify_hash(value: str) -> list[HashGuess]:
    stripped = value.strip()
    guesses: list[HashGuess] = []

    for pattern, guess in _PREFIX_RULES:
        if re.match(pattern, stripped):
            guesses.append(guess)

    if not guesses:
        body = stripped[1:] if stripped.startswith("*") else stripped  # MySQL old format prefixes '*'
        if re.fullmatch(r"[0-9a-fA-F]+", body):
            for length, _kind, guess in _LENGTH_RULES:
                if len(body) == length:
                    guesses.append(guess)

    return guesses


# ---------------------------------------------------------------------------
# 3. Local dictionary crack for fast unsalted digests
# ---------------------------------------------------------------------------
import hashlib

_HASHLIB_BY_NAME = {
    "raw-md5": hashlib.md5,
    "raw-sha1": hashlib.sha1,
    "raw-sha224": hashlib.sha224,
    "raw-sha256": hashlib.sha256,
    "raw-sha384": hashlib.sha384,
    "raw-sha512": hashlib.sha512,
}


def resolve_wordlist_path(spec: str) -> Path:
    direct = Path(spec)
    if direct.is_file():
        return direct
    for candidate in (
        SECLISTS_PASSWORDS_DIR / spec,
        SECLISTS_PASSWORDS_DIR / "Common-Credentials" / spec,
    ):
        if candidate.is_file():
            return candidate
    raise FileNotFoundError(f"Wordlist not found: {spec!r} (checked as a direct path and under {SECLISTS_PASSWORDS_DIR})")


def crack_fast_digest(target_hex: str, john_format: str, wordlist_path: Path, limit: int) -> tuple[str | None, int]:
    ctor = _HASHLIB_BY_NAME[john_format]
    target_hex = target_hex.lower().lstrip("*")
    count = 0
    with wordlist_path.open("r", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            word = line.rstrip("\n\r")
            if not word:
                continue
            count += 1
            if count > limit:
                break
            if ctor(word.encode("utf-8")).hexdigest() == target_hex:
                return word, count
    return None, count


# ---------------------------------------------------------------------------
# hashcat / john command builders (printed, never auto-executed for slow formats)
# ---------------------------------------------------------------------------
def build_hashcat_command(guess: HashGuess, hash_value: str, wordlist_path: Path) -> str | None:
    if guess.hashcat_mode is None or not HASHCAT_EXE.is_file():
        return None
    return f'"{HASHCAT_EXE}" -m {guess.hashcat_mode} -a 0 "{hash_value}" "{wordlist_path}"'


def build_john_command(guess: HashGuess, hash_file: str, wordlist_path: Path) -> str | None:
    if guess.john_format is None or not JOHN_EXE.is_file():
        return None
    return f'"{JOHN_EXE}" --format={guess.john_format} --wordlist="{wordlist_path}" "{hash_file}"'


def _emit_json(report: dict, output_file: str | None) -> None:
    text = json.dumps(report, indent=2, ensure_ascii=False)
    if output_file:
        Path(output_file).write_text(text, encoding="utf-8")
    else:
        print(text)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="crypto_identifier", description="Auto-decode and hash-identify/crack an unknown value.")
    parser.add_argument("value", nargs="?", default=None, help="The suspicious value to analyze")
    parser.add_argument("--file", default=None, help="Read the value from this file instead of the positional arg")
    parser.add_argument("--crack", action="store_true", help="Attempt a local dictionary crack for fast unsalted digest guesses")
    parser.add_argument("--wordlist", default=str(DEFAULT_WORDLIST), help="Path or short name for --crack (default: SecLists 10k-most-common.txt)")
    parser.add_argument("--limit", type=int, default=DEFAULT_CRACK_LIMIT, help=f"Max words to try for --crack (default {DEFAULT_CRACK_LIMIT})")
    parser.add_argument("--output", choices=["console", "json"], default="console", help="Report format (default console)")
    parser.add_argument("--output-file", default=None, help="Write report to this path instead of stdout (both --output modes)")
    parser.add_argument("-v", "--verbose", action="store_true", help="Verbose logging")
    return parser


def _interactive_argv(parser: argparse.ArgumentParser) -> list[str] | None:
    """Number-driven interactive menu: builds an argv list from the parser's own
    option definitions, so it stays in sync automatically as options change."""
    positionals = [a for a in parser._actions if not a.option_strings]
    optionals = [a for a in parser._actions if a.option_strings and a.dest != "help"]

    print(f"\n=== {parser.prog} 대화형 모드 ===")
    print("(필수 값부터 입력 -> 옵션은 번호로 설정/토글 -> 0=실행, q=취소)\n")

    pos_values: dict[str, str] = {}
    for act in positionals:
        optional_pos = act.nargs == "?"
        suffix = " [선택, Enter=생략]" if optional_pos else ""
        label = f"{act.dest}" + (f" ({act.help})" if act.help else "") + suffix
        while True:
            v = input(f"{label}: ").strip()
            if v:
                pos_values[act.dest] = v
                break
            if optional_pos:
                break
            print("  필수 입력값입니다.")

    opt_values: dict[str, object] = {}
    while True:
        print("\n-- 옵션 목록 --")
        for i, act in enumerate(optionals, start=1):
            name = act.option_strings[0]
            if isinstance(act, argparse._StoreTrueAction):
                state = "ON" if opt_values.get(act.dest) else "off"
            elif isinstance(act, argparse._AppendAction):
                cur = opt_values.get(act.dest) or []
                state = f"{len(cur)}개 등록됨" if cur else "(없음)"
            elif act.dest in opt_values:
                v = opt_values[act.dest]
                state = "(기본값 사용)" if v is True else str(v)
            else:
                state = f"(기본값: {act.default})" if act.default is not None else "(미설정)"
            req = " *필수" if getattr(act, "required", False) else ""
            choices = f" 선택지:{','.join(map(str, act.choices))}" if act.choices else ""
            print(f"  {i:>2}. {name:<20} = {state:<22}{req}  {act.help or ''}{choices}")
        choice = input("\n번호 선택 (0=실행, q=취소): ").strip().lower()
        if choice == "q":
            return None
        if choice == "0":
            missing = [a.option_strings[0] for a in optionals if getattr(a, "required", False) and a.dest not in opt_values]
            if missing:
                print(f"  필수 옵션 미설정: {', '.join(missing)}")
                continue
            break
        if not choice.isdigit() or not (1 <= int(choice) <= len(optionals)):
            print("  잘못된 번호입니다.")
            continue
        act = optionals[int(choice) - 1]
        if isinstance(act, argparse._StoreTrueAction):
            opt_values[act.dest] = not opt_values.get(act.dest, False)
        elif isinstance(act, argparse._AppendAction):
            print(f"  {act.option_strings[0]} 값 반복 입력, 빈 줄이면 종료:")
            items: list[str] = []
            while True:
                v = input("    + ").strip()
                if not v:
                    break
                items.append(v)
            opt_values[act.dest] = items
        elif act.nargs == "?":
            v = input(f"  {act.option_strings[0]} 값 (비우고 Enter=기본값 '{act.const}' 사용): ").strip()
            opt_values[act.dest] = v if v else True
        else:
            v = input(f"  {act.option_strings[0]} 값 (빈 줄=설정 해제): ").strip()
            if v:
                opt_values[act.dest] = v
            else:
                opt_values.pop(act.dest, None)

    argv: list[str] = [pos_values[a.dest] for a in positionals if a.dest in pos_values]
    for act in optionals:
        if act.dest not in opt_values:
            continue
        val = opt_values[act.dest]
        if isinstance(act, argparse._StoreTrueAction):
            if val:
                argv.append(act.option_strings[0])
        elif isinstance(act, argparse._AppendAction):
            for item in val:
                argv += [act.option_strings[0], item]
        elif act.nargs == "?":
            argv.append(act.option_strings[0])
            if val is not True:
                argv.append(val)
        else:
            argv += [act.option_strings[0], str(val)]
    return argv


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass

    parser = build_arg_parser()
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format="%(message)s", stream=sys.stderr)

    if args.file:
        value = Path(args.file).read_text(encoding="utf-8").strip()
    elif args.value:
        value = args.value
    else:
        parser.error("value 인자 또는 --file 중 하나는 필요함")
        return 2

    chains = decode_chain(value)
    guesses = identify_hash(value)

    report: dict = {
        "input": value,
        "decode_chains": [
            {
                "path": " -> ".join(step.method for step in chain),
                "steps": [step.method for step in chain],
                "result": chain[-1].result,
            }
            for chain in chains
        ],
        "hash_guesses": [
            {
                "name": g.name, "confidence": g.confidence, "hashcat_mode": g.hashcat_mode,
                "john_format": g.john_format, "crackable_locally": g.crackable_locally,
            }
            for g in guesses
        ],
    }

    wordlist_path: Path | None = None
    wordlist_error: str | None = None
    if guesses:
        try:
            wordlist_path = resolve_wordlist_path(args.wordlist)
        except FileNotFoundError as exc:
            wordlist_error = str(exc)
            if args.crack:
                logger.error(wordlist_error)
                if args.output == "json":
                    _emit_json({**report, "error": wordlist_error}, args.output_file)
                return 2

    crack_results: list[dict] = []
    cracker_commands: list[dict] = []
    for g in guesses:
        if g.crackable_locally and args.crack and wordlist_path is not None and g.john_format in _HASHLIB_BY_NAME:
            start = time.monotonic()
            found, tried = crack_fast_digest(value.strip(), g.john_format, wordlist_path, args.limit)
            elapsed = time.monotonic() - start
            crack_results.append({
                "name": g.name, "wordlist": str(wordlist_path), "tried": tried,
                "elapsed_seconds": round(elapsed, 1), "found": found,
            })
        elif not g.crackable_locally and wordlist_path is not None:
            hc_cmd = build_hashcat_command(g, value.strip(), wordlist_path)
            john_cmd = build_john_command(g, "(해시를 파일에 저장 후 그 경로로 교체)", wordlist_path)
            cracker_commands.append({"name": g.name, "hashcat_command": hc_cmd, "john_command": john_cmd})
    if crack_results:
        report["crack_results"] = crack_results
    if cracker_commands:
        report["cracker_commands"] = cracker_commands

    if args.output == "json":
        _emit_json(report, args.output_file)
        return 0

    print("=" * 60)
    print(" Crypto / Encoding Identifier")
    print("=" * 60)
    print(f"\nInput: {value}")

    print(f"\n[Decode chains] ({len(chains)} found)")
    if not chains:
        print("  (인코딩된 값으로 보이지 않음 -- 원문이거나 해시일 가능성)")
    for chain in report["decode_chains"]:
        final = chain["result"]
        preview = final if len(final) <= 200 else final[:200] + "..."
        print(f"  [{chain['path']}] {preview!r}")

    print(f"\n[Hash format guesses] ({len(guesses)} found)")
    if not guesses:
        print("  (알려진 해시/crypt 포맷과 일치하지 않음)")
    for g in guesses:
        modes = []
        if g.hashcat_mode is not None:
            modes.append(f"hashcat -m {g.hashcat_mode}")
        if g.john_format is not None:
            modes.append(f"john --format={g.john_format}")
        print(f"  [{g.confidence}] {g.name}  ({', '.join(modes) or 'no cracker mapping'})")

    for cr in crack_results:
        print(f"\n[Local crack: {cr['name']}] wordlist={cr['wordlist']} limit={args.limit}")
        if cr["found"] is not None:
            print(f"  FOUND after {cr['tried']} word(s) in {cr['elapsed_seconds']}s: {cr['found']!r}")
        else:
            print(f"  Not found after {cr['tried']} word(s) in {cr['elapsed_seconds']}s.")

    for cc in cracker_commands:
        print(f"\n[{cc['name']}: GPU/전용 크래커 권장 -- 이 스크립트는 직접 실행하지 않음]")
        if cc["hashcat_command"]:
            print(f"  hashcat: {cc['hashcat_command']}")
        elif HASHCAT_EXE:
            print(f"  hashcat 실행파일을 찾을 수 없음: {HASHCAT_EXE}")
        if cc["john_command"]:
            print(f"  john:    {cc['john_command']}")
        elif JOHN_EXE:
            print(f"  john 실행파일을 찾을 수 없음: {JOHN_EXE}")

    return 0


if __name__ == "__main__":
    for _stream in (sys.stdout, sys.stderr):
        try:
            _stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    if len(sys.argv) == 1:
        _argv = _interactive_argv(build_arg_parser())
        if _argv is None:
            print("취소됨.")
            raise SystemExit(0)
        raise SystemExit(main(_argv))
    raise SystemExit(main())
