package com.orchestration.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {
  @Mock private AppUserRepository users;
  @Mock private UserSessionRepository sessions;

  private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
  private JwtService jwt;
  private AuthService service;

  @BeforeEach
  void setUp() {
    AuthProperties properties = new AuthProperties(true, false, "owner@local.dev", "Owner", "admin", "secret", "test-jwt-secret-0123456789-0123456789");
    jwt = new JwtService(properties);
    service = new AuthService(users, sessions, properties, jwt, encoder);
  }

  private AppUser admin(String password) {
    AppUser user = new AppUser("admin@local.dev", "Admin", Role.ADMIN, encoder.encode(password));
    ReflectionTestUtils.setField(user, "id", UUID.randomUUID());
    return user;
  }

  @Test
  void login_correctCredentials_issuesTokenCarryingRole() {
    AppUser user = admin("correct-password");
    when(users.findByEmail("admin@local.dev")).thenReturn(Optional.of(user));
    when(sessions.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

    var result = service.login("admin@local.dev", "correct-password");

    assertThat(result.token()).isNotBlank();
    assertThat(result.user().role()).isEqualTo(Role.ADMIN);
    assertThat(result.user().email()).isEqualTo("admin@local.dev");
  }

  @Test
  void login_wrongPassword_throwsInvalidCredentials() {
    when(users.findByEmail("admin@local.dev")).thenReturn(Optional.of(admin("correct-password")));

    assertThatThrownBy(() -> service.login("admin@local.dev", "wrong-password"))
        .isInstanceOf(InvalidCredentialsException.class);
  }

  @Test
  void login_unknownId_throwsInvalidCredentials() {
    when(users.findByEmail("nobody@local.dev")).thenReturn(Optional.empty());

    assertThatThrownBy(() -> service.login("nobody@local.dev", "whatever"))
        .isInstanceOf(InvalidCredentialsException.class);
  }

  @Test
  void login_accountWithNoPassword_isRejectedRatherThanNullPointer() {
    AppUser user = new AppUser("nopass@local.dev", "No Password", Role.USER);
    ReflectionTestUtils.setField(user, "id", UUID.randomUUID());
    when(users.findByEmail("nopass@local.dev")).thenReturn(Optional.of(user));

    assertThatThrownBy(() -> service.login("nopass@local.dev", "anything"))
        .isInstanceOf(InvalidCredentialsException.class);
  }

  @Test
  void validate_revokedSession_isRejectedEvenWithAValidSignature() {
    AppUser user = admin("correct-password");
    when(users.findByEmail("admin@local.dev")).thenReturn(Optional.of(user));
    when(sessions.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
    var result = service.login("admin@local.dev", "correct-password");
    String jti = jwt.parse(result.token()).orElseThrow().getId();

    UserSession revoked = new UserSession(user, jti, Instant.now().plus(1, ChronoUnit.DAYS));
    revoked.revoke();
    when(sessions.findByToken(jti)).thenReturn(Optional.of(revoked));

    assertThat(service.validate(result.token())).isEmpty();
  }

  @Test
  void validate_tamperedToken_isRejected() {
    assertThat(service.validate("not-a-real-jwt")).isEmpty();
  }
}
