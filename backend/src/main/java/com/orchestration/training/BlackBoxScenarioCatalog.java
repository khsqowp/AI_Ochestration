package com.orchestration.training;

import java.util.List;
import java.util.NoSuchElementException;

final class BlackBoxScenarioCatalog {
  private static final List<BlackBoxScenarioDefinition> SCENARIOS = List.of(
      new BlackBoxScenarioDefinition("order-access", "주문 상세 조회 이상 징후",
          "교육용 쇼핑몰 주소와 일반 회원 계정 A·B가 주어졌습니다. 고객은 다른 사람의 주문 정보가 보인다고 제보했습니다. 코드·로그·설정은 제공되지 않습니다. 직접 시도한 행동과 화면·응답에서 관측한 결과만 근거로 진단하세요.",
          "AUTHORIZATION", 3, "취약점 확인", List.of("own-order", "cross-order", "owner-confirmation"),
          "조회 기능과 상태 변경 기능의 범위를 분리하고, 타인 데이터가 실제로 반환됐는지 계정 교차 확인하세요."),
      new BlackBoxScenarioDefinition("coupon-cache", "쿠폰 적용 화면의 사용자 정보 혼선",
          "교육용 쇼핑몰 주소와 일반 회원 계정 A·B가 주어졌습니다. A가 쿠폰 화면에서 자신이 등록하지 않은 할인 정보가 보였다고 제보했습니다. 서버 코드와 운영 로그에는 접근할 수 없습니다.",
          "API_SECURITY", 3, "취약점 확인", List.of("coupon-own", "coupon-cross-session", "coupon-owner-confirmation"),
          "객체 인가 결함과 사용자별 응답 격리 실패를 구분할 수 있도록 계정·세션을 바꿔 관측하세요."),
      new BlackBoxScenarioDefinition("login-enumeration", "로그인 실패 응답의 계정 존재 단서",
          "교육용 포털 주소와 존재하는 테스트 이메일·존재하지 않는 테스트 이메일이 주어졌습니다. 둘 다 비밀번호는 모릅니다. 코드·로그·메일함에는 접근할 수 없습니다.",
          "AUTHENTICATION", 3, "추가 증거 필요", List.of("known-login", "unknown-login", "repeat-timing"),
          "문구와 상태 코드가 같아도 반복 관측의 시간 차이가 의미 있는지, 환경 변동을 분리해 판단하세요."));

  private BlackBoxScenarioCatalog() {}
  static List<BlackBoxScenarioDefinition> all() { return SCENARIOS; }
  static BlackBoxScenarioDefinition bySlug(String slug) {
    return SCENARIOS.stream().filter(item -> item.slug().equals(slug)).findFirst().orElseThrow(NoSuchElementException::new);
  }
  static BlackBoxScenarioDefinition orderAccess() { return bySlug("order-access"); }
}
