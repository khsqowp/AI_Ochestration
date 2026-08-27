package com.orchestration.sources;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

interface PageSnapshotRepository extends JpaRepository<PageSnapshot, UUID> {
  Optional<PageSnapshot> findByUrl(String url);
}
