package com.orchestration;

import com.orchestration.auth.AuthProperties;
import com.orchestration.dolphin.DolphinProperties;
import com.orchestration.files.FileProperties;
import com.orchestration.n8n.N8nProperties;
import com.orchestration.tasks.LlmProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.EnableAsync;

/** Excludes {@link UserDetailsServiceAutoConfiguration}: auth here is fully custom (JWT cookie, verified
 * against {@code app_users}), so Spring Boot's default in-memory user — logged with a random password on
 * every boot — would otherwise sit around unused and unnecessarily noisy/confusing. */
@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
@EnableScheduling
@EnableAsync
@EnableConfigurationProperties({AuthProperties.class, DolphinProperties.class, FileProperties.class, N8nProperties.class, LlmProperties.class})
public class OrchestrationApplication {
  public static void main(String[] args) { SpringApplication.run(OrchestrationApplication.class, args); }
}
