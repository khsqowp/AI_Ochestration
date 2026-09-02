package com.orchestration.dolphin;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app.dolphin")
public record DolphinProperties(String chatUrl) {
  public DolphinProperties {
    if (chatUrl == null || chatUrl.isBlank()) {
      chatUrl = "http://host.docker.internal:7777";
    }
  }
}
