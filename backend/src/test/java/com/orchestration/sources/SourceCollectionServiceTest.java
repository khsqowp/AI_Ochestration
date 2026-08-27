package com.orchestration.sources;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.orchestration.calendar.SecurityCalendarService;
import com.orchestration.files.FileProperties;
import com.orchestration.tasks.LlmGateway;
import com.orchestration.tasks.TaskService;
import com.orchestration.tasks.TaskWorkflowRunner;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.Executor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** A re-crawl that fetches the exact same article shouldn't hand the LLM a fresh analysis job — only a
 * genuinely changed page should. These verify {@link SourceCollectionService#contentChanged} makes that
 * call correctly, including that markup-only noise (tag/whitespace differences) doesn't register as a
 * real change, consistent with how {@code stripMarkup} already normalizes text for excerpt-building. */
class SourceCollectionServiceTest {

  private final Map<String, PageSnapshot> store = new HashMap<>();
  private SourceCollectionService service;

  @BeforeEach
  void setUp() {
    PageSnapshotRepository snapshots = mock(PageSnapshotRepository.class);
    when(snapshots.findByUrl(anyString())).thenAnswer(invocation -> Optional.ofNullable(store.get(invocation.<String>getArgument(0))));
    when(snapshots.save(any())).thenAnswer(invocation -> {
      PageSnapshot saved = invocation.getArgument(0);
      store.put(saved.getUrl(), saved);
      return saved;
    });
    service = new SourceCollectionService(
        mock(ResearchSourceService.class), new FileProperties("/tmp/originals", "/tmp/obsidian", 30000L),
        mock(TaskService.class), mock(SecurityCalendarService.class), mock(LlmGateway.class),
        mock(GeminiCollectionBatchRepository.class), snapshots, mock(TaskWorkflowRunner.class), mock(Executor.class),
        mock(CollectionSettingService.class));
  }

  @Test
  void firstFetchOfAUrl_alwaysCountsAsChanged() {
    assertThat(service.contentChanged("https://example.com/a", "hello world".getBytes(StandardCharsets.UTF_8))).isTrue();
  }

  @Test
  void reFetchOfIdenticalContent_isNotAChange() {
    service.contentChanged("https://example.com/a", "hello world".getBytes(StandardCharsets.UTF_8));

    assertThat(service.contentChanged("https://example.com/a", "hello world".getBytes(StandardCharsets.UTF_8))).isFalse();
  }

  @Test
  void reFetchWithOnlyMarkupOrWhitespaceDifferences_isNotAChange() {
    service.contentChanged("https://example.com/a", "hello world".getBytes(StandardCharsets.UTF_8));

    assertThat(service.contentChanged("https://example.com/a", "<div>hello   world</div>".getBytes(StandardCharsets.UTF_8))).isFalse();
  }

  @Test
  void reFetchWithActuallyDifferentText_isAChange() {
    service.contentChanged("https://example.com/a", "hello world".getBytes(StandardCharsets.UTF_8));

    assertThat(service.contentChanged("https://example.com/a", "goodbye world".getBytes(StandardCharsets.UTF_8))).isTrue();
  }

  @Test
  void changeIsTrackedPerUrl_notGlobally() {
    service.contentChanged("https://example.com/a", "hello world".getBytes(StandardCharsets.UTF_8));

    assertThat(service.contentChanged("https://example.com/b", "hello world".getBytes(StandardCharsets.UTF_8))).isTrue();
  }

  @Test
  void linkUnderTheSourcesOwnPath_isWithinRootPath() {
    List<String> root = service.pathSegments("/deeplinks");

    assertThat(service.withinRootPath(root, URI.create("https://www.eff.org/deeplinks/2026/07/21/some-post"))).isTrue();
  }

  @Test
  void siteNavigationLinkOutsideTheSourcesPath_isNotWithinRootPath() {
    List<String> root = service.pathSegments("/deeplinks");

    assertThat(service.withinRootPath(root, URI.create("https://www.eff.org/donate"))).isFalse();
    assertThat(service.withinRootPath(root, URI.create("https://www.eff.org/about"))).isFalse();
  }

  @Test
  void restrictionIsSegmentBased_notNaiveStringPrefix() {
    List<String> root = service.pathSegments("/deeplinks");

    // "/deeplinksomething" shares the string prefix "/deeplinks" but is a different path segment entirely.
    assertThat(service.withinRootPath(root, URI.create("https://www.eff.org/deeplinksomething"))).isFalse();
  }

  @Test
  void sourceRegisteredAtSiteRoot_allowsAnyPathOnThatHost() {
    List<String> root = service.pathSegments("/");

    assertThat(service.withinRootPath(root, URI.create("https://www.eff.org/donate"))).isTrue();
    assertThat(service.withinRootPath(root, URI.create("https://www.eff.org/deeplinks/2026/07/21/some-post"))).isTrue();
  }

  @Test
  void trailingSlashOnRootPath_isNormalizedTheSameAsWithout() {
    assertThat(service.pathSegments("/deeplinks/")).isEqualTo(service.pathSegments("/deeplinks"));
  }
}
