#!/usr/bin/env python3
"""Deterministically triage learner chunks; no model inference is used."""

from __future__ import annotations

import argparse
from pathlib import Path
import sqlite3


CORE_TERMS = (
    "security", "보안", "취약", "xss", "sqli", "sql injection", "csrf", "ssrf",
    "rce", "ctf", "pentest", "침투", "해킹", "owasp", "cve", "exploit",
    "spring", "java", "docker", "kubernetes", "mysql", "postgres", "api",
    "backend", "frontend", "react", "next.js", "nextjs", "python", "javascript",
    "typescript", "코드", "개발", "프로그래밍", "디버", "오류", "에러",
    "network", "리눅스", "linux", "database", "데이터베이스", "sql",
)

# Fast-track only conversations whose subject itself signals sustained technical
# work.  Generic SQL/data-entry chats are represented by the already-reviewed
# motorcycle corpus and would otherwise dominate the queue.
TITLE_CORE_TERMS = (
    "security", "보안", "취약", "xss", "sqli", "sql injection", "csrf", "ssrf",
    "rce", "ctf", "pentest", "침투", "해킹", "owasp", "cve", "exploit",
    "spring", "java", "docker", "kubernetes", "github actions", "nginx",
    "nextcloud", "next.js", "nextjs", "react", "typescript", "python",
    "troubleshooting", "deploy", "deployment", "gradle", "ubuntu", "linux",
    "network", "인증", "authentication", "api", "개발", "프로그래밍", "디버",
    "오류", "에러", "코드", "소스코드", "자바 웹",
)

# Motorcycle catalogue work was already directly reviewed and is overwhelmingly
# repeated requests for the same SQL shape.  It is preserved as evidence already
# recorded, but not promoted to the fast-track core queue again.
REPETITIVE_DOMAIN_TITLE_TERMS = ("motorcycle", "honda xl750", "bmw s 1000")


def body(path: Path) -> str:
    return path.read_text(encoding="utf-8").split("\n\n", 3)[-1]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", required=True)
    parser.add_argument("--root", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    root = Path(args.root)
    connection = sqlite3.connect(args.database)
    rows = connection.execute(
        "SELECT lc.id, lc.relative_path, c.title FROM learner_chunk lc "
        "JOIN conversation c ON c.id=lc.conversation_id "
        "WHERE lc.review_status='PENDING'"
    ).fetchall()
    core: list[tuple[int, str]] = []
    excluded: list[int] = []
    for chunk_id, relative_path, title in rows:
        title_lower = title.lower()
        if any(term in title_lower for term in REPETITIVE_DOMAIN_TITLE_TERMS):
            excluded.append(chunk_id)
            continue
        body_text = body(root / relative_path).lower()
        matched = [term for term in TITLE_CORE_TERMS if term in title_lower]
        # Untitled conversations have no semantic title; retain only those with
        # direct security/development signals in the actual learner message.
        if not matched and title_lower == "제목 없음":
            matched = [term for term in CORE_TERMS if term in body_text]
        if matched:
            core.append((chunk_id, ", ".join(matched[:6])))
        else:
            excluded.append(chunk_id)

    print(f"pending={len(rows)}")
    print(f"core_candidates={len(core)}")
    print(f"excluded_low_signal={len(excluded)}")
    print("candidate_sample=" + ",".join(str(chunk_id) for chunk_id, _ in core[:30]))
    if not args.apply:
        return
    connection.executemany(
        "UPDATE learner_chunk SET review_status='CORE_CANDIDATE' WHERE id=?",
        [(chunk_id,) for chunk_id, _ in core],
    )
    connection.executemany(
        "UPDATE learner_chunk SET review_status='EXCLUDED_LOW_SIGNAL' WHERE id=?",
        [(chunk_id,) for chunk_id in excluded],
    )
    connection.commit()


if __name__ == "__main__":
    main()
