package com.orchestration.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.auth")
public record AuthProperties(
    boolean enabled,
    boolean cookieSecure,
    String devAdminEmail,
    String devAdminName,
    String adminId,
    String adminPassword,
    String jwtSecret) {}

