package com.orchestration.auth;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

interface UserSessionRepository extends JpaRepository<UserSession, UUID> {
  Optional<UserSession> findByToken(String token);
  void deleteByUser(AppUser user);
}

