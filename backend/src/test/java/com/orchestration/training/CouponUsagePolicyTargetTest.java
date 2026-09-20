package com.orchestration.training;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * Contract for the business-rule investigation lab. Responses alone never establish a race: the
 * learner must be able to re-query the affected orders and coupon history from the same state.
 */
class CouponUsagePolicyTargetTest {
  @Test
  void exposes_the_coupon_policy_scenario_and_parses_a_natural_apply_request() {
    BlackBoxScenarioDefinition scenario = BlackBoxScenarioCatalog.bySlug("coupon-usage-policy");

    BlackBoxCommand command = BlackBoxCommandParser.parse(scenario,
        "A 계정으로 로그인 후 O-3001 주문에 ONE-TIME-10 쿠폰 적용 시도");

    assertThat(command.type()).isEqualTo(BlackBoxCommand.Type.SEQUENCE);
    assertThat(command.method()).isEqualTo("POST");
    assertThat(command.path()).isEqualTo("/orders/O-3001/coupons/ONE-TIME-10/apply");
  }

  @Test
  void verifies_a_one_time_coupon_against_actual_order_state_not_only_the_first_success_response() {
    BlackBoxVirtualTarget target = BlackBoxVirtualTargets.forScenario("coupon-usage-policy");
    BlackBoxVirtualTarget.Result login = target.execute(target.initialState(), BlackBoxCommand.login("A"));
    BlackBoxVirtualTarget.Result firstApply = target.execute(login.nextState(),
        BlackBoxCommand.request("POST", "/orders/O-3001/coupons/ONE-TIME-10/apply"));
    BlackBoxVirtualTarget.Result secondApply = target.execute(firstApply.nextState(),
        BlackBoxCommand.request("POST", "/orders/O-3002/coupons/ONE-TIME-10/apply"));
    BlackBoxVirtualTarget.Result order = target.execute(secondApply.nextState(),
        BlackBoxCommand.request("GET", "/orders/O-3001"));
    BlackBoxVirtualTarget.Result history = target.execute(secondApply.nextState(),
        BlackBoxCommand.request("GET", "/mypage/coupon-history"));

    assertThat(firstApply.transcript()).contains("HTTP/1.1 200 OK").contains("discountApplied");
    assertThat(secondApply.transcript()).contains("HTTP/1.1 409 CONFLICT").contains("COUPON_ALREADY_USED");
    assertThat(order.transcript()).contains("\"finalAmount\":54000");
    assertThat(history.transcript()).contains("\"usageCount\": 1");
  }

  @Test
  void returns_distinct_observations_for_minimum_amount_and_completed_order_constraints() {
    BlackBoxVirtualTarget target = BlackBoxVirtualTargets.forScenario("coupon-usage-policy");
    BlackBoxVirtualTarget.Result login = target.execute(target.initialState(), BlackBoxCommand.login("A"));

    BlackBoxVirtualTarget.Result lowAmount = target.execute(login.nextState(),
        BlackBoxCommand.request("POST", "/orders/O-3003/coupons/ONE-TIME-10/apply"));
    BlackBoxVirtualTarget.Result completed = target.execute(login.nextState(),
        BlackBoxCommand.request("POST", "/orders/O-3004/coupons/ONE-TIME-10/apply"));

    assertThat(lowAmount.transcript()).contains("HTTP/1.1 422 UNPROCESSABLE ENTITY").contains("MINIMUM_ORDER_AMOUNT_NOT_MET");
    assertThat(completed.transcript()).contains("HTTP/1.1 409 CONFLICT").contains("ORDER_NOT_COUPON_ELIGIBLE");
  }

  @Test
  void makes_the_parallel_two_order_case_observable_without_naming_the_vulnerability() {
    BlackBoxVirtualTarget target = BlackBoxVirtualTargets.forScenario("coupon-usage-policy");
    BlackBoxVirtualTarget.Result login = target.execute(target.initialState(), BlackBoxCommand.login("A"));
    BlackBoxVirtualTarget.Result parallel = target.execute(login.nextState(),
        BlackBoxCommand.request("POST", "/orders/coupons/ONE-TIME-10/apply?parallel=O-3001,O-3002"));
    BlackBoxVirtualTarget.Result orderOne = target.execute(parallel.nextState(), BlackBoxCommand.request("GET", "/orders/O-3001"));
    BlackBoxVirtualTarget.Result orderTwo = target.execute(parallel.nextState(), BlackBoxCommand.request("GET", "/orders/O-3002"));
    BlackBoxVirtualTarget.Result history = target.execute(parallel.nextState(), BlackBoxCommand.request("GET", "/mypage/coupon-history"));

    assertThat(parallel.transcript()).contains("\"requestCount\": 2").contains("HTTP/1.1 200 OK");
    assertThat(parallel.transcript()).doesNotContain("race condition");
    assertThat(orderOne.transcript()).contains("\"finalAmount\":54000");
    assertThat(orderTwo.transcript()).contains("\"finalAmount\":72000");
    assertThat(history.transcript()).contains("\"usageCount\": 1");
  }

  @Test
  void keeps_parallel_outcomes_identical_after_runtime_state_round_trip() {
    BlackBoxVirtualTarget target = BlackBoxVirtualTargets.forScenario("coupon-usage-policy");
    BlackBoxVirtualTarget.Result login = target.execute(target.initialState(), BlackBoxCommand.login("A"));
    BlackBoxCommand parallel = BlackBoxCommand.request("POST", "/orders/coupons/ONE-TIME-10/apply?parallel=O-3001,O-3002");

    BlackBoxVirtualTarget.Result before = target.execute(login.nextState(), parallel);
    BlackBoxVirtualTarget.State restored = target.decode(target.encode(login.nextState()));
    BlackBoxVirtualTarget.Result after = target.execute(restored, parallel);

    assertThat(after.transcript()).isEqualTo(before.transcript());
    assertThat(after.nextState()).isEqualTo(before.nextState());
  }

  @Test
  void preserves_a_requested_ten_parallel_attempts_instead_of_silently_reducing_them_to_two() {
    BlackBoxScenarioDefinition scenario=BlackBoxScenarioCatalog.bySlug("coupon-usage-policy");
    BlackBoxCommand command=BlackBoxCommandParser.parse(scenario, "A 계정으로 로그인 후 O-3001에 쿠폰을 동시에 10개 요청한다");
    BlackBoxVirtualTarget target=BlackBoxVirtualTargets.forScenario("coupon-usage-policy");

    BlackBoxVirtualTarget.Result result=target.execute(target.initialState(), command);

    assertThat(command.path()).endsWith("?parallel=10");
    assertThat(result.transcript()).contains("\"requestCount\":10");
    assertThat(result.transcript()).doesNotContain("race condition");
  }
}
