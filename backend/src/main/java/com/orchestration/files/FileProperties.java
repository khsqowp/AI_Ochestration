package com.orchestration.files;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.files")
public record FileProperties(String originalsPath, String obsidianPath, long scanDelayMs) {}

