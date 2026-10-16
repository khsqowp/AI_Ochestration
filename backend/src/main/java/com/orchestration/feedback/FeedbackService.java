package com.orchestration.feedback;

import com.orchestration.auth.AuthService;
import com.orchestration.auth.Role;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class FeedbackService {
  static final String OWNER_EMAIL = "kknd03255@gmail.com";
  private final FeedbackReportRepository reports;

  FeedbackService(FeedbackReportRepository reports) { this.reports = reports; }

  @Transactional(readOnly = true)
  public List<FeedbackReport> list(AuthService.UserProfile user) {
    requireUser(user);
    if (canViewAll(user)) return reports.findAllByOrderByCreatedAtDesc();
    return reports.findByAuthorIdOrderByCreatedAtDesc(UUID.fromString(user.id()));
  }

  @Transactional
  public FeedbackReport submit(AuthService.UserProfile user, String title, String body) {
    requireUser(user);
    return reports.save(new FeedbackReport(
        UUID.fromString(user.id()), user.email(), user.displayName(), title.trim(), body.trim()));
  }

  static boolean canViewAll(AuthService.UserProfile user) {
    return user.role() == Role.ADMIN || OWNER_EMAIL.equalsIgnoreCase(user.email());
  }

  private static void requireUser(AuthService.UserProfile user) {
    if (user == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다.");
  }
}
