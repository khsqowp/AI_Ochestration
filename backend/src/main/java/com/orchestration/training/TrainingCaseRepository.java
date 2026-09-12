package com.orchestration.training;
import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;
interface TrainingCaseRepository extends JpaRepository<TrainingCase,UUID>{
  List<TrainingCase> findByPublishedTrueOrderByPrimarySkillCodeAscDifficultyAsc();
  Optional<TrainingCase> findBySlug(String slug);
}
