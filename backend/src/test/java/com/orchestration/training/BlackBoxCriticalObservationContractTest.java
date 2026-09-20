package com.orchestration.training;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.LinkedHashSet;
import java.util.Set;
import org.junit.jupiter.api.Test;

/** Every catalogued score-critical observation must be obtainable through an actual learner trace. */
class BlackBoxCriticalObservationContractTest {
  @Test
  void order_access_critical_observations_are_emitted_by_a_real_trace() {
    BlackBoxVirtualTarget target=BlackBoxVirtualTargets.forScenario("order-access");
    BlackBoxVirtualTarget.State state=target.execute(target.initialState(), BlackBoxCommand.login("A")).nextState();
    Set<String> keys=new LinkedHashSet<>();
    state=record(target, state, BlackBoxCommand.request("GET", "/orders/O-1001"), keys);
    record(target, state, BlackBoxCommand.request("GET", "/orders/O-2008"), keys);
    assertThat(keys).containsAll(BlackBoxScenarioCatalog.bySlug("order-access").criticalObservationKeys());
  }

  @Test
  void coupon_policy_critical_observations_are_emitted_by_a_real_trace() {
    BlackBoxVirtualTarget target=BlackBoxVirtualTargets.forScenario("coupon-usage-policy");
    BlackBoxVirtualTarget.State state=target.execute(target.initialState(), BlackBoxCommand.login("A")).nextState();
    Set<String> keys=new LinkedHashSet<>();
    state=record(target,state,BlackBoxCommand.request("POST","/orders/coupons/ONE-TIME-10/apply?parallel=O-3001,O-3002"),keys);
    state=record(target,state,BlackBoxCommand.request("GET","/orders/O-3001"),keys);
    state=record(target,state,BlackBoxCommand.request("GET","/orders/O-3002"),keys);
    record(target,state,BlackBoxCommand.request("GET","/mypage/coupon-history"),keys);
    assertThat(keys).containsAll(BlackBoxScenarioCatalog.bySlug("coupon-usage-policy").criticalObservationKeys());
  }

  private BlackBoxVirtualTarget.State record(BlackBoxVirtualTarget target, BlackBoxVirtualTarget.State state, BlackBoxCommand command, Set<String> keys) {
    BlackBoxVirtualTarget.Result result=target.execute(state,command);
    if(result.observationKey()!=null) keys.add(result.observationKey());
    return result.nextState();
  }
}
