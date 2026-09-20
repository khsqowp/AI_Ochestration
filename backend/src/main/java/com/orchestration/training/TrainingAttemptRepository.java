package com.orchestration.training;
import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;
interface TrainingAttemptRepository extends JpaRepository<TrainingAttempt,UUID>{ List<TrainingAttempt> findByOwnerIdOrderByStartedAtDesc(UUID ownerId); Optional<TrainingAttempt> findByIdAndOwnerId(UUID id,UUID ownerId); long countByOwnerIdAndTrainingCaseId(UUID ownerId,UUID caseId); }
