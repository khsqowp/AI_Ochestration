package com.orchestration.training;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class BlackBoxVirtualTargetTest {
  @Test
  void exposes_lab_briefing_then_executes_a_realistic_login_and_order_request() {
    BlackBoxVirtualTarget target = BlackBoxVirtualTargets.forScenario("order-access");
    BlackBoxVirtualTarget.State state = target.initialState();

    assertThat(target.initialBriefing()).contains("테스트 계정 A").contains("/orders/{orderId}");

    BlackBoxVirtualTarget.Result login = target.execute(state, BlackBoxCommand.login("A"));
    BlackBoxVirtualTarget.Result order = target.execute(login.nextState(), BlackBoxCommand.request("GET", "/orders/O-1001"));

    assertThat(login.transcript()).contains("Set-Cookie: session=").contains("HttpOnly");
    assertThat(order.transcript()).contains("HTTP/1.1 200 OK").contains("\"orderId\": \"O-1001\"").contains("김서준");
  }

  @Test
  void exposes_cross_account_order_only_after_the_user_performs_the_request() {
    BlackBoxVirtualTarget target = BlackBoxVirtualTargets.forScenario("order-access");
    BlackBoxVirtualTarget.Result login = target.execute(target.initialState(), BlackBoxCommand.login("A"));

    BlackBoxVirtualTarget.Result result = target.execute(login.nextState(), BlackBoxCommand.request("GET", "/orders/O-2008"));

    assertThat(result.observationKey()).isEqualTo("cross-order");
    assertThat(result.transcript()).contains("HTTP/1.1 200 OK").contains("\"orderId\": \"O-2008\"").contains("박민지");
    assertThat(result.transcript()).doesNotContain("객체 소유권 인가 누락");
  }

  @Test
  void keeps_virtual_login_state_isolated_between_new_sessions() {
    BlackBoxVirtualTarget target = BlackBoxVirtualTargets.forScenario("order-access");
    BlackBoxVirtualTarget.Result login = target.execute(target.initialState(), BlackBoxCommand.login("A"));

    BlackBoxVirtualTarget.Result first = target.execute(login.nextState(), BlackBoxCommand.request("GET", "/orders/O-1001"));
    BlackBoxVirtualTarget.Result fresh = target.execute(target.initialState(), BlackBoxCommand.request("GET", "/orders/O-1001"));

    assertThat(first.transcript()).contains("200 OK");
    assertThat(fresh.transcript()).contains("401 UNAUTHORIZED");
  }

  @Test
  void returns_available_lab_facts_when_the_learner_asks_for_them() {
    BlackBoxVirtualTarget target = BlackBoxVirtualTargets.forScenario("order-access");

    BlackBoxVirtualTarget.Result result = target.execute(target.initialState(), BlackBoxCommand.info("계정과 주문 주소를 알려줘"));

    assertThat(result.transcript()).contains("테스트 계정 A").contains("O-1001").contains("Bearer 토큰은 사용하지 않습니다");
  }

  @Test
  void answers_a_redirect_destination_from_the_immediately_observed_location_header() {
    BlackBoxVirtualTarget target = BlackBoxVirtualTargets.forScenario("order-access");
    BlackBoxVirtualTarget.Result login = target.execute(target.initialState(), BlackBoxCommand.login("A"));

    BlackBoxVirtualTarget.Result result = target.execute(login.nextState(), BlackBoxCommand.info("리다이렉트 후 주소는?"));

    assertThat(result.observationKey()).isEqualTo("last-redirect-location");
    assertThat(result.transcript()).contains("/mypage/orders").contains("직전 `302 FOUND` 응답");
  }

  @Test
  void keeps_coupon_cache_state_across_logout_and_a_second_login() {
    BlackBoxVirtualTarget target = BlackBoxVirtualTargets.forScenario("coupon-cache");
    BlackBoxVirtualTarget.Result aLogin = target.execute(target.initialState(), BlackBoxCommand.login("A"));
    BlackBoxVirtualTarget.Result aCoupon = target.execute(aLogin.nextState(), BlackBoxCommand.request("GET", "/mypage/coupons"));
    BlackBoxVirtualTarget.Result logout = target.execute(aCoupon.nextState(), BlackBoxCommand.logout());
    BlackBoxVirtualTarget.Result bLogin = target.execute(logout.nextState(), BlackBoxCommand.login("B"));
    BlackBoxVirtualTarget.Result bCoupon = target.execute(bLogin.nextState(), BlackBoxCommand.request("GET", "/mypage/coupons"));

    assertThat(aCoupon.transcript()).contains("A-SPRING-10");
    assertThat(bCoupon.observationKey()).isEqualTo("coupon-cross-session");
    assertThat(bCoupon.transcript()).contains("A-SPRING-10");
  }
}
