package com.orchestration.notebook;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.notebook")
public record NotebookProperties(String imagesPath) {}
