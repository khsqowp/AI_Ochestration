package com.orchestration.diag;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "diag_network_runs")
class NetworkDiagnosticRunRecord {
  @Id @Column(columnDefinition = "BINARY(16)") private UUID id;
  @Column(name = "requested_by_user_id", nullable = false, columnDefinition = "BINARY(16)") private UUID requestedByUserId;
  @Column(nullable = false, length = 255) private String target;
  @Column(nullable = false, length = 64) private String ports;
  @Column(length = 255) private String proxy;
  @Column(name = "timeout_ms", nullable = false) private int timeoutMs;
  /** Jackson-serialized List<Step>, same LONGTEXT convention as RagConversation. */
  @Lob @Column(name = "steps_json", nullable = false, columnDefinition = "LONGTEXT") private String stepsJson;
  @Column(nullable = false, columnDefinition = "TEXT") private String verdict;
  @Column(name = "created_at", nullable = false) private Instant createdAt;

  protected NetworkDiagnosticRunRecord() {}
  NetworkDiagnosticRunRecord(UUID requestedByUserId, String target, String ports, String proxy, int timeoutMs, String stepsJson, String verdict) {
    this.id = UUID.randomUUID(); this.requestedByUserId = requestedByUserId; this.target = target; this.ports = ports;
    this.proxy = proxy; this.timeoutMs = timeoutMs; this.stepsJson = stepsJson; this.verdict = verdict; this.createdAt = Instant.now();
  }
  UUID getId() { return id; }
  UUID getRequestedByUserId() { return requestedByUserId; }
  String getTarget() { return target; }
  String getPorts() { return ports; }
  String getProxy() { return proxy; }
  int getTimeoutMs() { return timeoutMs; }
  String getStepsJson() { return stepsJson; }
  String getVerdict() { return verdict; }
  Instant getCreatedAt() { return createdAt; }
}
