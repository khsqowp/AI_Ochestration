package com.orchestration.auth;

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

    http.addFilterBefore(new JwtAuthenticationFilter(authService), UsernamePasswordAuthenticationFilter.class);
    http.authorizeHttpRequests(auth -> auth
        // pre-login and static/bootstrap endpoints
        .requestMatchers("/api/auth/**", "/", "/index.html", "/assets/**", "/build-info.json", "/actuator/health").permitAll()

        // 파일 아카이브 — read is USER+ADMIN, maintenance/dedup mutation is ADMIN-only
        .requestMatchers(HttpMethod.GET, "/api/archive/files", "/api/archive/content", "/api/archive/search", "/api/archive/graph").authenticated()
        .requestMatchers("/api/archive/**").hasRole("ADMIN")

        // 수집 사이트 — listing is USER+ADMIN ("조회만"); add/edit/delete/collect-now is ADMIN-only
        .requestMatchers(HttpMethod.GET, "/api/research-sources", "/api/research-sources/due").authenticated()
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

        // 치트시트 has no backend endpoints — nothing to declare here

        // everything else (usage, trading, digest, file upload, RAG ask, user admin) is ADMIN-only
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
