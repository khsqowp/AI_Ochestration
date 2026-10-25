package com.orchestration.linkcollect;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.linkcollect")
public record LinkCollectProperties(String baseUrl, String token) {}
