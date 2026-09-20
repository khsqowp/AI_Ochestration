package com.orchestration.training;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class BlackBoxScenarioSelectorTest {
  @Test
  void selectsLowestRelevantSkillInsteadOfExposingCaseCards() {
    CompetencyAssessment authorization=new CompetencyAssessment(UUID.randomUUID(), "AUTHORIZATION", 80, AssessmentConfidence.MEDIUM, "", 0);
    authorization.updateBlackBox(80, 1, "", "");
    CompetencyAssessment businessLogic=new CompetencyAssessment(UUID.randomUUID(), "BUSINESS_LOGIC", 35, AssessmentConfidence.MEDIUM, "", 0);
    businessLogic.updateBlackBox(35, 1, "", "");

    assertThat(BlackBoxScenarioSelector.select(List.of(authorization, businessLogic), List.of()).slug())
        .isEqualTo("coupon-usage-policy");
  }

  @Test
  void usesLearnerChosenSkillWhenStartingAChatSession() {
    assertThat(BlackBoxScenarioSelector.selectForSkill("AUTHENTICATION", List.of()).slug())
        .isEqualTo("login-enumeration");
  }
}
