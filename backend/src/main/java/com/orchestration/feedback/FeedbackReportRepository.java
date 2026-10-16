package com.orchestration.feedback;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

interface FeedbackReportRepository extends JpaRepository<FeedbackReport, UUID> {
  List<FeedbackReport> findAllByOrderByCreatedAtDesc();
  List<FeedbackReport> findByAuthorIdOrderByCreatedAtDesc(UUID authorId);
}
