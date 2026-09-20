package com.orchestration.training;

import java.util.List;
import java.util.Set;

/** Defines the smallest observable proof for each case; extra exploratory actions are not required. */
final class BlackBoxEvidencePolicy {
  private BlackBoxEvidencePolicy() { }

  static double coverage(BlackBoxScenarioDefinition scenario, List<String> observedKeys) {
    Set<String> observed=Set.copyOf(observedKeys);
    return proofSets(scenario.slug()).stream()
        .mapToDouble(proof -> proof.isEmpty()?0:(double)proof.stream().filter(observed::contains).count()/proof.size())
        .max().orElseGet(() -> scenario.criticalObservationKeys().isEmpty()?0:(double)scenario.criticalObservationKeys().stream().filter(observed::contains).count()/scenario.criticalObservationKeys().size());
  }

  static boolean complete(BlackBoxScenarioDefinition scenario, List<String> observedKeys) { return coverage(scenario, observedKeys)>=1.0; }

  private static List<Set<String>> proofSets(String slug) {
    return switch(slug) {
      // A/B ownership is disclosed in the briefing. A cross-order response is therefore sufficient
      // to prove read authorization failure; an own-order re-read would be redundant.
      case "order-access" -> List.of(Set.of("cross-order"));
      case "coupon-cache" -> List.of(Set.of("coupon-own", "coupon-cross-session"));
      case "coupon-usage-policy" -> List.of(Set.of("coupon-parallel-apply", "coupon-order-O-3001", "coupon-order-O-3002", "coupon-history-one"));
      case "login-enumeration" -> List.of(Set.of("known-login", "unknown-login"));
      default -> List.of();
    };
  }
}
