package com.orchestration.tasks;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NoteGraphEdgeRepository extends JpaRepository<NoteGraphEdge, UUID> {
}
