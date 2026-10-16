package com.orchestration.feedback;

import com.orchestration.auth.AuthService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import org.springframework.web.bind.annotation.CookieValue;
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

  private AuthService.UserProfile currentUser(AuthService.UserProfile principal, String token) {
    if (principal != null) return principal;
    return auth.validate(token).orElse(null);
  }

  record CreateRequest(@NotBlank @Size(max = 160) String title,
                       @NotBlank @Size(max = 10000) String body) {}
  record ReportResponse(String id, String authorEmail, String authorDisplayName,
                        String title, String body, Instant createdAt) {
    static ReportResponse from(FeedbackReport report) {
      return new ReportResponse(report.getId().toString(), report.getAuthorEmail(),
          report.getAuthorDisplayName(), report.getTitle(), report.getBody(), report.getCreatedAt());
    }
  }
}
