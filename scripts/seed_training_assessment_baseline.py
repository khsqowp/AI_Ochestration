#!/usr/bin/env python3
"""Seed explicitly provisional assessment evidence from already human-read material.

This never claims to have reviewed the whole export.  It gives the future
training page a transparent baseline while the chunk review is in progress.
"""

from __future__ import annotations

import argparse
import sqlite3
from datetime import datetime, timezone


BASELINE = {
    "WEB_ARCHITECTURE": (7.0, "MEDIUM", "Spring MVC·MyBatis·DB 호출 경로를 실제 개발·진단 대화에서 반복적으로 다뤘다."),
    "JAVA_SPRING": (6.5, "MEDIUM", "Controller·Service·Mapper·Tomcat·MyBatis 오류를 추적한 기록이 있다."),
    "HTTP_REQUEST": (6.0, "MEDIUM", "Burp 요청·응답, HTTP 메서드와 헤더를 실제 진단 맥락에서 다뤘다."),
    "XSS_CONTEXT": (6.5, "MEDIUM", "XSS 필터와 HTML 출력 맥락은 강하지만 DOM 데이터 흐름은 추가 검증이 필요하다."),
    "SQLI_QUERY": (6.0, "MEDIUM", "SQL 문법 경험과 SQLi 기초가 있으나 실제 쿼리 컨텍스트 추론은 더 검증해야 한다."),
    "FILE_UPLOAD": (5.5, "MEDIUM", "매직 바이트, 실행 경로, 임의 파일 삭제와 경로 검증을 실제 사례로 학습했다."),
    "AUTHENTICATION": (5.0, "LOW", "세션·JWT·로그인 주제 기록은 있으나 개념 간 연결과 반복 재현이 부족하다는 기존 근거가 있다."),
    "AUTHORIZATION": (5.0, "MEDIUM", "IDOR/객체 소유권 검증 후보를 찾는 능력은 보이나 체계성은 추가 검증이 필요하다."),
    "SESSION_COOKIE": (4.5, "MEDIUM", "HttpOnly·Secure·SameSite의 역할을 반복해서 혼동한 기록이 있다."),
    "CSRF": (4.5, "LOW", "토큰·SameSite·상태 변경 요청의 관계를 추가로 점검해야 한다."),
    "SSRF": (5.0, "MEDIUM", "리다이렉트 기반 SSRF와 내부 주소 경계를 실제 요청 분석으로 다뤘다."),
    "API_SECURITY": (4.5, "LOW", "HTTP 메서드와 입력 검증은 다뤘으나 API 전반의 인증·인가·오류 설계는 추가 검토가 필요하다."),
    "BUSINESS_LOGIC": (4.0, "LOW", "현재 확보된 근거가 적다."),
    "STATIC_DATA_FLOW": (5.0, "MEDIUM", "Source→Sink 개념을 실제 Java 코드 진단에 적용하기 시작했으나 자동화된 습관 여부는 미확정이다."),
    "DYNAMIC_TESTING": (5.5, "MEDIUM", "Burp 기반 재현·가설 검증 사례가 존재한다."),
    "REPORTING": (7.5, "MEDIUM", "취약점 문장·원인·영향·해결방안 첨삭을 반복적으로 수행한 기록이 있다."),
    "AUTOMATION": (7.0, "LOW", "체크리스트·카탈로그·스크립트 기반 진단 사고가 확인되지만 전체 내보내기 검토 전이다."),
    "LINUX_SERVER": (4.0, "LOW", "Docker·Ubuntu 배포 경험은 확인되나 보안 진단 역량은 별도 검증이 필요하다."),
    "WINDOWS_IIS": (2.5, "LOW", "현재 읽힌 근거가 매우 적다."),
    "NETWORK_TLS": (4.0, "LOW", "Burp 인증서·TLS 문제 해결 경험은 있으나 네트워크 계층 진단 역량은 미확정이다."),
    "DBMS_SECURITY": (4.5, "LOW", "SQL·MySQL 사용 경험과 DB 보안 설정 능력은 구분해서 검증해야 한다."),
    "CLOUD_IAM": (2.0, "LOW", "현재 읽힌 근거가 매우 적다."),
    "DOCKER_DEPLOY": (6.0, "MEDIUM", "Docker·Ubuntu·GitHub Actions 배포 문제를 반복 추적한 기록이 있다."),
    "MOBILE_SECURITY": (None, "LOW", "모바일 진단 대화가 대기열에 있으므로 원문 검토 전 점수를 확정하지 않는다."),
    "CRYPTO_PASSWORD": (5.0, "MEDIUM", "salt 없는 SHA-256, 해시·레인보우 테이블 관련 실제 진단 사례가 있다."),
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", required=True)
    args = parser.parse_args()
    now = datetime.now(timezone.utc).isoformat()
    conn = sqlite3.connect(args.database)
    try:
        for code, (score, confidence, rationale) in BASELINE.items():
            conn.execute(
                """INSERT INTO assessment(skill_code, score, confidence, status, rationale, evidence_count, assessed_at)
                   VALUES (?, ?, ?, 'BASELINE_PENDING_FULL_REVIEW', ?, 1, ?)
                   ON CONFLICT(skill_code, status) DO UPDATE SET score=excluded.score, confidence=excluded.confidence,
                     rationale=excluded.rationale, assessed_at=excluded.assessed_at""",
                (code, score, confidence, rationale, now),
            )
            conn.execute(
                """INSERT INTO evidence(conversation_id, chunk_id, skill_code, evidence_type, observation, confidence, reviewer, created_at)
                   VALUES (NULL, NULL, ?, 'BASELINE_SOURCE', ?, ?, 'Codex', ?)""",
                (code, "첨부된 사전 평가와 이미 완독된 902번 기록을 바탕으로 한 잠정 근거: " + rationale, confidence, now),
            )
        conn.commit()
        print(f"seeded {len(BASELINE)} provisional skill assessments")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
