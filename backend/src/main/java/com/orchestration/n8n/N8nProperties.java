package com.orchestration.n8n;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.n8n")
public record N8nProperties(boolean dispatchEnabled, String fileIntakeWebhookUrl, String digestWebhookUrl, String archiveWebhookUrl, String webhookSecret, String tradingHaltedWebhookUrl) {}

