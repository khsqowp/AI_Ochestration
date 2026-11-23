package com.orchestration.feedback;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.when;

import com.orchestration.auth.AppUserRepository;
import com.orchestration.auth.AuthService;
import com.orchestration.auth.Role;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class FeedbackServiceTest {
  @Mock private FeedbackReportRepository reports;
  @Mock private FeedbackCommentRepository comments;
  @Mock private FeedbackNotificationRepository notifications;
  @Mock private AppUserRepository users;
  private FeedbackService service() { return new FeedbackService(reports, comments, notifications, users); }

  @Test
  void regularUserSeesOnlyOwnReports() {
    UUID userId = UUID.randomUUID();
    AuthService.UserProfile user = new AuthService.UserProfile(userId.toString(), "user@example.com", "User", Role.USER);
    when(reports.findByAuthorIdOrderByCreatedAtDesc(userId)).thenReturn(List.of());

    assertThat(service().list(user)).isEmpty();
    verify(reports).findByAuthorIdOrderByCreatedAtDesc(userId);
  }

  @Test
  void ownerEmailSeesAllReportsEvenWithUserRole() {
    AuthService.UserProfile owner = new AuthService.UserProfile(UUID.randomUUID().toString(), "kknd03255@gmail.com", "Owner", Role.USER);
    when(reports.findAllByOrderByCreatedAtDesc()).thenReturn(List.of());

    assertThat(service().list(owner)).isEmpty();
    verify(reports).findAllByOrderByCreatedAtDesc();
  }

  @Test
  void adminOwnerSeesAllReports() {
    AuthService.UserProfile owner = new AuthService.UserProfile(UUID.randomUUID().toString(), "owner@local.dev", "Owner", Role.ADMIN);
    when(reports.findAllByOrderByCreatedAtDesc()).thenReturn(List.of());

    assertThat(service().list(owner)).isEmpty();
    verify(reports).findAllByOrderByCreatedAtDesc();
  }

  @Test
  void submitStoresAuthenticatedAuthorAndContent() {
    UUID userId = UUID.randomUUID();
    AuthService.UserProfile user = new AuthService.UserProfile(userId.toString(), "user@example.com", "User", Role.USER);
    when(reports.save(any(FeedbackReport.class))).thenAnswer(invocation -> invocation.getArgument(0));

    FeedbackReport saved = service().submit(user, "버튼 오류", "저장 버튼을 누르면 오류가 발생합니다.");

    assertThat(saved.getAuthorId()).isEqualTo(userId);
    assertThat(saved.getAuthorEmail()).isEqualTo("user@example.com");
    assertThat(saved.getTitle()).isEqualTo("버튼 오류");
    assertThat(saved.getBody()).contains("저장 버튼");
  }

  @Test
  void commentsAreScopedToReportAndNotifyOtherPartyOnce() {
    UUID authorId = UUID.randomUUID();
    UUID adminId = UUID.randomUUID();
    FeedbackReport report = new FeedbackReport(authorId, "user@example.com", "User", "제목", "본문");
    AuthService.UserProfile admin = new AuthService.UserProfile(adminId.toString(), "owner@example.com", "Owner", Role.ADMIN);
    when(reports.findById(any())).thenReturn(java.util.Optional.of(report));
    when(comments.save(any(FeedbackComment.class))).thenAnswer(invocation -> invocation.getArgument(0));
    when(notifications.save(any(FeedbackNotification.class))).thenAnswer(invocation -> invocation.getArgument(0));

    FeedbackComment saved = service().comment(admin, reportId(report), "조치 내용을 확인했습니다.");

    assertThat(saved.getBody()).isEqualTo("조치 내용을 확인했습니다.");
    verify(notifications).save(any(FeedbackNotification.class));
  }

  @Test
  void userCannotAccessAnotherUsersReportThread() {
    UUID ownerId = UUID.randomUUID();
    FeedbackReport report = new FeedbackReport(ownerId, "owner@example.com", "Owner", "제목", "본문");
    AuthService.UserProfile other = new AuthService.UserProfile(UUID.randomUUID().toString(), "other@example.com", "Other", Role.USER);
    when(reports.findById(any())).thenReturn(java.util.Optional.of(report));

    org.assertj.core.api.Assertions.assertThatThrownBy(() -> service().comments(other, reportId(report)))
        .isInstanceOf(ResponseStatusException.class)
        .extracting(error -> ((ResponseStatusException) error).getStatusCode())
        .isEqualTo(HttpStatus.NOT_FOUND);
    verify(comments, never()).findByReportIdOrderByCreatedAtAsc(any());
  }

  @Test
  void resolvingRequiresCommentAndStoresResolutionReply() {
    UUID authorId = UUID.randomUUID();
    UUID adminId = UUID.randomUUID();
    FeedbackReport report = new FeedbackReport(authorId, "user@example.com", "User", "제목", "본문");
    AuthService.UserProfile admin = new AuthService.UserProfile(adminId.toString(), "owner@example.com", "Owner", Role.ADMIN);
    when(reports.findById(any())).thenReturn(java.util.Optional.of(report));
    when(reports.save(any(FeedbackReport.class))).thenAnswer(invocation -> invocation.getArgument(0));
    when(comments.save(any(FeedbackComment.class))).thenAnswer(invocation -> invocation.getArgument(0));
    when(notifications.save(any(FeedbackNotification.class))).thenAnswer(invocation -> invocation.getArgument(0));

    FeedbackReport resolved = service().resolve(admin, reportId(report), "수정 배포를 완료했습니다.");

    assertThat(resolved.getStatus()).isEqualTo(FeedbackStatus.RESOLVED);
    verify(comments).save(any(FeedbackComment.class));
  }

  @Test
  void blankResolutionCommentIsRejected() {
    AuthService.UserProfile admin = new AuthService.UserProfile(UUID.randomUUID().toString(), "owner@example.com", "Owner", Role.ADMIN);
    org.assertj.core.api.Assertions.assertThatThrownBy(() -> service().resolve(admin, UUID.randomUUID(), "  "))
        .isInstanceOf(ResponseStatusException.class);
  }

  @Test
  void claimingToastsMarksEachNotificationShown() {
    UUID userId = UUID.randomUUID();
    FeedbackNotification notification = new FeedbackNotification(userId, UUID.randomUUID(), UUID.randomUUID(), "제목", "댓글 내용");
    when(notifications.findUnshownForUpdate(userId)).thenReturn(new ArrayList<>(List.of(notification)));
    AuthService.UserProfile user = new AuthService.UserProfile(userId.toString(), "user@example.com", "User", Role.USER);

    assertThat(service().claimToasts(user)).hasSize(1);
    assertThat(notification.getToastShownAt()).isNotNull();
    verify(notifications).saveAll(any());
  }

  private static UUID reportId(FeedbackReport report) {
    // The report's database ID is assigned by JPA; tests use a stable mocked lookup identifier.
    return UUID.nameUUIDFromBytes(report.getTitle().getBytes(java.nio.charset.StandardCharsets.UTF_8));
  }
}
