#!/usr/bin/env python3
"""Record one manually read learner-evidence chunk in the temporary DB."""

from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import datetime, timezone


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", required=True)
    parser.add_argument("--chunk-id", required=True, type=int)
    parser.add_argument("--summary", required=True)
    parser.add_argument("--evidence-json", default="[]")
    parser.add_argument("--misconceptions-json", default="[]")
    parser.add_argument("--gaps-json", default="[]")
    args = parser.parse_args()
    # Parse before mutating so malformed review payloads never create a partial row.
    evidence = json.loads(args.evidence_json)
    misconceptions = json.loads(args.misconceptions_json)
    gaps = json.loads(args.gaps_json)
    if not all(isinstance(value, list) for value in (evidence, misconceptions, gaps)):
        raise SystemExit("evidence, misconceptions and gaps must be JSON arrays")
    conn = sqlite3.connect(args.database)
    try:
        exists = conn.execute("SELECT 1 FROM learner_chunk WHERE id=?", (args.chunk_id,)).fetchone()
        if not exists:
            raise SystemExit(f"unknown learner chunk id: {args.chunk_id}")
        conn.execute(
            """INSERT INTO learner_chunk_review(chunk_id, reviewer_model, summary, user_evidence_json, misconceptions_json, training_gaps_json, reviewed_at)
               VALUES (?, 'Codex manual review', ?, ?, ?, ?, ?)
               ON CONFLICT(chunk_id) DO UPDATE SET reviewer_model=excluded.reviewer_model, summary=excluded.summary,
                 user_evidence_json=excluded.user_evidence_json, misconceptions_json=excluded.misconceptions_json,
                 training_gaps_json=excluded.training_gaps_json, reviewed_at=excluded.reviewed_at""",
            (args.chunk_id, args.summary, json.dumps(evidence, ensure_ascii=False), json.dumps(misconceptions, ensure_ascii=False),
             json.dumps(gaps, ensure_ascii=False), datetime.now(timezone.utc).isoformat()),
        )
        conn.execute("UPDATE learner_chunk SET review_status='MANUALLY_REVIEWED' WHERE id=?", (args.chunk_id,))
        conn.commit()
    finally:
        conn.close()


if __name__ == "__main__":
    main()
