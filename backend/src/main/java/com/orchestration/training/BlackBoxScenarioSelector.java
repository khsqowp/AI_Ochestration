package com.orchestration.training;

import java.util.Comparator;
import java.util.List;
import java.util.Set;

/** Chooses a case from the learner profile; the client never receives a card catalogue. */
final class BlackBoxScenarioSelector {
  private BlackBoxScenarioSelector() { }

  static BlackBoxScenarioDefinition select(List<CompetencyAssessment> assessments, List<BlackBoxScenarioSession> history) {
    Set<String> recent=history.stream().filter(item -> item.getStatus()==BlackBoxSessionStatus.CLOSED)
        .limit(2).map(BlackBoxScenarioSession::getScenarioSlug).collect(java.util.stream.Collectors.toSet());
    List<BlackBoxScenarioDefinition> candidates=BlackBoxScenarioCatalog.all().stream()
        .filter(item -> !recent.contains(item.slug())).toList();
    if (candidates.isEmpty()) candidates=BlackBoxScenarioCatalog.all();
    return candidates.stream().min(Comparator
        .comparingDouble((BlackBoxScenarioDefinition scenario) -> scoreFor(assessments, scenario.primarySkillCode()))
        .thenComparingInt(BlackBoxScenarioDefinition::difficulty)
        .thenComparing(BlackBoxScenarioDefinition::slug)).orElseThrow();
  }

  static BlackBoxScenarioDefinition selectForSkill(String skillCode, List<BlackBoxScenarioSession> history) {
    Set<String> recent=history.stream().filter(item -> item.getStatus()==BlackBoxSessionStatus.CLOSED)
        .limit(2).map(BlackBoxScenarioSession::getScenarioSlug).collect(java.util.stream.Collectors.toSet());
    List<BlackBoxScenarioDefinition> candidates=BlackBoxScenarioCatalog.all().stream()
        .filter(item -> item.primarySkillCode().equals(skillCode)).filter(item -> !recent.contains(item.slug())).toList();
    if (candidates.isEmpty()) candidates=BlackBoxScenarioCatalog.all().stream().filter(item -> item.primarySkillCode().equals(skillCode)).toList();
    return candidates.stream().min(Comparator.comparingInt(BlackBoxScenarioDefinition::difficulty).thenComparing(BlackBoxScenarioDefinition::slug)).orElseThrow();
  }

  private static double scoreFor(List<CompetencyAssessment> assessments, String skillCode) {
    return assessments.stream().filter(item -> item.getSkillCode().equals(skillCode)).findFirst()
        .map(item -> item.getBlackBoxScore()==null ? item.getScore() : item.getBlackBoxScore()).orElse(50d);
  }
}
