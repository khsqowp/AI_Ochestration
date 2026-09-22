package com.orchestration.auth;

import jakarta.servlet.DispatcherType;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

/**
 * Path-level authorization, down to individual endpoints rather than whole controllers, so a "read the
 * archive" feature and a "mutate the archive" feature on the same base path can carry different roles.
 * While {@code app.auth.enabled=false} (local dev default) everything stays open, matching the zero-friction
 * dev workflow this app already had before accounts existed. Once enabled, only {@code /api/auth/**} is
 * reachable unauthenticated; every other rule below is an explicit allow — nothing is open by omission.
 */
@Configuration
@EnableWebSecurity
class SecurityConfig {

  @Bean
  PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(); }

  @Bean
  SecurityFilterChain filterChain(HttpSecurity http, AuthProperties properties, AuthService authService) throws Exception {
    http.csrf(csrf -> csrf.disable()) // stateless JWT cookie with SameSite=Lax; no server-side form session to fixate
        .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .exceptionHandling(handling -> handling
            .authenticationEntryPoint((request, response, exception) -> jsonError(response, 401, "인증이 필요합니다."))
            .accessDeniedHandler((request, response, exception) -> jsonError(response, 403, "권한이 없습니다.")));

    if (!properties.enabled()) {
      http.authorizeHttpRequests(auth -> auth.anyRequest().permitAll());
      return http.build();
    }

    // High #2, CSRF defense-in-depth on top of SameSite=Lax -- runs before the JWT filter so an
    // untrusted cross-site mutating request is rejected before it even gets a chance at authentication.
    http.addFilterBefore(new OriginValidationFilter(properties), UsernamePasswordAuthenticationFilter.class);
    http.addFilterBefore(new JwtAuthenticationFilter(authService), UsernamePasswordAuthenticationFilter.class);
    http.authorizeHttpRequests(auth -> auth
        // SSE 스트리밍 응답(예: /api/dolphin/chat)은 StreamingResponseBody 로 async 재디스패치되는데,
        // OncePerRequestFilter 는 기본적으로 async dispatch 에서 안 돌아 SecurityContext 가 비고,
        // Spring Security 6 의 AuthorizationFilter 는 async dispatch 도 검사해 Access Denied 가 난다.
        // 최초 REQUEST dispatch 에서 이미 인가된 요청이므로 async 재디스패치는 통과시킨다.
        .dispatcherTypeMatchers(DispatcherType.ASYNC, DispatcherType.ERROR, DispatcherType.FORWARD).permitAll()
        // pre-login and static/bootstrap endpoints
        .requestMatchers("/api/auth/**", "/", "/index.html", "/assets/**", "/build-info.json", "/actuator/health").permitAll()

        // 파일 아카이브 — read is USER+ADMIN, maintenance/dedup mutation is ADMIN-only
        .requestMatchers(HttpMethod.GET, "/api/archive/files", "/api/archive/content", "/api/archive/search", "/api/archive/graph").authenticated()
        .requestMatchers("/api/archive/**").hasRole("ADMIN")

        // 수집 사이트 — 2026-09-22부터 일반 계정 노출 범위 축소로 조회 포함 전체 ADMIN-only.
        .requestMatchers("/api/research-sources/**").hasRole("ADMIN")

        // 수집 제안 사이트 — entirely ADMIN-only, including viewing candidates
        .requestMatchers("/api/source-candidates/**").hasRole("ADMIN")

        // 에이전트(작업 현황) — read is USER+ADMIN; creating/retrying a task is ADMIN-only
        .requestMatchers(HttpMethod.GET, "/api/tasks/**").authenticated()
        .requestMatchers("/api/tasks/**").hasRole("ADMIN")

        // 보안 캘린더 — fully read-only for everyone already; USER+ADMIN can view
        .requestMatchers(HttpMethod.GET, "/api/security-calendar/**").authenticated()

        // 개인 할 일 목록 — 계정별로 스코프되어 있어 USER+ADMIN 모두 자신의 항목을 읽고 쓸 수 있어야 함
        .requestMatchers("/api/todos/**").authenticated()

        // 음료 주문 — 공개 주문 페이지는 계정 없이 이름+PIN 으로 본인 주문만 조회/작성
        .requestMatchers("/api/orders/mine").permitAll()
        // 대시보드 주문판(전체 조회·구매 체크)은 ADMIN 전용
        .requestMatchers("/api/orders/**").hasRole("ADMIN")

        // 접근기록 — nginx mirror 서브요청(내부망에서만, 컨트롤러가 소켓 피어 검사)
        .requestMatchers("/api/internal/**").permitAll()

        // 로컬 LLM — 인증된 USER 도 사용
        .requestMatchers("/api/dolphin/**").authenticated()
        // AI 토론 — 2026-09-22부터 일반 계정 노출 범위 축소로 ADMIN-only.
        .requestMatchers("/api/debate/**").hasRole("ADMIN")

        // 역량 강화 — 2026-09-22부터 일반 계정 노출 범위 축소로 ADMIN-only.
        .requestMatchers("/api/training/**").hasRole("ADMIN")

        // 투자 데이터 — anyRequest catch-all 로도 덮이지만, 롤 경계를 명시적으로 고정해 회귀를 막는다
        .requestMatchers("/api/trading/**").hasRole("ADMIN")

        // 치트시트 has no backend endpoints — nothing to declare here

        // everything else (usage, digest, file upload, RAG ask, user admin) is ADMIN-only
        .requestMatchers("/api/admin/**").hasRole("ADMIN")
        .anyRequest().hasRole("ADMIN"));
    return http.build();
  }

  private static void jsonError(jakarta.servlet.http.HttpServletResponse response, int status, String message) throws java.io.IOException {
    response.setStatus(status);
    response.setContentType(MediaType.APPLICATION_JSON_VALUE);
    response.setCharacterEncoding("UTF-8");
    response.getWriter().write("{\"message\":\"" + message + "\"}");
  }
}
