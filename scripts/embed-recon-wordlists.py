#!/usr/bin/env python3
"""recon_toolkit.py의 _EMBEDDED_WORDLISTS 딕셔너리를 재생성한다.

SecLists/PayloadsAllTheThings 서브셋(파일 목록은 아래 FILES에 고정)을 gzip(9단계)
압축 후 base85로 인코딩해, recon_toolkit.py의
# ===EMBEDDED_WORDLISTS_START=== ~ # ===EMBEDDED_WORDLISTS_END=== 사이를
통째로 교체한다. 수동으로 그 구간을 편집하지 말 것 -- 이 스크립트 재실행으로만 갱신.

사용:
    python3 scripts/embed-recon-wordlists.py --seclists-dir <SecLists 체크아웃 경로> \\
        --patt-dir <PayloadsAllTheThings 체크아웃 경로>
"""
from __future__ import annotations

import argparse
import base64
import gzip
import pathlib
import sys

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
TARGET_FILE = REPO_ROOT / "frontend/public/diagnostics-fixtures/recon-toolkit/recon_toolkit.py"
START_MARK = "# ===EMBEDDED_WORDLISTS_START==="
END_MARK = "# ===EMBEDDED_WORDLISTS_END==="

# (내장 키, SecLists/PayloadsAllTheThings 체크아웃 기준 상대경로)
SECLISTS_FILES = {
    "tech:tomcat": "Discovery/Web-Content/Web-Servers/Apache-Tomcat.txt",
    "tech:apache": "Discovery/Web-Content/Web-Servers/Apache.txt",
    "tech:nginx": "Discovery/Web-Content/Web-Servers/nginx.txt",
    "tech:iis": "Discovery/Web-Content/Web-Servers/IIS.txt",
    "tech:iis-systemweb": "Discovery/Web-Content/Web-Servers/IIS-systemweb.txt",
    "tech:jboss": "Discovery/Web-Content/Web-Servers/JBoss.txt",
    "tech:db-backups": "Discovery/Web-Content/Common-DB-Backups.txt",
    "tech:axis": "Discovery/Web-Content/Web-Servers/Apache-Axis.txt",
    "tech:glassfish": "Discovery/Web-Content/Web-Servers/Glassfish-Sun-Microsystems.txt",
    "tech:iplanet": "Discovery/Web-Content/Web-Servers/Oracle-Sun-iPlanet.txt",
    "tech:jrun": "Discovery/Web-Content/Web-Servers/Java-Servlet-Runner-Adobe-JRun.txt",
    "tech:api-endpoints": "Discovery/Web-Content/api/api-endpoints.txt",
    "tech:api-endpoints-res": "Discovery/Web-Content/api/api-endpoints-res.txt",
    "tech:api-objects": "Discovery/Web-Content/api/objects.txt",
    "tech:api-actions": "Discovery/Web-Content/api/actions.txt",
    "tech:cms-wordpress": "Discovery/Web-Content/CMS/wordpress.fuzz.txt",
    "tech:cms-wp-plugins": "Discovery/Web-Content/CMS/wp-plugins.fuzz.txt",
    "tech:cms-wp-themes": "Discovery/Web-Content/CMS/wp-themes.fuzz.txt",
    "tech:cms-drupal-themes": "Discovery/Web-Content/CMS/drupal-themes.fuzz.txt",
    "tech:cms-joomla-plugins": "Discovery/Web-Content/CMS/joomla-plugins.fuzz.txt",
    "generic:quickhits": "Discovery/Web-Content/quickhits.txt",
    "crawl:common": "Discovery/Web-Content/common.txt",
    "crawl:raft-large-directories": "Discovery/Web-Content/raft-large-directories.txt",
    "crawl:raft-large-files": "Discovery/Web-Content/raft-large-files.txt",
    "crawl:raft-medium-directories": "Discovery/Web-Content/raft-medium-directories.txt",
    "crawl:raft-medium-files": "Discovery/Web-Content/raft-medium-files.txt",
}
PATT_FILES = {
    "traversal:directory_traversal": "Directory Traversal/Intruder/directory_traversal.txt",
    "traversal:dotdotpwn": "Directory Traversal/Intruder/dotdotpwn.txt",
    "traversal:deep_traversal": "Directory Traversal/Intruder/deep_traversal.txt",
    "traversal:exotic-encoding": "Directory Traversal/Intruder/traversals-8-deep-exotic-encoding.txt",
    "lfi:jhaddix": "File Inclusion/Intruders/JHADDIX_LFI.txt",
    "lfi:list-of-file-to-include": "File Inclusion/Intruders/List_Of_File_To_Include.txt",
    "lfi:list-of-file-to-include-nullbyte": "File Inclusion/Intruders/List_Of_File_To_Include_NullByteAdded.txt",
    "lfi:dot-slash-pairing": "File Inclusion/Intruders/dot-slash-PathTraversal_and_LFI_pairing.txt",
    "lfi:fd-check": "File Inclusion/Intruders/LFI-FD-check.txt",
}


def encode_file(path: pathlib.Path) -> str:
    raw = path.read_bytes()
    return base64.b85encode(gzip.compress(raw, 9)).decode("ascii")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seclists-dir", required=True, type=pathlib.Path)
    ap.add_argument("--patt-dir", required=True, type=pathlib.Path)
    args = ap.parse_args()

    entries: dict[str, str] = {}
    missing: list[str] = []
    for key, rel in SECLISTS_FILES.items():
        p = args.seclists_dir / rel
        if not p.is_file():
            missing.append(str(p))
            continue
        entries[key] = encode_file(p)
    for key, rel in PATT_FILES.items():
        p = args.patt_dir / rel
        if not p.is_file():
            missing.append(str(p))
            continue
        entries[key] = encode_file(p)

    if missing:
        print("[경고] 못 찾은 파일 (해당 키는 내장 안 됨, 실행 시 조용히 건너뜀):", file=sys.stderr)
        for m in missing:
            print(f"  {m}", file=sys.stderr)

    lines = [START_MARK, "_EMBEDDED_WORDLISTS: dict[str, str] = {"]
    for key in sorted(entries):
        lines.append(f'    {key!r}: {entries[key]!r},')
    lines.append("}")
    lines.append(END_MARK)
    block = "\n".join(lines)

    text = TARGET_FILE.read_text(encoding="utf-8")
    start = text.index(START_MARK)
    end = text.index(END_MARK) + len(END_MARK)
    new_text = text[:start] + block + text[end:]
    TARGET_FILE.write_text(new_text, encoding="utf-8")

    total_raw = sum((args.seclists_dir / rel).stat().st_size for rel in SECLISTS_FILES.values() if (args.seclists_dir / rel).is_file())
    total_raw += sum((args.patt_dir / rel).stat().st_size for rel in PATT_FILES.values() if (args.patt_dir / rel).is_file())
    print(f"완료: {len(entries)}개 워드리스트 내장 (원본 {total_raw / 1e6:.2f}MB), {TARGET_FILE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
