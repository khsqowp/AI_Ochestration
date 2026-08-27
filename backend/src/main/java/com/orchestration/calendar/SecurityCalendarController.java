package com.orchestration.calendar;

import java.time.YearMonth;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/security-calendar")
public class SecurityCalendarController {
  private static final int DEFAULT_TIMELINE_LIMIT = 60;
  private final SecurityCalendarService calendar;

  SecurityCalendarController(SecurityCalendarService calendar) { this.calendar = calendar; }

  @GetMapping
  public List<Response> forMonth(@RequestParam(required = false) String month) {
    YearMonth target = month == null || month.isBlank() ? YearMonth.now() : YearMonth.parse(month);
    return calendar.forMonth(target).stream().map(Response::from).toList();
  }

  /** Ordered by lastUpdatedDate desc so a story with a fresh follow-up keeps rising to the top instead of
   * staying pinned to its original occurrence date. */
  @GetMapping("/timeline")
  public List<TimelineEntry> timeline(@RequestParam(required = false) Integer limit) {
    return calendar.timeline(limit == null ? DEFAULT_TIMELINE_LIMIT : limit).stream()
        .map(event -> new TimelineEntry(Response.from(event), calendar.updatesFor(event).stream().map(UpdateResponse::from).toList()))
        .toList();
  }

  record Response(String id, String eventDate, String lastUpdatedDate, SecurityCalendarCategory category, String title, String summary, String sourceName, String sourceUrl) {
    static Response from(SecurityCalendarEvent event) {
      return new Response(event.getId().toString(), event.getEventDate().toString(), event.getLastUpdatedDate().toString(), event.getCategory(), event.getTitle(), event.getSummary(), event.getSourceName(), event.getSourceUrl());
    }
  }
  record UpdateResponse(String updateDate, String summary, String sourceName, String sourceUrl) {
    static UpdateResponse from(SecurityCalendarUpdate update) {
      return new UpdateResponse(update.getUpdateDate().toString(), update.getSummary(), update.getSourceName(), update.getSourceUrl());
    }
  }
  record TimelineEntry(Response event, List<UpdateResponse> updates) {}
}
