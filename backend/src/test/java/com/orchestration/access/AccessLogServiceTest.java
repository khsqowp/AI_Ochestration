package com.orchestration.access;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class AccessLogServiceTest {

  @Mock private AccessEventRepository events;
  @Mock private IpLocationRepository locations;
  @Mock private GeoLocator geo;

  private AccessLogService service() { return new AccessLogService(events, locations, geo); }

  private static AccessLogService.Hit hit(String email, String displayName) {
    return new AccessLogService.Hit("1.2.3.4", "GET", "/api/tasks", 200, "ua", true, "api",
        email, displayName, null, null, null, null, null);
  }

  @Test
  void record_savesTheAuthenticatedUsersEmailAndDisplayName() {
    service().record(hit("skshieldus@example.com", "SK쉴더스"));

    var captor = org.mockito.ArgumentCaptor.forClass(AccessEvent.class);
    org.mockito.Mockito.verify(events).save(captor.capture());
    assertThat(captor.getValue().getUserEmail()).isEqualTo("skshieldus@example.com");
    assertThat(captor.getValue().getUserDisplayName()).isEqualTo("SK쉴더스");
  }

  @Test
  void record_leavesUserFieldsNull_forAnonymousHits() {
    service().record(hit(null, null));

    var captor = org.mockito.ArgumentCaptor.forClass(AccessEvent.class);
    org.mockito.Mockito.verify(events).save(captor.capture());
    assertThat(captor.getValue().getUserEmail()).isNull();
    assertThat(captor.getValue().getUserDisplayName()).isNull();
  }

  @Test
  void summary_aggregatesUsers_sortedByMostRecentActivity() {
    when(locations.findAll()).thenReturn(List.of());
    when(events.aggregateByIp()).thenReturn(List.of());
    when(events.findAllByOrderByTsDesc(any())).thenReturn(List.of());
    when(events.aggregateByUser()).thenReturn(List.of(
        userAggregate("older@example.com", "Older", 3, Instant.parse("2026-09-20T00:00:00Z")),
        userAggregate("newer@example.com", "Newer", 5, Instant.parse("2026-09-22T00:00:00Z"))));

    List<AccessLogService.UserSummary> users = service().summary().users();

    assertThat(users).extracting(AccessLogService.UserSummary::email)
        .containsExactly("newer@example.com", "older@example.com");
    assertThat(users.get(0).hits()).isEqualTo(5);
  }

  @Test
  void activityByUser_returnsOnlyThatAccountsEvents() {
    when(locations.findAll()).thenReturn(List.of());
    AccessEvent theirs = new AccessEvent("9.9.9.9", "GET", "/api/tasks", 200, "ua", true, "api",
        "target@example.com", "Target");
    when(events.findByUserEmailOrderByTsDesc(org.mockito.ArgumentMatchers.eq("target@example.com"), any()))
        .thenReturn(List.of(theirs));

    List<AccessLogService.Recent> activity = service().activityByUser("target@example.com");

    assertThat(activity).hasSize(1);
    assertThat(activity.get(0).userEmail()).isEqualTo("target@example.com");
  }

  private static AccessEventRepository.UserAggregate userAggregate(String email, String displayName, long hits, Instant lastSeen) {
    return new AccessEventRepository.UserAggregate() {
      public String getEmail() { return email; }
      public String getDisplayName() { return displayName; }
      public long getHits() { return hits; }
      public Instant getLastSeen() { return lastSeen; }
    };
  }
}
