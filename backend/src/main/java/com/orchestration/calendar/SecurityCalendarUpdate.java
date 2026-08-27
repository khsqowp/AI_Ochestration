package com.orchestration.calendar;

import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** A follow-up report on an existing {@link SecurityCalendarEvent} (e.g. remediation, attribution, impact
 * update) found in a later collection. Kept as its own row rather than overwriting the parent event's
 * summary, so the original report isn't lost once news moves on. */
@Entity
@Table(name = "security_calendar_updates")
public class SecurityCalendarUpdate {
  @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
  @ManyToOne(optional = false) @JoinColumn(name = "event_id", nullable = false) private SecurityCalendarEvent event;
  @Column(nullable = false) private LocalDate updateDate;
  @Lob @Column(columnDefinition = "TEXT") private String summary;
  @Column(length = 120) private String sourceName;
  @Column(length = 2048) private String sourceUrl;
  @Column(nullable = false) private Instant createdAt = Instant.now();

  protected SecurityCalendarUpdate() {}
  SecurityCalendarUpdate(SecurityCalendarEvent event, LocalDate updateDate, String summary, String sourceName, String sourceUrl) {
    this.event = event; this.updateDate = updateDate; this.summary = summary; this.sourceName = sourceName; this.sourceUrl = sourceUrl;
  }

  public UUID getId() { return id; }
  public SecurityCalendarEvent getEvent() { return event; }
  public LocalDate getUpdateDate() { return updateDate; }
  public String getSummary() { return summary; }
  public String getSourceName() { return sourceName; }
  public String getSourceUrl() { return sourceUrl; }
  public Instant getCreatedAt() { return createdAt; }
}
