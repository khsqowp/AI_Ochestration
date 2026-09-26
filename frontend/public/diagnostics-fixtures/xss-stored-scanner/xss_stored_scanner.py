#!/usr/bin/env python3
"""Marker-based Stored-XSS scanner (exactly one inject page + one check page).

Same funnel philosophy as the sibling xss_reflected_scanner.py (marker
injection first, then context/escaping analysis -- never live payloads,
never real exploitation), but for values that get stored server-side and
rendered back on a DIFFERENT page later (profile fields, comments, order
notes, admin memos, etc.).

DELIBERATELY SCOPED TO A SINGLE CHECK PAGE, NOT A CRAWL: bouncing across
many pages to hunt for where a stored value might surface multiplies
request volume fast and was flagged as a traffic-load concern. This tool
takes exactly one --check-url (the one page you already know renders the
field back) and does exactly ONE additional GET there after injection --
never a list of pages, never link-following. If you need to check several
candidate output pages, run this tool once per page deliberately, so the
request volume stays visible and intentional.

Marker shape: "<param>_XSS_TEST_<random6hex>" immediately followed by the
raw probe charset  <>'"/`. The core (name+XSS_TEST+random) is always sent
as literal, searchable plain text; only the trailing probe charset is
optionally transformed by --bypass-variants (HTML-entity decimal/hex/
named, double URL-encoding, base64) to test filter/WAF bypass or
double-decode bugs. Detection always just searches the check page's
response for the literal core string, regardless of encoding used.

Explicitly OUT OF SCOPE: DOM-based XSS (client-side sinks). That needs a
headless browser instrumenting JS sinks, not response-text marker search.

Usage:
    python xss_stored_scanner.py https://target.example/profile \\
        --method post-form --params nickname,bio \\
        --check-url https://target.example/profile_view \\
        --cookies "session=abcd1234"
"""
from __future__ import annotations

import argparse
import base64
import json
import logging
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass

logger = logging.getLogger("xss_stored_scanner")

DEFAULT_USER_AGENT = "xss-stored-scanner/1.0 (+rate-limited; contact: local-security-testing)"
MAX_BODY_BYTES = 1024 * 1024
PROBE_CHARS = "<>'\"/`"
MAX_TOTAL_REQUESTS = 2000  # hard ceiling unless --force


# ---------------------------------------------------------------------------
# Rate limiting (same shape as the sibling tools)
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
# Encoding-bypass variants (only the PROBE suffix is transformed; the core
# is always sent/searched as literal plain text)
# ---------------------------------------------------------------------------
def _enc_html_decimal(probe: str) -> str:
    return "".join(f"&#{ord(c)};" for c in probe)


def _enc_html_hex(probe: str) -> str:
    return "".join(f"&#x{ord(c):x};" for c in probe)


_NAMED_ENTITIES = {"<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#x27;", "/": "&#x2F;", "`": "&#96;"}


def _enc_html_named(probe: str) -> str:
    return "".join(_NAMED_ENTITIES.get(c, c) for c in probe)


def _enc_url_double(probe: str) -> str:
    once = urllib.parse.quote(probe, safe="")
    return urllib.parse.quote(once, safe="")


def _enc_base64(probe: str) -> str:
    return base64.b64encode(probe.encode("utf-8")).decode("ascii")


ENCODERS: dict[str, callable] = {
    "raw": lambda probe: probe,
    "html-entity-decimal": _enc_html_decimal,
    "html-entity-hex": _enc_html_hex,
    "html-entity-named": _enc_html_named,
    "url-double-encode": _enc_url_double,
    "base64": _enc_base64,
}
ALL_VARIANTS = list(ENCODERS)


# ---------------------------------------------------------------------------
# Marker / slot model
# ---------------------------------------------------------------------------
@dataclass
class Slot:
    source: str  # "query" / "form" / "json" / "cookie" / "header"
    name: str
    variant: str
    core: str
    value_to_send: str


def make_slot(source: str, name: str, variant: str) -> Slot:
    uniq = uuid.uuid4().hex[:6]
    core = f"{name}_XSS_TEST_{uniq}"
    encoder = ENCODERS[variant]
    value = core + encoder(PROBE_CHARS)
    return Slot(source=source, name=name, variant=variant, core=core, value_to_send=value)


def batch_slots(slots: list[Slot], batch_size: int) -> list[list[Slot]]:
    """Groups slots into request batches of at most `batch_size`, with the
    hard rule that no single batch ever contains two slots sharing the same
    (source, name) -- e.g. two --bypass-variants of the same param would
    otherwise collide on the same query/form/json/cookie/header key and
    silently overwrite each other within one request."""
    batches: list[list[Slot]] = []
    remaining = list(slots)
    while remaining:
        batch: list[Slot] = []
        used_keys: set[tuple[str, str]] = set()
        leftover: list[Slot] = []
        for slot in remaining:
            key = (slot.source, slot.name)
            if len(batch) < batch_size and key not in used_keys:
                batch.append(slot)
                used_keys.add(key)
            else:
                leftover.append(slot)
        batches.append(batch)
        remaining = leftover
    return batches


# ---------------------------------------------------------------------------
# Context classification + probe-survival (identical logic to
# xss_reflected_scanner.py, applied here to the check-page response)
# ---------------------------------------------------------------------------
def classify_context(text: str, idx: int, content_type: str) -> str:
    if "json" in content_type.lower():
        return "json"
    before = text[max(0, idx - 200) : idx]
    last_script_open = before.rfind("<script")
    last_script_close = before.rfind("</script")
    if last_script_open > last_script_close:
        if re.search(r"""['"]\s*$""", before):
            return "javascript-string"
        return "javascript-raw"
    if re.search(r"""(href|src|action)\s*=\s*["']$""", before, re.IGNORECASE):
        return "url-attribute"
    if re.search(r"""=\s*["']$""", before):
        return "attribute-quoted"
    if re.search(r"""[a-zA-Z][a-zA-Z0-9_-]*=\s*$""", before):
        return "attribute-unquoted"
    return "html-text"


_ESCAPE_FORMS = {
    "<": ("&lt;", "&#60;", "&#x3c;", "&#x3C;"),
    ">": ("&gt;", "&#62;", "&#x3e;", "&#x3E;"),
    "'": ("&#39;", "&#x27;", "&apos;"),
    '"': ("&quot;", "&#34;", "&#x22;"),
    "/": ("&#47;", "&#x2f;", "&#x2F;"),
    "`": ("&#96;", "&#x60;"),
}


def probe_survival(after: str) -> tuple[bool, str]:
    """Walks PROBE_CHARS in order starting exactly at position 0 of `after`
    (immediately adjacent to the marker core). Raw match = survived
    unescaped (dangerous); known HTML-entity form = escaped (safe-ish);
    anything else stops the walk. Never scans an arbitrary window, so it
    can't misattribute unrelated surrounding markup or a different nearby
    marker occurrence to this one."""
    pos = 0
    survived: list[str] = []
    for c in PROBE_CHARS:
        if after[pos : pos + 1] == c:
            survived.append(c)
            pos += 1
            continue
        match = next((f for f in _ESCAPE_FORMS.get(c, ()) if after[pos : pos + len(f)] == f), None)
        if match:
            pos += len(match)
            continue
        break
    present = "".join(survived)
    exact_intact = present == PROBE_CHARS
    return exact_intact, present


def classify_risk(context: str, exact_intact: bool, chars_present: str) -> str:
    if exact_intact:
        return "HIGH"
    if context == "html-text" and any(c in chars_present for c in "<>"):
        return "HIGH"
    if context in ("attribute-quoted", "javascript-string") and any(c in chars_present for c in "'\""):
        return "HIGH"
    if context == "attribute-unquoted" and any(c in chars_present for c in " \t\n'\">="):
        return "HIGH"
    if context == "url-attribute" and chars_present:
        return "MEDIUM"
    if chars_present:
        return "MEDIUM"
    return "LOW"


@dataclass
class ReflectionHit:
    slot_source: str
    param: str
    variant: str
    marker_core: str
    context: str
    exact_intact: bool
    chars_present: str
    risk: str
    snippet: str

    def to_dict(self) -> dict:
        return dict(self.__dict__)


def find_reflections(response_text: str, content_type: str, cores: dict[str, Slot]) -> list[ReflectionHit]:
    hits: list[ReflectionHit] = []
    for core, slot in cores.items():
        start = 0
        while True:
            idx = response_text.find(core, start)
            if idx == -1:
                break
            after = response_text[idx + len(core) :]
            before_snip = max(0, idx - 40)
            snippet = response_text[before_snip : idx + len(core) + 40]
            exact_intact, chars_present = probe_survival(after)
            context = classify_context(response_text, idx, content_type)
            risk = classify_risk(context, exact_intact, chars_present)
            hits.append(
                ReflectionHit(
                    slot_source=slot.source,
                    param=slot.name,
                    variant=slot.variant,
                    marker_core=core,
                    context=context,
                    exact_intact=exact_intact,
                    chars_present=chars_present,
                    risk=risk,
                    snippet=snippet.replace("\n", "\\n"),
                )
            )
            start = idx + len(core)
    return hits


# ---------------------------------------------------------------------------
# Request building / fetching (injection side)
# ---------------------------------------------------------------------------
def build_and_fetch(
    url: str,
    method: str,
    batch: list[Slot],
    base_query: dict[str, str],
    base_form: dict[str, str],
    base_json: dict,
    base_cookies: dict[str, str],
    base_headers: dict[str, str],
    timeout: int,
    user_agent: str,
) -> tuple[str, str, str, int | None, str | None]:
    query = dict(base_query)
    form = dict(base_form)
    payload = dict(base_json)
    cookies = dict(base_cookies)
    headers = dict(base_headers)

    for slot in batch:
        if slot.source == "query":
            query[slot.name] = slot.value_to_send
        elif slot.source == "form":
            form[slot.name] = slot.value_to_send
        elif slot.source == "json":
            payload[slot.name] = slot.value_to_send
        elif slot.source == "cookie":
            cookies[slot.name] = slot.value_to_send
        elif slot.source == "header":
            headers[slot.name] = slot.value_to_send

    full_url = url
    body: bytes | None = None
    req_headers = {"User-Agent": user_agent}
    req_headers.update(headers)

    if query:
        sep = "&" if "?" in url else "?"
        full_url = url + sep + urllib.parse.urlencode(query)

    if method == "post-form":
        body = urllib.parse.urlencode(form).encode("utf-8")
        req_headers["Content-Type"] = "application/x-www-form-urlencoded"
    elif method == "post-json":
        body = json.dumps(payload).encode("utf-8")
        req_headers["Content-Type"] = "application/json"

    if cookies:
        req_headers["Cookie"] = "; ".join(f"{k}={urllib.parse.quote(v, safe='')}" for k, v in cookies.items())

    try:
        req = urllib.request.Request(full_url, data=body, headers=req_headers, method="GET" if method == "get" else "POST")
        with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310
            content_type = resp.headers.get("Content-Type", "")
            raw = resp.read(MAX_BODY_BYTES)
            text = raw.decode(resp.headers.get_content_charset() or "utf-8", errors="replace")
            return text, content_type, full_url, resp.getcode(), None
    except urllib.error.HTTPError as exc:
        content_type = exc.headers.get("Content-Type", "") if exc.headers else ""
        raw = exc.read(MAX_BODY_BYTES) if exc.fp else b""
        text = raw.decode("utf-8", errors="replace")
        return text, content_type, full_url, exc.code, None
    except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as exc:
        return "", "", full_url, None, str(exc)


def fetch_check_page(url: str, cookies: dict[str, str], timeout: int) -> tuple[str, str, str | None]:
    req_headers = {"User-Agent": DEFAULT_USER_AGENT}
    if cookies:
        req_headers["Cookie"] = "; ".join(f"{k}={urllib.parse.quote(v, safe='')}" for k, v in cookies.items())
    try:
        req = urllib.request.Request(url, headers=req_headers)
        with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310
            content_type = resp.headers.get("Content-Type", "")
            text = resp.read(MAX_BODY_BYTES).decode(resp.headers.get_content_charset() or "utf-8", errors="replace")
            return text, content_type, None
    except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as exc:
        return "", "", str(exc)


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------
def print_console_report(hits: list[ReflectionHit], inject_requests: int, check_url: str) -> None:
    print("=" * 60)
    print(" Stored-XSS Marker Scan Report (single inject page + single check page)")
    print("=" * 60)
    print(f"\nCheck page: {check_url}")

    by_risk = {"HIGH": [], "MEDIUM": [], "LOW": []}
    for h in hits:
        by_risk.setdefault(h.risk, []).append(h)

    for risk in ("HIGH", "MEDIUM", "LOW"):
        items = by_risk.get(risk, [])
        print(f"\n[{risk}] ({len(items)})")
        for h in items:
            variant_tag = f" variant={h.variant}" if h.variant != "raw" else ""
            print(f"  {h.slot_source}:{h.param}{variant_tag}  context={h.context}  intact={h.exact_intact}  chars={h.chars_present or '-'}")
            print(f"      snippet: {h.snippet!r}")

    print(f"\nInjection requests: {inject_requests}  |  Check requests: 1  |  Stored reflections found: {len(hits)}  (candidates need manual/Burp confirmation for final verdict)")


def write_json_report(hits: list[ReflectionHit], path: str) -> None:
    with open(path, "w", encoding="utf-8") as fh:
        json.dump([h.to_dict() for h in hits], fh, indent=2, ensure_ascii=False)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def parse_kv_string(s: str, sep_pairs: str = "&", sep_kv: str = "=") -> dict[str, str]:
    result = {}
    for pair in s.split(sep_pairs):
        pair = pair.strip()
        if not pair:
            continue
        if sep_kv in pair:
            k, v = pair.split(sep_kv, 1)
        else:
            k, v = pair, ""
        result[k.strip()] = v.strip()
    return result


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="xss_stored_scanner", description="Marker-based Stored-XSS scanner (one inject page + one check page).")
    parser.add_argument("url", help="Injection URL (where the value gets submitted/stored)")
    parser.add_argument("--check-url", required=True, help="The single page to check for the stored marker afterward (no crawling, exactly one page)")
    parser.add_argument("--method", choices=["get", "post-form", "post-json"], default="post-form", help="HTTP method/body encoding for injection (default: post-form)")
    parser.add_argument("--params", default=None, help="Comma-separated query/form/json param names to fuzz")
    parser.add_argument("--cookie-params", default=None, help="Comma-separated cookie names to fuzz")
    parser.add_argument("--header-params", default=None, help="Comma-separated header names to fuzz")
    parser.add_argument("--base-params", default=None, help="Baseline query/form params kept constant, 'k=v&k2=v2' style")
    parser.add_argument("--base-json", default=None, help="Baseline JSON body (as a JSON object string) kept constant for untested fields")
    parser.add_argument("--cookies", default=None, help="Baseline Cookie header sent with every request (injection AND check), 'k=v; k2=v2' style (e.g. session auth)")
    parser.add_argument("--headers", action="append", default=[], help="Baseline header 'Name: value' for the injection request, repeatable")
    parser.add_argument("--bypass-variants", nargs="?", const="all", default=None, help=f"Comma list of encoding variants to also try (or 'all'): {', '.join(ALL_VARIANTS)}. Default: raw only.")
    parser.add_argument("--batch-size", type=int, default=10, help="Params combined per injection request (default 10; >20 needs --force)")
    parser.add_argument("--min-interval", type=float, default=0.5, help="Minimum seconds between requests to the same host (default 0.5)")
    parser.add_argument("--timeout", type=int, default=10, help="Per-request timeout in seconds (default 10)")
    parser.add_argument("--output", choices=["console", "json"], default="console", help="Report format")
    parser.add_argument("--output-file", default=None, help="Write JSON report to this path")
    parser.add_argument("--force", action="store_true", help="Override safety ceilings (batch-size > 20, total slots > 2000)")
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
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S", stream=sys.stderr)

    if not (args.params or args.cookie_params or args.header_params):
        logger.error("At least one of --params / --cookie-params / --header-params is required")
        return 2
    if args.batch_size > 20 and not args.force:
        logger.error("--batch-size %d exceeds the recommended safety ceiling of 20 (use --force to override)", args.batch_size)
        return 2

    variants = ["raw"]
    if args.bypass_variants:
        variants = ALL_VARIANTS if args.bypass_variants == "all" else [v.strip() for v in args.bypass_variants.split(",") if v.strip()]
        unknown = [v for v in variants if v not in ENCODERS]
        if unknown:
            logger.error("Unknown --bypass-variants: %s (known: %s)", ", ".join(unknown), ", ".join(ALL_VARIANTS))
            return 2

    slots: list[Slot] = []
    for name in (args.params.split(",") if args.params else []):
        name = name.strip()
        if not name:
            continue
        source = {"get": "query", "post-form": "form", "post-json": "json"}[args.method]
        for variant in variants:
            slots.append(make_slot(source, name, variant))
    for name in (args.cookie_params.split(",") if args.cookie_params else []):
        name = name.strip()
        if not name:
            continue
        for variant in variants:
            slots.append(make_slot("cookie", name, variant))
    for name in (args.header_params.split(",") if args.header_params else []):
        name = name.strip()
        if not name:
            continue
        for variant in variants:
            slots.append(make_slot("header", name, variant))

    if len(slots) > MAX_TOTAL_REQUESTS and not args.force:
        logger.error("Slot count %d exceeds the safety ceiling of %d (use --force to override)", len(slots), MAX_TOTAL_REQUESTS)
        return 2

    base_query = parse_kv_string(args.base_params) if args.base_params and args.method == "get" else {}
    base_form = parse_kv_string(args.base_params) if args.base_params and args.method == "post-form" else {}
    base_json = json.loads(args.base_json) if args.base_json else {}
    base_cookies = parse_kv_string(args.cookies, sep_pairs=";") if args.cookies else {}
    base_headers = {}
    for h in args.headers:
        if ":" in h:
            k, v = h.split(":", 1)
            base_headers[k.strip()] = v.strip()

    rate_limiter = HostRateLimiter(args.min_interval)
    host_key = urllib.parse.urlparse(args.url).hostname or args.url

    all_slots_by_core: dict[str, Slot] = {}
    inject_requests = 0

    logger.info("Phase 1: injecting %d marker slot(s) into %s in batches of %d, variants=%s", len(slots), args.url, args.batch_size, ",".join(variants))
    for batch in batch_slots(slots, args.batch_size):
        rate_limiter.wait(host_key)
        _text, _content_type, _req_url, status, error = build_and_fetch(
            args.url, args.method, batch, base_query, base_form, base_json, base_cookies, base_headers, args.timeout, DEFAULT_USER_AGENT
        )
        inject_requests += 1
        if error:
            logger.warning("Injection request failed: %s", error)
            continue
        cores = {slot.core: slot for slot in batch}
        all_slots_by_core.update(cores)
        logger.info("Injection batch of %d slot(s) -> status=%s", len(batch), status)

    if not all_slots_by_core:
        logger.error("No marker was successfully injected -- nothing to check.")
        return 3

    logger.info("Phase 2: checking exactly one page (%s) for %d injected marker(s)", args.check_url, len(all_slots_by_core))
    rate_limiter.wait(urllib.parse.urlparse(args.check_url).hostname or args.check_url)
    check_text, check_content_type, check_error = fetch_check_page(args.check_url, base_cookies, args.timeout)
    if check_error:
        logger.error("check-url failed: %s", check_error)
        return 3

    all_hits = find_reflections(check_text, check_content_type, all_slots_by_core)

    if args.output == "json":
        if args.output_file:
            write_json_report(all_hits, args.output_file)
            logger.info("JSON report written to %s", args.output_file)
        else:
            print(json.dumps([h.to_dict() for h in all_hits], indent=2, ensure_ascii=False))
    else:
        print_console_report(all_hits, inject_requests, args.check_url)
        if args.output_file:
            write_json_report(all_hits, args.output_file)
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
