package com.orchestration.sources;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
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

  // Medium #10 -- collectNow() (manual button) and the scheduled retry/nightly sweeps can all reach crawl()
  // for the same source concurrently. contentChanged()'s read-then-write on PageSnapshot isn't atomic across
  // two such calls, so both can see "changed" for the same page and each spin up its own duplicate analysis
  // WorkTask. A per-sourceId lock closes that window; these test the lock primitive itself directly rather
  // than racing real threads through the full network crawl (which would be flaky and slow).
  @Test
  void tryAcquireCollectionLock_deniesASecondConcurrentAcquisition_forTheSameSource() {
    java.util.UUID sourceId = java.util.UUID.randomUUID();

    assertThat(service.tryAcquireCollectionLock(sourceId)).isTrue();
    assertThat(service.tryAcquireCollectionLock(sourceId)).isFalse();
  }

  @Test
  void tryAcquireCollectionLock_allowsReacquisition_onceTheFirstHolderReleasesIt() {
    java.util.UUID sourceId = java.util.UUID.randomUUID();
    service.tryAcquireCollectionLock(sourceId);

    service.releaseCollectionLock(sourceId);

    assertThat(service.tryAcquireCollectionLock(sourceId)).isTrue();
  }

  @Test
  void tryAcquireCollectionLock_isIndependentPerSource() {
    java.util.UUID first = java.util.UUID.randomUUID();
    java.util.UUID second = java.util.UUID.randomUUID();
    service.tryAcquireCollectionLock(first);

    assertThat(service.tryAcquireCollectionLock(second)).isTrue();
  }

  // Critical #1 -- rejectPrivateTarget() is the single choke point every fetch (page and robots.txt) must
  // pass before connecting. These use IP literals only, so InetAddress never performs a real DNS lookup
  // and the tests stay fully offline/deterministic.
  @Test
  void rejectPrivateTarget_throwsForLoopbackAddress() {
    assertThatThrownBy(() -> service.rejectPrivateTarget(URI.create("http://127.0.0.1/"))).isInstanceOf(SecurityException.class);
  }

  @Test
  void rejectPrivateTarget_throwsForLinkLocalAddress_includingCloudMetadataEndpoint() {
    assertThatThrownBy(() -> service.rejectPrivateTarget(URI.create("http://169.254.169.254/latest/meta-data/"))).isInstanceOf(SecurityException.class);
  }

  @Test
  void rejectPrivateTarget_throwsForRfc1918PrivateAddresses() {
    assertThatThrownBy(() -> service.rejectPrivateTarget(URI.create("http://10.0.0.5/"))).isInstanceOf(SecurityException.class);
    assertThatThrownBy(() -> service.rejectPrivateTarget(URI.create("http://192.168.1.1/"))).isInstanceOf(SecurityException.class);
  }

  @Test
  void rejectPrivateTarget_throwsForAnyLocalAddress() {
    assertThatThrownBy(() -> service.rejectPrivateTarget(URI.create("http://0.0.0.0/"))).isInstanceOf(SecurityException.class);
  }

  @Test
  void rejectPrivateTarget_allowsAPublicLiteralIp() {
    assertThatCode(() -> service.rejectPrivateTarget(URI.create("http://8.8.8.8/"))).doesNotThrowAnyException();
  }

  @Test
  void collectNow_neverSendsARequest_whenTheSourceUrlIsALoopbackAddress() throws Exception {
    // Covers both vectors together: fetchRobotsRules() used to have zero validation (would unconditionally
    // hit /robots.txt on a private target), and the page fetch used to auto-follow redirects (Redirect.
    // NORMAL) before ever checking where it landed -- validating only the final response.uri() was too
    // late, since the JDK client had already connected to every hop by then. A source pointed straight at
    // a loopback origin must never receive a single request, robots.txt included.
    java.util.concurrent.atomic.AtomicInteger requestCount = new java.util.concurrent.atomic.AtomicInteger();
    com.sun.net.httpserver.HttpServer server = com.sun.net.httpserver.HttpServer.create(new java.net.InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext("/", exchange -> {
      requestCount.incrementAndGet();
      byte[] body = "<html></html>".getBytes(StandardCharsets.UTF_8);
      exchange.sendResponseHeaders(200, body.length);
      exchange.getResponseBody().write(body);
      exchange.close();
    });
    server.start();
    try {
      ResearchSource source = new ResearchSource("로컬 테스트 서버", "http://127.0.0.1:" + server.getAddress().getPort() + "/",
          ResearchDomain.SECURITY, 24, 1, 5, null);
      org.springframework.test.util.ReflectionTestUtils.setField(source, "id", java.util.UUID.randomUUID());
      ResearchSourceService sourceLookup = mock(ResearchSourceService.class);
      when(sourceLookup.get(any())).thenReturn(source);
      SourceCollectionService target = new SourceCollectionService(sourceLookup,
          new FileProperties("/tmp/originals", "/tmp/obsidian", 30000L), mock(TaskService.class),
          mock(SecurityCalendarService.class), mock(LlmGateway.class), mock(GeminiCollectionBatchRepository.class),
          mock(PageSnapshotRepository.class), mock(TaskWorkflowRunner.class), mock(Executor.class), mock(CollectionSettingService.class));

      SourceCollectionService.CollectionResult result = target.collectNow(source.getId());

      assertThat(requestCount.get()).isEqualTo(0);
      assertThat(result.savedPages()).isEqualTo(0);
    } finally {
      server.stop(0);
    }
  }
}
