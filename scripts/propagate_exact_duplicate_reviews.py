#!/usr/bin/env python3
"""Copy a manual review only when the learner-message body is byte-for-byte equal."""

from __future__ import annotations

import argparse
import hashlib
import sqlite3
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path


def body(path: Path) -> str:
    return path.read_text(encoding="utf-8").split("\n\n", 3)[-1]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", required=True)
    parser.add_argument("--root", required=True)
    args = parser.parse_args()
    connection = sqlite3.connect(args.database)
    root = Path(args.root)
    chunks = connection.execute("SELECT id, relative_path FROM learner_chunk").fetchall()
    groups: dict[str, list[int]] = defaultdict(list)
    for chunk_id, relative_path in chunks:
        groups[hashlib.sha256(body(root / relative_path).encode()).hexdigest()].append(chunk_id)

    reviews = {
        row[0]: row[1:]
        for row in connection.execute(
            "SELECT chunk_id, reviewer_model, summary, user_evidence_json, misconceptions_json, training_gaps_json "
            "FROM learner_chunk_review"
        )
    }
    inserted = 0
    for chunk_ids in groups.values():
        sources = [chunk_id for chunk_id in chunk_ids if chunk_id in reviews]
        if not sources:
            continue
        source_id = min(sources)
        reviewer, summary, evidence, misconceptions, gaps = reviews[source_id]
        for chunk_id in chunk_ids:
            if chunk_id in reviews:
                continue
            connection.execute(
                "INSERT INTO learner_chunk_review "
                "(chunk_id, reviewer_model, summary, user_evidence_json, misconceptions_json, training_gaps_json, reviewed_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    chunk_id,
                    f"{reviewer}; exact-body duplicate propagation",
                    f"원문 본문이 청크 {source_id}와 SHA-256 기준으로 완전히 동일하다. {summary}",
                    evidence,
                    misconceptions,
                    gaps,
                    datetime.now(UTC).isoformat(),
                ),
            )
            connection.execute("UPDATE learner_chunk SET review_status='MANUALLY_REVIEWED_EXACT_DUPLICATE' WHERE id=?", (chunk_id,))
            inserted += 1
    connection.commit()
    print(f"propagated={inserted}")


if __name__ == "__main__":
    main()
