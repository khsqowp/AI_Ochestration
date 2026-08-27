package com.orchestration.tasks;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.llm")
public record LlmProperties(
    String geminiApiKey,
    String deepseekApiKey,
    String openaiApiKey,
    String geminiModel,
    String deepseekModel,
    String openaiModel,
    String openaiEmbeddingModel,
    int geminiTimeoutSeconds,
    int decisionTimeoutSeconds,
    int longFormTimeoutSeconds,
    int maxProviderAttempts,
    int maxTaskCharacters,
    int archiveMaxOutputTokens,
    java.math.BigDecimal geminiInputUsdPerMillion,
    java.math.BigDecimal geminiOutputUsdPerMillion,
    java.math.BigDecimal deepseekInputUsdPerMillion,
    java.math.BigDecimal deepseekOutputUsdPerMillion,
    java.math.BigDecimal openaiInputUsdPerMillion,
    java.math.BigDecimal openaiOutputUsdPerMillion,
    String bedrockApiKey,
    String bedrockModel,
    String bedrockRegion,
    java.math.BigDecimal bedrockInputUsdPerMillion,
    java.math.BigDecimal bedrockOutputUsdPerMillion) {}
