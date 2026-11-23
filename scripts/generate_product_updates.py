#!/usr/bin/env python3
"""Generate dashboard-visible update notes from recent public-facing Git commits."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from collections import OrderedDict
from datetime import datetime, timezone
from pathlib import Path

SINCE = "2026-11-19T23:59:59+09:00"
COMMIT_RE = re.compile(r"^(feat|fix|perf)(?:\(([^)]+)\))?!?:\s*(.+)$", re.IGNORECASE)
SCOPE_LABELS = {
    "diag": "진단",
    "feedback": "개선 제보",
    "dashboard": "대시보드",
    "archive": "아카이브",
    "notes": "노트",
    "training": "역량 강화",
    "calendar": "캘린더",
    "ux": "사용성",
}
EXCLUDED_SCOPE = re.compile(r"admin|internal|infra|build|ci|test|ops|trading", re.IGNORECASE)
PUBLIC_FRONTEND_PREFIXES = (
    "frontend/src/pages/",
    "frontend/src/panels/",
    "frontend/src/payloads/",
    "frontend/src/components/",
    "frontend/src/shells/",
    "frontend/src/lib/",
)


def git(root: Path, *args: str) -> str:
    return subprocess.check_output(["git", "-C", str(root), *args], text=True, stderr=subprocess.DEVNULL).strip()


def is_public_commit(root: Path, commit: str, scope: str | None) -> bool:
    if scope and EXCLUDED_SCOPE.search(scope):
        return False
    files = git(root, "diff-tree", "--no-commit-id", "--name-only", "-r", commit).splitlines()
    public_paths = [
        path for path in files
        if path.startswith(PUBLIC_FRONTEND_PREFIXES)
        and "/admin/" not in path.lower()
        and not Path(path).name.lower().startswith("admin")
    ]
    return bool(public_paths)


def collect_updates(root: Path, since: str = SINCE) -> list[dict[str, object]]:
    rows = git(root, "log", "--first-parent", "--no-merges", f"--since={since}", "--format=%H%x09%cs%x09%s", "main").splitlines()
    groups: OrderedDict[str, list[str]] = OrderedDict()
    for row in rows:
        parts = row.split("\t", 2)
        if len(parts) != 3:
            continue
        commit, date, subject = parts
        match = COMMIT_RE.match(subject)
        if not match:
            continue
        scope, summary = match.group(2), match.group(3).strip()
        if not is_public_commit(root, commit, scope):
            continue
        label = SCOPE_LABELS.get((scope or "").lower())
        item = f"{label} · {summary}" if label else summary
        if item not in groups.setdefault(date, []):
            groups[date].append(item)
    return [{"date": date, "items": items} for date, items in groups.items()]


def generate(root: Path, output: Path) -> None:
    groups = collect_updates(root)
    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "groups": groups,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    root = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parents[1]
    output = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else root / "frontend/public/product-updates.generated.json"
    try:
        if git(root, "rev-parse", "--is-inside-work-tree") != "true":
            raise RuntimeError("not a Git checkout")
        generate(root, output)
    except (OSError, subprocess.CalledProcessError, RuntimeError) as error:
        print(f"product update generation skipped: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
