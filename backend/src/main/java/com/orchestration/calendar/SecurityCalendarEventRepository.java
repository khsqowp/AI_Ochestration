package com.orchestration.calendar;

import java.time.LocalDate;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

interface SecurityCalendarEventRepository extends JpaRepository<SecurityCalendarEvent, java.util.UUID> {
  List<SecurityCalendarEvent> findByEventDateBetweenOrderByEventDateAsc(LocalDate from, LocalDate to);
  boolean existsByEventDateAndTitle(LocalDate eventDate, String title);
  /** Recent-story candidates offered to the extraction prompt so it can recognize a follow-up instead of
   * filing a duplicate new entry. */
  List<SecurityCalendarEvent> findByEventDateGreaterThanEqualOrderByEventDateDesc(LocalDate cutoff);
  List<SecurityCalendarEvent> findAllByOrderByLastUpdatedDateDesc();
}
