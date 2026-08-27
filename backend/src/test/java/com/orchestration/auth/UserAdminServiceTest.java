package com.orchestration.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class UserAdminServiceTest {
  @Mock private AppUserRepository users;
  @Mock private UserSessionRepository sessions;
  private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
  private UserAdminService service;

  @BeforeEach
  void setUp() { service = new UserAdminService(users, sessions, encoder); }

  private AppUser withId(AppUser user) { ReflectionTestUtils.setField(user, "id", UUID.randomUUID()); return user; }

  @Test
  void create_duplicateId_isRejected() {
    when(users.findByEmail("existing")).thenReturn(Optional.of(withId(new AppUser("existing", "Existing", Role.USER))));

    assertThatThrownBy(() -> service.create("existing", "New", Role.USER, "password123"))
        .isInstanceOf(ResponseStatusException.class);
  }

  @Test
  void create_newAccount_hashesThePasswordRatherThanStoringItRaw() {
    when(users.findByEmail("newuser")).thenReturn(Optional.empty());
    when(users.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

    AppUser saved = service.create("newuser", "New User", Role.USER, "password123");

    assertThat(saved.getPasswordHash()).isNotEqualTo("password123");
    assertThat(encoder.matches("password123", saved.getPasswordHash())).isTrue();
  }

  @Test
  void delete_lastRemainingAdmin_isRejected() {
    AppUser admin = withId(new AppUser("admin", "Admin", Role.ADMIN));
    UUID id = admin.getId();
    when(users.findById(id)).thenReturn(Optional.of(admin));
    when(users.countByRole(Role.ADMIN)).thenReturn(1L);

    assertThatThrownBy(() -> service.delete(id, UUID.randomUUID()))
        .isInstanceOf(ResponseStatusException.class);
  }

  @Test
  void delete_nonLastAdmin_clearsSessionsBeforeDeletingTheAccount() {
    // a lingering session row would otherwise violate the user_sessions -> app_users foreign key on delete
    AppUser admin = withId(new AppUser("admin", "Admin", Role.ADMIN));
    UUID id = admin.getId();
    when(users.findById(id)).thenReturn(Optional.of(admin));
    when(users.countByRole(Role.ADMIN)).thenReturn(2L);

    service.delete(id, UUID.randomUUID());

    org.mockito.Mockito.verify(sessions).deleteByUser(admin);
    org.mockito.Mockito.verify(users).delete(admin);
  }

  @Test
  void delete_self_isRejectedEvenIfNotTheLastAdmin() {
    AppUser admin = withId(new AppUser("admin", "Admin", Role.ADMIN));
    UUID id = admin.getId();
    when(users.findById(id)).thenReturn(Optional.of(admin));

    assertThatThrownBy(() -> service.delete(id, id)).isInstanceOf(ResponseStatusException.class);
  }

  @Test
  void update_demotingLastAdminToUser_isRejected() {
    AppUser admin = withId(new AppUser("admin", "Admin", Role.ADMIN));
    UUID id = admin.getId();
    when(users.findById(id)).thenReturn(Optional.of(admin));
    when(users.countByRole(Role.ADMIN)).thenReturn(1L);

    assertThatThrownBy(() -> service.update(id, "Admin", Role.USER, null))
        .isInstanceOf(ResponseStatusException.class);
  }
}
