package com.orchestration.training;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

class BlackBoxMinimalEvidencePolicyTest {
  @Test
  void treats_the_disclosed_owner_mapping_and_cross_order_response_as_complete_read_authorization_proof() {
    BlackBoxScenarioDefinition scenario=BlackBoxScenarioCatalog.bySlug("order-access");

    BlackBoxConclusionEvaluator.Baseline result=BlackBoxConclusionEvaluator.baseline(scenario,
        List.of("unauthenticated-order", "login-a", "cross-order"), "취약점 확인",
        "비로그인 요청은 401로 거부됐다. A로 로그인한 뒤 B 소유 O-2008을 조회하자 200 응답과 B의 주문 상세 정보가 반환됐다. 따라서 인증은 적용됐지만 요청 주문의 소유자 확인이 누락돼 타 사용자 주문 조회가 가능하다. 수정·삭제 가능 여부와 내부 구현은 확인하지 못했다.");

    assertThat(result.score()).isGreaterThanOrEqualTo(95.0);
    assertThat(result.feedback()).contains("최소 증명 경로");
  }

  @Test
  void does_not_require_a_redundant_own_order_request_when_ownership_is_already_disclosed_in_the_case() {
    BlackBoxScenarioDefinition scenario=BlackBoxScenarioCatalog.bySlug("order-access");

    assertThat(BlackBoxEvidencePolicy.coverage(scenario, List.of("login-a", "cross-order"))).isEqualTo(1.0);
  }
}
