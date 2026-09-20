package com.orchestration.training;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

class BlackBoxConclusionEvaluatorTest {
  private final BlackBoxScenarioDefinition scenario=BlackBoxScenarioCatalog.bySlug("coupon-usage-policy");

  @Test
  void gives_a_full_score_band_to_a_conclusion_that_connects_all_observations_to_actual_economic_effect() {
    BlackBoxConclusionEvaluator.Baseline result=BlackBoxConclusionEvaluator.baseline(scenario,
        scenario.criticalObservationKeys(),
        "취약점 확인", "동시에 두 주문에 적용한 뒤 두 주문의 finalAmount가 모두 10% 할인됐고, 쿠폰 사용 이력은 1건이었다. 성공 응답이 아니라 재조회된 실제 할인 효과를 근거로 1회 제한이 깨졌다고 판단한다. 취소·환불 경로도 추가 확인이 필요하다.");

    assertThat(result.score()).isGreaterThanOrEqualTo(95);
    assertThat(result.feedback()).contains("관측").doesNotContain("양식");
  }

  @Test
  void gives_an_eighty_point_band_when_the_main_effect_is_correct_but_one_verification_axis_is_missing() {
    BlackBoxConclusionEvaluator.Baseline result=BlackBoxConclusionEvaluator.baseline(scenario,
        List.of("coupon-parallel-apply","coupon-order-O-3001","coupon-order-O-3002"),
        "취약점 확인", "두 주문 모두 할인된 것을 재조회했으므로 동일 쿠폰이 두 번 혜택으로 반영됐다. 쿠폰 이력과 취소 뒤 상태는 확인하지 못했다.");

    assertThat(result.score()).isBetween(75.0, 89.0);
    assertThat(result.feedback()).contains("최소 증명 경로");
  }

  @Test
  void gives_a_sixty_point_band_when_a_learner_repeats_success_status_without_proving_effect() {
    BlackBoxConclusionEvaluator.Baseline result=BlackBoxConclusionEvaluator.baseline(scenario,
        List.of("coupon-parallel-apply","coupon-order-O-3001"),
        "취약점 확인", "동시 요청이 모두 200 OK였으므로 문제가 있다.");

    assertThat(result.score()).isBetween(55.0, 69.0);
    assertThat(result.feedback()).contains("200 OK");
  }

  @Test
  void treats_an_incorrect_confident_conclusion_as_lower_than_a_correct_but_incomplete_one() {
    BlackBoxConclusionEvaluator.Baseline result=BlackBoxConclusionEvaluator.baseline(scenario,
        List.of("coupon-parallel-apply","coupon-order-O-3001","coupon-order-O-3002"),
        "취약점 아님", "두 주문에 할인이 보이지만 서버가 정상 처리했으므로 문제는 없다.");

    assertThat(result.score()).isLessThan(60);
    assertThat(result.feedback()).contains("판정");
  }

  @Test
  void lets_every_registered_scenario_reach_the_top_band_with_complete_free_form_evidence() {
    for (BlackBoxScenarioDefinition registered : BlackBoxScenarioCatalog.all()) {
      BlackBoxConclusionEvaluator.Baseline result=BlackBoxConclusionEvaluator.baseline(registered,
          registered.criticalObservationKeys(), registered.expectedVerdict(),
          "관측한 응답과 재조회 결과를 함께 비교했다. 확보한 사실을 근거로 결론을 냈으며, 아직 보지 못한 상태 변화는 추가 확인이 필요하다.");

      assertThat(result.score()).as(registered.slug()).isGreaterThanOrEqualTo(95.0);
    }
  }

  @Test
  void accepts_equivalent_free_wording_without_requiring_coupon_specific_words() {
    BlackBoxConclusionEvaluator.Baseline result=BlackBoxConclusionEvaluator.baseline(scenario,
        scenario.criticalObservationKeys(), "취약점 확인", "O-3001과 O-3002에 각각 10% 할인이 실제 반영됐고 쿠폰 사용기록은 1건이었다. 응답과 재확인을 비교해 결론을 냈으며, 취소 경로는 추가 확인이 필요하다.");

    assertThat(result.score()).isGreaterThanOrEqualTo(95.0);
  }
}
