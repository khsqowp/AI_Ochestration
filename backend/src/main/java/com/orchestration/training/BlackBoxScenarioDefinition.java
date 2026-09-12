package com.orchestration.training;

import java.util.List;

record BlackBoxScenarioDefinition(String slug, String title, String intro, String primarySkillCode,
    int difficulty, String expectedVerdict, List<String> criticalObservationKeys, String feedbackFocus) {}
