package com.orchestration.auth;

import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class UserAdminService {
  private final AppUserRepository users;
  private final UserSessionRepository sessions;
  private final PasswordEncoder encoder;

  UserAdminService(AppUserRepository users, UserSessionRepository sessions, PasswordEncoder encoder) {
    this.users = users; this.sessions = sessions; this.encoder = encoder;
  }

  public List<AppUser> list() { return users.findAllByOrderByCreatedAtAsc(); }

  @Transactional
  public AppUser create(String id, String displayName, Role role, String rawPassword) {
    if (users.findByEmail(id).isPresent()) throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 존재하는 아이디입니다.");
    return users.save(new AppUser(id, displayName, role, encoder.encode(rawPassword)));
  }

  @Transactional
  public AppUser update(UUID id, String displayName, Role role, String rawPassword) {
    AppUser user = find(id);
    if (user.getRole() == Role.ADMIN && role == Role.USER && users.countByRole(Role.ADMIN) <= 1) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "마지막 관리자 계정의 권한은 변경할 수 없습니다.");
    }
    user.setDisplayName(displayName);
    user.setRole(role);
    if (rawPassword != null && !rawPassword.isBlank()) user.setPasswordHash(encoder.encode(rawPassword));
    return users.save(user);
  }

  @Transactional
  public void delete(UUID id, UUID callerId) {
    AppUser user = find(id);
    if (callerId != null && callerId.equals(id)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "자기 자신은 삭제할 수 없습니다.");
    if (user.getRole() == Role.ADMIN && users.countByRole(Role.ADMIN) <= 1) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "마지막 관리자 계정은 삭제할 수 없습니다.");
    }
    sessions.deleteByUser(user);
    users.delete(user);
  }

  private AppUser find(UUID id) { return users.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "사용자를 찾을 수 없습니다.")); }
}
