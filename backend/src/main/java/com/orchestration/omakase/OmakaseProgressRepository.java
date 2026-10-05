package com.orchestration.omakase;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

interface OmakaseProgressRepository extends JpaRepository<OmakaseProgress, UUID> {
  List<OmakaseProgress> findByOwnerId(UUID ownerId);
  Optional<OmakaseProgress> findByOwnerIdAndTopicId(UUID ownerId, String topicId);
}
