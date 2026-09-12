package com.orchestration.training;

import jakarta.annotation.PostConstruct;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orchestration.tasks.LlmGateway;
import java.math.BigDecimal;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TrainingService {
  private final CompetencyAssessmentRepository assessments;
  private final TrainingCaseRepository cases;
  private final TrainingAttemptRepository attempts;
  private final TrainingEvaluationRepository evaluations;
  private final TrainingEvaluationCacheRepository evaluationCache;
  private final TrainingAiEvaluator evaluator;
  private final ObjectMapper json;
  TrainingService(CompetencyAssessmentRepository assessments, TrainingCaseRepository cases, TrainingAttemptRepository attempts,
      TrainingEvaluationRepository evaluations, TrainingEvaluationCacheRepository evaluationCache, TrainingAiEvaluator evaluator, ObjectMapper json) {
    this.assessments=assessments;this.cases=cases;this.attempts=attempts;this.evaluations=evaluations;this.evaluationCache=evaluationCache;this.evaluator=evaluator;this.json=json;
  }

  @PostConstruct @Transactional void seedCases() {
    backfillLegacyAttemptContexts();
    caseSeeds().forEach(this::upsertCase);
  }
  private void backfillLegacyAttemptContexts() {
    Map<String,LegacyCase> legacy=Map.of(
        "idor-object-owner",new LegacyCase("객체 소유권 인가 판정","## 상황\n로그인 사용자가 `/api/orders/{orderId}`를 호출합니다. Controller는 로그인 여부만 확인하고 orderId의 소유자를 확인하지 않습니다.\n\n## 제출\n취약 여부, 필요한 증거, 성립 조건, 영향, 조치, 재검증 계획을 작성하세요."),
        "mybatis-like-query",new LegacyCase("MyBatis LIKE 검색과 정렬 파라미터","## 상황\n검색어는 바인딩되지만 정렬 컬럼은 문자열로 조합됩니다.\n\n## 제출\n안전한 부분과 위험한 부분을 분리하고, 허용 목록 기반 조치와 테스트 계획을 작성하세요."),
        "report-method-overclaim",new LegacyCase("HTTP 메서드 보고서 오류 찾기","## 상황\n보고서는 PUT과 DELETE 응답이 존재한다는 이유만으로 즉시 고위험 취약점이라고 결론냅니다.\n\n## 제출\n보고서의 과장·증거 부족·필요한 추가 검증과 올바른 조치 방향을 작성하세요."),
        "redirect-ssrf-evidence",new LegacyCase("리다이렉트 응답과 SSRF 증거 판정","## 상황\nURL 입력 기능이 리다이렉트를 반환합니다. 브라우저에는 내부 주소 관련 응답이 보이지만 서버가 실제로 내부 요청을 보냈는지는 확실하지 않습니다.\n\n## 제출\n취약·정상·추가 증거 필요 중 하나를 판정하고 필요한 증거와 방어책을 작성하세요."),
        "upload-storage-boundary",new LegacyCase("파일 업로드 저장 경계","## 상황\n업로드 파일은 확장자만 검사하고 웹 루트 아래에 원본 파일명으로 저장됩니다.\n\n## 제출\n위험 조건, 조치 계층, 재검증 케이스를 작성하세요."),
        "ci-secret-hygiene",new LegacyCase("CI 배포 비밀값 점검","## 상황\n배포 설정과 과거 작업 로그에 토큰 또는 개인 키가 포함될 수 있습니다.\n\n## 제출\n즉시 조치, 재발 방지, 로그와 저장소 정리 원칙을 작성하세요.")
    );
    attempts.findAll().forEach(attempt -> { LegacyCase source=legacy.get(attempt.getTrainingCase().getSlug()); if(source!=null){attempt.backfillSnapshotIfMissing(source.title(),source.prompt());attempts.save(attempt);} });
  }
  private void upsertCase(CaseSeed seed) {
    cases.findBySlug(seed.slug()).ifPresentOrElse(existing -> {
      existing.refresh(seed.title(),seed.type(),seed.skill(),seed.difficulty(),seed.prompt(),rubricFor(seed.slug())); cases.save(existing);
    }, () -> cases.save(new TrainingCase(seed.slug(),seed.title(),seed.type(),seed.skill(),seed.difficulty(),seed.prompt(),rubricFor(seed.slug()))));
  }
  private List<CaseSeed> caseSeeds() { return List.of(
      new CaseSeed("session-cart-context", "쇼핑몰 장바구니 컨텍스트 쿠키 판정", TrainingCaseType.STATIC_DIAGNOSIS, "SESSION_COOKIE", 3, """
          ## 모의 환경과 범위
          사내 교육용 쇼핑몰 `shop.lab.internal`의 스테이징 환경이다. 제공된 계정 A와 B만 사용했고, 외부 서비스에는 요청하지 않았다.

          ## 관측 자료
          계정 A 로그인 뒤 브라우저에는 `shop_session`, `locale`, `cart_context` 쿠키가 있었다. `shop_session`의 임의 변경은 즉시 로그인 해제로 이어졌고, `locale` 변경은 화면 언어만 바꿨다. `cart_context`는 Base64로 표현된 JSON이며 A에서는 `{"cartId":"C-1042","accountId":"A-101"}`였다.

          계정 A 세션을 유지한 채 `cart_context.cartId`만 B의 장바구니 식별자인 `C-2097`로 바꿔 `GET /api/cart/summary`를 호출했다. 응답은 `200 OK`와 함께 B 장바구니의 상품명 2개와 수량을 반환했지만, 결제 버튼을 누르면 `403 CART_OWNER_MISMATCH`가 반환됐다. 서버 로그에는 `user=A-101 cart=C-2097 action=summary`가 남았다.

          ## 제출
          제공된 증거만으로 판정하고, 취약 성립 범위와 영향 제한을 구분하세요. 이 문제가 단순 쿠키 보안 속성 문제가 아닌 이유, 서버 측 조치, 본인·타인·결제·관리자 조건을 포함한 재검증 계획을 작성하세요.
          """),
      new CaseSeed("idor-object-owner", "주문 상세의 객체 소유권 인가 판정", TrainingCaseType.STATIC_DIAGNOSIS, "AUTHORIZATION", 3, """
          ## 모의 환경과 역할
          사내 주문 API의 일반 회원 A·B와 관리자 계정이 있다. 두 일반 회원은 서로 다른 주문을 한 건씩 보유한다.

          ## 요청과 응답
          A가 자신의 `GET /api/orders/O-1001`을 호출하면 `200 OK`와 배송지·수령인 일부 마스킹 정보가 반환된다. A의 세션으로 B 주문 식별자 `O-2008`을 요청하면 역시 `200 OK`이고 B의 수령인 이름, 전화번호 끝자리, 배송지가 반환된다. 주문 취소 `POST /api/orders/O-2008/cancel`은 `403 FORBIDDEN`이다.

          ## 코드와 로그
          Controller는 `@PreAuthorize("isAuthenticated()")`만 적용하고 Service는 `orderRepository.findById(orderId)` 결과를 바로 DTO로 변환한다. 접근 로그는 두 상세 조회를 모두 `status=200 user=A`로 기록했다.

          ## 제출
          상세 조회와 취소 기능을 하나의 결론으로 섞지 말고 각각 판정하세요. 노출되는 데이터·영향·소유권 검증 위치·관리자 예외·회귀 테스트를 작성하세요.
          """),
      new CaseSeed("mybatis-like-query", "검색 정렬 파라미터와 MyBatis 데이터 흐름", TrainingCaseType.STATIC_DIAGNOSIS, "SQLI_QUERY", 3, """
          ## 모의 환경
          상품 검색 API는 `keyword`, `sort`, `direction`을 받는다. 테스트 데이터베이스와 읽기 전용 계정으로만 점검했다.

          ## 코드 조각
          `keyword`는 `WHERE name LIKE CONCAT('%', #{keyword}, '%')`로 바인딩된다. 반면 정렬은 `ORDER BY ${sort} ${direction}`으로 조합된다. 프론트엔드는 `sort=name|price|createdAt`, `direction=asc|desc`만 보내지만 API는 직접 호출도 허용한다.

          ## 관측 결과
          검색어에 따옴표와 SQL 예약어가 포함되어도 결과는 단순 문자열 검색으로 처리됐다. 허용 목록 밖 정렬값에는 DB 오류 메시지가 노출되었고, `direction`에 예상 밖 문자열을 넣으면 쿼리 구문 오류가 반환됐다. 오류 로그에는 완성된 SQL 일부가 남는다.

          ## 제출
          안전한 입력과 위험한 입력을 데이터 흐름 기준으로 구분하세요. 오류 메시지가 곧 데이터 유출이라는 단정은 피하고, 허용 목록·예외 처리·권한·정상 정렬 회귀 검증을 설계하세요.
          """),
      new CaseSeed("report-method-overclaim", "HTTP 메서드 보고서의 과장 판별", TrainingCaseType.REPORT_REVIEW, "API_SECURITY", 2, """
          ## 모의 점검 보고서 초안
          `OPTIONS /api/profile/42` 응답의 `Allow: GET, PUT, DELETE` 헤더를 근거로 “PUT·DELETE가 존재하므로 누구나 회원정보를 수정·삭제할 수 있는 고위험 취약점”이라고 적혀 있다.

          ## 추가 관측 자료
          비로그인 `PUT` 요청은 `401`, 일반 회원 A가 본인 프로필을 수정하면 `204`, A가 다른 회원 식별자로 수정하면 `403`이었다. 관리자 계정은 고객 지원 목적으로 다른 회원의 제한된 필드만 수정할 수 있다. DELETE는 현재 기능 미사용으로 모든 역할에서 `405`를 반환하지만 `Allow` 헤더는 오래된 라우팅 설정을 그대로 표시한다.

          ## 제출
          초안의 잘못된 결론과 아직 확인된 사실을 분리하세요. 올바른 위험 판정, 불필요하게 GET·POST만 허용하자는 조치가 틀린 이유, 권한·상태변경·감사로그 재검증을 작성하세요.
          """),
      new CaseSeed("redirect-ssrf-evidence", "리다이렉트 응답과 서버측 요청 증거", TrainingCaseType.STATIC_DIAGNOSIS, "SSRF", 3, """
          ## 모의 환경
          문서 미리보기 API `POST /api/preview`는 URL을 받아 제목과 대표 이미지를 추출한다. 사내 교육용 콜백 서버와 테스트 네트워크만 사용했다.

          ## 관측 자료
          외부 테스트 URL은 `302 Location: http://127.0.0.1:8080/admin`을 반환하도록 설정했다. 브라우저에는 최종적으로 `502 preview failed`가 보였고, 애플리케이션 로그에는 원래 URL과 `redirectCount=1`만 기록됐다. 같은 시각 콜백 서버에는 요청이 없었으며, egress 프록시 로그도 아직 확보되지 않았다. 코드에는 URL 첫 요청 전에 hostname allowlist가 있으나 리다이렉트 대상과 DNS 재해석 검증은 보이지 않는다.

          ## 제출
          취약 확정·정상·추가 증거 필요 중 하나를 선택하세요. 브라우저 502만으로 서버의 내부 접근을 확정할 수 없는 이유, 확보할 로그, 리다이렉트·사설 대역·DNS 변경을 포함한 방어와 재검증을 작성하세요.
          """),
      new CaseSeed("upload-storage-boundary", "상품 이미지 업로드의 저장 경계", TrainingCaseType.STATIC_DIAGNOSIS, "FILE_UPLOAD", 3, """
          ## 모의 환경
          판매자 상품 이미지 업로드 기능이다. 허용 확장자는 jpg·png이며, 웹 서버는 `/uploads/` 경로를 정적으로 제공한다.

          ## 코드와 관측 자료
          서버는 원본 파일명의 마지막 확장자만 확인한 뒤 `/var/www/uploads/{originalFilename}`에 저장한다. 이미지 라이브러리의 실제 디코딩 검증은 없다. 같은 이름으로 업로드하면 기존 파일이 덮어써진다. `Content-Type: image/png`만으로는 실제 형식을 보장하지 않는다는 점은 확인됐지만, 제공된 환경에서 서버측 코드 실행이나 파일 열람 성공 증거는 없다.

          ## 제출
          확인된 위험과 아직 증거가 없는 영향을 나누세요. 파일명·콘텐츠·저장 위치·제공 경로·권한을 계층별로 조치하고, 우회 확장자·중복 파일명·비이미지·다운로드 응답까지 재검증하세요.
          """),
      new CaseSeed("ci-secret-hygiene", "CI 로그에 남은 배포 비밀값 대응", TrainingCaseType.REPORT_REVIEW, "SECRETS_MANAGEMENT", 3, """
          ## 사고 상황
          배포 실패 분석 중 CI 로그에 `DATABASE_URL` 전체와 외부 API 토큰 앞 20자가 출력된 사실을 발견했다. 해당 파이프라인은 사내 개발자 12명이 볼 수 있고, 공개 저장소는 아니다.

          ## 확인된 사실과 미확인 사실
          토큰은 현재도 유효하며 읽기·쓰기 권한을 가진다. 저장소 최신 소스에는 토큰 값이 없다. 과거 로그 보존 기간은 90일이고, 아티팩트·캐시·개발자 개인 다운로드 여부는 아직 조사되지 않았다.

          ## 제출
          단순 로그 삭제를 종결 조치로 쓰지 마세요. 즉시 차단 순서, 영향 조사 범위, 회전 뒤 서비스 검증, 권한 축소와 마스킹 규칙, 재노출 탐지를 작성하세요.
          """),
      new CaseSeed("webhook-replay-idempotency", "결제 웹훅 재전송과 중복 처리", TrainingCaseType.STATIC_DIAGNOSIS, "API_SECURITY", 3, """
          ## 모의 환경
          결제 공급자가 `POST /api/payments/webhook`으로 결제 완료 이벤트를 보낸다. 공급자는 네트워크 오류 시 동일 이벤트를 여러 번 재전송할 수 있다.

          ## 관측 자료
          서명 검증은 통과한 `eventId=evt-501`이 10초 간격으로 두 번 들어왔다. 첫 요청은 주문 상태를 PAID로 바꾸고 포인트 5,000점을 지급했다. 두 번째도 `200 OK`이며 포인트가 다시 지급됐다. 데이터베이스에는 이벤트 식별자 저장·고유 제약이 없고, 주문 금액 검증은 공급자 조회가 아닌 요청 본문 금액을 신뢰한다.

          ## 제출
          서명 검증 통과가 왜 충분하지 않은지 설명하세요. 재전송·순서 뒤바뀜·금액 불일치 조건을 분리하고, 멱등성 키·거래 경계·공급자 조회·감사 로그를 포함한 조치와 재검증을 작성하세요.
          """),
      new CaseSeed("stored-xss-support-note", "고객센터 메모의 저장형 XSS 판정", TrainingCaseType.STATIC_DIAGNOSIS, "XSS_CONTEXT", 3, """
          ## 모의 환경
          고객이 문의 내용을 제출하면 상담사 콘솔에서 렌더링한다. 교육용 계정과 비운영 브라우저에서만 확인했다.

          ## 코드와 관측 자료
          고객 입력은 DB에 저장되고 상담사 화면은 Markdown 미리보기 라이브러리 결과를 `innerHTML`로 삽입한다. 일반적인 태그는 화면에 렌더링되지만, 서버는 일부 태그를 제거한다. 제공된 기록에서는 외부 스크립트 호출이나 세션 탈취 성공 증거가 없고, 상담사 콘솔에는 CSRF 토큰이 아닌 HttpOnly 세션 쿠키를 사용한다.

          ## 제출
          저장형 XSS 가능성과 세션 탈취를 같은 결론으로 묶지 마세요. 실제 출력 맥락·정화 정책·CSP·권한 있는 열람자의 영향·안전한 재현 방법·재검증 항목을 작성하세요.
          """),
      new CaseSeed("cors-credential-origin", "교차 출처 인증 요청의 CORS 판정", TrainingCaseType.REPORT_REVIEW, "API_SECURITY", 3, """
          ## 모의 환경
          `api.shop.lab.internal`은 브라우저 세션 쿠키로 인증한다. 프론트엔드는 `app.shop.lab.internal`에서 동작한다.

          ## 응답 헤더 관측
          정상 프론트엔드 Origin에는 `Access-Control-Allow-Origin: https://app.shop.lab.internal`과 `Access-Control-Allow-Credentials: true`가 있다. 임의 Origin 요청에도 응답 본문은 `200`이지만 `Access-Control-Allow-Origin` 헤더가 없었다. 개발 서버용 `http://localhost:5173`은 설정 파일에 남아 있으나 운영 배포에서는 비활성화됐는지 확인되지 않았다.

          ## 제출
          HTTP 200과 브라우저에서 응답을 읽을 수 있는지를 구분하세요. 허용 Origin·자격증명·프리플라이트·개발 설정 누수·쿠키 SameSite를 근거로 판정하고, 재검증 브라우저 행렬을 작성하세요.
          """),
      new CaseSeed("login-enumeration-lockout", "로그인 실패 응답과 계정 잠금 정책", TrainingCaseType.REPORT_REVIEW, "AUTHENTICATION", 3, """
          ## 모의 환경
          사내 포털 로그인 화면이다. 실제 사용자 정보가 아닌 교육용 계정만 사용했다.

          ## 관측 자료
          존재하지 않는 이메일은 약 180ms 뒤 `401 INVALID_CREDENTIALS`를 반환했다. 존재하는 계정에 틀린 비밀번호를 넣으면 약 850ms 뒤 같은 상태 코드와 문구를 반환했다. 다섯 번째 실패 뒤에는 해당 계정만 15분 동안 로그인이 막히고, IP 기준 제한은 없다. 비밀번호 재설정 화면은 “등록된 주소면 메일을 보냈습니다”라는 동일 문구를 사용한다.

          ## 제출
          상태 코드와 문구가 같아도 계정 열거 가능성을 검토해야 하는 이유를 설명하세요. 시간 차이의 증거 수준, 계정 잠금의 서비스 거부 위험, IP·계정·행동 기반 방어와 정상 사용자 재검증을 작성하세요.
          """),
      new CaseSeed("download-path-authorization", "문서 다운로드 식별자와 경로 검증", TrainingCaseType.STATIC_DIAGNOSIS, "AUTHORIZATION", 3, """
          ## 모의 환경
          계약 문서 다운로드 API `GET /api/documents/{documentId}/download`가 있다. 문서는 부서와 프로젝트에 연결된다.

          ## 관측 자료
          A 부서 사용자가 본인 문서 `D-110`을 받으면 `200`과 `Content-Disposition: attachment`가 반환된다. 다른 부서 문서 `D-987`은 API에서 `403`이지만, 예전 이메일에 남은 `/download?path=/archive/contracts/D-987.pdf` 링크는 로그인한 일반 사용자에게 `200`을 반환한다. 서버 로그에는 두 경로 모두 `user=U-15`만 남고 문서 소유 부서는 남지 않는다.

          ## 제출
          식별자 API와 이전 경로 기반 API를 분리해 판정하세요. 경로 정규화만으로 충분하지 않은 이유, 데이터베이스 기준 인가·기존 링크 폐기·감사 로그·회귀 테스트를 작성하세요.
          """),
      new CaseSeed("proxy-forwarded-header-trust", "역방향 프록시 헤더 신뢰 경계", TrainingCaseType.STATIC_DIAGNOSIS, "NETWORK_TLS", 3, """
          ## 배포 구조
          인터넷 → CDN → Nginx → Spring API 순서다. 관리 API는 사내 IP 대역만 허용한다.

          ## 설정과 로그
          Nginx는 CDN에서 온 `X-Forwarded-For`를 그대로 API에 전달한다. Spring은 모든 프록시에서 전달된 첫 번째 IP를 클라이언트 IP로 신뢰한다. 직접 API 포트 접근은 방화벽으로 차단돼 있어야 하나, 현재 방화벽 규칙의 실제 적용 여부는 확인되지 않았다. 관리 API 접근 로그에 사설 IP가 기록됐지만 CDN 로그 원본은 아직 비교하지 않았다.

          ## 제출
          헤더 값만으로 우회 성공을 확정하지 마세요. 신뢰할 프록시 범위, 원본 서버 직접 접근 검증, 헤더 재작성, 로그 상관관계와 재검증을 작성하세요.
          """),
      new CaseSeed("tls-validation-bypass", "외부 API 호출의 인증서 검증 우회", TrainingCaseType.STATIC_DIAGNOSIS, "NETWORK_TLS", 3, """
          ## 모의 환경
          배송 추적 API 호출이 개발 환경의 자체 서명 인증서 오류 때문에 실패했다.

          ## 코드와 배포 기록
          개발자가 모든 인증서를 신뢰하도록 만든 HTTP 클라이언트 설정을 추가했다. 운영 환경 변수에는 이 설정을 끄는 값이 없고, 배포 산출물에 같은 코드가 포함돼 있다. 운영 트래픽에서 실제로 위조 인증서 연결이 발생했다는 로그는 없다.

          ## 제출
          확인된 구성 결함과 아직 발생하지 않은 침해 사실을 분리하세요. 인증서 검증 복구·사설 CA 신뢰 저장소·환경 분리·배포 차단·TLS 연결 재검증을 작성하세요.
          """),
      new CaseSeed("packet-retransmission-triage", "패킷 관측으로 API 지연 원인 분리", TrainingCaseType.REPORT_REVIEW, "NETWORK_TLS", 2, """
          ## 장애 상황
          결제 API의 평균 응답이 300ms에서 4초로 늘었다. 애플리케이션 오류율은 증가하지 않았다.

          ## 관측 자료
          같은 5분 구간 패킷 캡처에서 TCP 재전송 비율은 평소보다 높고, SYN 뒤 SYN-ACK 수신 지연이 일부 연결에서 보인다. TLS 핸드셰이크 완료 뒤의 HTTP 처리 시간은 정상 범위다. DB 연결 풀 대기 시간도 정상이다. 다만 캡처 지점은 로드밸런서 뒤 한 대의 앱 서버뿐이며 전체 AZ와 CDN 지표는 없다.

          ## 제출
          애플리케이션·DB·네트워크 중 무엇을 우선 의심할지 근거로 설명하세요. 단일 캡처의 한계, 추가로 비교할 지표, 즉시 완화와 재발 방지 검증을 작성하세요.
          """),
      new CaseSeed("error-page-data-leak", "오류 응답의 내부 정보 노출 판정", TrainingCaseType.REPORT_REVIEW, "API_SECURITY", 2, """
          ## 모의 환경
          파일 변환 API에 손상된 문서를 제출했다.

          ## 응답과 로그
          응답은 `500`이며 화면에는 예외 클래스명, 내부 패키지 경로, 변환 서버의 사설 호스트명만 표시된다. 데이터베이스 비밀번호·토큰·전체 스택 트레이스는 응답에 없다. 상세 스택 트레이스는 서버 로그에만 있고 접근 권한이 제한돼 있다.

          ## 제출
          확인된 정보 노출의 범위와 과장하면 안 되는 영향을 분리하세요. 사용자 오류 응답·상관관계 ID·서버 로그·알림 기준·정상 오류 처리 재검증을 작성하세요.
          """)
    ); }
  private record CaseSeed(String slug,String title,TrainingCaseType type,String skill,int difficulty,String prompt) {}
  private record LegacyCase(String title,String prompt) {}

  @Transactional
  void ensureAssessments(UUID ownerId) {
    Object[][] rows={{"REPORTING",75,"HIGH",8,"문제점·영향·조치·캡션을 분리해 검토한 근거가 있다."},{"REQUIREMENTS",75,"HIGH",26,"범위와 산출물 조건을 구체적으로 정의한다."},{"JAVA_SPRING",65,"MEDIUM",12,"Controller·Service·Mapper 오류를 추적한 근거가 있다."},{"SQL_DML",65,"MEDIUM",31,"관계 테이블 INSERT와 범위 UPDATE를 다뤘다."},{"DATA_QUALITY",65,"MEDIUM",37,"근거 없는 입력을 거부하는 조건을 명확히 둔다."},{"DEBUGGING",65,"MEDIUM",21,"오류 메시지와 서비스 로그로 원인을 단계적으로 좁힌다."},{"WEB_ARCHITECTURE",65,"MEDIUM",3,"웹 요청 경로와 계층 분리를 실제 오류 맥락에서 다뤘다."},{"XSS_CONTEXT",65,"MEDIUM",3,"출력 맥락과 XSS 보고서 조치안을 검토한 근거가 있다."},{"DOCKER_DEPLOY",65,"MEDIUM",3,"Docker·CI·SSH 배포 로그를 다뤘다."},{"API_SECURITY",60,"MEDIUM",10,"메서드·오류·객체 접근 제어를 정리했다."},{"AUTHENTICATION",60,"MEDIUM",4,"비밀번호 정책과 인증 실패 제한을 다뤘다."},{"AUTHORIZATION",60,"MEDIUM",4,"IDOR과 역할 기반 접근 제어를 다뤘다."},{"FILE_UPLOAD",60,"MEDIUM",7,"업로드 저장 경계와 검증을 다뤘다."},{"SQLI_QUERY",60,"MEDIUM",3,"바인딩과 동적 쿼리 조건을 구분해 검토했다."},{"SSRF",60,"MEDIUM",7,"리다이렉트와 내부망 경계를 검토했다."},{"LINUX_SERVER",60,"MEDIUM",6,"서비스 상태·포트·배포 오류를 로그로 다뤘다."},{"NETWORK_TLS",55,"MEDIUM",5,"프록시·TLS·다층 방어의 역할을 구분하려 했다."},{"SESSION_COOKIE",55,"MEDIUM",5,"쿠키 속성의 역할은 알지만 단정 방지 훈련이 필요하다."},{"STATIC_DATA_FLOW",55,"MEDIUM",1,"Source에서 Sink까지 독립 코드 추적 근거가 부족하다."},{"SECRETS_MANAGEMENT",50,"MEDIUM",2,"비밀값 회전·최소권한·저장소 노출 방지가 우선 과제다."}};
    for(Object[] row:rows) {
      String skill=(String) row[0]; double score=(Integer) row[1]; AssessmentConfidence confidence=AssessmentConfidence.valueOf((String) row[2]);
      if (assessments.findByOwnerIdAndSkillCode(ownerId, skill).isEmpty()) {
        assessments.save(new CompetencyAssessment(ownerId, skill, score, confidence, (String) row[4], (Integer) row[3]));
      }
    }
    assessments.findByOwnerIdOrderBySkillCode(ownerId).forEach(assessment -> { assessment.initializeBaselineIfMissing(); assessments.save(assessment); });
  }
  @Transactional(readOnly=true) List<CompetencyAssessment> dashboard(UUID ownerId){ return assessments.findByOwnerIdOrderBySkillCode(ownerId); }
  @Transactional(readOnly=true) List<TrainingCase> listCases(){return cases.findByPublishedTrueOrderByPrimarySkillCodeAscDifficultyAsc();}
  /** Do not recommend a submitted case twice until the user has exhausted the current catalogue. */
  @Transactional(readOnly=true) List<TrainingCase> recommendations(UUID ownerId) {
    List<TrainingAttempt> history=attempts.findByOwnerIdOrderByStartedAtDesc(ownerId);
    Set<UUID> completed=history.stream().filter(attempt -> attempt.getStatus()==AttemptStatus.SUBMITTED)
        .map(attempt -> attempt.getTrainingCase().getId()).collect(java.util.stream.Collectors.toSet());
    List<TrainingCase> fresh=listCases().stream().filter(trainingCase -> !completed.contains(trainingCase.getId())).limit(3).toList();
    if(!fresh.isEmpty()) return fresh;
    Map<UUID,Double> lowestScore=new HashMap<>();
    for(TrainingAttempt attempt:history) if(attempt.getScore()!=null) lowestScore.merge(attempt.getTrainingCase().getId(),attempt.getScore(),Math::min);
    return listCases().stream().sorted(Comparator.comparing(trainingCase -> lowestScore.getOrDefault(trainingCase.getId(),100.0))).limit(3).toList();
  }
  @Transactional TrainingAttempt start(UUID ownerId,UUID caseId){ TrainingCase c=cases.findById(caseId).orElseThrow(NoSuchElementException::new); return attempts.save(new TrainingAttempt(ownerId,c)); }
  @Transactional TrainingAttempt save(UUID ownerId,UUID attemptId,String answer){ TrainingAttempt a=owned(ownerId,attemptId); a.saveAnswer(answer);return attempts.save(a); }
  @Transactional TrainingAttempt submit(UUID ownerId,UUID attemptId,String answer){
    TrainingAttempt attempt=owned(ownerId,attemptId); attempt.saveAnswer(answer); return evaluateAttempt(attempt,answer);
  }
  @Transactional TrainingAttempt evaluateExisting(UUID ownerId, UUID attemptId) {
    TrainingAttempt attempt=owned(ownerId,attemptId);
    Optional<TrainingEvaluation> existing=evaluations.findByAttemptId(attemptId);
    if(existing.filter(item -> item.getStatus()==TrainingEvaluationStatus.COMPLETED).isPresent()) return attempt;
    if(existing.isPresent()) { evaluations.delete(existing.get()); evaluations.flush(); }
    return evaluateAttempt(attempt,attempt.getAnswerMd());
  }
  private TrainingAttempt evaluateAttempt(TrainingAttempt attempt, String answer) {
    String cacheKey=evaluator.cacheKey(attempt.getTrainingCase(),answer); String answerHash=evaluator.answerHash(answer);
    Optional<TrainingEvaluationCache> cached=evaluationCache.findByCacheKey(cacheKey);
    if(cached.isPresent()) {
      TrainingEvaluationCache hit=cached.get(); attempt.submit(hit.getScore(),hit.getFeedbackMd()); attempts.save(attempt);
      evaluations.save(new TrainingEvaluation(attempt,hit.getProvider(),hit.getModel(),TrainingAiEvaluator.PROMPT_VERSION,answerHash,TrainingEvaluationStatus.COMPLETED,hit.getResultJson(),null,hit.getInputTokens(),hit.getOutputTokens(),hit.getTotalTokens(),hit.getElapsedMs(),BigDecimal.ZERO));
      recalculateAssessments(attempt.getOwnerId());
      return attempt;
    }
    try {
      TrainingAiEvaluator.EvaluationResult result=evaluator.evaluate(attempt.getTrainingCase(),answer); LlmGateway.LlmResult usage=result.providerResponse(); BigDecimal cost=evaluator.estimatedCost(usage);
      attempt.submit((double)result.score(),result.feedbackMd()); attempts.save(attempt);
      evaluations.save(new TrainingEvaluation(attempt,usage.provider(),usage.model(),TrainingAiEvaluator.PROMPT_VERSION,answerHash,TrainingEvaluationStatus.COMPLETED,result.resultJson(),null,usage.inputTokens(),usage.outputTokens(),usage.totalTokens(),usage.elapsedMs(),cost));
      evaluationCache.save(new TrainingEvaluationCache(cacheKey,usage.provider(),usage.model(),result.resultJson(),result.score(),result.feedbackMd(),usage.inputTokens(),usage.outputTokens(),usage.totalTokens(),usage.elapsedMs(),cost));
      recalculateAssessments(attempt.getOwnerId());
    } catch(Exception exception) {
      String message="AI 채점에 실패했습니다. 답안은 저장됐으며, 새 시도로 다시 채점할 수 있습니다.";
      attempt.submit(null,"## AI 채점 대기\n"+message); attempts.save(attempt);
      evaluations.save(new TrainingEvaluation(attempt,evaluator.provider(),evaluator.model(),TrainingAiEvaluator.PROMPT_VERSION,answerHash,TrainingEvaluationStatus.FAILED,null,exception.getClass().getSimpleName(),null,null,null,null,null));
    }
    return attempt;
  }
  @Transactional(readOnly=true) List<TrainingAttempt> history(UUID ownerId){return attempts.findByOwnerIdOrderByStartedAtDesc(ownerId);}
  @Transactional(readOnly=true) TrainingAttempt attempt(UUID ownerId,UUID id){return owned(ownerId,id);}
  private TrainingAttempt owned(UUID ownerId,UUID id){return attempts.findByIdAndOwnerId(id,ownerId).orElseThrow(NoSuchElementException::new);}
  /** Rebuild each skill from its own completed evaluations only. A case can never overwrite another skill's feedback. */
  private void recalculateAssessments(UUID ownerId) {
    Map<String,List<TrainingEvaluation>> bySkill=evaluations.findCompletedForOwner(ownerId,TrainingEvaluationStatus.COMPLETED).stream()
        .collect(java.util.stream.Collectors.groupingBy(evaluation -> evaluation.getAttempt().getTrainingCase().getPrimarySkillCode()));
    for(CompetencyAssessment assessment:assessments.findByOwnerIdOrderBySkillCode(ownerId)) {
      assessment.initializeBaselineIfMissing(); List<TrainingEvaluation> rows=bySkill.getOrDefault(assessment.getSkillCode(),List.of());
      if(rows.isEmpty()) { assessments.save(assessment); continue; }
      List<Integer> scores=new ArrayList<>(); List<String> gaps=new ArrayList<>();
      for(TrainingEvaluation row:rows.stream().limit(8).toList()) {
        try { JsonNode result=json.readTree(row.getResultJson()); scores.add(Math.max(0,Math.min(100,result.path("score").asInt()))); gaps.addAll(evaluationText(result,"missingPoints")); gaps.addAll(evaluationText(result,"incorrectPoints")); }
        catch(Exception ignored) { /* a malformed historic record is retained but never drives a score */ }
      }
      if(scores.isEmpty()) { assessments.save(assessment); continue; }
      double weight=0; double weighted=0; for(int index=0;index<scores.size();index++){double current=1.0-index*0.1;weighted+=scores.get(index)*current;weight+=current;}
      double average=weighted/weight; double baseline=assessment.baselineScore();
      double blended=baseline*0.65+average*0.35; double bounded=Math.max(baseline-10,Math.min(baseline+15,blended));
      List<String> topGaps=topDistinct(gaps,2); String gapText=topGaps.isEmpty()?"반복 누락 항목이 아직 충분히 쌓이지 않았습니다.":String.join(" · ",topGaps);
      String rationale="최근 "+scores.size()+"회 AI 평가 평균 "+Math.round(average)+"점. "+gapText;
      String nextAction=topGaps.isEmpty()?"같은 역량 문제를 2회 이상 풀어 누적 피드백을 만드세요.":"다음 답안에서 "+String.join(" 및 ",topGaps)+"을 근거와 재검증 항목에 명시하세요.";
      AssessmentConfidence confidence=scores.size()>=5?AssessmentConfidence.HIGH:scores.size()>=2?AssessmentConfidence.MEDIUM:AssessmentConfidence.LOW;
      assessment.updateFromPractice(Math.round(bounded*10.0)/10.0,confidence,rationale,nextAction,scores.size()); assessments.save(assessment);
    }
  }
  private List<String> evaluationText(JsonNode result,String field){
    List<String> values=new ArrayList<>(); for(JsonNode value:result.path(field)){String text=value.asText("").trim();if(!text.isBlank())values.add(text);} return values;
  }
  private List<String> topDistinct(List<String> values,int limit){
    Map<String,Long> counts=values.stream().collect(java.util.stream.Collectors.groupingBy(value->value,LinkedHashMap::new,java.util.stream.Collectors.counting()));
    return counts.entrySet().stream().sorted((a,b)->Long.compare(b.getValue(),a.getValue())).map(Map.Entry::getKey).limit(limit).toList();
  }
  private String rubricFor(String slug) {
    return switch(slug) {
      case "session-cart-context" -> "{\"version\":\"v2\",\"expectedVerdict\":\"CORRECT\",\"required\":[\"cart_context 변조 뒤 타인 장바구니 조회라는 객체 소유권 증거\",\"결제 403을 조회 노출 없음의 증거로 오해하지 않음\",\"쿠키 속성보다 서버측 cart 소유권 검증을 우선\",\"본인·타인·결제·관리자 조건 재검증\"],\"commonMistakes\":[\"쿠키 변경 자체만으로 취약점 확정\",\"결제 차단 때문에 정보 노출을 정상으로 판정\"]}";
      case "report-method-overclaim" -> "{\"version\":\"v1\",\"expectedVerdict\":\"INSUFFICIENT_EVIDENCE\",\"required\":[\"PUT/DELETE 존재만으로 취약점 확정 불가\",\"인증·인가·객체 소유권·실제 상태변경 증거 필요\",\"허용 메서드 전면 차단이 아닌 엔드포인트별 권한 통제\",\"권한 없는 요청 실패와 데이터 불변 재검증\"],\"commonMistakes\":[\"PUT/DELETE 자체를 취약점으로 단정\",\"GET/POST만 허용하도록 제안\",\"400만 성공 기준으로 제시\"]}";
      case "idor-object-owner" -> "{\"version\":\"v1\",\"expectedVerdict\":\"CORRECT\",\"required\":[\"로그인 확인만으로 객체 소유권 인가를 대체할 수 없음\",\"다른 사용자의 orderId 접근 시나리오\",\"서버측 소유권 또는 권한 검증\",\"본인·타인·관리자 요청 재검증\"],\"commonMistakes\":[\"클라이언트에서 ID 숨기기로 해결\"]}";
      case "mybatis-like-query" -> "{\"version\":\"v1\",\"expectedVerdict\":\"PARTIALLY_CORRECT\",\"required\":[\"바인딩된 검색어와 문자열 조합 정렬 컬럼을 분리\",\"정렬 컬럼·방향 허용 목록\",\"공격 문자열 및 정상 정렬 회귀 테스트\"],\"commonMistakes\":[\"모든 MyBatis 쿼리를 SQL Injection으로 단정\"]}";
      case "redirect-ssrf-evidence" -> "{\"version\":\"v1\",\"expectedVerdict\":\"INSUFFICIENT_EVIDENCE\",\"required\":[\"브라우저 응답만으로 서버측 요청 확정 불가\",\"서버 egress 로그 또는 콜백 증거\",\"사설·loopback·link-local 및 리다이렉트 검증\",\"DNS 재해석 방지\"],\"commonMistakes\":[\"리다이렉트만으로 SSRF 확정\"]}";
      case "upload-storage-boundary" -> "{\"version\":\"v1\",\"expectedVerdict\":\"CORRECT\",\"required\":[\"확장자 단독 검증과 웹 루트 저장 위험\",\"콘텐츠 검증·랜덤 파일명·웹 루트 외 저장\",\"실행 불가 제공 경로\",\"우회 확장자와 접근 테스트\"],\"commonMistakes\":[\"확장자 차단만으로 충분하다고 주장\"]}";
      case "ci-secret-hygiene" -> "{\"version\":\"v1\",\"expectedVerdict\":\"CORRECT\",\"required\":[\"노출 가능 비밀값 즉시 폐기·회전\",\"로그·저장소 이력·아티팩트 점검\",\"권한 최소화와 secret manager\",\"기존 키 무효화 및 재노출 검사\"],\"commonMistakes\":[\"삭제 커밋만으로 유출 해결\"]}";
      case "webhook-replay-idempotency" -> "{\"version\":\"v2\",\"expectedVerdict\":\"CORRECT\",\"required\":[\"유효한 서명만으로 중복·금액 검증을 대체할 수 없음\",\"eventId 고유 제약과 멱등 처리\",\"신뢰할 수 있는 결제 금액 검증\",\"재전송·순서 변경·동시 요청 재검증\"],\"commonMistakes\":[\"서명 검증만 추가하면 해결된다고 판단\"]}";
      case "stored-xss-support-note" -> "{\"version\":\"v2\",\"expectedVerdict\":\"PARTIALLY_CORRECT\",\"required\":[\"innerHTML 출력 맥락과 저장형 위험 분리\",\"세션 탈취 성공 증거가 없음을 명시\",\"신뢰할 수 있는 정화·출력 인코딩·CSP\",\"권한 있는 열람자와 안전한 재검증\"],\"commonMistakes\":[\"XSS 가능성을 곧바로 쿠키 탈취 성공으로 단정\"]}";
      case "cors-credential-origin" -> "{\"version\":\"v2\",\"expectedVerdict\":\"INSUFFICIENT_EVIDENCE\",\"required\":[\"HTTP 200과 브라우저의 교차 출처 읽기를 분리\",\"정확한 허용 Origin과 credentials 조합\",\"운영 localhost 허용 여부 확인\",\"브라우저·쿠키 SameSite·프리플라이트 재검증\"],\"commonMistakes\":[\"임의 Origin의 200만으로 CORS 취약점 확정\"]}";
      case "login-enumeration-lockout" -> "{\"version\":\"v2\",\"expectedVerdict\":\"PARTIALLY_CORRECT\",\"required\":[\"동일 문구에도 응답 시간 차이가 계정 존재 단서가 될 수 있음\",\"시간 차이의 반복 측정과 변동성 검증\",\"계정 잠금의 서비스 거부 위험\",\"계정·IP·행동 기준과 정상 사용자 재검증\"],\"commonMistakes\":[\"401 문구가 같으므로 안전하다고 단정\"]}";
      case "download-path-authorization" -> "{\"version\":\"v2\",\"expectedVerdict\":\"CORRECT\",\"required\":[\"경로 기반 이전 API의 타 부서 문서 다운로드 증거\",\"경로 정규화와 객체 인가를 구분\",\"DB 기준 문서 권한 검증과 이전 링크 폐기\",\"문서 소유 부서를 포함한 감사와 회귀 테스트\"],\"commonMistakes\":[\"경로 traversal 차단만으로 해결\"]}";
      case "proxy-forwarded-header-trust" -> "{\"version\":\"v2\",\"expectedVerdict\":\"INSUFFICIENT_EVIDENCE\",\"required\":[\"사설 IP 로그만으로 우회 성공을 단정하지 않음\",\"신뢰 프록시 범위와 원본 직접 접근 확인\",\"프록시의 헤더 재작성 또는 제거\",\"CDN·방화벽·애플리케이션 로그 상관관계\"],\"commonMistakes\":[\"X-Forwarded-For가 있으므로 즉시 IP 우회 확정\"]}";
      case "tls-validation-bypass" -> "{\"version\":\"v2\",\"expectedVerdict\":\"CORRECT\",\"required\":[\"인증서 검증 비활성화라는 구성 결함\",\"실제 MITM 침해 발생과 구분\",\"정상 검증·사설 CA trust store·환경 분리\",\"배포 차단 및 TLS 연결 재검증\"],\"commonMistakes\":[\"위조 인증서 연결이 확인됐다고 과장\"]}";
      case "packet-retransmission-triage" -> "{\"version\":\"v2\",\"expectedVerdict\":\"PARTIALLY_CORRECT\",\"required\":[\"재전송과 SYN-SYNACK 지연으로 네트워크 우선 의심\",\"TLS 이후 HTTP·DB 시간이 정상인 관측 활용\",\"단일 앱 서버 캡처의 한계\",\"CDN·AZ·로드밸런서 지표 비교와 완화 검증\"],\"commonMistakes\":[\"패킷 하나로 네트워크 장애를 확정\"]}";
      case "error-page-data-leak" -> "{\"version\":\"v2\",\"expectedVerdict\":\"CORRECT\",\"required\":[\"예외 클래스·패키지·사설 호스트 노출을 확인\",\"토큰·비밀번호 유출 증거가 없음을 구분\",\"외부 오류 메시지와 내부 상관관계 ID 분리\",\"권한 있는 로그 보존과 오류 흐름 재검증\"],\"commonMistakes\":[\"500 응답 전체를 민감정보 유출로 과장\"]}";
      default -> "{\"version\":\"v1\",\"required\":[\"판정\",\"근거\",\"조치\",\"재검증\"]}";
    };
  }
}
