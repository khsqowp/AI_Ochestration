package com.orchestration.feedback;

import com.orchestration.auth.AppUser;
import com.orchestration.auth.AppUserRepository;
import com.orchestration.auth.AuthService;
import com.orchestration.auth.Role;
import java.time.Instant;
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
  private final FeedbackCommentRepository comments;
  private final FeedbackNotificationRepository notifications;
  private final AppUserRepository users;

  FeedbackService(FeedbackReportRepository reports, FeedbackCommentRepository comments,
                  FeedbackNotificationRepository notifications, AppUserRepository users) {
    this.reports = reports;
    this.comments = comments;
    this.notifications = notifications;
    this.users = users;
  }

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

  @Transactional(readOnly = true)
  public List<FeedbackComment> comments(AuthService.UserProfile user, UUID reportId) {
    FeedbackReport report = accessibleReport(user, reportId);
    return comments.findByReportIdOrderByCreatedAtAsc(report.getId() == null ? reportId : report.getId());
  }

  @Transactional
  public FeedbackComment comment(AuthService.UserProfile user, UUID reportId, String body) {
    FeedbackReport report = accessibleReport(user, reportId);
    String content = requireComment(body);
    FeedbackComment saved = comments.save(new FeedbackComment(reportId, UUID.fromString(user.id()),
        user.email(), user.displayName(), content));
    notifyOtherParty(user, report, saved);
    return saved;
  }

  @Transactional
  public FeedbackReport resolve(AuthService.UserProfile user, UUID reportId, String body) {
    requireAdmin(user);
    FeedbackReport report = accessibleReport(user, reportId);
    String content = requireComment(body);
    report.resolve();
    FeedbackReport saved = reports.save(report);
    FeedbackComment resolution = comments.save(new FeedbackComment(reportId, UUID.fromString(user.id()),
        user.email(), user.displayName(), content));
    notifyOtherParty(user, report, resolution);
    return saved;
  }

  @Transactional(readOnly = true)
  public FeedbackNotificationFeed notificationFeed(AuthService.UserProfile user) {
    requireUser(user);
    UUID recipientId = UUID.fromString(user.id());
    return new FeedbackNotificationFeed(
        notifications.findTop30ByRecipientIdOrderByCreatedAtDesc(recipientId),
        notifications.countByRecipientIdAndReadAtIsNull(recipientId));
  }

  /** Claims unseen notifications in a DB transaction so multiple tabs/devices cannot toast twice. */
  @Transactional
  public List<FeedbackNotification> claimToasts(AuthService.UserProfile user) {
    requireUser(user);
    List<FeedbackNotification> unseen = notifications.findUnshownForUpdate(UUID.fromString(user.id()));
    Instant now = Instant.now();
    unseen.forEach(notification -> notification.markToastShown(now));
    notifications.saveAll(unseen);
    return unseen;
  }

  @Transactional
  public void markNotificationRead(AuthService.UserProfile user, UUID notificationId) {
    requireUser(user);
    UUID recipientId = UUID.fromString(user.id());
    FeedbackNotification notification = notifications.findById(notificationId)
        .filter(item -> recipientId.equals(item.getRecipientId()))
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    notification.markRead(Instant.now());
    notifications.save(notification);
  }

  private FeedbackReport accessibleReport(AuthService.UserProfile user, UUID reportId) {
    requireUser(user);
    FeedbackReport report = reports.findById(reportId)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    if (!canViewAll(user) && !UUID.fromString(user.id()).equals(report.getAuthorId())) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND);
    }
    return report;
  }

  private void notifyOtherParty(AuthService.UserProfile commenter, FeedbackReport report, FeedbackComment comment) {
    UUID commenterId = UUID.fromString(commenter.id());
    UUID authorId = report.getAuthorId();
    if (!commenterId.equals(authorId)) {
      saveNotification(authorId, report, comment);
      return;
    }
    if (canViewAll(commenter)) return;
    List<FeedbackNotification> pending = users.findAllByRole(Role.ADMIN).stream()
        .filter(admin -> !admin.getId().equals(commenterId))
        .map(admin -> new FeedbackNotification(admin.getId(), reportId(report, comment), comment.getId(),
            report.getTitle(), comment.getBody()))
        .toList();
    notifications.saveAll(pending);
  }

  private void saveNotification(UUID recipientId, FeedbackReport report, FeedbackComment comment) {
    notifications.save(new FeedbackNotification(recipientId, reportId(report, comment), comment.getId(),
        report.getTitle(), comment.getBody()));
  }

  private static UUID reportId(FeedbackReport report, FeedbackComment comment) {
    return report.getId() == null ? comment.getReportId() : report.getId();
  }

  private static String requireComment(String body) {
    if (body == null || body.isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "댓글 내용을 입력하세요.");
    return body.trim();
  }

  static boolean canViewAll(AuthService.UserProfile user) {
    return user.role() == Role.ADMIN || OWNER_EMAIL.equalsIgnoreCase(user.email());
  }

  private static void requireAdmin(AuthService.UserProfile user) {
    requireUser(user);
    if (!canViewAll(user)) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
  }

  private static void requireUser(AuthService.UserProfile user) {
    if (user == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다.");
  }

  public record FeedbackNotificationFeed(List<FeedbackNotification> notifications, long unreadCount) {}
}
