#!/usr/bin/env python3
"""Rate-limited, depth-bounded site crawler/analyzer.

Given a starting URL and a maximum link-following depth, crawls the site
breadth-first up to that depth and reports what it found (status code,
content-type, title, size, response time, outbound link count) for every
page -- WITHOUT overloading the target server.

"Don't overload the server" is enforced by two independent, always-on
controls (mirrors the sibling ssl_tls_scanner project's philosophy):

  1. A small bounded thread pool caps *concurrent* in-flight requests.
  2. A per-host minimum-interval gate caps *request rate* even across
     threads, because a concurrency cap alone doesn't limit throughput
     when each request is fast.

Self-contained: stdlib only (urllib, threading, html.parser), no external
dependencies required.

Usage:
    python crawler.py https://example.com --depth 2
    python crawler.py https://example.com --depth 3 --output json --output-file report.json
    python crawler.py https://example.com --depth 2 --workers 2 --min-interval 1.0
    python crawler.py https://example.com --depth 2 --allow-external --ignore-robots
    python crawler.py https://example.com --wordlist common.txt
    python crawler.py https://example.com --wordlist raft-large-directories.txt --wordlist-limit 500

--wordlist accepts an absolute/relative path to any newline-delimited path
list, or a short name (e.g. "common.txt", "raft-large-directories") that is
resolved against the bundled SecLists checkout's Discovery/Web-Content
directory (../SecLists-master/Discovery/Web-Content relative to this file).
"""
from __future__ import annotations

import argparse
import hashlib
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
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import quote, urljoin, urlparse, urlunparse

logger = logging.getLogger("site_depth_crawler")

DEFAULT_USER_AGENT = "site-depth-crawler/1.0 (+rate-limited; contact: local-security-testing)"
MAX_BODY_BYTES = 2 * 1024 * 1024  # 2 MB cap per page, be gentle on bandwidth
MAX_ALLOWED_DEPTH = 10  # safety ceiling unless --force is passed
MAX_WORDLIST_PATHS = 2000  # safety ceiling unless --force is passed
SECLISTS_WEB_CONTENT_DIR = Path(__file__).resolve().parent.parent / "SecLists-master" / "Discovery" / "Web-Content"


# ---------------------------------------------------------------------------
# Rate limiting (concurrency cap + per-host minimum interval)
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


# ---------------------------------------------------------------------------
# Minimal HTML parsing: title + outbound links, no external deps
# ---------------------------------------------------------------------------
class _PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title_parts: list[str] = []
        self._in_title = False
        self.links: list[str] = []
        self.script_srcs: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "title":
            self._in_title = True
        attr_dict = dict(attrs)
        if tag == "a" and attr_dict.get("href"):
            self.links.append(attr_dict["href"])
        elif tag == "link" and attr_dict.get("href"):
            self.links.append(attr_dict["href"])
        elif tag == "script" and attr_dict.get("src"):
            self.script_srcs.append(attr_dict["src"])

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title_parts.append(data)

    @property
    def title(self) -> str | None:
        text = "".join(self.title_parts).strip()
        return text or None


def parse_html(body: str) -> tuple[str | None, list[str], list[str]]:
    """Returns (title, <a>/<link> hrefs, <script src> srcs)."""
    parser = _PageParser()
    try:
        parser.feed(body)
    except Exception:  # noqa: BLE001 -- malformed HTML must never crash the crawl
        pass
    return parser.title, parser.links, parser.script_srcs


# ---------------------------------------------------------------------------
# URL helpers
# ---------------------------------------------------------------------------
def _percent_encode_if_needed(component: str, safe: str) -> str:
    """A discovered <a href> can legally contain raw, un-percent-encoded
    non-ASCII text (e.g. a Korean-language path/query) -- http.client's
    request-line encoder is ASCII-only and crashes with a bare
    UnicodeEncodeError the instant it sees one, taking the whole crawl down
    with it. Only touches components that actually contain a non-ASCII
    character, so an already-percent-encoded (pure-ASCII) component is left
    byte-for-byte alone -- never double-encoded."""
    try:
        component.encode("ascii")
        return component
    except UnicodeEncodeError:
        return quote(component, safe=safe)


def _encode_netloc(netloc: str) -> str:
    """IDNA-encodes a non-ASCII hostname (internationalized domain name),
    preserving userinfo@ and :port if present. Same crash mode as the path/
    query case above, just for the Host component instead."""
    try:
        netloc.encode("ascii")
        return netloc
    except UnicodeEncodeError:
        pass
    userinfo, _, hostport = netloc.rpartition("@")
    host, sep, port = hostport.partition(":")
    try:
        host = host.encode("idna").decode("ascii")
    except UnicodeError:
        host = quote(host)  # not a valid IDNA hostname either -- best-effort fallback, still ASCII-safe
    hostport = host + sep + port
    return f"{userinfo}@{hostport}" if userinfo else hostport


def ensure_ascii_safe_url(url: str) -> str:
    """Percent-/IDNA-encodes whatever in `url` isn't already ASCII-safe,
    without touching scheme/params/fragment or re-encoding anything that's
    already valid. Shared by normalize_url() (the main crawl loop's own
    link list) AND fetch_page() itself (SPA-assist / Burp-History candidate
    URLs reach fetch_page() directly, bypassing normalize_url() entirely --
    this is the one place every caller is guaranteed to pass through)."""
    parsed = urlparse(url)
    netloc = _encode_netloc(parsed.netloc)
    path = _percent_encode_if_needed(parsed.path, safe="/%:@!$&'()*+,;=")
    query = _percent_encode_if_needed(parsed.query, safe="/%:@!$&'()*+,;=?")
    return urlunparse((parsed.scheme, netloc, path, parsed.params, query, parsed.fragment))


def normalize_url(url: str) -> str:
    parsed = urlparse(ensure_ascii_safe_url(url))
    # Drop fragments (they never hit the server) and normalize an empty path.
    path = parsed.path or "/"
    return urlunparse((parsed.scheme, parsed.netloc.lower(), path, parsed.params, parsed.query, ""))


def is_http_url(url: str) -> bool:
    return urlparse(url).scheme in ("http", "https")


def same_registrable_host(url_a: str, url_b: str) -> bool:
    return urlparse(url_a).hostname == urlparse(url_b).hostname


# ---------------------------------------------------------------------------
# Fetch result model
# ---------------------------------------------------------------------------
@dataclass
class PageResult:
    url: str
    depth: int
    status_code: int | None = None
    content_type: str | None = None
    title: str | None = None
    content_length: int | None = None
    response_time_ms: float | None = None
    outbound_link_count: int = 0
    error: str | None = None
    source: str = "crawl"
    discovered_links: list[str] = field(default_factory=list)
    script_srcs: list[str] = field(default_factory=list)  # <script src> URLs -- SPA-assist JS bundle candidates
    body_hash: str | None = None  # only computed when SPA-assist needs it for fallback-response comparison
    is_spa_fallback: bool = False  # true once compared against a fallback baseline and found to match it

    def to_dict(self) -> dict:
        d = {k: v for k, v in self.__dict__.items() if k not in ("discovered_links", "script_srcs")}
        return d


# ---------------------------------------------------------------------------
# Early-termination reasons (spec: 크롤링 깊이 옵션 적용 수정 §5.4) -- crawl()
# always ends for exactly one of these reasons, even a "clean" one (reached
# the configured max depth). Reported so "설정 깊이 3, 실제 깊이 1" is never
# silently presented as an unqualified success.
# ---------------------------------------------------------------------------
TERMINATION_MAX_DEPTH = "설정한 최대 깊이에 도달함"
TERMINATION_NO_LINKS = "다음 단계에서 방문할 링크가 발견되지 않음"
TERMINATION_OUT_OF_SCOPE = "동일 대상 범위 밖의 링크만 발견됨"
TERMINATION_ROBOTS = "robots.txt에 의해 다음 링크가 제외됨"
TERMINATION_MAX_PAGES = "최대 페이지 수에 도달함"
TERMINATION_REQUEST_ERROR = "요청 오류로 다음 링크를 수집하지 못함"
TERMINATION_USER_STOPPED = "사용자가 중지함"  # never set here -- the GUI reports this itself on terminate()
TERMINATION_EMERGENCY_LIMIT = "비상 한도 도달로 중단"  # spec: 목록 진행·Infra·ffuf·
# Gobuster·HTTP History 개선명세서 §3.5 -- reached only via the absolute
# EMERGENCY_VISITED_LIMIT safety valve below, never presented as a clean
# success even though pages already collected are still returned.

# `--max-pages 0` means "지정 깊이/범위 안에서 새 URL이 없을 때까지 탐색"
# (spec §3.3, §3.5), not "0 페이지(즉시 종료)" -- `len(results) < max_pages`
# with max_pages=0 used to be false before the loop even ran once. This
# sentinel keeps every existing `< max_pages` / `max_pages - len(results)`
# expression working unchanged for the "unlimited" case.
_UNLIMITED_PAGES = 10**9
# Absolute memory-safety ceiling independent of --max-pages -- without this,
# `--max-pages 0` would have no fan-out bound at all (the old `max_pages * 4`
# valve becomes astronomically large once max_pages is the sentinel above).
EMERGENCY_VISITED_LIMIT = 50_000
# Same path with more distinct query strings than this is very likely an
# infinite query-parameter generator (e.g. a calendar "next month" link) --
# warned once per path, never silently crawled forever.
QUERY_VARIATION_WARN_THRESHOLD = 50


def _effective_max_pages(max_pages: int) -> int:
    return _UNLIMITED_PAGES if max_pages == 0 else max_pages


@dataclass
class CrawlStats:
    requested_max_depth: int
    reached_depth: int = 0
    pages_by_depth: dict[int, int] = field(default_factory=dict)
    termination_reason: str = TERMINATION_MAX_DEPTH
    unlimited_pages: bool = False  # --max-pages 0
    query_variation_warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "requested_max_depth": self.requested_max_depth,
            "reached_depth": self.reached_depth,
            "pages_by_depth": dict(sorted(self.pages_by_depth.items())),
            "termination_reason": self.termination_reason,
            "unlimited_pages": self.unlimited_pages,
            "query_variation_warnings": self.query_variation_warnings,
        }


# ---------------------------------------------------------------------------
# Robots.txt handling
# ---------------------------------------------------------------------------
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
                    with urllib.request.urlopen(req, timeout=self.timeout) as resp:  # noqa: S310 - fixed http(s) scheme validated earlier
                        raw = resp.read(65536).decode("utf-8", errors="replace")
                    rp.parse(raw.splitlines())
                except Exception:  # noqa: BLE001 -- no robots.txt / unreachable => treat as allow-all
                    rp.parse([])
                self._parsers[origin] = rp
        try:
            return rp.can_fetch(self.user_agent, url)
        except Exception:  # noqa: BLE001
            return True


# ---------------------------------------------------------------------------
# Fetching a single page
# ---------------------------------------------------------------------------
def fetch_page(
    url: str, depth: int, timeout: int, user_agent: str, max_retries: int, want_hash: bool = False,
    extra_headers: dict[str, str] | None = None,
) -> PageResult:
    # Belt-and-suspenders: normalize_url() already does this for the main
    # crawl loop's own link list, but SPA-assist/Burp-History candidate URLs
    # reach fetch_page() straight from urljoin() without ever passing
    # through normalize_url() -- this is the one spot every caller shares,
    # so a raw non-ASCII URL can never reach http.client and crash the
    # whole crawl with a bare UnicodeEncodeError.
    url = ensure_ascii_safe_url(url)
    attempt = 0
    last_error: str | None = None
    while attempt <= max_retries:
        start = time.monotonic()
        try:
            headers = {"User-Agent": user_agent, "Accept": "text/html,*/*"}
            if extra_headers:
                headers.update(extra_headers)
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 - scheme validated by caller
                status = resp.getcode()
                content_type = resp.headers.get("Content-Type", "")
                body_bytes = resp.read(MAX_BODY_BYTES + 1)
                elapsed_ms = (time.monotonic() - start) * 1000

                truncated = len(body_bytes) > MAX_BODY_BYTES
                if truncated:
                    body_bytes = body_bytes[:MAX_BODY_BYTES]

                title = None
                links: list[str] = []
                script_srcs: list[str] = []
                if "text/html" in content_type.lower():
                    try:
                        body_text = body_bytes.decode(resp.headers.get_content_charset() or "utf-8", errors="replace")
                    except LookupError:
                        body_text = body_bytes.decode("utf-8", errors="replace")
                    title, raw_links, raw_scripts = parse_html(body_text)
                    links = [urljoin(url, link) for link in raw_links if link and not link.startswith(("javascript:", "mailto:", "tel:", "#"))]
                    script_srcs = [urljoin(url, s) for s in raw_scripts if s]

                body_hash = hashlib.md5(body_bytes).hexdigest() if want_hash else None  # noqa: S324 -- similarity check only, not security-sensitive

                return PageResult(
                    url=url,
                    depth=depth,
                    status_code=status,
                    content_type=content_type.split(";")[0].strip() or None,
                    title=title,
                    content_length=len(body_bytes) if not truncated else None,
                    response_time_ms=round(elapsed_ms, 1),
                    outbound_link_count=len(links),
                    discovered_links=links,
                    script_srcs=script_srcs,
                    body_hash=body_hash,
                )
        except urllib.error.HTTPError as exc:
            elapsed_ms = (time.monotonic() - start) * 1000
            # HTTP error responses (4xx/5xx) are a valid *result*, not a
            # transient failure -- report and move on, don't retry.
            return PageResult(
                url=url,
                depth=depth,
                status_code=exc.code,
                content_type=(exc.headers.get("Content-Type", "") if exc.headers else None),
                response_time_ms=round(elapsed_ms, 1),
                error=f"HTTP {exc.code}",
            )
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as exc:
            last_error = str(exc)
            attempt += 1
            if attempt > max_retries:
                break
            time.sleep(0.5 * attempt)

    return PageResult(url=url, depth=depth, error=f"Request failed after {max_retries + 1} attempt(s): {last_error}")


# ---------------------------------------------------------------------------
# SPA fallback detection + JS-bundle-assisted candidate discovery
# (spec: Docker Juice Shop 및 SPA 크롤링 개선 §6.4/§6.5)
#
# Many SPAs (Angular/React/Vue with client-side routing behind a server
# catch-all route) answer literally any unknown path with the same shell
# HTML and HTTP 200 -- without this, every JS-bundle-derived candidate path
# would look like a "discovery". detect_spa_fallback_baseline() probes 1-2
# definitely-bogus paths first so is_spa_fallback_match() can tell a real
# hit apart from that noise, the same approach default_content_scanner.py
# already uses for its own fingerprint sweep.
# ---------------------------------------------------------------------------
MAX_JS_BUNDLES = 10  # default cap on how many <script src> bundles get downloaded, unless --force
MAX_JS_BUNDLES_CEILING = 30
MAX_JS_BUNDLE_BYTES = 400_000  # per-bundle download cap -- bundles can be large, this is a bandwidth/time guard
DEFAULT_SPA_CANDIDATE_LIMIT = 60  # default cap on verified candidate requests, unless --force
MAX_SPA_CANDIDATE_LIMIT = 300

# Deliberately conservative -- only a quoted, absolute (leading "/") path
# with plain URL-safe characters counts as a candidate at all ("명확한 상대
# 경로, API prefix, 라우트 패턴만 후보로 사용한다. 임의 문자열을 전부 URL로
# 간주하지 않는다"). Static-asset-looking paths and source maps are dropped.
_JS_PATH_CANDIDATE_RE = re.compile(r'["\'](/[A-Za-z0-9_\-./]{1,78})["\']')
_STATIC_ASSET_EXT_RE = re.compile(
    r"\.(png|jpe?g|gif|svg|webp|ico|css|scss|woff2?|ttf|eot|otf|mp4|webm|mp3|wav|map)$", re.IGNORECASE
)


@dataclass
class FallbackBaseline:
    status_code: int | None
    content_length: int | None
    title: str | None
    body_hash: str | None


def detect_spa_fallback_baseline(base_url: str, timeout: int, user_agent: str, max_retries: int) -> FallbackBaseline | None:
    """Probes one random, almost-certainly-nonexistent path so later
    candidate checks can recognize a SPA's catch-all response instead of
    reporting it as a real discovery. Returns None only if the probe itself
    failed outright (network error) -- in that case fallback comparison is
    skipped entirely rather than guessed at."""
    probe_path = f"__nx_{uuid.uuid4().hex[:16]}__"
    url = urljoin(base_url.rstrip("/") + "/", probe_path)
    result = fetch_page(url, depth=-1, timeout=timeout, user_agent=user_agent, max_retries=max_retries, want_hash=True)
    if result.error:
        return None
    return FallbackBaseline(
        status_code=result.status_code, content_length=result.content_length, title=result.title, body_hash=result.body_hash
    )


def is_spa_fallback_match(result: PageResult, baseline: FallbackBaseline | None) -> bool:
    """True when a fetched page looks like the same SPA catch-all shell the
    baseline probe got back -- compares status + size + title + body hash,
    not status alone (spec 6.5: "상태 코드뿐 아니라 본문 길이, 제목, 본문
    해시... 함께 비교")."""
    if baseline is None or result.error or result.status_code is None:
        return False
    return (
        result.status_code == baseline.status_code
        and result.content_length == baseline.content_length
        and result.title == baseline.title
        and (baseline.body_hash is None or result.body_hash == baseline.body_hash)
    )


def extract_js_path_candidates(js_text: str, base_url: str) -> list[str]:
    """Pulls plausible same-origin route/API path candidates out of a JS
    bundle's source text -- conservative on purpose (see the module-level
    comment above _JS_PATH_CANDIDATE_RE)."""
    seen: set[str] = set()
    candidates: list[str] = []
    for match in _JS_PATH_CANDIDATE_RE.finditer(js_text):
        path = match.group(1)
        if path in ("/", "") or _STATIC_ASSET_EXT_RE.search(path):
            continue
        url = urljoin(base_url, path)
        if url in seen:
            continue
        seen.add(url)
        candidates.append(url)
    return candidates


def collect_js_bundle_candidates(
    script_srcs: set[str],
    start_url: str,
    *,
    allow_external: bool,
    timeout: int,
    user_agent: str,
    max_retries: int,
    bundle_limit: int,
) -> tuple[list[str], int]:
    """Downloads up to `bundle_limit` same-origin, non-source-map JS bundles
    (each capped at MAX_JS_BUNDLE_BYTES) and extracts path candidates from
    them. Returns (candidate_urls, bundles_fetched) -- bundles_fetched
    counts toward the caller's own request budget (spec: "번들 다운로드도
    전체 최대 페이지 및 요청 수 한도에 포함한다")."""
    same_origin = [
        s for s in script_srcs
        if is_http_url(s) and not s.lower().split("?")[0].endswith(".map") and (allow_external or same_registrable_host(s, start_url))
    ]
    bundles = same_origin[:bundle_limit]
    all_candidates: list[str] = []
    seen: set[str] = set()
    for bundle_url in bundles:
        try:
            req = urllib.request.Request(bundle_url, headers={"User-Agent": user_agent, "Accept": "*/*"})
            with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 - scheme validated above
                raw = resp.read(MAX_JS_BUNDLE_BYTES + 1)
        except Exception as exc:  # noqa: BLE001 -- one unreachable bundle must not abort the rest
            logger.debug("SPA-assist: failed to fetch JS bundle %s: %s", bundle_url, exc)
            continue
        text = raw[:MAX_JS_BUNDLE_BYTES].decode("utf-8", errors="replace")
        for cand in extract_js_path_candidates(text, start_url):
            if cand not in seen:
                seen.add(cand)
                all_candidates.append(cand)
    return all_candidates, len(bundles)


def verify_spa_candidates(
    candidate_urls: list[str],
    *,
    rate_limiter: HostRateLimiter,
    robots: RobotsCache,
    max_workers: int,
    timeout: int,
    max_retries: int,
    user_agent: str,
    baseline: FallbackBaseline | None,
    limit: int,
    source_label: str = "spa-candidate",
    extra_headers: dict[str, str] | None = None,
) -> list[PageResult]:
    """Actually requests each candidate (JS-bundle-derived, or Burp-History-
    derived -- spec 6.3/6.4: "후보 경로는 실제 HTTP 요청으로 확인한 뒤 결과에
    포함한다") and tags any that match the SPA fallback baseline instead of
    silently dropping them, so the report stays honest about what was
    filtered and why."""
    urls = candidate_urls[:limit]
    if len(candidate_urls) > limit:
        logger.warning("Candidate list has %d entries, truncating to the candidate limit %d", len(candidate_urls), limit)
    results = _fetch_batch(
        urls, -1, rate_limiter, robots, max_workers, timeout, max_retries, user_agent,
        want_hash=True, extra_headers=extra_headers,
    )
    verified = []
    for r in results:
        r.source = source_label
        r.is_spa_fallback = is_spa_fallback_match(r, baseline)
        verified.append(r)
    return verified


# ---------------------------------------------------------------------------
# Wordlist loading (SecLists-style path lists)
# ---------------------------------------------------------------------------
def resolve_wordlist_path(spec: str) -> Path:
    """Accepts an absolute/relative file path, or a short name resolved
    against the bundled SecLists Discovery/Web-Content directory."""
    direct = Path(spec)
    if direct.is_file():
        return direct
    for candidate in (SECLISTS_WEB_CONTENT_DIR / spec, SECLISTS_WEB_CONTENT_DIR / f"{spec}.txt"):
        if candidate.is_file():
            return candidate
    raise FileNotFoundError(
        f"Wordlist not found: {spec!r} (checked as a direct path and under {SECLISTS_WEB_CONTENT_DIR})"
    )


def load_wordlist(path: Path, limit: int) -> list[str]:
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    paths = [line.strip() for line in lines if line.strip() and not line.startswith("#")]
    # de-dupe while preserving order
    seen: set[str] = set()
    unique = [p for p in paths if not (p in seen or seen.add(p))]
    if len(unique) > limit:
        logger.warning("Wordlist has %d entries, truncating to --wordlist-limit %d", len(unique), limit)
        unique = unique[:limit]
    return unique


# ---------------------------------------------------------------------------
# Shared rate-limited batch fetch (used by both link-crawling and wordlist probing)
# ---------------------------------------------------------------------------
def _fetch_batch(
    urls: list[str],
    depth: int,
    rate_limiter: HostRateLimiter,
    robots: RobotsCache,
    max_workers: int,
    timeout: int,
    max_retries: int,
    user_agent: str,
    want_hash: bool = False,
    extra_headers: dict[str, str] | None = None,
) -> list[PageResult]:
    def _fetch_one(url: str) -> PageResult:
        if not robots.allowed(url):
            return PageResult(url=url, depth=depth, error="Disallowed by robots.txt")
        host_key = urlparse(url).hostname or url
        rate_limiter.wait(host_key)
        return fetch_page(url, depth, timeout, user_agent, max_retries, want_hash=want_hash, extra_headers=extra_headers)

    results: list[PageResult] = []
    with ThreadPoolExecutor(max_workers=max(1, min(max_workers, 10))) as pool:
        futures = {pool.submit(_fetch_one, url): url for url in urls}
        for fut in as_completed(futures):
            results.append(fut.result())
    return results


def probe_wordlist(
    base_url: str,
    paths: list[str],
    *,
    max_workers: int,
    min_interval_seconds: float,
    timeout: int,
    max_retries: int,
    user_agent: str,
    respect_robots: bool,
) -> list[PageResult]:
    parsed = urlparse(normalize_url(base_url))
    origin = f"{parsed.scheme}://{parsed.netloc}/"
    urls = [urljoin(origin, p.lstrip("/")) for p in paths]

    rate_limiter = HostRateLimiter(min_interval_seconds)
    robots = RobotsCache(user_agent, timeout, respect_robots)
    logger.info("Probing %d wordlist path(s) against %s", len(urls), origin)
    results = _fetch_batch(urls, 0, rate_limiter, robots, max_workers, timeout, max_retries, user_agent)
    for r in results:
        r.source = "wordlist"
    return results


# ---------------------------------------------------------------------------
# Breadth-first crawl orchestration
# ---------------------------------------------------------------------------
def crawl(
    start_url: str,
    max_depth: int,
    *,
    max_workers: int,
    min_interval_seconds: float,
    timeout: int,
    max_retries: int,
    user_agent: str,
    allow_external: bool,
    respect_robots: bool,
    max_pages: int,
) -> tuple[list[PageResult], CrawlStats]:
    start_url = normalize_url(start_url)
    rate_limiter = HostRateLimiter(min_interval_seconds)
    robots = RobotsCache(user_agent, timeout, respect_robots)

    effective_max_pages = _effective_max_pages(max_pages)
    unlimited = max_pages == 0
    visited_limit = min(effective_max_pages * 4, EMERGENCY_VISITED_LIMIT)

    visited: set[str] = set()
    results: list[PageResult] = []
    current_level = [start_url]
    visited.add(start_url)
    depth = 0
    stats = CrawlStats(requested_max_depth=max_depth, unlimited_pages=unlimited)
    path_query_variants: dict[str, set[str]] = {}
    warned_paths: set[str] = set()

    while current_level and depth <= max_depth and len(results) < effective_max_pages:
        logger.info(
            "Crawling depth %d: %d URL(s) | 완료 %d개 / 발견(visited) %d개%s",
            depth, len(current_level), len(results), len(visited),
            " (전체 모드)" if unlimited else f" / 최대 {effective_max_pages}개",
        )
        next_level_candidates: list[str] = []

        budget = effective_max_pages - len(results)
        batch = current_level[:budget]

        batch_results = _fetch_batch(batch, depth, rate_limiter, robots, max_workers, timeout, max_retries, user_agent)
        robots_disallowed = 0
        other_errors = 0
        for result in batch_results:
            results.append(result)
            if result.error and result.error.startswith("Disallowed"):
                robots_disallowed += 1
                logger.debug("Skipped (robots.txt): %s", result.url)
            elif result.error:
                other_errors += 1
                logger.warning("Failed: %s (%s)", result.url, result.error)
            else:
                logger.info("[%3d] %-6s %5sms %s", result.status_code or 0, result.content_type or "-", result.response_time_ms, result.url)
            next_level_candidates.extend(result.discovered_links)

        stats.pages_by_depth[depth] = stats.pages_by_depth.get(depth, 0) + len(batch_results)
        stats.reached_depth = depth

        if len(results) >= effective_max_pages:
            stats.termination_reason = TERMINATION_MAX_PAGES
            break

        depth += 1
        if depth > max_depth:
            stats.termination_reason = TERMINATION_MAX_DEPTH
            break

        next_level: list[str] = []
        external_count = 0
        emergency_stop = False
        for link in next_level_candidates:
            if not is_http_url(link):
                continue
            norm = normalize_url(link)
            if norm in visited:
                continue
            if not allow_external and not same_registrable_host(norm, start_url):
                external_count += 1
                continue
            parsed = urlparse(norm)
            path_key = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
            variants = path_query_variants.setdefault(path_key, set())
            variants.add(parsed.query)
            if len(variants) > QUERY_VARIATION_WARN_THRESHOLD and path_key not in warned_paths:
                warned_paths.add(path_key)
                msg = f"{path_key} 경로에서 서로 다른 쿼리 문자열이 {len(variants)}개 넘게 발견됨 (무한 URL 생성 패턴 의심)"
                logger.warning(msg)
                stats.query_variation_warnings.append(msg)
            visited.add(norm)
            next_level.append(norm)
            if len(visited) >= visited_limit:
                emergency_stop = True
                break
        current_level = next_level

        if emergency_stop:
            stats.termination_reason = TERMINATION_EMERGENCY_LIMIT
            logger.warning("비상 한도(%d) 도달 -- 크롤링을 중단함 (수집된 결과는 유지됨)", visited_limit)
            break

        if not next_level:
            fetched_ok = len(batch_results) - robots_disallowed - other_errors
            if fetched_ok == 0 and robots_disallowed > 0 and other_errors == 0:
                stats.termination_reason = TERMINATION_ROBOTS
            elif fetched_ok == 0 and other_errors > 0:
                stats.termination_reason = TERMINATION_REQUEST_ERROR
            elif next_level_candidates and external_count == len(next_level_candidates):
                stats.termination_reason = TERMINATION_OUT_OF_SCOPE
            else:
                stats.termination_reason = TERMINATION_NO_LINKS
            break

    return results, stats


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------
def print_console_report(results: list[PageResult], stats: CrawlStats | None = None) -> None:
    crawled = [r for r in results if r.source == "crawl"]
    wordlist = [r for r in results if r.source == "wordlist"]

    print("=" * 60)
    print(" Site Depth Crawl Report")
    print("=" * 60)
    by_depth: dict[int, list[PageResult]] = {}
    for r in crawled:
        by_depth.setdefault(r.depth, []).append(r)

    total_ok = sum(1 for r in crawled if r.status_code and 200 <= r.status_code < 400)
    total_err = len(crawled) - total_ok
    for depth in sorted(by_depth):
        print(f"\n[Depth {depth}] ({len(by_depth[depth])} page(s))")
        for r in by_depth[depth]:
            if r.error and not r.status_code:
                print(f"  ERROR  {r.url}  -- {r.error}")
            else:
                title = f' "{r.title}"' if r.title else ""
                print(f"  {r.status_code or '?':<4} {r.response_time_ms or 0:>7.1f}ms  {r.content_type or '-':<20} {r.url}{title}")
    if crawled:
        print(f"\nTotal pages: {len(crawled)}  (ok/redirect: {total_ok}, error: {total_err})")

    if wordlist:
        interesting = [r for r in wordlist if r.status_code and r.status_code != 404]
        print(f"\n[Wordlist Discovery] ({len(wordlist)} path(s) probed, {len(interesting)} non-404)")
        for r in sorted(interesting, key=lambda r: (r.status_code or 0, r.url)):
            print(f"  {r.status_code:<4} {r.response_time_ms or 0:>7.1f}ms  {r.content_type or '-':<20} {r.url}")

    spa_candidates = [r for r in results if r.source == "spa-candidate"]
    if spa_candidates:
        real_hits = [r for r in spa_candidates if not r.is_spa_fallback and r.status_code and not r.error]
        fallback_count = sum(1 for r in spa_candidates if r.is_spa_fallback)
        print(
            f"\n[SPA 보조 탐색 -- JS 번들 후보] ({len(spa_candidates)}개 확인, "
            f"{len(real_hits)}개 실제 발견, {fallback_count}개 SPA 기본 응답으로 제외)"
        )
        for r in sorted(real_hits, key=lambda r: (r.status_code or 0, r.url)):
            print(f"  {r.status_code:<4} {r.response_time_ms or 0:>7.1f}ms  {r.content_type or '-':<20} {r.url}  [출처: JS 번들]")

    burp_candidates = [r for r in results if r.source == "burp-history"]
    if burp_candidates:
        real_hits = [r for r in burp_candidates if not r.is_spa_fallback and r.status_code and not r.error]
        fallback_count = sum(1 for r in burp_candidates if r.is_spa_fallback)
        print(
            f"\n[SPA 보조 탐색 -- Burp History 후보] ({len(burp_candidates)}개 확인, "
            f"{len(real_hits)}개 실제 발견, {fallback_count}개 SPA 기본 응답으로 제외)"
        )
        for r in sorted(real_hits, key=lambda r: (r.status_code or 0, r.url)):
            print(f"  {r.status_code:<4} {r.response_time_ms or 0:>7.1f}ms  {r.content_type or '-':<20} {r.url}  [출처: Burp History]")

    if stats is not None:
        print("\n" + "=" * 60)
        print(" 탐색 진행 요약")
        print("=" * 60)
        print(f"최대 페이지 수: {'전체 (제한값 0 = 전체, 새 URL이 없을 때까지 탐색)' if stats.unlimited_pages else '지정값'}")
        print(f"설정한 최대 단계: {stats.requested_max_depth + 1}단계 (내부 --depth {stats.requested_max_depth})")
        print(f"실제 도달 단계: {stats.reached_depth + 1}단계 (내부 depth {stats.reached_depth})")
        print("단계별 방문 페이지 수:")
        for d in sorted(stats.pages_by_depth):
            print(f"  {d + 1}단계 (내부 depth {d}): {stats.pages_by_depth[d]}개")
        print(f"더 진행하지 못한 이유: {stats.termination_reason}")
        if stats.query_variation_warnings:
            print(f"\n[경고] 쿼리 파라미터만 다른 무한 URL 생성 의심 ({len(stats.query_variation_warnings)}건):")
            for w in stats.query_variation_warnings:
                print(f"  - {w}")
        if stats.termination_reason == TERMINATION_NO_LINKS and stats.reached_depth == 0 and not spa_candidates and not burp_candidates:
            print(
                "\n[알림] SPA 가능성 -- 일반 HTML 링크 없음 (JavaScript로 화면을 구성하는 SPA일 수 있음). "
                "--spa-assist 옵션을 켜면 JS 번들에서 후보 경로를 추가로 찾습니다."
            )


def write_json_report(results: list[PageResult], path: str, stats: CrawlStats | None = None) -> None:
    payload: dict | list = (
        {"pages": [r.to_dict() for r in results], "stats": stats.to_dict()}
        if stats is not None
        else [r.to_dict() for r in results]
    )
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2, ensure_ascii=False)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="site_depth_crawler",
        description="Rate-limited, depth-bounded site crawler that never overloads the target server.",
    )
    parser.add_argument("url", help="Starting URL (must include scheme, e.g. https://example.com)")
    parser.add_argument("--depth", type=int, default=1, help="Maximum link-following depth from the start URL (default: 1)")
    parser.add_argument("--workers", type=int, default=3, help="Max concurrent requests (default: 3, capped at 10)")
    parser.add_argument("--min-interval", type=float, default=0.5, help="Minimum seconds between requests to the same host (default: 0.5)")
    parser.add_argument("--timeout", type=int, default=10, help="Per-request timeout in seconds (default: 10)")
    parser.add_argument("--retries", type=int, default=1, help="Retries for transient network errors (default: 1)")
    parser.add_argument(
        "--max-pages", type=int, default=200,
        help=f"Hard cap on total pages fetched, regardless of depth (default: 200). "
        f"0 = crawl until no new in-scope URLs are found within --depth (still bounded by an "
        f"absolute {EMERGENCY_VISITED_LIMIT:,}-URL emergency safety valve)",
    )
    parser.add_argument("--allow-external", action="store_true", help="Follow links to other hosts too (default: same-host only)")
    parser.add_argument("--ignore-robots", action="store_true", help="Do not consult robots.txt (default: respected)")
    parser.add_argument("--user-agent", default=DEFAULT_USER_AGENT, help="Custom User-Agent string")
    parser.add_argument(
        "--wordlist",
        default=None,
        help="Path (or short name, e.g. 'common.txt') of a SecLists-style path list to probe against the "
        f"target root, in addition to link crawling. Short names resolve under {SECLISTS_WEB_CONTENT_DIR}",
    )
    parser.add_argument(
        "--wordlist-limit",
        type=int,
        default=200,
        help=f"Max paths to actually probe from --wordlist (default: 200, hard ceiling {MAX_WORDLIST_PATHS} unless --force)",
    )
    parser.add_argument("--output", choices=["console", "json"], default="console", help="Report format (default: console)")
    parser.add_argument("--output-file", default=None, help="Write JSON report to this path (required with --output json unless printed to stdout)")
    parser.add_argument(
        "--spa-assist", action="store_true",
        help="SPA-assisted discovery: after the normal crawl, pull <script src> bundles found on crawled pages, "
        "extract plausible same-origin route/API path candidates from them, and verify each with a real request "
        "(filtering out anything that matches a detected SPA catch-all fallback response)",
    )
    parser.add_argument(
        "--js-bundle-limit", type=int, default=MAX_JS_BUNDLES,
        help=f"Max JS bundles to download for --spa-assist (default {MAX_JS_BUNDLES}, ceiling {MAX_JS_BUNDLES_CEILING} unless --force)",
    )
    parser.add_argument(
        "--spa-candidate-limit", type=int, default=DEFAULT_SPA_CANDIDATE_LIMIT,
        help=f"Max JS-bundle-derived candidate paths to actually request for --spa-assist "
        f"(default {DEFAULT_SPA_CANDIDATE_LIMIT}, ceiling {MAX_SPA_CANDIDATE_LIMIT} unless --force)",
    )
    parser.add_argument(
        "--extra-urls", default=None,
        help="Comma-separated full URLs to verify with a real request in addition to the normal crawl -- e.g. "
        "same-target paths/API calls observed in Burp History while browsing through Burp Browser (spec 6.3). "
        "Filtered against the SPA fallback baseline the same as --spa-assist candidates, tagged 'burp-history'.",
    )
    parser.add_argument(
        "--extra-header", action="append", default=[],
        help="'Name: value' header applied only to --extra-urls verification requests (e.g. a session cookie "
        "carried over from Burp History) -- repeatable. Never applied to the normal crawl or wordlist probing.",
    )
    parser.add_argument("--force", action="store_true", help=f"Allow depth greater than the default safety ceiling ({MAX_ALLOWED_DEPTH})")
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
    parser = build_arg_parser()
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%H:%M:%S",
        stream=sys.stderr,
    )

    if not is_http_url(args.url):
        logger.error("URL must start with http:// or https://: %r", args.url)
        return 2

    if args.depth < 0:
        logger.error("--depth must be >= 0")
        return 2
    if args.depth > MAX_ALLOWED_DEPTH and not args.force:
        logger.error(
            "--depth %d exceeds the safety ceiling of %d (use --force to override; this can generate a LOT of traffic)",
            args.depth,
            MAX_ALLOWED_DEPTH,
        )
        return 2

    if args.workers > 10:
        logger.warning("--workers capped at 10 to avoid hammering the target server.")

    if args.wordlist_limit > MAX_WORDLIST_PATHS and not args.force:
        logger.error(
            "--wordlist-limit %d exceeds the safety ceiling of %d (use --force to override)",
            args.wordlist_limit,
            MAX_WORDLIST_PATHS,
        )
        return 2
    if args.js_bundle_limit > MAX_JS_BUNDLES_CEILING and not args.force:
        logger.error(
            "--js-bundle-limit %d exceeds the safety ceiling of %d (use --force to override)",
            args.js_bundle_limit, MAX_JS_BUNDLES_CEILING,
        )
        return 2
    if args.spa_candidate_limit > MAX_SPA_CANDIDATE_LIMIT and not args.force:
        logger.error(
            "--spa-candidate-limit %d exceeds the safety ceiling of %d (use --force to override)",
            args.spa_candidate_limit, MAX_SPA_CANDIDATE_LIMIT,
        )
        return 2

    results, stats = crawl(
        args.url,
        args.depth,
        max_workers=args.workers,
        min_interval_seconds=args.min_interval,
        timeout=args.timeout,
        max_retries=args.retries,
        user_agent=args.user_agent,
        allow_external=args.allow_external,
        respect_robots=not args.ignore_robots,
        max_pages=args.max_pages,
    )

    if args.wordlist:
        try:
            wordlist_path = resolve_wordlist_path(args.wordlist)
        except FileNotFoundError as exc:
            logger.error(str(exc))
            return 2
        paths = load_wordlist(wordlist_path, args.wordlist_limit)
        logger.info("Loaded %d path(s) from %s", len(paths), wordlist_path)
        results.extend(
            probe_wordlist(
                args.url,
                paths,
                max_workers=args.workers,
                min_interval_seconds=args.min_interval,
                timeout=args.timeout,
                max_retries=args.retries,
                user_agent=args.user_agent,
                respect_robots=not args.ignore_robots,
            )
        )

    extra_urls = [u.strip() for u in (args.extra_urls or "").split(",") if u.strip()]
    spa_baseline: FallbackBaseline | None = None
    spa_baseline_attempted = False

    def _get_spa_baseline() -> FallbackBaseline | None:
        nonlocal spa_baseline, spa_baseline_attempted
        if not spa_baseline_attempted:
            spa_baseline_attempted = True
            spa_baseline = detect_spa_fallback_baseline(args.url, args.timeout, args.user_agent, args.retries)
            if spa_baseline is None:
                logger.info("SPA fallback baseline probe failed (network error) -- proceeding without it")
        return spa_baseline

    if args.spa_assist:
        script_srcs = {s for r in results if r.source == "crawl" for s in r.script_srcs}
        budget = max(0, _effective_max_pages(args.max_pages) - len(results))
        if not script_srcs:
            logger.info("SPA-assist: no <script src> bundles found on crawled pages -- nothing to analyze")
        elif budget <= 0:
            logger.warning("SPA-assist: skipped -- --max-pages budget already used up by the normal crawl")
        else:
            baseline = _get_spa_baseline()
            budget -= 1  # the baseline probe itself
            candidates, bundles_fetched = collect_js_bundle_candidates(
                script_srcs, args.url,
                allow_external=args.allow_external, timeout=args.timeout, user_agent=args.user_agent,
                max_retries=args.retries, bundle_limit=min(args.js_bundle_limit, max(budget, 0)),
            )
            budget -= bundles_fetched
            logger.info("SPA-assist: %d bundle(s) fetched, %d candidate path(s) extracted", bundles_fetched, len(candidates))
            if candidates and budget > 0:
                rate_limiter = HostRateLimiter(args.min_interval)
                robots = RobotsCache(args.user_agent, args.timeout, not args.ignore_robots)
                verified = verify_spa_candidates(
                    candidates, rate_limiter=rate_limiter, robots=robots, max_workers=args.workers,
                    timeout=args.timeout, max_retries=args.retries, user_agent=args.user_agent,
                    baseline=baseline, limit=min(args.spa_candidate_limit, budget),
                )
                results.extend(verified)

    if extra_urls:
        # spec 6.3: Burp History에서 수집한, 같은 대상의 경로/API 요청 후보 --
        # the GUI has already done the host/port/static-file/dedup filtering
        # before building this list; this just verifies each with a real
        # request and applies the same SPA-fallback check as --spa-assist.
        budget = max(0, _effective_max_pages(args.max_pages) - len(results))
        if budget <= 0:
            logger.warning("Burp History candidates skipped -- --max-pages budget already used up")
        else:
            baseline = _get_spa_baseline()
            budget -= 0 if spa_baseline_attempted and args.spa_assist else 1  # avoid double-charging the same probe
            extra_headers = {}
            for h in args.extra_header:
                if ":" in h:
                    k, v = h.split(":", 1)
                    extra_headers[k.strip()] = v.strip()
            rate_limiter = HostRateLimiter(args.min_interval)
            robots = RobotsCache(args.user_agent, args.timeout, not args.ignore_robots)
            verified = verify_spa_candidates(
                extra_urls, rate_limiter=rate_limiter, robots=robots, max_workers=args.workers,
                timeout=args.timeout, max_retries=args.retries, user_agent=args.user_agent,
                baseline=baseline, limit=min(len(extra_urls), max(budget, 0)),
                source_label="burp-history", extra_headers=extra_headers or None,
            )
            logger.info("Burp History candidates: %d verified", len(verified))
            results.extend(verified)

    if args.output == "json":
        if args.output_file:
            write_json_report(results, args.output_file, stats)
            logger.info("JSON report written to %s", args.output_file)
        else:
            print(json.dumps({"pages": [r.to_dict() for r in results], "stats": stats.to_dict()}, indent=2, ensure_ascii=False))
    else:
        print_console_report(results, stats)
        if args.output_file:
            write_json_report(results, args.output_file, stats)
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
