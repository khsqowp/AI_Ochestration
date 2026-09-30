#!/usr/bin/env python3
"""Burp Suite export -> deduped path wordlist + per-path observed-methods list.

Input: one or more Burp "Save items" XML exports (Proxy > HTTP history, or a
Site map subtree, saved via right-click > Save items), or a plain-text file
(one entry per line -- either a full URL, or a raw request line like
"GET /api/users HTTP/1.1"). Multiple files are merged.

No network requests at all -- pure local parsing, so none of the
rate-limiting machinery the other tools in this toolkit have applies here.

Output (written to --output-dir):
    paths-wordlist.txt   -- one deduped path per line (no query string,
                             no leading '/', matches SecLists convention) --
                             feed straight into crawler.py --wordlist or
                             default_content_scanner.py's target list.
    methods-by-path.txt  -- "path<TAB>METHOD1,METHOD2" per line, so you can
                             see which paths are worth an OPTIONS/method probe.

Usage:
    python burp_history_to_wordlist.py history.xml
    python burp_history_to_wordlist.py requests.txt --output-dir ./out
    python burp_history_to_wordlist.py history.xml more-history.xml
"""
from __future__ import annotations

import argparse
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlparse

DEFAULT_METHOD = "GET"
REQUEST_LINE_RE = re.compile(r"^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|TRACE|CONNECT)\s+(\S+)\s+HTTP/", re.IGNORECASE)


def parse_xml_export(path: Path) -> list[tuple[str, str]]:
    """Burp 'Save items' XML export -- returns (method, path) pairs. The
    <method>/<path>/<url> fields are always plaintext (unlike <request>,
    which is base64), so no request decoding is needed at all."""
    pairs: list[tuple[str, str]] = []
    try:
        tree = ET.parse(path)
    except ET.ParseError as exc:
        raise ValueError(f"XML 파싱 실패: {exc}") from exc
    for item in tree.getroot().iter("item"):
        method_el = item.find("method")
        path_el = item.find("path")
        url_el = item.find("url")
        method = (method_el.text or DEFAULT_METHOD).strip().upper() if method_el is not None and method_el.text else DEFAULT_METHOD
        raw_path = None
        if path_el is not None and path_el.text:
            raw_path = path_el.text.strip()
        elif url_el is not None and url_el.text:
            raw_path = urlparse(url_el.text.strip()).path or "/"
        if raw_path:
            pairs.append((method, raw_path))
    return pairs


def parse_text_export(path: Path) -> list[tuple[str, str]]:
    """Plain-text paste -- one entry per line, either a full URL or a raw
    HTTP request line ('GET /path HTTP/1.1'). Lines matching neither are
    skipped (not an error -- exports often have blank lines/separators)."""
    pairs: list[tuple[str, str]] = []
    for raw_line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        m = REQUEST_LINE_RE.match(line)
        if m:
            pairs.append((m.group(1).upper(), m.group(2)))
            continue
        if line.startswith("http://") or line.startswith("https://"):
            parsed = urlparse(line)
            pairs.append((DEFAULT_METHOD, parsed.path or "/"))
            continue
        if line.startswith("/"):
            pairs.append((DEFAULT_METHOD, line))
    return pairs


def load_export(path: Path) -> list[tuple[str, str]]:
    if path.suffix.lower() == ".xml":
        return parse_xml_export(path)
    return parse_text_export(path)


def normalize_path(raw_path: str) -> str:
    """Strip query string/fragment and the leading '/' -- matches the
    SecLists wordlist convention (common.txt etc. have no leading slash);
    crawler.py's --wordlist already does .lstrip('/') on load too, so either
    form works there, but this keeps the output file itself consistent."""
    path_only = raw_path.split("?", 1)[0].split("#", 1)[0]
    return path_only.lstrip("/")


def build_wordlist(sources: list[Path]) -> tuple[list[str], dict[str, set[str]]]:
    methods_by_path: dict[str, set[str]] = {}
    for src in sources:
        for method, raw_path in load_export(src):
            norm = normalize_path(raw_path)
            if not norm:
                continue
            methods_by_path.setdefault(norm, set()).add(method)
    paths = sorted(methods_by_path)
    return paths, methods_by_path


def write_outputs(paths: list[str], methods_by_path: dict[str, set[str]], out_dir: Path) -> tuple[Path, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    wordlist_path = out_dir / "paths-wordlist.txt"
    methods_path = out_dir / "methods-by-path.txt"
    wordlist_path.write_text("\n".join(paths) + "\n", encoding="utf-8")
    with open(methods_path, "w", encoding="utf-8") as fh:
        for p in paths:
            fh.write(f"{p}\t{','.join(sorted(methods_by_path[p]))}\n")
    return wordlist_path, methods_path


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="burp_history_to_wordlist",
        description="Burp Suite export(들)에서 URL 경로를 뽑아 중복 제거된 워드리스트와 경로별 관측 메서드 목록을 만듭니다. 네트워크 요청 없음(순수 로컬 파싱).",
    )
    parser.add_argument(
        "files", nargs="+",
        help="Burp 'Save items' XML export 또는 텍스트 파일(전체 URL 목록 또는 'METHOD /path HTTP/1.1' 줄) 경로. "
        "여러 개 지정하면 합쳐서 처리.",
    )
    parser.add_argument("--output-dir", default=".", help="결과 파일을 저장할 디렉터리 (기본: 현재 폴더)")
    return parser


def _guided_wizard(parser: argparse.ArgumentParser) -> list[str] | None:
    print(f"\n=== {parser.prog} 간단 모드 ===")
    print("(Burp Proxy > HTTP history에서 'Save items'로 내보낸 XML, 또는 요청/URL을 붙여넣은 텍스트 파일 경로만 입력)\n")
    files: list[str] = []
    print("파일 경로 입력, 여러 개면 반복(빈 줄=입력 종료):")
    while True:
        f = input("  파일: ").strip()
        if not f:
            break
        if not Path(f).is_file():
            print(f"    파일이 존재하지 않음: {f} -- 다시 입력하세요.")
            continue
        files.append(f)
    if not files:
        print("  최소 1개 파일이 필요합니다.")
        return None
    out_dir = input("결과 저장 폴더 (Enter=현재 폴더): ").strip() or "."
    return [*files, "--output-dir", out_dir]


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass

    parser = build_arg_parser()
    args = parser.parse_args(argv)

    sources: list[Path] = []
    for f in args.files:
        p = Path(f)
        if not p.is_file():
            print(f"[오류] 파일을 찾을 수 없음: {f}", file=sys.stderr)
            return 2
        sources.append(p)

    try:
        paths, methods_by_path = build_wordlist(sources)
    except ValueError as exc:
        print(f"[오류] {exc}", file=sys.stderr)
        return 2

    if not paths:
        print("[알림] 추출된 경로가 없습니다 -- 입력 파일 형식을 확인하세요 (Burp XML 'Save items' 내보내기, 또는 URL/요청줄 텍스트).")
        return 0

    out_dir = Path(args.output_dir)
    wordlist_path, methods_path = write_outputs(paths, methods_by_path, out_dir)

    method_counts: dict[str, int] = {}
    for methods in methods_by_path.values():
        for m in methods:
            method_counts[m] = method_counts.get(m, 0) + 1

    print(f"입력 파일 {len(sources)}개에서 고유 경로 {len(paths)}개 추출됨.")
    print("메서드별 경로 수: " + ", ".join(f"{m} {c}" for m, c in sorted(method_counts.items())))
    print(f"워드리스트 저장: {wordlist_path}")
    print(f"경로별 메서드 저장: {methods_path}")
    print(f"\n다음 단계: crawler.py --wordlist {wordlist_path} 처럼 바로 넘기거나, default_content_scanner.py 대상 경로 선정에 참고하면 됩니다.")
    return 0


if __name__ == "__main__":
    for _stream in (sys.stdout, sys.stderr):
        try:
            _stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    if len(sys.argv) == 1:
        _argv = _guided_wizard(build_arg_parser())
        if _argv is None:
            print("취소됨.")
            raise SystemExit(0)
        raise SystemExit(main(_argv))
    raise SystemExit(main())
