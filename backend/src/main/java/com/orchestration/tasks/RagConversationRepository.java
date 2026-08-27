package com.orchestration.tasks;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

interface RagConversationRepository extends JpaRepository<RagConversation, UUID> {
  List<RagConversation> findTop50ByOrderByCreatedAtDesc();
}
