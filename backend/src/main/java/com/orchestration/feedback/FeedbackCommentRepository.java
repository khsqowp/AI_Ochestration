package com.orchestration.feedback;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

interface FeedbackCommentRepository extends JpaRepository<FeedbackComment, UUID> {
  List<FeedbackComment> findByReportIdOrderByCreatedAtAsc(UUID reportId);
}
