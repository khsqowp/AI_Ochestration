package com.orchestration.training;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class BlackBoxSecurityTopicsTest {
  @Test
  void includesDedicatedWebInfrastructureCloudAndDefenseSecurityTopics() {
    assertThat(BlackBoxSecurityTopics.contains("API_SECURITY")).isTrue();
    assertThat(BlackBoxSecurityTopics.contains("SQLI_QUERY")).isTrue();
    assertThat(BlackBoxSecurityTopics.contains("CSRF")).isTrue();
    assertThat(BlackBoxSecurityTopics.contains("FILE_DOWNLOAD")).isTrue();
    assertThat(BlackBoxSecurityTopics.contains("WEB_HARDENING")).isTrue();
    assertThat(BlackBoxSecurityTopics.contains("LINUX_HARDENING")).isTrue();
    assertThat(BlackBoxSecurityTopics.contains("CLOUD_IAM")).isTrue();
    assertThat(BlackBoxSecurityTopics.contains("CLOUD_NETWORK")).isTrue();
    assertThat(BlackBoxSecurityTopics.contains("CONTAINER_SECURITY")).isTrue();
    assertThat(BlackBoxSecurityTopics.contains("NETWORK_DEFENSE")).isTrue();
  }

  @Test
  void excludesGenericDevelopmentAndOperationsAssessments() {
    assertThat(BlackBoxSecurityTopics.contains("LINUX_SERVER")).isFalse();
    assertThat(BlackBoxSecurityTopics.contains("DOCKER_DEPLOY")).isFalse();
    assertThat(BlackBoxSecurityTopics.contains("JAVA_SPRING")).isFalse();
    assertThat(BlackBoxSecurityTopics.contains("SQL_DML")).isFalse();
  }
}
