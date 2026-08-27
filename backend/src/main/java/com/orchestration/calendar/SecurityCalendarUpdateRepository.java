package com.orchestration.calendar;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

interface SecurityCalendarUpdateRepository extends JpaRepository<SecurityCalendarUpdate, UUID> {
  List<SecurityCalendarUpdate> findByEventOrderByUpdateDateAsc(SecurityCalendarEvent event);
  boolean existsByEventAndSummary(SecurityCalendarEvent event, String summary);
}
