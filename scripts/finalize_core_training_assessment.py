#!/usr/bin/env python3
"""Write a transparent core-only assessment from human-reviewed evidence.

This intentionally does not count propagated exact duplicates.  Scores are
bounded estimates, not a certification of production competency.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
from collections import Counter
from datetime import datetime, timezone


RATINGS = {
    "WEB_ARCHITECTURE": (6.5, "MEDIUM", "Spring MVC의 Controller-Service-Mapper-View 경로를 실제 오류와 함께 다뤘다."),
    "JAVA_SPRING": (6.5, "MEDIUM", "DTO 매핑, MyBatis, 404와 바인딩 오류 추적 근거가 있다."),
    "AUTHENTICATION": (6.0, "MEDIUM", "비밀번호 정책, OTP, 로그인 실패 제한, 세션과 JWT 위험을 구분하려는 근거가 있다."),
    "AUTHORIZATION": (6.0, "MEDIUM", "비인증 접근, IDOR, 역할 기반 접근제어를 진단 항목으로 분리한다."),
    "SESSION_COOKIE": (5.5, "MEDIUM", "HttpOnly, Secure, SameSite를 알고 있으나 쿠키 속성만으로 취약 여부를 단정하지 않는 훈련이 더 필요하다."),
    "XSS_CONTEXT": (6.5, "MEDIUM", "Reflected와 Stored XSS의 보고서 표현과 출력 인코딩을 다뤘다."),
    "SQLI_QUERY": (6.0, "MEDIUM", "MyBatis 바인딩과 LIKE 검색을 검토했다. DB별 실행계획 검증은 추가 필요하다."),
    "FILE_UPLOAD": (6.0, "MEDIUM", "multipart 요청, 파일명과 유형 검증, 경로 통제를 실제 진단 맥락으로 다뤘다."),
    "SSRF": (6.0, "MEDIUM", "리다이렉트, 내부 주소, 파트너 신뢰 경계를 구체적으로 질문하고 검토했다."),
    "API_SECURITY": (6.0, "MEDIUM", "메서드, 입력값, 오류 노출, 객체 접근 제어를 진단 관점에서 정리했다."),
    "STATIC_DATA_FLOW": (5.5, "MEDIUM", "Source-Sink와 파라미터 흐름을 적용하기 시작했다. 독립 코드 추적 증거는 제한적이다."),
    "REPORTING": (7.5, "HIGH", "문제점, 영향, 해결방안, 캡션, 개념 오류를 분리해 보고서 품질을 반복 교정했다."),
    "LINUX_SERVER": (6.0, "MEDIUM", "SSH 서비스 상태, 포트, 서버 파일 노출, 배포 오류를 실제 로그로 다뤘다."),
    "NETWORK_TLS": (5.5, "MEDIUM", "방화벽, IPS, WAF, 프록시와 TLS 설정의 역할을 구분하려는 근거가 있다."),
    "DOCKER_DEPLOY": (6.5, "MEDIUM", "Docker Compose, GitHub Actions, SSH 기반 이미지 갱신과 실패 로그를 다뤘다."),
    "SQL_DML": (6.5, "MEDIUM", "관계 테이블 INSERT와 범위 조건 UPDATE의 실행 단위를 구체적으로 다뤘다."),
    "DATA_MODELING": (6.5, "MEDIUM", "필드 제약, 타입, 부모-자식 관계와 데이터 의미를 분리해 다뤘다."),
    "DATA_QUALITY": (6.5, "MEDIUM", "출처 없는 수치와 불리언 값의 추정을 거부하고 근거 기반 입력을 요구했다."),
    "SECRETS_MANAGEMENT": (5.0, "MEDIUM", "비밀값 환경변수 관리 필요성은 인지하지만 과거 평문 노출 기록이 있어 회전과 최소권한 운영이 우선 과제다."),
    "REQUIREMENTS": (7.5, "HIGH", "산출물 형식, 작성 시점, 검토 기준을 명확히 통제한다."),
    "DEBUGGING": (6.5, "MEDIUM", "오류 메시지와 서비스 로그로 원인을 단계적으로 좁힌 기록이 있다."),
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", required=True)
    args = parser.parse_args()
    now = datetime.now(timezone.utc).isoformat()
    conn = sqlite3.connect(args.database)
    try:
        rows = conn.execute(
            "SELECT user_evidence_json FROM learner_chunk_review WHERE reviewer_model='Codex manual review'"
        ).fetchall()
        counts: Counter[str] = Counter()
        for (payload,) in rows:
            for item in json.loads(payload):
                # Earlier manual reviews used `skill`; later structured
                # reviews use `category`. Both are direct human evidence.
                code = item.get("category") or item.get("skill")
                if code:
                    counts[code] += 1
        for code, (score, confidence, rationale) in RATINGS.items():
            conn.execute(
                """INSERT INTO assessment(skill_code, score, confidence, status, rationale, evidence_count, assessed_at)
                   VALUES (?, ?, ?, 'CORE_REVIEW_2026_09_11', ?, ?, ?)
                   ON CONFLICT(skill_code, status) DO UPDATE SET
                     score=excluded.score, confidence=excluded.confidence,
                     rationale=excluded.rationale, evidence_count=excluded.evidence_count,
                     assessed_at=excluded.assessed_at""",
                (code, score, confidence, rationale, counts[code], now),
            )
        conn.commit()
        print(f"wrote {len(RATINGS)} core assessments from {len(rows)} direct manual reviews")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
