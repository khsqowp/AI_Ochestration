package com.orchestration.files;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

interface FileIntakeRepository extends JpaRepository<FileIntakeJob, UUID> {
  boolean existsBySourcePath(String sourcePath);
  List<FileIntakeJob> findTop20ByOrderByDiscoveredAtDesc();
}

