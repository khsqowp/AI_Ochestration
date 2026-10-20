package com.orchestration.notebook;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NotebookEntryRepository extends JpaRepository<NotebookEntry, UUID> {
  List<NotebookEntry> findByOwnerIdOrderByUpdatedAtDesc(UUID ownerId);
}
