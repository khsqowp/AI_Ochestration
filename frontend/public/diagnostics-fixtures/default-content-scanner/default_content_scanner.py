#!/usr/bin/env python3
"""Default-content / sample-file / backup-file / path-traversal scanner.

Three probing modes, all rate-limited the same way as the sibling
site_depth_crawler (bounded concurrency + per-host minimum interval,
always on, never disabled):

  1. Fingerprint mode (default): probes known default/sample/test/docs
     paths shipped by common server software (Tomcat, Apache httpd,
     nginx, IIS, JBoss) using the bundled SecLists Web-Servers lists,
     plus a small built-in list of common sensitive/generic files
     (.env, .git/HEAD, docker-compose.yml, phpinfo.php, ...).

  2. Backup-mutation mode (--mutate): for every path the fingerprint
     pass finds (status != 404), also probes common backup-file
     variants of it (.bak, ~, .old, .orig, .swp, .zip, ...).

  3. Path-traversal mode (--traversal): fuzzes a query parameter or a
     FUZZ marker in a URL template with traversal payloads from the
     bundled PayloadsAllTheThings Directory Traversal lists, and flags
     responses matching known target-file signatures (/etc/passwd,
     win.ini).

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

DEFAULT_USER_AGENT = "default-content-scanner/1.0 (+rate-limited; contact: local-security-testing)"
MAX_BODY_BYTES = 512 * 1024
MAX_TOTAL_REQUESTS = 3000  # hard ceiling unless --force

TECH_WORDLISTS = {
    "tomcat": SECLISTS_WEB_CONTENT / "Web-Servers" / "Apache-Tomcat.txt",
    "apache": SECLISTS_WEB_CONTENT / "Web-Servers" / "Apache.txt",
    "nginx": SECLISTS_WEB_CONTENT / "Web-Servers" / "nginx.txt",
    "iis": SECLISTS_WEB_CONTENT / "Web-Servers" / "IIS.txt",
    "jboss": SECLISTS_WEB_CONTENT / "Web-Servers" / "JBoss.txt",
    "db-backups": SECLISTS_WEB_CONTENT / "Common-DB-Backups.txt",
}

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

TRAVERSAL_TARGET_FILES = {"unix": "etc/passwd", "windows": "windows/win.ini"}
TRAVERSAL_SIGNATURES = {
    "unix": re.compile(r"root:.*:0:0:"),
    "windows": re.compile(r"\[(fonts|extensions)\]", re.IGNORECASE),
}


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
        wl = TECH_WORDLISTS.get(tech)
        if wl is None:
            logger.warning("Unknown --tech value: %s (known: %s)", tech, ", ".join(TECH_WORDLISTS))
            continue
        if not wl.is_file():
            logger.warning("Wordlist missing for %s: %s", tech, wl)
            continue
        for line in load_lines(wl):
            targets.append((tech, line))
    if include_generic:
        targets.extend(("generic", p) for p in GENERIC_DEFAULT_PATHS)
    return targets


def load_traversal_payloads(target_os: str, limit: int) -> list[tuple[str, str]]:
    """Returns (target_file_label, payload) pairs."""
    payloads: list[tuple[str, str]] = []

    direct_file = PAYLOADS_TRAVERSAL_DIR / "directory_traversal.txt"
    if direct_file.is_file():
        payloads.extend(("mixed", p) for p in load_lines(direct_file))

    os_list = ["unix", "windows"] if target_os == "both" else [target_os]
    for template_file in ("deep_traversal.txt", "traversals-8-deep-exotic-encoding.txt"):
        p = PAYLOADS_TRAVERSAL_DIR / template_file
        if not p.is_file():
            continue
        for line in load_lines(p):
            for os_name in os_list:
                payloads.append((os_name, line.replace("{FILE}", TRAVERSAL_TARGET_FILES[os_name])))

    seen: set[str] = set()
    unique = [pl for pl in payloads if not (pl[1] in seen or seen.add(pl[1]))]
    if len(unique) > limit:
        logger.warning("Traversal payload set has %d entries, truncating to --traversal-limit %d", len(unique), limit)
        unique = unique[:limit]
    return unique


# ---------------------------------------------------------------------------
# Fetching
# ---------------------------------------------------------------------------
def fetch(url: str, timeout: int, user_agent: str, max_retries: int, want_body: bool) -> tuple[int | None, int | None, float, bytes, str | None]:
    attempt = 0
    last_error: str | None = None
    while attempt <= max_retries:
        start = time.monotonic()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": user_agent})
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


def detect_fallback_baseline(base_url: str, timeout: int, user_agent: str, max_retries: int) -> tuple[int, int] | None:
    """Some apps (SPAs with client-side routing, e.g. Angular/React with a
    catch-all server route) return 200 with the *same* body for literally
    any unknown path instead of a real 404 -- probe one definitely-bogus
    path first so the real fingerprint sweep can tell an actual hit apart
    from that fallback noise (otherwise every single probed path "hits").
    Returns None if the probe itself failed (network error etc.)."""
    probe_path = f"__nx_{uuid.uuid4().hex[:16]}__"
    url = urljoin(base_url.rstrip("/") + "/", probe_path)
    status, length, _elapsed, _body, error = fetch(url, timeout, user_agent, max_retries, want_body=False)
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
) -> list[ProbeResult]:
    def _one(job: tuple[str, str, str | None]) -> ProbeResult:
        category, url, payload = job
        if not robots.allowed(url):
            return ProbeResult(category=category, url=url, error="Disallowed by robots.txt", payload=payload)
        host_key = urlparse(url).hostname or url
        rate_limiter.wait(host_key)
        status, length, elapsed_ms, body, error = fetch(url, timeout, user_agent, max_retries, want_body)
        matched = None
        if signature_check and body:
            text = body.decode("utf-8", errors="replace")
            for os_name, pattern in TRAVERSAL_SIGNATURES.items():
                if pattern.search(text):
                    matched = os_name
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
    parser.add_argument("--tech", default="tomcat,apache,nginx", help="Comma-separated tech wordlists to probe (default: tomcat,apache,nginx). Known: " + ", ".join(TECH_WORDLISTS))
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
    parser.add_argument("--workers", type=int, default=3, help="Max concurrent requests (default 3, capped at 10)")
    parser.add_argument("--min-interval", type=float, default=0.5, help="Minimum seconds between requests to the same host (default 0.5)")
    parser.add_argument("--timeout", type=int, default=10, help="Per-request timeout in seconds (default 10)")
    parser.add_argument("--retries", type=int, default=1, help="Retries for transient network errors (default 1)")
    parser.add_argument("--max-requests", type=int, default=1000, help="Hard cap on total requests across all modes (default 1000, ceiling 3000 unless --force)")
    parser.add_argument("--ignore-robots", action="store_true", help="Do not consult robots.txt")
    parser.add_argument("--user-agent", default=DEFAULT_USER_AGENT, help="Custom User-Agent string")
    parser.add_argument("--output", choices=["console", "json"], default="console", help="Report format (default console)")
    parser.add_argument("--output-file", default=None, help="Write JSON report to this path")
    parser.add_argument("--force", action="store_true", help="Override safety ceilings")
    parser.add_argument(
        "--estimate-only", action="store_true",
        help="Print the request-count estimate for the current options as JSON and exit (no network requests)",
    )
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
        payload_pairs = load_traversal_payloads(args.target_os, min(args.traversal_limit, budget))
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
        results = _fetch_batch(mutate_jobs, rate_limiter, robots, args.workers, args.timeout, args.retries, args.user_agent, want_body=False, signature_check=False)
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
        baseline = detect_fallback_baseline(args.url, args.timeout, args.user_agent, args.retries)
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
        fp_results = _fetch_batch(jobs, rate_limiter, robots, args.workers, args.timeout, args.retries, args.user_agent, want_body=False, signature_check=False)
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
                mut_results = _fetch_batch(mutate_jobs, rate_limiter, robots, args.workers, args.timeout, args.retries, args.user_agent, want_body=False, signature_check=False)
                all_results.extend(mut_results)
                budget -= len(mut_results)

    if args.traversal and budget > 0:
        payload_pairs = load_traversal_payloads(args.target_os, min(args.traversal_limit, budget))
        if args.url_template:
            jobs = [("traversal", args.url.replace("FUZZ", payload), payload) for _, payload in payload_pairs]
        else:
            sep = "&" if "?" in args.url else "?"
            jobs = [("traversal", f"{args.url}{sep}{args.param}={payload}", payload) for _, payload in payload_pairs]
        logger.info("Traversal mode: probing %d payload(s)", len(jobs))
        trav_results = _fetch_batch(jobs, rate_limiter, robots, args.workers, args.timeout, args.retries, args.user_agent, want_body=True, signature_check=True)
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
        _argv = _interactive_argv(build_arg_parser())
        if _argv is None:
            print("취소됨.")
            raise SystemExit(0)
        raise SystemExit(main(_argv))
    raise SystemExit(main())
