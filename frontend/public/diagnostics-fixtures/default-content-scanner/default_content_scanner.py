#!/usr/bin/env python3
"""Default-content / sample-file / backup-file / path-traversal scanner.

Three probing modes, all rate-limited the same way as the sibling
site_depth_crawler (bounded concurrency + per-host minimum interval,
always on, never disabled):

  1. Fingerprint mode (default): probes known default/sample/test/docs
     paths shipped by common server software (Tomcat, Apache httpd,
     nginx, IIS, JBoss, Axis, Glassfish, iPlanet, JRun) plus REST API
     surface (api) and popular CMS (wordpress/drupal/joomla) lists,
     using the bundled SecLists Web-Content lists, plus a built-in
     list of common sensitive/generic files (.env, .git/HEAD, ...)
     merged with SecLists' quickhits.txt.

  2. Backup-mutation mode (--mutate): for every path the fingerprint
     pass finds (status != 404), also probes common backup-file
     variants of it (.bak, ~, .old, .orig, .swp, .zip, ...).

  3. Path-traversal mode (--traversal): fuzzes a query parameter or a
     FUZZ marker in a URL template with traversal/LFI payloads from
     the bundled PayloadsAllTheThings Directory Traversal + File
     Inclusion lists, applies WAF-bypass encoding variants (URL/double
     URL-encode, overlong UTF-8, null byte -- toggle with
     --no-bypass-encodings) to the depth-template payloads, and flags
     responses matching known target-file signatures (passwd, apache/
     nginx/php config, win.ini, boot.ini, web.config).

Usage:
    python default_content_scanner.py https://target.example --tech tomcat,nginx
    python default_content_scanner.py https://target.example --mutate
    python default_content_scanner.py https://target.example --traversal --param file
    python default_content_scanner.py https://target.example/dl?f=FUZZ --traversal --url-template
"""
from __future__ import annotations

import argparse
import json
import logging
import re
import sys
import threading
import time
import urllib.error
import urllib.request
import urllib.robotparser
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urljoin, urlparse

logger = logging.getLogger("default_content_scanner")

TOOLS_DIR = Path(__file__).resolve().parent.parent
SECLISTS_WEB_CONTENT = TOOLS_DIR / "SecLists-master" / "Discovery" / "Web-Content"
PAYLOADS_TRAVERSAL_DIR = TOOLS_DIR / "PayloadsAllTheThings-master" / "Directory Traversal" / "Intruder"
PAYLOADS_LFI_DIR = TOOLS_DIR / "PayloadsAllTheThings-master" / "File Inclusion" / "Intruders"

DEFAULT_USER_AGENT = "default-content-scanner/1.0 (+rate-limited; contact: local-security-testing)"
MAX_BODY_BYTES = 512 * 1024
MAX_TOTAL_REQUESTS = 3000  # hard ceiling unless --force

# 값이 list[Path]인 항목은 여러 파일을 합쳐서(중복 제거) 하나의 --tech 카테고리로 씀
# -- SecLists가 같은 소프트웨어를 여러 파일로 쪼개놨거나(IIS 본체+system.web 설정), api/cms처럼
# 원래도 여러 출처 파일을 모아야 의미있는 카테고리인 경우.
TECH_WORDLISTS: dict[str, Path | list[Path]] = {
    "tomcat": SECLISTS_WEB_CONTENT / "Web-Servers" / "Apache-Tomcat.txt",
    "apache": SECLISTS_WEB_CONTENT / "Web-Servers" / "Apache.txt",
    "nginx": SECLISTS_WEB_CONTENT / "Web-Servers" / "nginx.txt",
    "iis": [
        SECLISTS_WEB_CONTENT / "Web-Servers" / "IIS.txt",
        SECLISTS_WEB_CONTENT / "Web-Servers" / "IIS-systemweb.txt",
    ],
    "jboss": SECLISTS_WEB_CONTENT / "Web-Servers" / "JBoss.txt",
    "db-backups": SECLISTS_WEB_CONTENT / "Common-DB-Backups.txt",
    "axis": SECLISTS_WEB_CONTENT / "Web-Servers" / "Apache-Axis.txt",
    "glassfish": SECLISTS_WEB_CONTENT / "Web-Servers" / "Glassfish-Sun-Microsystems.txt",
    "iplanet": SECLISTS_WEB_CONTENT / "Web-Servers" / "Oracle-Sun-iPlanet.txt",
    "jrun": SECLISTS_WEB_CONTENT / "Web-Servers" / "Java-Servlet-Runner-Adobe-JRun.txt",
    "api": [
        SECLISTS_WEB_CONTENT / "api" / "api-endpoints.txt",
        SECLISTS_WEB_CONTENT / "api" / "api-endpoints-res.txt",
        SECLISTS_WEB_CONTENT / "api" / "objects.txt",
        SECLISTS_WEB_CONTENT / "api" / "actions.txt",
    ],
    "cms": [
        SECLISTS_WEB_CONTENT / "CMS" / "wordpress.fuzz.txt",
        SECLISTS_WEB_CONTENT / "CMS" / "wp-plugins.fuzz.txt",
        SECLISTS_WEB_CONTENT / "CMS" / "wp-themes.fuzz.txt",
        SECLISTS_WEB_CONTENT / "CMS" / "drupal-themes.fuzz.txt",
        SECLISTS_WEB_CONTENT / "CMS" / "joomla-plugins.fuzz.txt",
    ],
}

# generic 카테고리 보강용 -- 하드코딩 목록(GENERIC_DEFAULT_PATHS)은 그대로 유지하고, 있으면
# 이 파일(알려진 민감파일 2500여개 모음)에서 더 불러와 합친다(없으면 조용히 건너뜀, 에러 아님).
GENERIC_EXTRA_WORDLIST = SECLISTS_WEB_CONTENT / "quickhits.txt"

# Next.js has no dedicated SecLists file (Web-Servers/ covers server software,
# not frontend frameworks) -- built in directly instead of a wordlist file.
NEXTJS_DEFAULT_PATHS = [
    "_next/static/development/_buildManifest.js",
    "_next/static/development/_ssgManifest.js",
    "_next/static/chunks/webpack.js",
    "_next/static/chunks/main.js",
    "_next/static/chunks/pages/_app.js",
    ".next/BUILD_ID",
    "_next/server/pages-manifest.json",
    "_next/server/middleware-manifest.json",
    "_next/data/development/index.json",
    "next.config.js",
    "next.config.mjs",
    "_next/image",
]
BUILTIN_TECH_PATHS = {
    "nextjs": NEXTJS_DEFAULT_PATHS,
}

# 대화형 모드에서 --tech를 맨입으로 타이핑하게 하지 않고 번호/이름으로 고르게 하기 위한 표시용 라벨.
TECH_LABELS: dict[str, str] = {
    "tomcat": "Apache Tomcat",
    "apache": "Apache HTTPD",
    "nginx": "nginx",
    "iis": "Microsoft IIS",
    "jboss": "JBoss / WildFly",
    "axis": "Apache Axis",
    "glassfish": "GlassFish",
    "iplanet": "Oracle/Sun iPlanet",
    "jrun": "Adobe JRun",
    "nextjs": "Next.js",
    "api": "REST API 엔드포인트/오브젝트/액션",
    "cms": "CMS (WordPress/Drupal/Joomla)",
    "db-backups": "DB 백업 파일 모음",
}
TECH_CHOICES: list[tuple[str, str]] = [(key, TECH_LABELS.get(key, key)) for key in (*TECH_WORDLISTS, *BUILTIN_TECH_PATHS)]

GENERIC_DEFAULT_PATHS = [
    ".env", ".env.bak", ".env.local", ".git/HEAD", ".git/config", ".svn/entries",
    ".htaccess", ".htpasswd", "web.config", "docker-compose.yml", "Dockerfile",
    "phpinfo.php", "info.php", "test.php", "server-status", "server-info",
    "elmah.axd", "trace.axd", "id_rsa", "id_rsa.pub", ".DS_Store", "Thumbs.db",
    "backup.zip", "backup.sql", "backup.tar.gz", "dump.sql", "database.sql",
    "config.php.bak", "config.old", "config.php~", "wp-config.php.bak",
    "README.md", "CHANGELOG.md", "composer.json", "package.json", ".well-known/security.txt",
]

BACKUP_SUFFIXES = [".bak", ".backup", ".old", ".orig", ".save", ".swp", ".tmp", "~", ".1", ".copy", ".zip", ".tar.gz", ".rar", ".7z"]

# 타겟 파일마다 실제로 "읽혔다"를 확인할 콘텐츠 시그니처가 있어야 의미가 있다 -- 시그니처 없는
# 타겟을 더 넣는 건 매치될 수 없는 요청만 늘리는 것이라 일부러 안 함(Linux-files.txt 같은
# 무검증 대량 목록 대신, 확인 가능한 소수 정예로 감).
TRAVERSAL_TARGET_FILES: dict[str, list[str]] = {
    "unix": ["etc/passwd", "etc/apache2/apache2.conf", "etc/nginx/nginx.conf", "etc/php.ini"],
    "windows": ["windows/win.ini", "boot.ini", "inetpub/wwwroot/web.config"],
}
TRAVERSAL_SIGNATURES: dict[str, re.Pattern] = {
    "passwd": re.compile(r"root:.*:0:0:"),
    "apache-conf": re.compile(r"ServerRoot", re.IGNORECASE),
    "nginx-conf": re.compile(r"worker_processes", re.IGNORECASE),
    "php-ini": re.compile(r"\[PHP\]"),
    "win-ini": re.compile(r"\[(fonts|extensions)\]", re.IGNORECASE),
    "boot-ini": re.compile(r"\[boot loader\]", re.IGNORECASE),
    "web-config": re.compile(r"<configuration>", re.IGNORECASE),
}

# 이미 완성된 트래버설/LFI 문자열 목록 -- {FILE} 치환 불필요, 상당수가 출처에서부터 null
# byte(%00)·이중 인코딩 등 우회 변형을 자체 포함하고 있음.
FLAT_TRAVERSAL_FILES = [
    (PAYLOADS_TRAVERSAL_DIR, "directory_traversal.txt"),
    (PAYLOADS_TRAVERSAL_DIR, "dotdotpwn.txt"),
    (PAYLOADS_LFI_DIR, "JHADDIX_LFI.txt"),
    (PAYLOADS_LFI_DIR, "List_Of_File_To_Include.txt"),
    (PAYLOADS_LFI_DIR, "List_Of_File_To_Include_NullByteAdded.txt"),
    (PAYLOADS_LFI_DIR, "dot-slash-PathTraversal_and_LFI_pairing.txt"),
    (PAYLOADS_LFI_DIR, "LFI-FD-check.txt"),
]


# ---------------------------------------------------------------------------
# Rate limiting (shared shape with site_depth_crawler)
# ---------------------------------------------------------------------------
class HostRateLimiter:
    def __init__(self, min_interval_seconds: float) -> None:
        self._min_interval = max(0.0, min_interval_seconds)
        self._lock = threading.Lock()
        self._last_slot: dict[str, float] = {}

    def wait(self, host_key: str) -> None:
        if self._min_interval <= 0:
            return
        with self._lock:
            now = time.monotonic()
            last = self._last_slot.get(host_key, 0.0)
            next_slot = max(now, last + self._min_interval)
            self._last_slot[host_key] = next_slot
            remaining = next_slot - now
        if remaining > 0:
            time.sleep(remaining)


class RobotsCache:
    def __init__(self, user_agent: str, timeout: int, respect: bool) -> None:
        self.user_agent = user_agent
        self.timeout = timeout
        self.respect = respect
        self._parsers: dict[str, urllib.robotparser.RobotFileParser] = {}
        self._lock = threading.Lock()

    def allowed(self, url: str) -> bool:
        if not self.respect:
            return True
        parsed = urlparse(url)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        with self._lock:
            rp = self._parsers.get(origin)
            if rp is None:
                rp = urllib.robotparser.RobotFileParser()
                rp.set_url(urljoin(origin, "/robots.txt"))
                try:
                    req = urllib.request.Request(rp.url, headers={"User-Agent": self.user_agent})
                    with urllib.request.urlopen(req, timeout=self.timeout) as resp:  # noqa: S310
                        raw = resp.read(65536).decode("utf-8", errors="replace")
                    rp.parse(raw.splitlines())
                except Exception:  # noqa: BLE001
                    rp.parse([])
                self._parsers[origin] = rp
        try:
            return rp.can_fetch(self.user_agent, url)
        except Exception:  # noqa: BLE001
            return True


# ---------------------------------------------------------------------------
# Result model
# ---------------------------------------------------------------------------
@dataclass
class ProbeResult:
    category: str
    url: str
    status_code: int | None = None
    content_length: int | None = None
    response_time_ms: float | None = None
    error: str | None = None
    matched_signature: str | None = None
    payload: str | None = None

    def to_dict(self) -> dict:
        return dict(self.__dict__)


# ---------------------------------------------------------------------------
# Word/payload loading
# ---------------------------------------------------------------------------
def load_lines(path: Path) -> list[str]:
    return [line.strip() for line in path.read_text(encoding="utf-8", errors="replace").splitlines() if line.strip() and not line.startswith("#")]


def build_fingerprint_targets(techs: list[str], include_generic: bool) -> list[tuple[str, str]]:
    targets: list[tuple[str, str]] = []
    for tech in techs:
        builtin = BUILTIN_TECH_PATHS.get(tech)
        if builtin is not None:
            targets.extend((tech, p) for p in builtin)
            continue
        wl = TECH_WORDLISTS.get(tech)
        if wl is None:
            logger.warning("Unknown --tech value: %s (known: %s)", tech, ", ".join([*TECH_WORDLISTS, *BUILTIN_TECH_PATHS]))
            continue
        wordlist_files = wl if isinstance(wl, list) else [wl]
        seen_paths: set[str] = set()
        found_any = False
        for wf in wordlist_files:
            if not wf.is_file():
                continue
            found_any = True
            for line in load_lines(wf):
                if line not in seen_paths:
                    seen_paths.add(line)
                    targets.append((tech, line))
        if not found_any:
            logger.warning("Wordlist(s) missing for %s: %s", tech, ", ".join(str(w) for w in wordlist_files))
    if include_generic:
        seen_generic: set[str] = set()
        merged_generic = list(GENERIC_DEFAULT_PATHS)
        if GENERIC_EXTRA_WORDLIST.is_file():
            merged_generic += load_lines(GENERIC_EXTRA_WORDLIST)
        for p in merged_generic:
            if p not in seen_generic:
                seen_generic.add(p)
                targets.append(("generic", p))
    return targets


def mutate_traversal_payload(payload: str) -> list[str]:
    """WAF/필터 우회용 인코딩 변형 4종(원본 포함 최대 4개): 단일 URL 인코딩, 이중 URL
    인코딩, 오버롱 UTF-8 슬래시(..%c0%af), null byte suffix. 우리가 직접 조립하는
    depth-템플릿 페이로드에만 적용한다 -- flat 목록(FLAT_TRAVERSAL_FILES)은 이미 출처에서부터
    자체 인코딩 변형을 포함하고 있어서 대상이 아님."""
    variants = [payload]
    if "/" in payload or "." in payload:
        single = payload.replace("/", "%2f").replace(".", "%2e")
        if single != payload:
            variants.append(single)
        double = payload.replace("/", "%252f").replace(".", "%252e")
        if double != payload:
            variants.append(double)
    if "../" in payload:
        variants.append(payload.replace("../", "..%c0%af"))
    variants.append(payload + "%00")
    return variants


def load_traversal_payloads(target_os: str, limit: int, bypass_encodings: bool = True) -> list[tuple[str, str]]:
    """Returns (label, payload) pairs."""
    payloads: list[tuple[str, str]] = []

    for directory, fname in FLAT_TRAVERSAL_FILES:
        p = directory / fname
        if p.is_file():
            payloads.extend(("flat", line) for line in load_lines(p))

    os_list = ["unix", "windows"] if target_os == "both" else [target_os]
    template_payloads: list[tuple[str, str]] = []
    for template_file in ("deep_traversal.txt", "traversals-8-deep-exotic-encoding.txt"):
        p = PAYLOADS_TRAVERSAL_DIR / template_file
        if not p.is_file():
            continue
        for line in load_lines(p):
            for os_name in os_list:
                for target_file in TRAVERSAL_TARGET_FILES[os_name]:
                    template_payloads.append((os_name, line.replace("{FILE}", target_file)))

    if bypass_encodings:
        for label, base in template_payloads:
            for variant in mutate_traversal_payload(base):
                payloads.append((label, variant))
    else:
        payloads.extend(template_payloads)

    seen: set[str] = set()
    unique = [pl for pl in payloads if not (pl[1] in seen or seen.add(pl[1]))]
    if len(unique) > limit:
        logger.warning("Traversal payload set has %d entries, truncating to --traversal-limit %d", len(unique), limit)
        unique = unique[:limit]
    return unique


# ---------------------------------------------------------------------------
# Fetching
# ---------------------------------------------------------------------------
def fetch(
    url: str, timeout: int, user_agent: str, max_retries: int, want_body: bool,
    extra_headers: dict[str, str] | None = None,
) -> tuple[int | None, int | None, float, bytes, str | None]:
    attempt = 0
    last_error: str | None = None
    while attempt <= max_retries:
        start = time.monotonic()
        try:
            headers = {"User-Agent": user_agent, **(extra_headers or {})}
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310
                status = resp.getcode()
                body = resp.read(MAX_BODY_BYTES) if want_body else b""
                elapsed_ms = (time.monotonic() - start) * 1000
                return status, len(body) if want_body else int(resp.headers.get("Content-Length", 0) or 0), elapsed_ms, body, None
        except urllib.error.HTTPError as exc:
            elapsed_ms = (time.monotonic() - start) * 1000
            body = exc.read(MAX_BODY_BYTES) if want_body else b""
            return exc.code, len(body), elapsed_ms, body, None
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as exc:
            last_error = str(exc)
            attempt += 1
            if attempt > max_retries:
                break
            time.sleep(0.5 * attempt)
    return None, None, 0.0, b"", f"Request failed after {max_retries + 1} attempt(s): {last_error}"


def detect_fallback_baseline(
    base_url: str, timeout: int, user_agent: str, max_retries: int,
    extra_headers: dict[str, str] | None = None,
) -> tuple[int, int] | None:
    """Some apps (SPAs with client-side routing, e.g. Angular/React with a
    catch-all server route) return 200 with the *same* body for literally
    any unknown path instead of a real 404 -- probe one definitely-bogus
    path first so the real fingerprint sweep can tell an actual hit apart
    from that fallback noise (otherwise every single probed path "hits").
    Returns None if the probe itself failed (network error etc.)."""
    probe_path = f"__nx_{uuid.uuid4().hex[:16]}__"
    url = urljoin(base_url.rstrip("/") + "/", probe_path)
    status, length, _elapsed, _body, error = fetch(url, timeout, user_agent, max_retries, want_body=False, extra_headers=extra_headers)
    if error or status is None:
        return None
    return status, length or 0


def _is_hit(r: "ProbeResult", baseline: tuple[int, int] | None) -> bool:
    if not r.status_code or r.status_code == 404:
        return False
    if baseline is not None and (r.status_code, r.content_length or 0) == baseline:
        return False
    return True


def _fetch_batch(
    jobs: list[tuple[str, str, str | None]],  # (category, url, payload_label)
    rate_limiter: HostRateLimiter,
    robots: RobotsCache,
    max_workers: int,
    timeout: int,
    max_retries: int,
    user_agent: str,
    want_body: bool,
    signature_check: bool,
    extra_headers: dict[str, str] | None = None,
) -> list[ProbeResult]:
    def _one(job: tuple[str, str, str | None]) -> ProbeResult:
        category, url, payload = job
        if not robots.allowed(url):
            return ProbeResult(category=category, url=url, error="Disallowed by robots.txt", payload=payload)
        host_key = urlparse(url).hostname or url
        rate_limiter.wait(host_key)
        status, length, elapsed_ms, body, error = fetch(url, timeout, user_agent, max_retries, want_body, extra_headers)
        matched = None
        if signature_check and body:
            text = body.decode("utf-8", errors="replace")
            for sig_label, pattern in TRAVERSAL_SIGNATURES.items():
                if pattern.search(text):
                    matched = sig_label
                    break
        return ProbeResult(category=category, url=url, status_code=status, content_length=length, response_time_ms=round(elapsed_ms, 1), error=error, matched_signature=matched, payload=payload)

    results: list[ProbeResult] = []
    with ThreadPoolExecutor(max_workers=max(1, min(max_workers, 10))) as pool:
        futures = {pool.submit(_one, job): job for job in jobs}
        for fut in as_completed(futures):
            results.append(fut.result())
    return results


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------
def print_console_report(results: list[ProbeResult], baseline: tuple[int, int] | None = None) -> None:
    print("=" * 60)
    print(" Default-Content / Backup / Traversal Scan Report")
    print("=" * 60)

    if baseline is not None and baseline[0] != 404:
        print(
            f"\n[알림] 존재하지 않는 경로에도 {baseline[0]}({baseline[1]}B)로 응답함 "
            "(SPA 캐치올 라우팅 등으로 보임) -- 이 상태/크기와 동일한 결과는 아래 '히트'에서 자동 제외함."
        )

    by_category: dict[str, list[ProbeResult]] = {}
    for r in results:
        by_category.setdefault(r.category, []).append(r)

    for category, items in by_category.items():
        if category == "traversal":
            interesting = [r for r in items if r.matched_signature]
            print(f"\n[Traversal] ({len(items)} payload(s) tried, {len(interesting)} matched a target-file signature)")
            for r in interesting:
                print(f"  MATCH({r.matched_signature})  {r.status_code}  {r.url}")
        else:
            interesting = [r for r in items if _is_hit(r, baseline)]
            print(f"\n[{category}] ({len(items)} probed, {len(interesting)} hit(s))")
            for r in sorted(interesting, key=lambda r: (r.status_code or 0, r.url)):
                print(f"  {r.status_code:<4} {r.content_length or 0:>8}B  {r.url}")

    total_errors = sum(1 for r in results if r.error)
    print(f"\nTotal requests: {len(results)}  (errors/robots-disallowed: {total_errors})")


def _results_to_json(results: list[ProbeResult], baseline: tuple[int, int] | None) -> list[dict]:
    """Attaches a `hit` boolean (the same rule print_console_report already
    uses to decide what counts as interesting) to each entry -- lets a
    caller (the GUI's fingerprint-mode tab) tell a real discovery apart
    from a probed-but-empty result without re-implementing baseline logic."""
    payload = []
    for r in results:
        d = r.to_dict()
        d["hit"] = bool(r.matched_signature) if r.category == "traversal" else _is_hit(r, baseline)
        payload.append(d)
    return payload


def write_json_report(results: list[ProbeResult], path: str, baseline: tuple[int, int] | None = None) -> None:
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(_results_to_json(results, baseline), fh, indent=2, ensure_ascii=False)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="default_content_scanner", description="Rate-limited default-content / backup-file / path-traversal scanner.")
    parser.add_argument("url", help="Target base URL (or full URL with a literal FUZZ marker when using --url-template)")
    parser.add_argument("--tech", default="tomcat,apache,nginx", help="Comma-separated tech wordlists to probe (default: tomcat,apache,nginx). Known: " + ", ".join([*TECH_WORDLISTS, *BUILTIN_TECH_PATHS]))
    parser.add_argument("--no-generic", action="store_true", help="Skip the built-in generic sensitive/default-file list")
    parser.add_argument("--no-fingerprint", action="store_true", help="Skip fingerprint mode entirely (useful with --traversal only)")
    parser.add_argument("--mutate", action="store_true", help="Also probe backup-suffix variants of every fingerprint hit (status != 404)")
    parser.add_argument(
        "--mutate-paths", default=None,
        help="Comma-separated full URLs to probe backup-suffix variants of directly, standalone -- skips "
        "fingerprint/traversal entirely regardless of other flags (used for an independent backup-detection run "
        "against a caller-supplied base path list instead of this run's own fresh fingerprint hits)",
    )
    parser.add_argument("--traversal", action="store_true", help="Enable path-traversal/LFI fuzzing")
    parser.add_argument("--param", default=None, help="Query param name to inject traversal payloads into (appended to url)")
    parser.add_argument("--url-template", action="store_true", help="Treat url as a template containing a literal FUZZ marker for traversal payloads")
    parser.add_argument("--target-os", choices=["unix", "windows", "both"], default="both", help="Which OS target file to aim traversal payloads at (default: both)")
    parser.add_argument("--traversal-limit", type=int, default=300, help="Max traversal payloads to try (default 300, hard ceiling 2000 unless --force)")
    parser.add_argument(
        "--no-bypass-encodings", action="store_true",
        help="Disable automatic WAF/filter bypass encoding variants (single/double URL-encode, "
        "overlong UTF-8, null byte) of traversal payloads -- on by default",
    )
    parser.add_argument("--workers", type=int, default=3, help="Max concurrent requests (default 3, capped at 10)")
    parser.add_argument("--min-interval", type=float, default=0.5, help="Minimum seconds between requests to the same host (default 0.5)")
    parser.add_argument("--timeout", type=int, default=10, help="Per-request timeout in seconds (default 10)")
    parser.add_argument("--retries", type=int, default=1, help="Retries for transient network errors (default 1)")
    parser.add_argument("--max-requests", type=int, default=1000, help="Hard cap on total requests across all modes (default 1000, ceiling 3000 unless --force)")
    parser.add_argument("--ignore-robots", action="store_true", help="Do not consult robots.txt")
    parser.add_argument("--user-agent", default=DEFAULT_USER_AGENT, help="Custom User-Agent string")
    parser.add_argument("--cookies", default=None, help="Cookie header sent with every request, 'k=v; k2=v2' style (e.g. session auth for an admin-only path)")
    parser.add_argument("--headers", action="append", default=[], help="Extra header 'Name: value' sent with every request, repeatable")
    parser.add_argument("--output", choices=["console", "json"], default="console", help="Report format (default console)")
    parser.add_argument("--output-file", default=None, help="Write JSON report to this path")
    parser.add_argument("--force", action="store_true", help="Override safety ceilings")
    parser.add_argument(
        "--estimate-only", action="store_true",
        help="Print the request-count estimate for the current options as JSON and exit (no network requests)",
    )
    parser.add_argument("-v", "--verbose", action="store_true", help="Verbose logging")
    return parser


# 고급 메뉴 번호 목록에 뜨는 설명 -- argparse 자체 help(영어, --help 출력용)는
# 그대로 두고, 대화형 메뉴에서 보여줄 텍스트만 따로 둔다.
KOREAN_HELP = {
    "tech": "탐색할 기술 스택, 쉼표로 구분 (기본 tomcat,apache,nginx). 가능: " + ", ".join([*TECH_WORDLISTS, *BUILTIN_TECH_PATHS]),
    "no_generic": "내장 generic 목록(.env, .git/HEAD 등) 제외",
    "no_fingerprint": "지문(fingerprint) 모드 자체를 끔 (--traversal만 쓰고 싶을 때)",
    "mutate": "발견된 경로들의 백업 확장자 변형본(.bak/.old/~ 등)도 탐색",
    "mutate_paths": "지정한 URL 목록(쉼표 구분)의 백업 변형본만 독립적으로 탐색 -- 지문/트래버설 모드 무시",
    "traversal": "경로탐색(디렉터리 트래버설) 퍼징 활성화 -- param 또는 url_template 중 하나 필수",
    "param": "트래버설 페이로드를 넣을 쿼리 파라미터명 (예: file)",
    "url_template": "url 인자를 템플릿으로 취급, 안의 리터럴 FUZZ 문자열을 페이로드로 치환",
    "target_os": "트래버설 대상 OS (unix/windows/both, 기본 both)",
    "traversal_limit": "시도할 최대 트래버설 페이로드 수 (기본 300, 안전상한 2000)",
    "no_bypass_encodings": "WAF/필터 우회 인코딩 변형(단일/이중 URL인코딩, 오버롱 UTF-8, null byte) 끄기 -- 기본은 켜짐",
    "workers": "동시 요청 수 (기본 3, 최대 10)",
    "min_interval": "같은 호스트에 대한 요청 사이 최소 간격, 초 단위 (기본 0.5)",
    "timeout": "요청 1건당 타임아웃, 초 단위 (기본 10)",
    "retries": "네트워크 오류 시 재시도 횟수 (기본 1)",
    "max_requests": "전체 모드 합산 요청 수 상한 (기본 1000, 안전상한 3000)",
    "ignore_robots": "robots.txt 무시 (기본은 준수)",
    "user_agent": "요청 시 보낼 User-Agent 문자열",
    "cookies": "모든 요청에 실어 보낼 Cookie 헤더, 'k=v; k2=v2' 형식",
    "headers": "모든 요청에 추가할 헤더 'Name: value' (반복 가능)",
    "output": "출력 형식 (console 또는 json)",
    "output_file": "JSON 리포트를 저장할 파일 경로",
    "force": "안전상한(traversal-limit 2000, max-requests 3000) 초과를 허용",
    "estimate_only": "실제 요청 없이 예상 요청 수만 JSON으로 출력하고 종료",
    "verbose": "상세 로그 출력",
}


def _ask_yes_no(prompt: str, default: bool = False) -> bool:
    suffix = "Y/n" if default else "y/N"
    v = input(f"{prompt} ({suffix}): ").strip().lower()
    if not v:
        return default
    return v in ("y", "yes")


def _ask_float_range(prompt: str, lo: float, hi: float, default: float) -> float:
    while True:
        v = input(f"{prompt} [{lo}~{hi}, 기본 {default}]: ").strip()
        if not v:
            return default
        try:
            n = float(v)
        except ValueError:
            print(f"  숫자를 입력하세요 ({lo}~{hi}).")
            continue
        if not (lo <= n <= hi):
            print(f"  {lo}~{hi} 범위 안에서 입력하세요.")
            continue
        return n


def _ask_int_range(prompt: str, lo: int, hi: int, default: int) -> int:
    while True:
        v = input(f"{prompt} [{lo}~{hi}, 기본 {default}]: ").strip()
        if not v:
            return default
        try:
            n = int(v)
        except ValueError:
            print(f"  정수를 입력하세요 ({lo}~{hi}).")
            continue
        if not (lo <= n <= hi):
            print(f"  {lo}~{hi} 범위 안에서 입력하세요.")
            continue
        return n


def _pick_multi(options: list[tuple[str, str]], current: list[str], title: str) -> list[str]:
    """번호 또는 이름을 ','로 구분해 여러 개 고르는 공용 다중 선택 UI -- "파일 경로를
    직접 타이핑"이 아니라 전체 선택지를 보여주고 그중에서 고르게 한다.
    빈 줄=현재 선택 유지, all=전체 선택, q=선택 전부 해제."""
    key_set = {key for key, _ in options}
    while True:
        print(f"\n-- {title} --")
        for i, (key, label) in enumerate(options, start=1):
            mark = "x" if key in current else " "
            print(f"  [{mark}] {i:>2}. {key:<12} {label}")
        print(f"  현재 선택: {', '.join(current) if current else '(없음)'}")
        raw = input("번호 또는 이름을 ','로 구분해 입력 (빈 줄=유지, all=전체, q=선택 해제): ").strip()
        if raw == "":
            return current
        if raw.lower() == "q":
            return []
        if raw.lower() == "all":
            return [key for key, _ in options]
        picked: list[str] = []
        bad: list[str] = []
        for token in raw.split(","):
            token = token.strip()
            if not token:
                continue
            if token.isdigit() and 1 <= int(token) <= len(options):
                picked.append(options[int(token) - 1][0])
            elif token in key_set:
                picked.append(token)
            else:
                bad.append(token)
        if bad:
            print(f"  알 수 없는 항목: {', '.join(bad)} -- 번호 또는 위 목록의 이름으로 다시 입력하세요.")
            continue
        seen: set[str] = set()
        result: list[str] = []
        for key in picked:
            if key not in seen:
                seen.add(key)
                result.append(key)
        return result


# 자유 텍스트로 받으면 무엇을 적어야 할지 알 수 없는 옵션들을 번호/이름 다중 선택
# 메뉴로 바꾼다 -- dest별로 선택지 목록과 메뉴 제목을 등록.
MULTI_SELECT_FIELDS: dict[str, dict] = {
    "tech": {"title": "대상 기술 스택(웹서버/프레임워크/API/CMS 등) 선택", "options": TECH_CHOICES},
}


def _interactive_menu_loop(
    parser: argparse.ArgumentParser, pos_values: dict[str, str], opt_values: dict[str, object],
) -> tuple[dict[str, str], dict[str, object]] | None:
    """Number-driven advanced menu: builds on whatever pos_values/opt_values the
    caller already collected (empty dicts for a cold start, or the 간단 모드
    wizard's answers when the user asks to fine-tune further) -- stays in sync
    with the parser's own option definitions automatically as options change."""
    positionals = [a for a in parser._actions if not a.option_strings]
    optionals = [a for a in parser._actions if a.option_strings and a.dest != "help"]

    for act in positionals:
        if act.dest in pos_values:
            continue
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
            help_text = KOREAN_HELP.get(act.dest, act.help or '')
            print(f"  {i:>2}. {name:<20} = {state:<22}{req}  {help_text}{choices}")
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
        if act.dest in MULTI_SELECT_FIELDS:
            spec = MULTI_SELECT_FIELDS[act.dest]
            current_raw = opt_values.get(act.dest)
            if isinstance(current_raw, list):
                current = list(current_raw)
            elif isinstance(current_raw, str):
                current = [c.strip() for c in current_raw.split(",") if c.strip()]
            else:
                default_raw = act.default if isinstance(act.default, str) else ""
                current = [c.strip() for c in default_raw.split(",") if c.strip()]
            picked = _pick_multi(spec["options"], current, spec["title"])
            if isinstance(act, argparse._AppendAction):
                opt_values[act.dest] = picked
            elif picked:
                opt_values[act.dest] = ",".join(picked)
            else:
                opt_values.pop(act.dest, None)
        elif isinstance(act, argparse._StoreTrueAction):
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

    return pos_values, opt_values


def _argv_from_values(parser: argparse.ArgumentParser, pos_values: dict[str, str], opt_values: dict[str, object]) -> list[str]:
    positionals = [a for a in parser._actions if not a.option_strings]
    optionals = [a for a in parser._actions if a.option_strings and a.dest != "help"]
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


def _interactive_argv(parser: argparse.ArgumentParser) -> list[str] | None:
    """Full numbered menu covering every CLI flag -- kept as the '고급' path
    reachable from _guided_wizard(), and still usable stand-alone."""
    result = _interactive_menu_loop(parser, {}, {})
    if result is None:
        return None
    return _argv_from_values(parser, *result)


def _guided_wizard(parser: argparse.ArgumentParser) -> list[str] | None:
    """간단 모드: 경로/메서드는 이미 내장 워드리스트 기반 GET이라 물어볼 필요가 없고,
    실제로 매번 달라지는 값(대상 URL, 인증 쿠키/헤더, 어떤 모드를 켤지, 요청 속도)만
    순서대로 묻는다. 고급 옵션이 더 필요하면 마지막에 기존 번호 메뉴로 이어간다."""
    print(f"\n=== {parser.prog} 간단 모드 ===")
    print("(URL과 필요한 항목만 순서대로 입력 -> 마지막에 실행 여부 확인)\n")

    url = ""
    while not url:
        url = input("대상 URL: ").strip()
        if not url:
            print("  필수 입력값입니다.")

    pos_values: dict[str, str] = {"url": url}
    opt_values: dict[str, object] = {}

    cookie = input("세션 쿠키 (로그인 후 검사 시, 없으면 Enter): ").strip()
    if cookie:
        opt_values["cookies"] = cookie

    print("추가 헤더 (예: X-Api-Key: abc123), 없으면 그냥 Enter로 넘어가기 -- 여러 개면 반복, 빈 줄=종료")
    headers: list[str] = []
    while True:
        h = input("  헤더: ").strip()
        if not h:
            break
        headers.append(h)
    if headers:
        opt_values["headers"] = headers

    print("기본 대상 기술 스택: tomcat, apache, nginx (지문 모드가 뒤질 서버/프레임워크 종류)")
    if not _ask_yes_no("이 기본값 그대로 쓸까요? (아니오=번호/이름으로 직접 선택)", default=True):
        picked = _pick_multi(TECH_CHOICES, ["tomcat", "apache", "nginx"], "대상 기술 스택(웹서버/프레임워크/API/CMS 등) 선택")
        if picked:
            opt_values["tech"] = ",".join(picked)

    if _ask_yes_no("백업 파일 변형(.bak/.old/~ 등)도 확인할까요?"):
        opt_values["mutate"] = True

    if _ask_yes_no("경로순회(디렉터리 트래버설)도 확인할까요?"):
        opt_values["traversal"] = True
        param = ""
        while not param:
            param = input("  트래버설 페이로드를 넣을 쿼리 파라미터명 (예: file): ").strip()
            if not param:
                print("    필수 입력값입니다.")
        opt_values["param"] = param

    interval = _ask_float_range("요청 간격(초, 같은 서버 기준)", 0.05, 5, 0.5)
    if interval != 0.5:
        opt_values["min_interval"] = interval
    workers = _ask_int_range("동시 요청 수", 1, 10, 3)
    if workers != 3:
        opt_values["workers"] = workers

    if _ask_yes_no("고급 옵션(대상 기술 스택, 트래버설 대상 OS, 총 요청 상한 등)을 더 조정할까요?"):
        result = _interactive_menu_loop(parser, pos_values, opt_values)
        if result is None:
            return None
        pos_values, opt_values = result

    return _argv_from_values(parser, pos_values, opt_values)


_UNLIMITED_BUDGET = 10**9  # sentinel for --max-requests 0 ("전체 사용") -- an
# ordinary (non-huge) target/payload list is always far smaller than this, so
# every `min(len(list), budget)` naturally resolves to len(list) (no
# truncation) while every value in the arithmetic below stays a plain int
# (no float/inf slicing pitfalls in the real `list[:budget]` truncation
# branches inside main()).


def _effective_budget(max_requests: int) -> int:
    """`--max-requests 0` means "선택한 목록/후보 전체 사용", not "예산 0회
    (전부 건너뜀)" (spec: 목록 진행·Infra·ffuf·Gobuster·HTTP History
    개선명세서 §3.3 "0=전체")."""
    return _UNLIMITED_BUDGET if max_requests == 0 else max_requests


def _estimate_dict(args: argparse.Namespace) -> dict:
    """Mirrors main()'s own job-list construction (same functions, same
    budget arithmetic) but never opens a socket -- just counts how many
    requests the current options would actually send. Shared by
    `_print_estimate` (CLI --estimate-only) and main()'s own pre-flight
    safety check for `--max-requests 0`."""
    budget = _effective_budget(args.max_requests)
    fingerprint_count = 0
    traversal_count = 0

    if not args.no_fingerprint:
        budget -= 1  # the SPA-fallback baseline probe main() always does first
        techs = [t.strip().lower() for t in args.tech.split(",") if t.strip()]
        targets = build_fingerprint_targets(techs, not args.no_generic)
        fingerprint_count = min(len(targets), max(budget, 0))
        budget -= fingerprint_count

    if args.traversal and budget > 0:
        payload_pairs = load_traversal_payloads(args.target_os, min(args.traversal_limit, budget), not args.no_bypass_encodings)
        traversal_count = len(payload_pairs)

    mutate_paths_count = 0
    if args.mutate_paths:
        base_urls = [u.strip() for u in args.mutate_paths.split(",") if u.strip()]
        mutate_paths_count = min(len(base_urls) * len(BACKUP_SUFFIXES), max(_effective_budget(args.max_requests), 0))

    return {
        "fingerprint_requests": fingerprint_count,
        "traversal_requests": traversal_count,
        "mutate_paths_requests": mutate_paths_count,
        "baseline_probe": 0 if args.no_fingerprint else 1,
        "total_requests": (
            mutate_paths_count if args.mutate_paths
            else fingerprint_count + traversal_count + (0 if args.no_fingerprint else 1)
        ),
        "mutate_enabled": bool(args.mutate),
        "max_requests": args.max_requests,
        "unlimited": args.max_requests == 0,
    }


def _print_estimate(args: argparse.Namespace) -> int:
    print(json.dumps(_estimate_dict(args), ensure_ascii=False))
    return 0


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass

    parser = build_arg_parser()
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S", stream=sys.stderr)

    # bug fix (2026-09-06): a bare host/IP with no scheme (e.g. "192.168.0.12")
    # used to reach urllib.request.urlopen() unchanged, which raises a plain
    # ValueError("unknown url type") that fetch()'s except clause doesn't
    # catch -- crashing the whole script with a raw traceback instead of the
    # clean, one-line error every other bad-input case already gets.
    if urlparse(args.url).scheme not in ("http", "https"):
        logger.error("URL must start with http:// or https://: %r", args.url)
        return 2

    if args.traversal_limit > 2000 and not args.force:
        logger.error("--traversal-limit %d exceeds the safety ceiling of 2000 (use --force to override)", args.traversal_limit)
        return 2
    if args.max_requests > MAX_TOTAL_REQUESTS and not args.force:
        logger.error("--max-requests %d exceeds the safety ceiling of %d (use --force to override)", args.max_requests, MAX_TOTAL_REQUESTS)
        return 2
    if args.max_requests == 0 and not args.force and not args.estimate_only:
        # --estimate-only is read-only (no requests are ever sent), so it must
        # never be blocked by this gate -- that's exactly what a GUI/CLI user
        # needs to be able to run *before* deciding whether to actually
        # confirm+force a large 0=전체 run.
        projected_total = _estimate_dict(args)["total_requests"]
        if projected_total > MAX_TOTAL_REQUESTS:
            logger.error(
                "--max-requests 0(전체)이면 예상 %d회 요청이 발생합니다 -- 안전 상한 %d회를 넘으므로 "
                "--force로 명시적으로 확인해야 합니다.",
                projected_total, MAX_TOTAL_REQUESTS,
            )
            return 2
    if args.workers > 10:
        logger.warning("--workers capped at 10 to avoid hammering the target server.")
    if args.traversal and not args.param and not args.url_template:
        logger.error("--traversal requires either --param NAME or --url-template (with a FUZZ marker in url)")
        return 2

    if args.estimate_only:
        return _print_estimate(args)

    rate_limiter = HostRateLimiter(args.min_interval)
    robots = RobotsCache(args.user_agent, args.timeout, not args.ignore_robots)
    extra_headers: dict[str, str] = {}
    if args.cookies:
        extra_headers["Cookie"] = args.cookies
    for h in args.headers:
        if ":" in h:
            k, v = h.split(":", 1)
            extra_headers[k.strip()] = v.strip()

    if args.mutate_paths:
        # Standalone backup-mutation run against a caller-supplied base path
        # list -- skips fingerprint/traversal entirely, independent of
        # --no-fingerprint/--traversal (used by the GUI's separate 백업 파일
        # 탐지 tab, which may run this against last fingerprint run's hits,
        # the current target URL alone, or a manually typed path list).
        base_urls = [u.strip() for u in args.mutate_paths.split(",") if u.strip()]
        if not base_urls:
            logger.error("--mutate-paths given but no usable URL found in it")
            return 2
        mutate_jobs = [("backup-mutation", u + suf, None) for u in base_urls for suf in BACKUP_SUFFIXES]
        if len(mutate_jobs) > _effective_budget(args.max_requests) and not args.force:
            logger.error(
                "--mutate-paths would send %d requests, exceeding --max-requests %d (use --force to override)",
                len(mutate_jobs), args.max_requests,
            )
            return 2
        logger.info("Backup-mutation mode (standalone): probing %d variant(s) of %d base path(s)", len(mutate_jobs), len(base_urls))
        results = _fetch_batch(mutate_jobs, rate_limiter, robots, args.workers, args.timeout, args.retries, args.user_agent, want_body=False, signature_check=False, extra_headers=extra_headers)
        if args.output == "json":
            if args.output_file:
                write_json_report(results, args.output_file)
                logger.info("JSON report written to %s", args.output_file)
            else:
                print(json.dumps(_results_to_json(results, None), indent=2, ensure_ascii=False))
        else:
            print_console_report(results)
            if args.output_file:
                write_json_report(results, args.output_file)
                logger.info("JSON report additionally written to %s", args.output_file)
        return 0

    all_results: list[ProbeResult] = []
    budget = _effective_budget(args.max_requests)
    baseline: tuple[int, int] | None = None

    if not args.no_fingerprint:
        baseline = detect_fallback_baseline(args.url, args.timeout, args.user_agent, args.retries, extra_headers)
        budget -= 1
        if baseline and baseline[0] != 404:
            logger.warning(
                "Nonexistent paths return %s (%dB) here too (looks like an SPA catch-all route) -- "
                "results matching that status+size will be excluded from hits.", baseline[0], baseline[1],
            )
        techs = [t.strip().lower() for t in args.tech.split(",") if t.strip()]
        targets = build_fingerprint_targets(techs, not args.no_generic)
        original_target_count = len(targets)
        if len(targets) > budget:
            logger.warning("Fingerprint target list (%d) exceeds remaining request budget (%d); truncating.", len(targets), budget)
            targets = targets[:budget]
        jobs = [(cat, urljoin(args.url.rstrip("/") + "/", path), None) for cat, path in targets]
        logger.info(
            "목록: 유효 %d개 / 원본 %d개 | 사용: %s%d개%s",
            original_target_count, original_target_count,
            "전체 " if args.max_requests == 0 else "", len(jobs),
            " (제한값 0 = 전체)" if args.max_requests == 0 else "",
        )
        logger.info("Fingerprint mode: probing %d path(s) across tech(es) %s", len(jobs), ", ".join(techs) + (", generic" if not args.no_generic else ""))
        fp_results = _fetch_batch(jobs, rate_limiter, robots, args.workers, args.timeout, args.retries, args.user_agent, want_body=False, signature_check=False, extra_headers=extra_headers)
        all_results.extend(fp_results)
        budget -= len(fp_results)

        if args.mutate and budget > 0:
            hits = [r for r in fp_results if _is_hit(r, baseline)]
            mutate_jobs = [("backup-mutation", r.url + suf, None) for r in hits for suf in BACKUP_SUFFIXES]
            if len(mutate_jobs) > budget:
                logger.warning("Backup-mutation target list (%d) exceeds remaining request budget (%d); truncating.", len(mutate_jobs), budget)
                mutate_jobs = mutate_jobs[:budget]
            if mutate_jobs:
                logger.info("Backup-mutation mode: probing %d variant(s) of %d discovered path(s)", len(mutate_jobs), len(hits))
                mut_results = _fetch_batch(mutate_jobs, rate_limiter, robots, args.workers, args.timeout, args.retries, args.user_agent, want_body=False, signature_check=False, extra_headers=extra_headers)
                all_results.extend(mut_results)
                budget -= len(mut_results)

    if args.traversal and budget > 0:
        payload_pairs = load_traversal_payloads(args.target_os, min(args.traversal_limit, budget), not args.no_bypass_encodings)
        if args.url_template:
            jobs = [("traversal", args.url.replace("FUZZ", payload), payload) for _, payload in payload_pairs]
        else:
            sep = "&" if "?" in args.url else "?"
            jobs = [("traversal", f"{args.url}{sep}{args.param}={payload}", payload) for _, payload in payload_pairs]
        logger.info("Traversal mode: probing %d payload(s)", len(jobs))
        trav_results = _fetch_batch(jobs, rate_limiter, robots, args.workers, args.timeout, args.retries, args.user_agent, want_body=True, signature_check=True, extra_headers=extra_headers)
        all_results.extend(trav_results)

    if args.output == "json":
        if args.output_file:
            write_json_report(all_results, args.output_file, baseline)
            logger.info("JSON report written to %s", args.output_file)
        else:
            print(json.dumps(_results_to_json(all_results, baseline), indent=2, ensure_ascii=False))
    else:
        print_console_report(all_results, baseline)
        if args.output_file:
            write_json_report(all_results, args.output_file, baseline)
            logger.info("JSON report additionally written to %s", args.output_file)

    return 0


if __name__ == "__main__":
    for _stream in (sys.stdout, sys.stderr):
        try:
            _stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    if len(sys.argv) == 1:
        try:
            _argv = _guided_wizard(build_arg_parser())
        except (EOFError, KeyboardInterrupt):
            print("\n입력이 중단됨 -- 취소됨.")
            raise SystemExit(130)
        if _argv is None:
            print("취소됨.")
            raise SystemExit(0)
        raise SystemExit(main(_argv))
    raise SystemExit(main())
