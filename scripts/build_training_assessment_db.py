#!/usr/bin/env python3
"""Create a resumable local index for a private ChatGPT conversation export.

The export remains the canonical raw source.  The database stores metadata,
chunk references and later evidence/assessments; it intentionally does not
duplicate raw conversation bodies, which can contain personal or secret data.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


# Manual review uses deliberately small evidence units. A reviewer must finish
# one unit and record it before moving to the next; 3,000 Korean characters is
# small enough to inspect without silently skipping the end of a long thread.
MAX_CHUNK_CHARS = 3_000

SKILLS = [
    ("WEB_ARCHITECTURE", "웹 애플리케이션 구조", "Controller·Service·Repository·DTO·템플릿 경계"),
    ("JAVA_SPRING", "Java/Spring 코드 이해", "Spring MVC, Security, JPA/MyBatis, 예외 처리"),
    ("HTTP_REQUEST", "HTTP 요청·응답 분석", "메서드, 헤더, 쿠키, 상태코드, 파라미터"),
    ("AUTHENTICATION", "인증", "로그인, 세션/JWT 발급·검증, MFA, 계정 보호"),
    ("AUTHORIZATION", "인가·객체 접근 제어", "IDOR/BOLA/BFLA, 역할, 소유권 검증"),
    ("SESSION_COOKIE", "세션·쿠키 보안", "HttpOnly, Secure, SameSite, 고정, 만료"),
    ("XSS_CONTEXT", "XSS 컨텍스트·데이터 흐름", "출처, 변환, 출력 컨텍스트, DOM sink"),
    ("SQLI_QUERY", "SQL Injection·쿼리 흐름", "쿼리 컨텍스트, MyBatis, ORM, 검증"),
    ("FILE_UPLOAD", "파일 업로드·파일 경로", "형식 검증, 저장 경계, Path Traversal"),
    ("SSRF", "SSRF·리다이렉트", "URL 검증, DNS, 리다이렉트, 내부망 경계"),
    ("CSRF", "CSRF", "요청 출처 검증, 토큰, SameSite, 상태 변경"),
    ("API_SECURITY", "API 보안", "입력 검증, 메서드, 에러, 레이트 리밋, 객체 수준 보호"),
    ("BUSINESS_LOGIC", "비즈니스 로직 보안", "흐름 우회, 상태 전이, 금액·쿠폰·권한 규칙"),
    ("STATIC_DATA_FLOW", "정적 분석·Source to Sink", "신뢰 경계, taint 흐름, 코드 추적"),
    ("DYNAMIC_TESTING", "동적 진단 방법론", "재현, 가설 검증, Burp 기반 요청 분석"),
    ("REPORTING", "취약점 보고서 작성", "증적, 영향, 원인, 해결방안, 정확한 용어"),
    ("AUTOMATION", "진단 자동화 사고", "체크리스트, 스크립트, 반복 작업 설계"),
    ("LINUX_SERVER", "Linux·서버 보안", "서비스, 권한, 로그, 배포, 운영 경계"),
    ("WINDOWS_IIS", "Windows·IIS 보안", "Windows 인증, IIS, AD 연계 기초"),
    ("NETWORK_TLS", "네트워크·TCP·TLS", "포트, 프록시, 인증서, 흐름, 캡처"),
    ("DBMS_SECURITY", "DBMS 보안 설정", "계정, 권한, 연결, 암호화, 감사"),
    ("CLOUD_IAM", "클라우드·IAM", "자격증명, 역할, 네트워크, 최소 권한"),
    ("DOCKER_DEPLOY", "Docker·배포 운영", "컨테이너, 볼륨, 비밀값, CI/CD"),
    ("MOBILE_SECURITY", "모바일 진단", "앱 통신, 인증서, 저장소, API 경계"),
    ("CRYPTO_PASSWORD", "암호·비밀번호 보안", "해시, salt, KDF, 키 관리"),
    ("SQL_DML", "SQL DML 구현", "INSERT·UPDATE·CASE·범위 갱신과 실행 단위 설계"),
    ("DATA_MODELING", "데이터 모델링", "테이블 관계, 식별자, 필드 제약과 데이터 구조"),
    ("DATA_QUALITY", "데이터 근거·품질 관리", "출처 확인, 추정 방지, 누락·형식 제약 관리"),
    ("REQUIREMENTS", "요구사항 명세", "출력 형식, 범위, 불변 조건과 완료 기준 정의"),
    ("DEBUGGING", "문제 재현·디버깅", "오류 관찰, 가설, 원인 분리, 검증"),
]

KEYWORDS = {
    "WEB_ARCHITECTURE": ("controller", "service", "mapper", "dto", "tomcat", "spring"),
    "JAVA_SPRING": ("spring", "java", "mybatis", "jpa", "tomcat"),
    "HTTP_REQUEST": ("http", "request", "response", "header", "method", "cookie"),
    "AUTHENTICATION": ("login", "로그인", "jwt", "authentication", "mfa"),
    "AUTHORIZATION": ("idor", "bola", "bfla", "인가", "권한", "access control"),
    "SESSION_COOKIE": ("session", "세션", "httponly", "samesite", "secure cookie"),
    "XSS_CONTEXT": ("xss", "innerhtml", "dom", "script", "cross site scripting"),
    "SQLI_QUERY": ("sqli", "sql injection", "sql", "query", "#{", "${"),
    "FILE_UPLOAD": ("file upload", "파일 업로드", "path traversal", "업로드"),
    "SSRF": ("ssrf", "redirect", "리다이렉트", "localhost"),
    "CSRF": ("csrf", "cross-site request forgery"),
    "API_SECURITY": ("api", "rest", "endpoint", "rate limit"),
    "BUSINESS_LOGIC": ("coupon", "쿠폰", "payment", "주문", "business logic"),
    "STATIC_DATA_FLOW": ("source", "sink", "taint", "data flow", "정적 분석"),
    "DYNAMIC_TESTING": ("burp", "proxy", "poc", "검증", "테스트"),
    "REPORTING": ("report", "보고서", "severity", "cwe", "해결방안"),
    "AUTOMATION": ("automation", "자동화", "script", "스크립트"),
    "LINUX_SERVER": ("linux", "ubuntu", "nginx", "apache"),
    "WINDOWS_IIS": ("windows", "iis", "active directory"),
    "NETWORK_TLS": ("tls", "tcp", "certificate", "인증서", "wireshark"),
    "DBMS_SECURITY": ("database", "mysql", "oracle", "dbms", "database"),
    "CLOUD_IAM": ("aws", "azure", "gcp", "iam", "cloud"),
    "DOCKER_DEPLOY": ("docker", "compose", "deploy", "github actions", "ci/cd"),
    "MOBILE_SECURITY": ("mobile", "android", "ios", "apk", "모바일"),
    "CRYPTO_PASSWORD": ("sha", "bcrypt", "password", "비밀번호", "hash", "salt"),
}


def slug(value: str) -> str:
    result = re.sub(r"[^0-9A-Za-z가-힣_-]+", "-", value).strip("-")
    return (result[:72] or "untitled").lower()


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def message_text(message: dict[str, Any]) -> str:
    text = message.get("text")
    if isinstance(text, str) and text.strip():
        return text.strip()
    content = message.get("content")
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        return "\n".join(str(item) for item in content if item is not None).strip()
    if isinstance(content, dict):
        return json.dumps(content, ensure_ascii=False, sort_keys=True)
    return ""


def formatted_messages(item: dict[str, Any]) -> list[str]:
    result: list[str] = []
    for index, message in enumerate(item.get("chat_messages") or [], start=1):
        body = message_text(message)
        if not body:
            continue
        sender = message.get("sender") or message.get("author") or "unknown"
        created = message.get("created_at") or ""
        result.append(f"## Message {index} · {sender} · {created}\n\n{body}\n")
    return result


def formatted_learner_messages(item: dict[str, Any]) -> list[str]:
    """Keep only learner-authored messages for competence evidence.

    Assistant output stays available in the canonical raw export and regular
    chunks, but it must not inflate an assessment of the learner.
    """
    result: list[str] = []
    for index, message in enumerate(item.get("chat_messages") or [], start=1):
        sender = str(message.get("sender") or message.get("author") or "").lower()
        if sender not in {"user", "human"}:
            continue
        body = message_text(message)
        if not body:
            continue
        created = message.get("created_at") or ""
        result.append(f"## Learner message {index} · {created}\n\n{body}\n")
    return result


def split_messages(messages: list[str], empty_placeholder: bool = True) -> list[str]:
    chunks: list[str] = []
    current = ""
    for message in messages:
        if len(message) <= MAX_CHUNK_CHARS and len(current) + len(message) <= MAX_CHUNK_CHARS:
            current += message
            continue
        if current:
            chunks.append(current)
            current = ""
        while len(message) > MAX_CHUNK_CHARS:
            cut = message.rfind("\n", 0, MAX_CHUNK_CHARS)
            cut = cut if cut >= MAX_CHUNK_CHARS // 2 else MAX_CHUNK_CHARS
            chunks.append(message[:cut])
            message = message[cut:]
        current = message
    if current:
        chunks.append(current)
    return chunks or (["(내용 없음)\n"] if empty_placeholder else [])


def init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS source_export (
          id INTEGER PRIMARY KEY, source_path TEXT NOT NULL UNIQUE, sha256 TEXT NOT NULL,
          conversation_count INTEGER NOT NULL, indexed_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS conversation (
          id INTEGER PRIMARY KEY, export_id INTEGER NOT NULL REFERENCES source_export(id),
          export_index INTEGER NOT NULL, external_uuid TEXT, title TEXT NOT NULL, summary TEXT,
          created_at TEXT, updated_at TEXT, message_count INTEGER NOT NULL,
          extracted_dir TEXT NOT NULL, analysis_status TEXT NOT NULL DEFAULT 'PENDING',
          UNIQUE(export_id, export_index)
        );
        CREATE TABLE IF NOT EXISTS conversation_chunk (
          id INTEGER PRIMARY KEY, conversation_id INTEGER NOT NULL REFERENCES conversation(id),
          ordinal INTEGER NOT NULL, relative_path TEXT NOT NULL, char_count INTEGER NOT NULL,
          sha256 TEXT NOT NULL, review_status TEXT NOT NULL DEFAULT 'PENDING',
          UNIQUE(conversation_id, ordinal)
        );
        CREATE TABLE IF NOT EXISTS learner_chunk (
          id INTEGER PRIMARY KEY, conversation_id INTEGER NOT NULL REFERENCES conversation(id),
          ordinal INTEGER NOT NULL, relative_path TEXT NOT NULL, char_count INTEGER NOT NULL,
          sha256 TEXT NOT NULL, review_status TEXT NOT NULL DEFAULT 'PENDING',
          UNIQUE(conversation_id, ordinal)
        );
        CREATE TABLE IF NOT EXISTS skill_category (
          code TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS conversation_candidate_skill (
          conversation_id INTEGER NOT NULL REFERENCES conversation(id), skill_code TEXT NOT NULL REFERENCES skill_category(code),
          signal_count INTEGER NOT NULL, method TEXT NOT NULL, PRIMARY KEY(conversation_id, skill_code)
        );
        CREATE TABLE IF NOT EXISTS evidence (
          id INTEGER PRIMARY KEY, conversation_id INTEGER REFERENCES conversation(id),
          chunk_id INTEGER REFERENCES conversation_chunk(id), skill_code TEXT REFERENCES skill_category(code),
          evidence_type TEXT NOT NULL, observation TEXT NOT NULL, confidence TEXT NOT NULL,
          reviewer TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS chunk_review (
          chunk_id INTEGER PRIMARY KEY REFERENCES conversation_chunk(id),
          reviewer_model TEXT NOT NULL, summary TEXT NOT NULL,
          user_evidence_json TEXT NOT NULL, misconceptions_json TEXT NOT NULL,
          training_gaps_json TEXT NOT NULL, reviewed_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS learner_chunk_review (
          chunk_id INTEGER PRIMARY KEY REFERENCES learner_chunk(id),
          reviewer_model TEXT NOT NULL, summary TEXT NOT NULL,
          user_evidence_json TEXT NOT NULL, misconceptions_json TEXT NOT NULL,
          training_gaps_json TEXT NOT NULL, reviewed_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS assessment (
          id INTEGER PRIMARY KEY, skill_code TEXT NOT NULL REFERENCES skill_category(code),
          score REAL, confidence TEXT NOT NULL, status TEXT NOT NULL,
          rationale TEXT NOT NULL, evidence_count INTEGER NOT NULL DEFAULT 0,
          assessed_at TEXT NOT NULL, UNIQUE(skill_code, status)
        );
        CREATE TABLE IF NOT EXISTS analysis_run (
          id INTEGER PRIMARY KEY, started_at TEXT NOT NULL, source_path TEXT NOT NULL,
          method TEXT NOT NULL, note TEXT NOT NULL
        );
        """
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    source = args.source.resolve()
    output = args.output.resolve()
    chunks_root = output / "chunks"
    database = output / "training-assessment.sqlite"
    if output.exists():
        shutil.rmtree(output)
    chunks_root.mkdir(parents=True)
    raw = source.read_bytes()
    data = json.loads(raw)
    if not isinstance(data, list):
        raise SystemExit("The source must be a JSON array of conversations.")

    conn = sqlite3.connect(database)
    try:
        init_schema(conn)
        now = datetime.now(timezone.utc).isoformat()
        cursor = conn.execute(
            "INSERT INTO source_export(source_path, sha256, conversation_count, indexed_at) VALUES (?, ?, ?, ?)",
            (str(source), sha256_bytes(raw), len(data), now),
        )
        export_id = cursor.lastrowid
        conn.executemany("INSERT INTO skill_category(code, name, description) VALUES (?, ?, ?)", SKILLS)
        total_chunks = 0
        total_learner_chunks = 0
        for index, item in enumerate(data):
            title = str(item.get("name") or "제목 없음").strip()
            messages = formatted_messages(item)
            chunks = split_messages(messages)
            learner_chunks = split_messages(formatted_learner_messages(item), empty_placeholder=False)
            directory_name = f"{index:04d}-{slug(title)}"
            directory = chunks_root / directory_name
            directory.mkdir()
            cursor = conn.execute(
                """INSERT INTO conversation(export_id, export_index, external_uuid, title, summary, created_at, updated_at, message_count, extracted_dir)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (export_id, index, item.get("uuid"), title, item.get("summary"), item.get("created_at"), item.get("updated_at"), len(item.get("chat_messages") or []), directory_name),
            )
            conversation_id = cursor.lastrowid
            all_text = "\n".join(chunks).lower()
            for ordinal, body in enumerate(chunks, start=1):
                path = directory / f"part-{ordinal:03d}.md"
                path.write_text(f"# {title}\n\n원본 대화 인덱스: {index}\n청크: {ordinal}/{len(chunks)}\n\n{body}", encoding="utf-8")
                relative = str(path.relative_to(output))
                conn.execute(
                    "INSERT INTO conversation_chunk(conversation_id, ordinal, relative_path, char_count, sha256) VALUES (?, ?, ?, ?, ?)",
                    (conversation_id, ordinal, relative, len(body), sha256_bytes(body.encode("utf-8"))),
                )
                total_chunks += 1
            learner_dir = chunks_root / directory_name / "learner"
            learner_dir.mkdir()
            for ordinal, body in enumerate(learner_chunks, start=1):
                path = learner_dir / f"part-{ordinal:03d}.md"
                path.write_text(f"# {title}\n\n원본 대화 인덱스: {index}\n학습자 청크: {ordinal}/{len(learner_chunks)}\n\n{body}", encoding="utf-8")
                relative = str(path.relative_to(output))
                conn.execute(
                    "INSERT INTO learner_chunk(conversation_id, ordinal, relative_path, char_count, sha256) VALUES (?, ?, ?, ?, ?)",
                    (conversation_id, ordinal, relative, len(body), sha256_bytes(body.encode("utf-8"))),
                )
                total_learner_chunks += 1
            for code, words in KEYWORDS.items():
                hits = sum(all_text.count(word.lower()) for word in words)
                if hits:
                    conn.execute(
                        "INSERT INTO conversation_candidate_skill(conversation_id, skill_code, signal_count, method) VALUES (?, ?, ?, 'keyword-triage')",
                        (conversation_id, code, hits),
                    )
        conn.execute(
            "INSERT INTO analysis_run(started_at, source_path, method, note) VALUES (?, ?, ?, ?)",
            (now, str(source), "local chunk index", "All conversations split for human review; keyword tags are triage only, not competence scores."),
        )
        conn.commit()
        print(json.dumps({"database": str(database), "conversations": len(data), "chunks": total_chunks,
                          "learner_chunks": total_learner_chunks, "source_sha256": sha256_bytes(raw)}, ensure_ascii=False))
    finally:
        conn.close()


if __name__ == "__main__":
    main()
