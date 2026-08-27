package com.orchestration.calendar;

import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "security_calendar_events", indexes = {
    @Index(name = "idx_security_calendar_events_event_date", columnList = "event_date"),
    @Index(name = "idx_security_calendar_events_last_updated_date", columnList = "last_updated_date")
}, uniqueConstraints = {
    // Two collection tasks (different sources reporting the same story) can both run
    // SecurityCalendarService's exists-check before either commits its insert -- this constraint is the
    // real guard against the resulting duplicate row; the in-memory exists check is just a fast pre-filter.
    @UniqueConstraint(name = "uq_security_calendar_events_date_title", columnNames = {"event_date", "title"})
})
public class SecurityCalendarEvent {
  @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
  @Column(nullable = false) private LocalDate eventDate;
  // Bumped forward whenever a later collection reports a follow-up on this same story (e.g. remediation,
  // attribution). The month grid still keys off eventDate (when it first happened), but the timeline feed
  // sorts by this so a story with fresh news keeps rising back to the top instead of staying stuck at its
  // original occurrence date.
  @Column(nullable = false) private LocalDate lastUpdatedDate;
  @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20) private SecurityCalendarCategory category;
  @Column(nullable = false, length = 200) private String title;
  @Lob @Column(columnDefinition = "TEXT") private String summary;
  @Column(length = 120) private String sourceName;
  @Column(length = 2048) private String sourceUrl;
  @Column(nullable = false) private Instant createdAt = Instant.now();

  protected SecurityCalendarEvent() {}
  SecurityCalendarEvent(LocalDate eventDate, SecurityCalendarCategory category, String title, String summary, String sourceName, String sourceUrl) {
    this.eventDate = eventDate; this.lastUpdatedDate = eventDate; this.category = category; this.title = title; this.summary = summary; this.sourceName = sourceName; this.sourceUrl = sourceUrl;
  }

  public UUID getId() { return id; }
  public LocalDate getEventDate() { return eventDate; }
  public LocalDate getLastUpdatedDate() { return lastUpdatedDate; }
  public SecurityCalendarCategory getCategory() { return category; }
  public String getTitle() { return title; }
  public String getSummary() { return summary; }
  public String getSourceName() { return sourceName; }
  public String getSourceUrl() { return sourceUrl; }
  public Instant getCreatedAt() { return createdAt; }
  void bumpUpdated(LocalDate date) { if (date.isAfter(lastUpdatedDate)) lastUpdatedDate = date; }
}
