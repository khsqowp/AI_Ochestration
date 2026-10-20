package com.orchestration.notebook;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NotebookImageRepository extends JpaRepository<NotebookImage, UUID> {
  List<NotebookImage> findByEntryId(UUID entryId);
}
