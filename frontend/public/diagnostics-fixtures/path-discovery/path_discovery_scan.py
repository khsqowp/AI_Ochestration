#!/usr/bin/env python3
"""경로/백업 파일 탐색 스캐너 — 승인된 대상에서만 사용한다.

무엇을 하나: 워드리스트에 있는 경로들을 대상 URL 뒤에 붙여 GET/HEAD 요청만 보내고,
반응을 관찰한다. 상태 변경 메서드(POST/PUT/DELETE 등)는 아예 안 쓴다. 끝나면 의심
항목(200으로 실제 존재 확인된 파일/디렉터리, 401/403으로 존재는 확인됐지만 접근 통제가
걸린 경로, 디렉터리 목록화 흔적)만 추려서 콘솔 표 + CSV 파일로 남긴다.

대상: 도메인이든 IP(사설 IP·localhost 포함— 노트북/사내망 대상 진단도 그대로 됨)든 상관
없다. http(s)://host[:port] 형태만 맞으면 된다.

의존성 없음 — 파이썬 3.9+ 표준 라이브러리만 쓴다. 다운받은 그대로 실행 가능하다.

사용 예:
    python3 path_discovery_scan.py http://192.168.0.12:8080
    python3 path_discovery_scan.py https://example.com --wordlist my-list.txt --concurrency 8
"""

from __future__ import annotations

import argparse
import concurrent.futures
import csv
import re
import socket
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

DEFAULT_WORDLIST = Path(__file__).with_name("path-discovery-wordlist.txt")
DEFAULT_TIMEOUT = 8.0
DEFAULT_CONCURRENCY = 5
DEFAULT_DELAY = 0.1  # 워커 하나가 요청 사이에 쉬는 시간(초) — 대상에 부담 안 주려는 최소한의 속도 제한
USER_AGENT = "diagnostics-path-scan/1.0 (authorized-testing)"

# 디렉터리 목록화 판별은 상태코드 200 하나만으로 확정하지 않는다 — 본문 시그니처까지
# 맞아야 "노출"로 친다(오탐 방지). Burp_Extension/security_toolkit의 판정 원칙과 동일.
DIR_LISTING_SIGNATURES = (
    "index of /", "directory listing for", "<title>index of",
    "parent directory</a>", "[to parent directory]",
)
# 확장자/이름만 봐도 민감할 가능성이 높은 것들 — 200이 뜨면 severity를 올린다.
SENSITIVE_PATTERNS = re.compile(
    r"\.(bak|old|orig|swp|save|zip|tar\.gz|tgz|sql|sql\.gz|log|env|pem|key)$"
    r"|\.git/|\.svn/|\.env(\.|$)|wp-config|web\.config|\.htpasswd|\.htaccess|id_rsa",
    re.IGNORECASE,
)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        return None  # 3xx는 "따라가지" 않고 그 자체로 기록만 한다


@dataclass
class Hit:
    path: str
    method: str
    status: int | None
    length: int
    category: str
    severity: str
    note: str


def normalize_target(raw: str) -> str:
    value = raw.strip()
    if "://" not in value:
        value = "http://" + value
    parsed = urlsplit(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("대상은 http(s)://host[:port] 형태여야 합니다.")
    if parsed.username or parsed.password:
        raise ValueError("대상 URL에 자격증명을 넣지 마세요.")
    return urlunsplit((parsed.scheme, parsed.netloc, "", "", ""))


def load_wordlist(path: Path) -> list[str]:
    if not path.exists():
        raise FileNotFoundError(f"워드리스트를 찾을 수 없습니다: {path}")
    entries: list[str] = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        entries.append(line if line.startswith("/") else "/" + line)
    return entries


def classify(path: str, status: int | None, body_head: str) -> tuple[str, str, str] | None:
    """(category, severity, note)를 반환. 의심 항목이 아니면 None."""
    if status == 200:
        if path.endswith("/") and any(sig in body_head.lower() for sig in DIR_LISTING_SIGNATURES):
            return "directory_listing", "medium", "디렉터리 목록화 확인됨 — 내부 파일 구조가 노출됩니다."
        if SENSITIVE_PATTERNS.search(path):
            return "sensitive_file_exposed", "high", "민감할 수 있는 파일/경로가 공개 상태로 존재합니다."
        return "path_exists", "low", "경로가 200으로 응답 — 의도한 공개 리소스인지 확인하세요."
    if status == 401:
        return "auth_required", "info", "경로는 존재하나 인증이 필요합니다 — 엔드포인트 존재 자체가 정보 노출일 수 있습니다."
    if status == 403:
        return "forbidden", "info", "경로는 존재하나 접근이 차단됩니다 — 우회 가능 여부(메서드/헤더 변조)는 별도 확인 필요."
    return None


def fetch(origin: str, path: str, method: str, timeout: float) -> tuple[int | None, int, str]:
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect)
    request = urllib.request.Request(
        origin + path, method=method,
        headers={"User-Agent": USER_AGENT, "Accept": "*/*"},
    )
    try:
        with opener.open(request, timeout=timeout) as response:
            body = response.read(2048) if method == "GET" else b""
            return response.status, len(body), body.decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        body = exc.read(2048) if method == "GET" else b""
        return exc.code, len(body), body.decode("utf-8", errors="replace")
    except (urllib.error.URLError, TimeoutError, OSError, socket.error):
        return None, 0, ""


def confirm_authorization(target: str, skip_prompt: bool) -> None:
    print(f"대상: {target}")
    print("본인 소유이거나 서면으로 진단을 승인받은 대상에서만 사용하세요.")
    if skip_prompt:
        return
    answer = input("계속하려면 yes 입력: ").strip().lower()
    if answer != "yes":
        print("취소했습니다.")
        raise SystemExit(1)


def run(target: str, wordlist_path: Path, concurrency: int, delay: float, timeout: float,
        methods: list[str], output_csv: Path) -> list[Hit]:
    origin = normalize_target(target)
    paths = load_wordlist(wordlist_path)
    total = len(paths) * len(methods)
    print(f"워드리스트 {len(paths)}개 경로 x 메서드 {len(methods)}개 = 요청 {total}건, 동시성 {concurrency}, 지연 {delay}s")

    hits: list[Hit] = []
    done = 0

    def worker(path: str, method: str) -> None:
        nonlocal done
        time.sleep(delay)
        status, length, body_head = fetch(origin, path, method, timeout)
        result = classify(path, status, body_head)
        if result:
            category, severity, note = result
            hits.append(Hit(path, method, status, length, category, severity, note))
        done += 1
        if done % 25 == 0 or done == total:
            print(f"  진행 {done}/{total}", file=sys.stderr)

    with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as pool:
        futures = [pool.submit(worker, path, method) for path in paths for method in methods]
        concurrent.futures.wait(futures)

    hits.sort(key=lambda h: ({"high": 0, "medium": 1, "low": 2, "info": 3}.get(h.severity, 9), h.path))

    if hits:
        print(f"\n의심 항목 {len(hits)}건:\n")
        print(f"{'SEVERITY':<8} {'STATUS':<7} {'METHOD':<6} {'LENGTH':<8} PATH  ·  NOTE")
        for h in hits:
            print(f"{h.severity.upper():<8} {str(h.status):<7} {h.method:<6} {h.length:<8} {h.path}  ·  {h.note}")
    else:
        print("\n의심 항목 없음 — 워드리스트 범위 안에서는 깨끗합니다.")

    with output_csv.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["severity", "status", "method", "length", "category", "path", "note"])
        for h in hits:
            writer.writerow([h.severity, h.status, h.method, h.length, h.category, h.path, h.note])
    print(f"\nCSV 저장: {output_csv.resolve()}")
    return hits


def main() -> int:
    parser = argparse.ArgumentParser(description="경로/백업 파일 탐색 스캐너 (승인된 대상 전용)")
    parser.add_argument("target", help="http(s)://host[:port] — 도메인/사설IP/localhost 전부 가능")
    parser.add_argument("--wordlist", type=Path, default=DEFAULT_WORDLIST)
    parser.add_argument("--concurrency", type=int, default=DEFAULT_CONCURRENCY)
    parser.add_argument("--delay", type=float, default=DEFAULT_DELAY, help="요청 사이 최소 지연(초)")
    parser.add_argument("--timeout", type=float, default=DEFAULT_TIMEOUT)
    parser.add_argument("--methods", default="GET", help="쉼표 구분, 예: GET,HEAD (상태 변경 메서드는 거부됨)")
    parser.add_argument("--output", type=Path, default=Path("path_discovery_findings.csv"))
    parser.add_argument("--yes", action="store_true", help="승인 확인 프롬프트 생략(자동화용)")
    args = parser.parse_args()

    methods = [m.strip().upper() for m in args.methods.split(",") if m.strip()]
    if not set(methods) <= {"GET", "HEAD"}:
        print("허용된 메서드는 GET, HEAD뿐입니다.", file=sys.stderr)
        return 2
    if not 1 <= args.concurrency <= 20:
        print("--concurrency는 1~20 사이여야 합니다.", file=sys.stderr)
        return 2

    try:
        target = normalize_target(args.target)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    confirm_authorization(target, args.yes)

    try:
        run(target, args.wordlist, args.concurrency, args.delay, args.timeout, methods, args.output)
    except FileNotFoundError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
