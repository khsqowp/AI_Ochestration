package com.orchestration.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Runs once at startup: migrates the legacy "OWNER" role value that predates the ADMIN/USER split (raw SQL,
 * so it runs before Hibernate tries to map any row through the enum-typed {@link AppUser#getRole()} and
 * fails), then seeds the ADMIN account from ADMIN_ID/ADMIN_PW if it doesn't exist yet. Never overwrites an
 * existing account's password — the .env credentials are a first-run bootstrap, not a way to silently reset
 * a password an admin has since changed through the UI. */
@Component
class AdminBootstrap implements ApplicationRunner {
  private static final Logger log = LoggerFactory.getLogger(AdminBootstrap.class);
  private final JdbcTemplate jdbc;
  private final AppUserRepository users;
  private final AuthProperties properties;
  private final PasswordEncoder encoder;

  AdminBootstrap(JdbcTemplate jdbc, AppUserRepository users, AuthProperties properties, PasswordEncoder encoder) {
    this.jdbc = jdbc; this.users = users; this.properties = properties; this.encoder = encoder;
  }

  @Override
  @Transactional
  public void run(ApplicationArguments args) {
    migrateLegacyOwnerRole();
    seedAdminAccount();
  }

  private void migrateLegacyOwnerRole() {
    int updated = jdbc.update("UPDATE app_users SET role = 'ADMIN' WHERE role = 'OWNER'");
    if (updated > 0) log.info("auth_migrated_legacy_owner_role count={}", updated);
  }

  private void seedAdminAccount() {
    String adminId = properties.adminId();
    if (adminId == null || adminId.isBlank()) return;
    if (users.findByEmail(adminId).isPresent()) return;
    String rawPassword = properties.adminPassword();
    if (rawPassword == null || rawPassword.isBlank()) {
      log.warn("auth_admin_seed_skipped reason=ADMIN_PW_missing");
      return;
    }
    users.save(new AppUser(adminId, "Admin", Role.ADMIN, encoder.encode(rawPassword)));
    log.info("auth_admin_seeded id={}", adminId);
  }
}
