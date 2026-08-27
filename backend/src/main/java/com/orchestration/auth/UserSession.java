package com.orchestration.auth;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "user_sessions")
public class UserSession {
  @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
  @ManyToOne(optional = false, fetch = FetchType.LAZY) private AppUser user;
  @Column(nullable = false, unique = true, length = 100) private String token;
  @Column(nullable = false) private Instant expiresAt;
  @Column(nullable = false) private Instant createdAt = Instant.now();
  @Column(nullable = false) private boolean revoked;
  protected UserSession() {}
  public UserSession(AppUser user, String token, Instant expiresAt) { this.user = user; this.token = token; this.expiresAt = expiresAt; }
  public AppUser getUser() { return user; }
  public String getToken() { return token; }
  public boolean isActive() { return !revoked && expiresAt.isAfter(Instant.now()); }
  public void revoke() { revoked = true; }
}

