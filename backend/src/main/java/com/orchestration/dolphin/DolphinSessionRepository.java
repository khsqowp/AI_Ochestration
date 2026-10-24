package com.orchestration.dolphin;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface DolphinSessionRepository extends JpaRepository<DolphinSession, UUID> {
  List<DolphinSession> findByOwnerIdOrderByUpdatedAtDesc(String ownerId);
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select s from DolphinSession s where s.id = :id")
  Optional<DolphinSession> findByIdForUpdate(@Param("id") UUID id);
}
