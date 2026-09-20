package com.orchestration.training;
import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;
interface CompetencyAssessmentRepository extends JpaRepository<CompetencyAssessment,UUID>{ List<CompetencyAssessment> findByOwnerIdOrderBySkillCode(UUID ownerId); Optional<CompetencyAssessment> findByOwnerIdAndSkillCode(UUID ownerId,String skillCode); }
