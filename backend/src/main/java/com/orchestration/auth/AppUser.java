package com.orchestration.auth;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "app_users")
public class AppUser {
  @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
  @Column(nullable = false, unique = true, length = 320) private String email;
  @Column(nullable = false, length = 120) private String displayName;
  @Enumerated(EnumType.STRING) @Column(nullable = false, length = 40) private Role role;
  @Column(length = 255) private String passwordHash;
  @Column(nullable = false) private Instant createdAt = Instant.now();

  protected AppUser() {}
  public AppUser(String email, String displayName, Role role) { this.email = email; this.displayName = displayName; this.role = role; }
  public AppUser(String email, String displayName, Role role, String passwordHash) {
    this.email = email; this.displayName = displayName; this.role = role; this.passwordHash = passwordHash;
  }
  public UUID getId() { return id; }
  public String getEmail() { return email; }
  public String getDisplayName() { return displayName; }
  public Role getRole() { return role; }
  public String getPasswordHash() { return passwordHash; }
  public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }
  public void setDisplayName(String displayName) { this.displayName = displayName; }
  public void setRole(Role role) { this.role = role; }
  public Instant getCreatedAt() { return createdAt; }
}

