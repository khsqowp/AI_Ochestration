package com.orchestration.training;

/** Optional coverage map used by the AI when a broad security skill needs a concrete Web/API diagnostic focus. */
final class BlackBoxWebApiGuideline {
  private BlackBoxWebApiGuideline() {}

  static String candidatesFor(String skillCode) {
    return switch (skillCode) {
      case "XSS_CONTEXT" -> "1-1 XSS 공격 가능성. 출력 컨텍스트와 안전 인코딩을 관측 기반으로 판단";
      case "CSRF" -> "1-1 XSS / CSRF 공격 가능성. 쿠키 전송 조건, 요청 형식, 서버측 검증을 분리";
      case "SQLI_QUERY" -> "1-2 삽입(Injection) 공격 가능성";
      case "INPUT_INTEGRITY" -> "1-3 파라미터·hidden 필드 조작, 1-6 입력값 크기·무결성 검증 오류";
      case "SSRF" -> "1-4 SSRF / File Inclusion 공격 가능성";
      case "URL_REDIRECT" -> "1-5 검증되지 않은 리다이렉트와 포워드";
      case "FILE_UPLOAD" -> "2-1 악성코드 파일 업로드";
      case "FILE_DOWNLOAD" -> "2-2 중요 정보 파일 다운로드 가능성";
      case "AUTHENTICATION" -> "3-1 패스워드 정책, 3-2 인증 실패 횟수 제한, 3-3 계정 정보 파악 가능성";
      case "AUTHORIZATION" -> "4-3 접근제어 우회, 4-4 비인증 중요 페이지 접근, 4-5 일반계정 권한 상승";
      case "CLIENT_STATE_TRUST" -> "4-1 쿠키(Cookie) 및 웹 스토리지(Web Storage) 조작 가능성";
      case "SESSION_COOKIE" -> "4-2 세션·토큰 값 안전성";
      case "SECRETS_MANAGEMENT" -> "5-1 소스코드 주요정보 노출, 5-2 요청·응답 주요정보 포함";
      case "ERROR_HANDLING" -> "6-1 오류페이지를 통한 정보 노출, 6-2 일괄적인 오류 처리";
      case "WEB_HARDENING" -> "3-4 관리자 페이지 분리, 3-5 검색엔진 정보 노출, 3-6 백업·테스트 파일, 7-1 Client Request Method, 7-2 파일 목록화, 7-3 서버 헤더, 7-4 취약한 보안설정";
      case "NETWORK_TLS" -> "TLS 인증서 검증, 프록시 신뢰 경계, 암호군과 HTTPS 종료 지점";
      case "LINUX_HARDENING" -> "Linux 파일·설정 파일 권한, sudo·SUID, 서비스 계정, cron·로그 권한";
      case "CLOUD_IAM" -> "AWS IAM 사용자·역할·정책, 임시 자격증명, 최소 권한과 권한 상승 경로";
      case "CLOUD_NETWORK" -> "AWS VPC, 서브넷, 라우팅, Security Group, NACL, 인터넷 노출 경계";
      case "CLOUD_DATA_SECURITY" -> "S3 공개 접근, KMS 키 정책, 백업·스냅샷 공유, 데이터 암호화와 감사 로그";
      case "CONTAINER_SECURITY" -> "컨테이너 권한, 이미지 공급망, 비밀값 주입, 마운트와 네트워크 격리";
      case "NETWORK_ACCESS_CONTROL" -> "방화벽·ACL·포트 노출·망 분리·관리 인터페이스 접근 제어";
      case "NETWORK_DEFENSE" -> "WAF·IDS·IPS 정책, 우회 가능성, 오탐·차단 효과와 서비스 영향";
      case "SECURITY_MONITORING" -> "CloudTrail·WAF·IDS/IPS·서버 로그의 수집 범위, 탐지 규칙, 경보와 대응";
      case "API_SECURITY" -> "API 엔드포인트별 인증·인가·메서드·상태 전이와 실제 효과";
      case "BUSINESS_LOGIC" -> "8-1 정의되지 않은 기타 취약점. 업무 규칙 위반 여부를 관측 기반으로 설계";
      default -> "1 입출력 검증, 2 파일처리, 3 접근통제, 4 인증·세션, 5 중요정보, 6 오류처리, 7 보안설정, 8 기타 취약점 중 적합한 한 항목";
    };
  }
}
