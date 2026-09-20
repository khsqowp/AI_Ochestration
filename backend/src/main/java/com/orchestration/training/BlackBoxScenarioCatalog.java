package com.orchestration.training;

import java.util.List;
import java.util.NoSuchElementException;

final class BlackBoxScenarioCatalog {
  private static final List<BlackBoxScenarioDefinition> SCENARIOS = List.of(
      new BlackBoxScenarioDefinition("order-access", "주문 상세 조회 이상 징후",
          "범위: https://shop.training.local · 로그인: /login · 주문 상세: /orders/{orderId}. 테스트 계정 A(a.user@example.test / Training!A23)와 B(b.user@example.test / Training!B23)가 주어졌습니다. 각 계정의 주문 목록에는 본인 주문 1건만 보입니다(A: O-1001, B: O-2008). 로그인 뒤 브라우저는 HttpOnly·Secure·SameSite=Lax 속성의 session 쿠키를 받으며, Bearer 토큰은 발급되지 않습니다. 고객은 다른 사람의 주문 정보가 보인다고 제보했습니다. 코드·로그·설정은 제공되지 않습니다.",
          "AUTHORIZATION", 3, "취약점 확인", List.of("own-order", "cross-order"),
          "조회 기능과 상태 변경 기능의 범위를 분리하고, 타인 데이터가 실제로 반환됐는지 계정 교차 확인하세요."),
      new BlackBoxScenarioDefinition("coupon-cache", "쿠폰 적용 화면의 사용자 정보 혼선",
          "교육용 쇼핑몰 주소와 일반 회원 계정 A·B가 주어졌습니다. A가 쿠폰 화면에서 자신이 등록하지 않은 할인 정보가 보였다고 제보했습니다. 서버 코드와 운영 로그에는 접근할 수 없습니다.",
          "API_SECURITY", 3, "취약점 확인", List.of("coupon-own", "coupon-cross-session"),
          "객체 인가 결함과 사용자별 응답 격리 실패를 구분할 수 있도록 계정·세션을 바꿔 관측하세요."),
      new BlackBoxScenarioDefinition("coupon-usage-policy", "1회 사용 쿠폰의 적용 범위 점검",
          "범위: https://shop.training.local · 테스트 계정 A만 사용합니다. A의 주문은 O-3001(결제 전 60,000원), O-3002(결제 전 80,000원), O-3003(결제 전 40,000원), O-3004(결제 완료 60,000원)입니다. 쿠폰 ONE-TIME-10은 ‘계정당 1회, 10% 할인, 최소 주문금액 50,000원, 결제 전 주문만 적용’이라고 안내됩니다. 코드·로그·관리자 화면은 제공되지 않습니다. 주문 재조회와 쿠폰 사용 이력 조회는 사용할 수 있습니다.",
          "BUSINESS_LOGIC", 4, "취약점 확인", List.of("coupon-parallel-apply", "coupon-order-O-3001", "coupon-order-O-3002", "coupon-history-one"),
          "성공 응답 횟수와 실제 할인 효과를 분리하고, 주문·사용 이력 재조회로 1회 제한이 실제로 지켜지는지 확인하세요."),
      new BlackBoxScenarioDefinition("login-enumeration", "로그인 실패 응답의 계정 존재 단서",
          "교육용 포털 주소와 존재하는 테스트 이메일·존재하지 않는 테스트 이메일이 주어졌습니다. 둘 다 비밀번호는 모릅니다. 코드·로그·메일함에는 접근할 수 없습니다.",
          "AUTHENTICATION", 3, "추가 증거 필요", List.of("known-login", "unknown-login"),
          "문구와 상태 코드가 같아도 반복 관측의 시간 차이가 의미 있는지, 환경 변동을 분리해 판단하세요."));

  private BlackBoxScenarioCatalog() {}
  static List<BlackBoxScenarioDefinition> all() { return SCENARIOS; }
  static BlackBoxScenarioDefinition bySlug(String slug) {
    return SCENARIOS.stream().filter(item -> item.slug().equals(slug)).findFirst().orElseThrow(NoSuchElementException::new);
  }
  static BlackBoxScenarioDefinition orderAccess() { return bySlug("order-access"); }
}
