#!/usr/bin/env python3
"""Auto-decode / hash-identify / crack an unknown-looking value.

Given a string that "looks encoded or hashed", this tool:
  1. Tries a chain of reversible decodings (base64/base64url/hex/base32/
     base58/base85(ascii85+b85)/URL-encoding/HTML-entity/unicode-escape/
     ROT13/ROT47/gzip-or-zlib-after-decode/single-byte-XOR-bruteforce) up
     to a small recursion depth, and reports any that produce printable
     text. A 3-segment base64url.base64url.base64url value is additionally
     detected and decoded as a JWT (header + payload shown as JSON) even
     though its raw bytes aren't themselves printable text.
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
import gzip
import html as html_module
import json
import logging
import re
import shutil
import sys
import time
import zlib
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


def _maybe_decompress(data: bytes) -> bytes | None:
    """세션값/쿠키가 base64(gzip(...)) 또는 base64(zlib(...)) 형태로 오는 경우가
    흔해서, 디코딩된 바이트가 그 자체로는 printable하지 않아도 압축 해제 후
    다시 한번 printable 체크를 해본다."""
    if len(data) < 2:
        return None
    if data[:2] == b"\x1f\x8b":
        try:
            return gzip.decompress(data)
        except OSError:
            return None
    for wbits in (zlib.MAX_WBITS, -zlib.MAX_WBITS):  # zlib-wrapped, then raw deflate
        try:
            return zlib.decompress(data, wbits)
        except zlib.error:
            continue
    return None


def _is_strictly_printable_ascii(data: bytes) -> bool:
    """XOR 브루트포스 전용 엄격 필터. 일반 디코더들이 쓰는 90%-printable
    기준(_is_mostly_printable)을 그대로 쓰면, 짧은 바이트열은 틀린 키로도
    "90% printable"을 우연히 넘기는 경우가 많다(ASCII 범위가 넓어서) -- 100%
    순수 ASCII printable(+개행/탭)만 통과시켜 1차로 걸러낸다."""
    if not data:
        return False
    return all(32 <= b <= 126 or b in (9, 10, 13) for b in data)


# 영어 알파벳+공백의 대략적인 상대 빈도(표준 빈도표 근사치) -- XOR 브루트포스로 나온
# "printable이긴 한" 후보들 중 실제 평문에 가까운 걸 순위 매기는 용도. 짧은 토큰은
# printable 필터만으로는 우연히 통과하는 틀린 키가 수십 개씩 나올 수 있어서(실측:
# 17바이트 토큰 하나에 53개) 카이제곱 기반 점수 없이 "앞에서부터 N개"로 자르면 정답이
# 뒤로 밀려 통째로 누락되는 경우가 실제로 있었다 -- 반드시 전수 스캔 후 점수로 정렬.
_ENGLISH_LETTER_FREQ = {
    " ": 0.1217, "e": 0.1202, "t": 0.0910, "a": 0.0812, "o": 0.0768, "i": 0.0731,
    "n": 0.0695, "s": 0.0628, "r": 0.0602, "h": 0.0592, "d": 0.0432, "l": 0.0398,
    "u": 0.0288, "c": 0.0271, "m": 0.0261, "f": 0.0230, "y": 0.0211, "w": 0.0209,
    "g": 0.0203, "p": 0.0182, "b": 0.0149, "v": 0.0111, "k": 0.0069, "x": 0.0017,
    "q": 0.0011, "j": 0.0010, "z": 0.0007,
}


def _english_likeness_score(text: str) -> float:
    """낮을수록 영어 평문에 더 가까움(카이제곱 거리 + 기호/숫자 비중 페널티)."""
    lowered = text.lower()
    counts: dict[str, int] = {}
    alpha_or_space = 0
    for ch in lowered:
        if ch.isalpha() or ch == " ":
            counts[ch] = counts.get(ch, 0) + 1
            alpha_or_space += 1
    if alpha_or_space == 0:
        return 1e9
    chi2 = sum(
        ((counts.get(ch, 0) - freq * alpha_or_space) ** 2) / max(freq * alpha_or_space, 0.5)
        for ch, freq in _ENGLISH_LETTER_FREQ.items()
    )
    noise = len(text) - alpha_or_space  # 기호/숫자 등 -- 많을수록 "평문보다는 우연히 printable해진 쓰레기"일 가능성
    return chi2 + noise * 2


def _xor_bruteforce_candidates(data: bytes, max_results: int = 5) -> list[tuple[int, str]]:
    """단일 바이트 XOR로 가려진 평문을 찾는다 -- CTF/간단한 난독화에서 흔한 패턴.
    키 0(원문 그대로)은 제외. 전체 255개 키를 다 스캔해 printable한 후보를 모은 뒤
    영어 평문 유사도 점수로 정렬해 상위 max_results개만 반환(점수가 아니라 키 순서로
    자르면 진짜 평문이 뒤쪽 키에 있을 때 통째로 누락될 수 있어 반드시 전수 스캔)."""
    scored: list[tuple[float, int, str]] = []
    for key in range(1, 256):
        xored = bytes(b ^ key for b in data)
        if _is_strictly_printable_ascii(xored):
            text = xored.decode("ascii")
            scored.append((_english_likeness_score(text), key, text))
    scored.sort(key=lambda item: item[0])
    return [(key, text) for _score, key, text in scored[:max_results]]


_BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def _base58_decode(s: str) -> bytes:
    num = 0
    for ch in s:
        num = num * 58 + _BASE58_ALPHABET.index(ch)
    n_pad = len(s) - len(s.lstrip("1"))
    body = num.to_bytes((num.bit_length() + 7) // 8, "big") if num else b""
    return b"\x00" * n_pad + body


def _rot47(s: str) -> str:
    out = []
    for ch in s:
        code = ord(ch)
        out.append(chr(33 + ((code - 33 + 47) % 94)) if 33 <= code <= 126 else ch)
    return "".join(out)


def _add_bytes_candidate(candidates: list[DecodeStep], method: str, data: bytes) -> None:
    """printable이면 그대로, 아니면 gzip/zlib 압축 해제를 한번 더 시도해서 후보로 추가."""
    if _is_mostly_printable(data):
        candidates.append(DecodeStep(method, data.decode("utf-8")))
        return
    decompressed = _maybe_decompress(data)
    if decompressed is not None and _is_mostly_printable(decompressed):
        candidates.append(DecodeStep(f"{method}+decompress", decompressed.decode("utf-8")))


def try_decode_jwt(value: str) -> dict | None:
    """JWT는 base64url 체인으로 걸려도 "그냥 디코드된 문자열 하나"로만 보여주면
    header/payload 구조가 묻혀버려서 전용으로 분리해 header+payload를 JSON으로
    바로 보여준다. 서명(signature) 세그먼트는 검증하지 않음 -- 구조 파싱만."""
    parts = value.strip().split(".")
    if len(parts) != 3 or not all(parts):
        return None
    if not all(re.fullmatch(r"[A-Za-z0-9_-]+", p) for p in parts[:2]):
        return None
    try:
        header = json.loads(base64.urlsafe_b64decode(parts[0] + "=" * (-len(parts[0]) % 4)))
        payload = json.loads(base64.urlsafe_b64decode(parts[1] + "=" * (-len(parts[1]) % 4)))
    except (binascii.Error, ValueError, UnicodeDecodeError):
        return None
    if not isinstance(header, dict) or not isinstance(payload, dict):
        return None
    return {"header": header, "payload": payload, "alg": header.get("alg"), "signature_b64url": parts[2]}


def _try_decoders(value: str) -> list[DecodeStep]:
    candidates: list[DecodeStep] = []
    stripped = value.strip()

    if re.fullmatch(r"[0-9a-fA-F]{2,}", stripped) and len(stripped) % 2 == 0:
        try:
            data = bytes.fromhex(stripped)
            _add_bytes_candidate(candidates, "hex", data)
            for key, text in _xor_bruteforce_candidates(data):
                candidates.append(DecodeStep(f"xor(key=0x{key:02x})", text))
        except ValueError:
            pass

    for method, fn in (
        ("base64", lambda s: base64.b64decode(s + "=" * (-len(s) % 4))),
        ("base64url", lambda s: base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))),
    ):
        if re.fullmatch(r"[A-Za-z0-9+/_\-]{4,}=*", stripped):
            try:
                data = fn(stripped)
                _add_bytes_candidate(candidates, method, data)
            except (binascii.Error, ValueError):
                pass

    if re.fullmatch(r"[A-Z2-7=]{8,}", stripped, re.IGNORECASE):
        try:
            data = base64.b32decode(stripped.upper())
            _add_bytes_candidate(candidates, "base32", data)
        except (binascii.Error, ValueError):
            pass

    if re.fullmatch(r"[1-9A-HJ-NP-Za-km-z]{4,}", stripped):
        try:
            data = _base58_decode(stripped)
            _add_bytes_candidate(candidates, "base58", data)
        except ValueError:
            pass

    if re.fullmatch(r"[\x21-\x75]{4,}", stripped):  # Ascii85 alphabet: '!'..'u'
        try:
            data = base64.a85decode(stripped)
            _add_bytes_candidate(candidates, "ascii85", data)
        except (binascii.Error, ValueError):
            pass

    if re.fullmatch(r"[0-9A-Za-z!#$%&()*+\-;<=>?@^_`{|}~]{5,}", stripped):  # Python base85 (RFC 1924-ish) alphabet
        try:
            data = base64.b85decode(stripped)
            _add_bytes_candidate(candidates, "base85", data)
        except (binascii.Error, ValueError):
            pass

    if "%" in stripped:
        from urllib.parse import unquote

        decoded = unquote(stripped)
        if decoded != stripped:
            candidates.append(DecodeStep("url-encoding", decoded))

    if re.search(r"&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);", stripped):
        decoded = html_module.unescape(stripped)
        if decoded != stripped:
            candidates.append(DecodeStep("html-entity", decoded))

    if re.search(r"\\u[0-9a-fA-F]{4}|\\x[0-9a-fA-F]{2}", stripped):
        try:
            decoded = codecs.decode(stripped, "unicode_escape")
            if decoded != stripped and _is_mostly_printable(decoded.encode("utf-8", errors="ignore")):
                candidates.append(DecodeStep("unicode-escape", decoded))
        except (UnicodeDecodeError, ValueError):
            pass

    if re.fullmatch(r"[A-Za-z ]+", stripped):
        rot13 = codecs.encode(stripped, "rot_13")
        if rot13 != stripped:
            candidates.append(DecodeStep("rot13", rot13))

    if re.fullmatch(r"[\x21-\x7e]+", stripped):
        rot47 = _rot47(stripped)
        if rot47 != stripped:
            candidates.append(DecodeStep("rot47", rot47))

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

# 32-hex는 MD5와 NTLM이 길이/문자셋이 완전히 같아 구분 불가능 -- 둘 다 후보로 내고
# 크랙도 둘 다 시도한다(예전엔 "MD5 (or NTLM)"라고 뭉뚱그려놓고 실제로는 MD5로만 크랙을
# 시도해서, 진짜 NTLM 값이면 사전에 답이 있어도 절대 못 찾는 버그였음).
_LENGTH_RULES: list[tuple[int, str, tuple[HashGuess, ...]]] = [
    (32, "hex", (
        HashGuess("MD5", 0, "raw-md5", "possible", True),
        HashGuess("NTLM", 1000, "nt", "possible", True),
    )),
    (40, "hex", (HashGuess("SHA1", 100, "raw-sha1", "possible", True),)),
    (56, "hex", (HashGuess("SHA224", 1300, "raw-sha224", "possible", True),)),
    (64, "hex", (HashGuess("SHA256", 1400, "raw-sha256", "possible", True),)),
    (96, "hex", (HashGuess("SHA384", 10800, "raw-sha384", "possible", True),)),
    (128, "hex", (HashGuess("SHA512", 1700, "raw-sha512", "possible", True),)),
]

_MYSQL_OLD_PASSWORD_RE = re.compile(r"^\*[0-9a-fA-F]{40}$")


def identify_hash(value: str) -> list[HashGuess]:
    stripped = value.strip()
    guesses: list[HashGuess] = []

    for pattern, guess in _PREFIX_RULES:
        if re.match(pattern, stripped):
            guesses.append(guess)

    if not guesses:
        # MySQL 4.1+ PASSWORD(): '*' + SHA1(SHA1(pass)) uppercase hex, 40 chars after
        # the '*'. This used to fall through to the generic 40-hex SHA1 rule below and
        # get crack-attempted as a single plain SHA1 -- which can never match a real
        # MySQL hash (it's a double SHA1), so --crack silently always failed on it.
        if _MYSQL_OLD_PASSWORD_RE.match(stripped):
            guesses.append(HashGuess("MySQL 4.1+ PASSWORD() (SHA1(SHA1(pass)))", 300, "mysql-old", "likely", True))

        body = stripped[1:] if stripped.startswith("*") else stripped
        if re.fullmatch(r"[0-9a-fA-F]+", body):
            for length, _kind, guesses_for_length in _LENGTH_RULES:
                if len(body) == length:
                    guesses.extend(guesses_for_length)

    return guesses


# ---------------------------------------------------------------------------
# 3. Local dictionary crack for fast unsalted digests
# ---------------------------------------------------------------------------
import hashlib
import struct


def _md4(data: bytes) -> bytes:
    """Pure-Python MD4 (RFC 1320). Needed because modern OpenSSL (3.x) no longer
    ships MD4 in hashlib by default (hashlib.new('md4') raises on most machines
    this script will actually run on) -- NTLM = MD4(password, encoding=UTF-16LE),
    so without this, NTLM cracking has no correct implementation to fall back to."""

    def lrot(x: int, n: int) -> int:
        x &= 0xFFFFFFFF
        return ((x << n) | (x >> (32 - n))) & 0xFFFFFFFF

    def F(x, y, z):
        return (x & y) | (~x & z)

    def G(x, y, z):
        return (x & y) | (x & z) | (y & z)

    def H(x, y, z):
        return x ^ y ^ z

    msg = bytearray(data)
    orig_len_bits = (8 * len(data)) & 0xFFFFFFFFFFFFFFFF
    msg.append(0x80)
    while len(msg) % 64 != 56:
        msg.append(0)
    msg += struct.pack("<Q", orig_len_bits)

    a0, b0, c0, d0 = 0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476
    s1, s2, s3 = (3, 7, 11, 19), (3, 5, 9, 13), (3, 9, 11, 15)
    order2 = [0, 4, 8, 12, 1, 5, 9, 13, 2, 6, 10, 14, 3, 7, 11, 15]
    order3 = [0, 8, 4, 12, 2, 10, 6, 14, 1, 9, 5, 13, 3, 11, 7, 15]

    for chunk_ofs in range(0, len(msg), 64):
        x = list(struct.unpack("<16I", bytes(msg[chunk_ofs : chunk_ofs + 64])))
        a, b, c, d = a0, b0, c0, d0

        for i in range(16):
            a, b, c, d = d, lrot((a + F(b, c, d) + x[i]) & 0xFFFFFFFF, s1[i % 4]), b, c
        for i in range(16):
            k = order2[i]
            a, b, c, d = d, lrot((a + G(b, c, d) + x[k] + 0x5A827999) & 0xFFFFFFFF, s2[i % 4]), b, c
        for i in range(16):
            k = order3[i]
            a, b, c, d = d, lrot((a + H(b, c, d) + x[k] + 0x6ED9EBA1) & 0xFFFFFFFF, s3[i % 4]), b, c

        a0 = (a0 + a) & 0xFFFFFFFF
        b0 = (b0 + b) & 0xFFFFFFFF
        c0 = (c0 + c) & 0xFFFFFFFF
        d0 = (d0 + d) & 0xFFFFFFFF

    return struct.pack("<4I", a0, b0, c0, d0)


def _ntlm_hexdigest(word: str) -> str:
    return _md4(word.encode("utf-16-le")).hex()


def _mysql_old_hexdigest(word: str) -> str:
    return hashlib.sha1(hashlib.sha1(word.encode("utf-8")).digest()).hexdigest()


# john_format -> word(str) -> lowercase hex digest. Covers every `crackable_locally`
# HashGuess above; a format missing here is a bug (caught by the KeyError at crack time).
_DIGEST_FUNCS = {
    "raw-md5": lambda w: hashlib.md5(w.encode("utf-8")).hexdigest(),
    "raw-sha1": lambda w: hashlib.sha1(w.encode("utf-8")).hexdigest(),
    "raw-sha224": lambda w: hashlib.sha224(w.encode("utf-8")).hexdigest(),
    "raw-sha256": lambda w: hashlib.sha256(w.encode("utf-8")).hexdigest(),
    "raw-sha384": lambda w: hashlib.sha384(w.encode("utf-8")).hexdigest(),
    "raw-sha512": lambda w: hashlib.sha512(w.encode("utf-8")).hexdigest(),
    "nt": _ntlm_hexdigest,
    "mysql-old": _mysql_old_hexdigest,
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
    digest_fn = _DIGEST_FUNCS[john_format]
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
            if digest_fn(word) == target_hex:
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
    jwt = try_decode_jwt(value)

    report: dict = {
        "input": value,
        "jwt": jwt,
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
        if g.crackable_locally and args.crack and wordlist_path is not None and g.john_format in _DIGEST_FUNCS:
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

    if jwt:
        print(f"\n[JWT 감지됨] alg={jwt['alg']}")
        print("  header:", json.dumps(jwt["header"], ensure_ascii=False, indent=2).replace("\n", "\n  "))
        print("  payload:", json.dumps(jwt["payload"], ensure_ascii=False, indent=2).replace("\n", "\n  "))
        print(f"  signature(base64url, 미검증): {jwt['signature_b64url']}")
        if jwt["alg"] in ("none", "None", "NONE"):
            print("  [!] alg=none -- 서버가 이를 받아준다면 서명 없이 변조 가능할 수 있음(별도 검증 필요).")

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
        try:
            _argv = _interactive_argv(build_arg_parser())
        except (EOFError, KeyboardInterrupt):
            print("\n입력이 중단됨 -- 취소됨.")
            raise SystemExit(130)
        if _argv is None:
            print("취소됨.")
            raise SystemExit(0)
        raise SystemExit(main(_argv))
    raise SystemExit(main())
