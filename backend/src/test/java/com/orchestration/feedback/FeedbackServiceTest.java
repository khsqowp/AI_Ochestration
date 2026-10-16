package com.orchestration.feedback;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.orchestration.auth.AuthService;
import com.orchestration.auth.Role;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class FeedbackServiceTest {
  @Mock private FeedbackReportRepository reports;
  private FeedbackService service() { return new FeedbackService(reports); }

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
}
