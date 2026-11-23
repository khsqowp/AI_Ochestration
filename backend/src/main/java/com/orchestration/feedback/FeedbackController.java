package com.orchestration.feedback;

import com.orchestration.auth.AuthService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/feedback")
public class FeedbackController {
  private static final String SESSION_COOKIE = "orchestration_session";
  private final FeedbackService service;
  private final AuthService auth;
  FeedbackController(FeedbackService service, AuthService auth) { this.service = service; this.auth = auth; }

  @GetMapping
  public List<ReportResponse> list(@AuthenticationPrincipal AuthService.UserProfile principal,
                                   @CookieValue(value = SESSION_COOKIE, required = false) String token) {
    return service.list(currentUser(principal, token)).stream().map(ReportResponse::from).toList();
  }

  @PostMapping @ResponseStatus(HttpStatus.CREATED)
  public ReportResponse submit(@AuthenticationPrincipal AuthService.UserProfile principal,
                               @CookieValue(value = SESSION_COOKIE, required = false) String token,
                               @Valid @RequestBody CreateRequest request) {
    return ReportResponse.from(service.submit(currentUser(principal, token), request.title(), request.body()));
  }

  @GetMapping("/{reportId}/comments")
  public List<CommentResponse> comments(@AuthenticationPrincipal AuthService.UserProfile principal,
                                        @CookieValue(value = SESSION_COOKIE, required = false) String token,
                                        @PathVariable UUID reportId) {
    return service.comments(currentUser(principal, token), reportId).stream().map(CommentResponse::from).toList();
  }

  @PostMapping("/{reportId}/comments") @ResponseStatus(HttpStatus.CREATED)
  public CommentResponse comment(@AuthenticationPrincipal AuthService.UserProfile principal,
                                 @CookieValue(value = SESSION_COOKIE, required = false) String token,
                                 @PathVariable UUID reportId, @Valid @RequestBody CommentRequest request) {
    return CommentResponse.from(service.comment(currentUser(principal, token), reportId, request.body()));
  }

  @PostMapping("/{reportId}/resolve")
  public ReportResponse resolve(@AuthenticationPrincipal AuthService.UserProfile principal,
                                @CookieValue(value = SESSION_COOKIE, required = false) String token,
                                @PathVariable UUID reportId, @Valid @RequestBody CommentRequest request) {
    return ReportResponse.from(service.resolve(currentUser(principal, token), reportId, request.body()));
  }

  @GetMapping("/notifications")
  public NotificationFeedResponse notifications(@AuthenticationPrincipal AuthService.UserProfile principal,
                                                @CookieValue(value = SESSION_COOKIE, required = false) String token) {
    FeedbackService.FeedbackNotificationFeed feed = service.notificationFeed(currentUser(principal, token));
    return new NotificationFeedResponse(feed.notifications().stream().map(NotificationResponse::from).toList(), feed.unreadCount());
  }

  @PostMapping("/notifications/toasts")
  public List<NotificationResponse> claimToasts(@AuthenticationPrincipal AuthService.UserProfile principal,
                                                @CookieValue(value = SESSION_COOKIE, required = false) String token) {
    return service.claimToasts(currentUser(principal, token)).stream().map(NotificationResponse::from).toList();
  }

  @PatchMapping("/notifications/{notificationId}/read") @ResponseStatus(HttpStatus.NO_CONTENT)
  public void markNotificationRead(@AuthenticationPrincipal AuthService.UserProfile principal,
                                   @CookieValue(value = SESSION_COOKIE, required = false) String token,
                                   @PathVariable UUID notificationId) {
    service.markNotificationRead(currentUser(principal, token), notificationId);
  }

  private AuthService.UserProfile currentUser(AuthService.UserProfile principal, String token) {
    if (principal != null) return principal;
    return auth.validate(token).orElse(null);
  }

  record CreateRequest(@NotBlank @Size(max = 160) String title,
                       @NotBlank @Size(max = 10000) String body) {}
  record CommentRequest(@NotBlank @Size(max = 5000) String body) {}
  record ReportResponse(String id, String authorEmail, String authorDisplayName,
                        String title, String body, FeedbackStatus status, Instant createdAt) {
    static ReportResponse from(FeedbackReport report) {
      return new ReportResponse(report.getId().toString(), report.getAuthorEmail(),
          report.getAuthorDisplayName(), report.getTitle(), report.getBody(), report.getStatus(), report.getCreatedAt());
    }
  }
  record CommentResponse(String id, String reportId, String authorId, String authorEmail,
                         String authorDisplayName, String body, Instant createdAt) {
    static CommentResponse from(FeedbackComment comment) {
      return new CommentResponse(comment.getId().toString(), comment.getReportId().toString(),
          comment.getAuthorId().toString(), comment.getAuthorEmail(), comment.getAuthorDisplayName(),
          comment.getBody(), comment.getCreatedAt());
    }
  }
  record NotificationResponse(String id, String reportId, String title, String preview,
                              Instant createdAt, Instant readAt) {
    static NotificationResponse from(FeedbackNotification notification) {
      return new NotificationResponse(notification.getId().toString(), notification.getReportId().toString(),
          notification.getReportTitle(), notification.getCommentPreview(), notification.getCreatedAt(), notification.getReadAt());
    }
  }
  record NotificationFeedResponse(List<NotificationResponse> items, long unreadCount) {}
}
