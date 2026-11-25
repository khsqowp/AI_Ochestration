package com.orchestration.diag;

import com.orchestration.auth.AuthService;
import com.orchestration.auth.Role;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/diag/cve-poc")
class CvePocController {
  private static final String SESSION_COOKIE = "orchestration_session";
  private final CvePocService service;
  private final AuthService auth;

  CvePocController(CvePocService service, AuthService auth) { this.service = service; this.auth = auth; }

  /** AI 요약은 이 서버 비용으로 Gemini를 호출하므로 ADMIN만 켤 수 있다 — 다른 계정이 요청해도 무시하고 평범한 NVD/PoC 조회로 처리한다. */
  @PostMapping
  CvePocService.Response lookup(@RequestBody Request request,
      @AuthenticationPrincipal AuthService.UserProfile principal,
      @CookieValue(value = SESSION_COOKIE, required = false) String token) {
    boolean isAdmin = isAdmin(principal, token);
    boolean includeAiSummary = request != null && request.includeAiSummary() && isAdmin;
    return service.lookup(request == null ? null : request.cveId(), includeAiSummary);
  }

  private boolean isAdmin(AuthService.UserProfile principal, String token) {
    AuthService.UserProfile user = principal != null ? principal : auth.validate(token).orElse(null);
    return user != null && user.role() == Role.ADMIN;
  }

  record Request(String cveId, boolean includeAiSummary) {}
}
