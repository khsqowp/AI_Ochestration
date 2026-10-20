package com.orchestration.auth;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AppUserRepository extends JpaRepository<AppUser, UUID> {
  Optional<AppUser> findByEmail(String email);
  List<AppUser> findAllByOrderByCreatedAtAsc();
  long countByRole(Role role);
}
