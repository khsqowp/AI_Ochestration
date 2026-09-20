package com.orchestration.training;

import java.util.Set;

/** Security-only boundary for conversational black-box practice. General engineering assessments stay on the dashboard. */
final class BlackBoxSecurityTopics {
  private static final Set<String> CODES=Set.of(
      "API_SECURITY", "AUTHENTICATION", "AUTHORIZATION", "BUSINESS_LOGIC", "SESSION_COOKIE",
      "XSS_CONTEXT", "CSRF", "INPUT_INTEGRITY", "URL_REDIRECT", "FILE_UPLOAD", "FILE_DOWNLOAD",
      "SQLI_QUERY", "SSRF", "CLIENT_STATE_TRUST", "ERROR_HANDLING", "WEB_HARDENING",
      "NETWORK_TLS", "SECRETS_MANAGEMENT", "LINUX_HARDENING", "CLOUD_IAM", "CLOUD_NETWORK",
      "CLOUD_DATA_SECURITY", "CONTAINER_SECURITY", "NETWORK_ACCESS_CONTROL", "NETWORK_DEFENSE",
      "SECURITY_MONITORING");
  private BlackBoxSecurityTopics() {}
  static boolean contains(String code) { return code!=null&&CODES.contains(code); }
}
