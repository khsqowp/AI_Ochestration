package com.orchestration.tasks;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

interface NoteEmbeddingRepository extends JpaRepository<NoteEmbedding, UUID> {
  Optional<NoteEmbedding> findByPath(String path);
}
