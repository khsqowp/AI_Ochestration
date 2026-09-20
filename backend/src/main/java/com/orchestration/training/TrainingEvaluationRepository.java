package com.orchestration.training;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface TrainingEvaluationRepository extends JpaRepository<TrainingEvaluation, UUID> {
  Optional<TrainingEvaluation> findByAttemptId(UUID attemptId);
  @Query("select evaluation from TrainingEvaluation evaluation join fetch evaluation.attempt attempt join fetch attempt.trainingCase trainingCase where attempt.ownerId=:ownerId and evaluation.status=:status order by evaluation.createdAt desc")
  java.util.List<TrainingEvaluation> findCompletedForOwner(@Param("ownerId") UUID ownerId, @Param("status") TrainingEvaluationStatus status);
}
interface TrainingEvaluationCacheRepository extends JpaRepository<TrainingEvaluationCache, UUID> {
  Optional<TrainingEvaluationCache> findByCacheKey(String cacheKey);
}
