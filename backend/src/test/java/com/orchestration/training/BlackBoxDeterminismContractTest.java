package com.orchestration.training;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * A black-box target is a state machine, not a text generator. Given the same pre-request state and
 * command, it must return byte-for-byte equivalent observation text and next state.
 */
class BlackBoxDeterminismContractTest {
  @Test
  void returns_identical_observations_for_the_same_command_from_the_same_state() {
    assertStable("order-access", BlackBoxCommand.login("A"));
    assertStable("order-access", BlackBoxCommand.request("GET", "/orders/O-1001"));
    assertStable("coupon-cache", BlackBoxCommand.login("B"));
    assertStable("login-enumeration", new BlackBoxCommand(BlackBoxCommand.Type.REQUEST, "", "POST", "/login", "known 이메일로 로그인 요청"));
  }

  @Test
  void repeats_the_same_order_request_without_changing_the_observed_http_response() {
    BlackBoxVirtualTarget target = BlackBoxVirtualTargets.forScenario("order-access");
    BlackBoxVirtualTarget.Result login = target.execute(target.initialState(), BlackBoxCommand.login("A"));
    BlackBoxCommand request = BlackBoxCommand.request("GET", "/orders/O-2008");

    BlackBoxVirtualTarget.Result first = target.execute(login.nextState(), request);
    BlackBoxVirtualTarget.Result second = target.execute(first.nextState(), request);

    assertThat(second.transcript()).isEqualTo(first.transcript());
    assertThat(second.nextState()).isEqualTo(first.nextState());
    assertThat(first.transcript()).contains("HTTP/1.1 200 OK").contains("\"orderId\": \"O-2008\"");
  }

  @Test
  void repeated_actions_do_not_drift_after_their_own_previous_response() {
    assertRepeatedActionIsStable("order-access", BlackBoxCommand.login("A"));
    assertRepeatedActionIsStable("coupon-cache", BlackBoxCommand.login("B"));
    assertRepeatedActionIsStable("login-enumeration", new BlackBoxCommand(BlackBoxCommand.Type.REQUEST, "", "POST", "/login", "known 이메일로 로그인 요청"));
  }

  @Test
  void distinguishes_a_real_state_change_from_an_inconsistent_repeat() {
    BlackBoxVirtualTarget target = BlackBoxVirtualTargets.forScenario("coupon-cache");
    BlackBoxVirtualTarget.Result aLogin = target.execute(target.initialState(), BlackBoxCommand.login("A"));
    BlackBoxVirtualTarget.Result aCoupon = target.execute(aLogin.nextState(), BlackBoxCommand.request("GET", "/mypage/coupons"));
    BlackBoxVirtualTarget.Result bLogin = target.execute(aCoupon.nextState(), BlackBoxCommand.login("B"));
    BlackBoxCommand couponRequest = BlackBoxCommand.request("GET", "/mypage/coupons");

    BlackBoxVirtualTarget.Result first = target.execute(bLogin.nextState(), couponRequest);
    BlackBoxVirtualTarget.Result second = target.execute(bLogin.nextState(), couponRequest);

    assertThat(first.transcript()).isEqualTo(second.transcript());
    assertThat(first.transcript()).contains("A-SPRING-10");
  }

  @Test
  void preserves_the_complete_multiline_http_observation_across_state_persistence() {
    BlackBoxVirtualTarget target = BlackBoxVirtualTargets.forScenario("order-access");
    BlackBoxVirtualTarget.Result login = target.execute(target.initialState(), BlackBoxCommand.login("A"));
    BlackBoxVirtualTarget.State restored = target.decode(target.encode(login.nextState()));

    BlackBoxVirtualTarget.Result redirect = target.execute(restored, BlackBoxCommand.inspect("리다이렉트 후 주소는?"));
    BlackBoxVirtualTarget.Result cookie = target.execute(restored, BlackBoxCommand.inspect("세션 쿠키 값은?"));

    assertThat(restored.lastTranscript()).isEqualTo(login.nextState().lastTranscript());
    assertThat(redirect.transcript()).contains("`/mypage/orders`");
    assertThat(cookie.transcript()).contains("session=lab_a_7b1f");
  }

  private void assertStable(String slug, BlackBoxCommand command) {
    BlackBoxVirtualTarget target = BlackBoxVirtualTargets.forScenario(slug);
    BlackBoxVirtualTarget.State state = target.initialState();
    List<BlackBoxVirtualTarget.Result> results = List.of(target.execute(state, command), target.execute(state, command));
    assertThat(results.get(1).transcript()).isEqualTo(results.get(0).transcript());
    assertThat(results.get(1).nextState()).isEqualTo(results.get(0).nextState());
  }

  private void assertRepeatedActionIsStable(String slug, BlackBoxCommand command) {
    BlackBoxVirtualTarget target = BlackBoxVirtualTargets.forScenario(slug);
    BlackBoxVirtualTarget.Result first = target.execute(target.initialState(), command);
    BlackBoxVirtualTarget.Result second = target.execute(first.nextState(), command);
    assertThat(second.transcript()).isEqualTo(first.transcript());
    assertThat(second.nextState()).isEqualTo(first.nextState());
  }
}
