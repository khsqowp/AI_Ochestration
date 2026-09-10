package com.orchestration.access;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** One inbound hit — an edge request mirrored by nginx (landing, /order, /login, path probes) or an
 * {@code /api/**} call caught by {@link AccessLogFilter}. Powers the 관리 › 접근기록 map. */
@Entity
@Table(name = "access_event", indexes = {
    @Index(name = "idx_access_event_ts", columnList = "ts"),
    @Index(name = "idx_access_event_ip", columnList = "ip"),
})
public class AccessEvent {
  @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;

  @Column(nullable = false) private Instant ts = Instant.now();
  @Column(nullable = false, length = 45) private String ip;
  @Column(length = 8) private String method;
  @Column(length = 512) private String path;
  /** HTTP status when known ({@code /api/**}); -1 for edge mirror hits (status not available pre-response). */
  @Column(nullable = false) private int status = -1;
  @Column(length = 512) private String userAgent;
  /** Session cookie was present on the request (a login attempt / an authenticated poke). */
  @Column(name = "had_session", nullable = false) private boolean hadSession = false;
  /** "edge" (nginx mirror) or "api" (filter). */
  @Column(length = 8, nullable = false) private String source = "edge";

  protected AccessEvent() {}

  public AccessEvent(String ip, String method, String path, int status, String userAgent, boolean hadSession, String source) {
    this.ip = ip;
    this.method = method;
    this.path = trim(path, 512);
    this.status = status;
    this.userAgent = trim(userAgent, 512);
    this.hadSession = hadSession;
    this.source = source;
  }

  private static String trim(String v, int max) {
    if (v == null) return null;
    return v.length() > max ? v.substring(0, max) : v;
  }

  public UUID getId() { return id; }
  public Instant getTs() { return ts; }
  public String getIp() { return ip; }
  public String getMethod() { return method; }
  public String getPath() { return path; }
  public int getStatus() { return status; }
  public String getUserAgent() { return userAgent; }
  public boolean isHadSession() { return hadSession; }
  public String getSource() { return source; }
}
