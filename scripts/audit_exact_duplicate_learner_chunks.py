#!/usr/bin/env python3
"""Audit exact learner-message duplicates without using an AI model."""

from __future__ import annotations

import argparse
import hashlib
import sqlite3
from collections import defaultdict
from pathlib import Path


def learner_body(path: Path) -> str:
    """Remove generated chunk metadata and retain only the learner message."""
    content = path.read_text(encoding="utf-8")
    return content.split("\n\n", 3)[-1]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", required=True)
    parser.add_argument("--root", required=True)
    args = parser.parse_args()

    root = Path(args.root)
    connection = sqlite3.connect(args.database)
    rows = connection.execute("SELECT id, relative_path FROM learner_chunk").fetchall()
    reviewed = {row[0] for row in connection.execute("SELECT chunk_id FROM learner_chunk_review")}
    groups: dict[str, list[int]] = defaultdict(list)
    for chunk_id, relative_path in rows:
        digest = hashlib.sha256(learner_body(root / relative_path).encode("utf-8")).hexdigest()
        groups[digest].append(chunk_id)

    reusable = [ids for ids in groups.values() if any(chunk_id in reviewed for chunk_id in ids)]
    reachable = sum(
        1 for ids in reusable for chunk_id in ids if chunk_id not in reviewed
    )
    print(f"chunks={len(rows)}")
    print(f"unique_exact_bodies={len(groups)}")
    print(f"duplicate_instances={len(rows) - len(groups)}")
    print(f"reviewed_body_groups={len(reusable)}")
    print(f"pending_exact_duplicates_of_reviewed_bodies={reachable}")
    for ids in sorted(groups.values(), key=len, reverse=True)[:10]:
        if len(ids) > 1:
            print(f"copies={len(ids)} chunk_ids={','.join(map(str, ids[:20]))}")


if __name__ == "__main__":
    main()
