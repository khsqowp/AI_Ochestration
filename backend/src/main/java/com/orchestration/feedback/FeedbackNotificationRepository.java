package com.orchestration.feedback;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface FeedbackNotificationRepository extends JpaRepository<FeedbackNotification, UUID> {
  List<FeedbackNotification> findTop30ByRecipientIdOrderByCreatedAtDesc(UUID recipientId);
  long countByRecipientIdAndReadAtIsNull(UUID recipientId);

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select n from FeedbackNotification n where n.recipientId = :recipientId and n.readAt is null and n.toastShownAt is null order by n.createdAt asc")
  List<FeedbackNotification> findUnshownForUpdate(@Param("recipientId") UUID recipientId);
}
