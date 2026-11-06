package com.orchestration.sources;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.orchestration.calendar.SecurityCalendarService;
import com.orchestration.files.FileProperties;
import com.orchestration.tasks.LlmGateway;
import com.orchestration.tasks.TaskDomain;
import com.orchestration.tasks.TaskService;
import com.orchestration.tasks.TaskWorkflowRunner;
import com.orchestration.tasks.WorkTask;
import com.sun.net.httpserver.HttpServer;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** A re-crawl that fetches the exact same article shouldn't hand the LLM a fresh analysis job — only a
 * genuinely changed page should. These verify {@link SourceCollectionService#contentChanged} makes that
 * call correctly, including that markup-only noise (tag/whitespace differences) doesn't register as a
 * real change, consistent with how {@code stripMarkup} already normalizes text for excerpt-building. */
class SourceCollectionServiceTest {

  private final Map<String, PageSnapshot> store = new HashMap<>();
  private SourceCollectionService service;

  private SourceCollectionService serviceAllowingLoopbackForLocalServer() {
    return new SourceCollectionService(mock(ResearchSourceService.class), new FileProperties("/tmp/originals", "/tmp/obsidian", 30000L),
        mock(TaskService.class), mock(SecurityCalendarService.class), mock(LlmGateway.class),
        mock(GeminiCollectionBatchRepository.class), mock(PageSnapshotRepository.class), mock(TaskWorkflowRunner.class),
        mock(Executor.class), mock(CollectionSettingService.class)) {
      @Override InetAddress resolveAndValidate(URI uri) throws Exception { return InetAddress.getLoopbackAddress(); }
    };
  }

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
  void sendValidated_connectsToHostnameUri() throws Exception {
    HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext("/", exchange -> {
      byte[] body = "collected".getBytes(StandardCharsets.UTF_8);
      exchange.sendResponseHeaders(200, body.length);
      try (var output = exchange.getResponseBody()) { output.write(body); }
    });
    server.start();
    try {
      service = serviceAllowingLoopbackForLocalServer();
      URI uri = URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/");
      HttpResponse<byte[]> response = service.sendValidated(uri);
      assertThat(response.statusCode()).isEqualTo(200);
      assertThat(new String(response.body(), StandardCharsets.UTF_8)).isEqualTo("collected");
    } finally { server.stop(0); }
  }

  @Test
  void oversizedResponse_failsWhileStreaming() throws Exception {
    HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext("/large", exchange -> {
      exchange.sendResponseHeaders(200, 2_000_001);
      try (var output = exchange.getResponseBody()) { output.write(new byte[2_000_001]); }
      catch (java.io.IOException ignored) { } // client cancels when the bound is crossed
    });
    server.start();
    try {
      service = serviceAllowingLoopbackForLocalServer();
      URI uri = URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/large");
      assertThatThrownBy(() -> service.sendValidated(uri))
          .hasMessageContaining("response exceeds 2MB limit");
    } finally { server.stop(0); }
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

  // Gemini request failed with HTTP 402 / network blip during the nightly batch submit: the crawl
  // already succeeded (source.markCollected() already ran), so losing that work outright by marking the
  // WorkTask FAILED on the spot would silently drop a night's collection until the source's next full
  // intervalHours cycle. These three tests cover submitBatchForSources leaving the task retryable instead
  // of failing it immediately, a later retry succeeding, and a retry that keeps failing past the bounded
  // retry budget eventually failing for good.

  @Test
  void submitBatchForSources_submissionItselfFails_leavesTaskAwaitingBatchInsteadOfFailingItImmediately() throws Exception {
    HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext("/", exchange -> {
      byte[] body = "hello page".getBytes(StandardCharsets.UTF_8);
      exchange.sendResponseHeaders(200, body.length);
      try (var output = exchange.getResponseBody()) { output.write(body); }
    });
    server.start();
    try {
      TaskService taskService = mock(TaskService.class);
      LlmGateway llm = mock(LlmGateway.class);
      GeminiCollectionBatchRepository batchRepository = mock(GeminiCollectionBatchRepository.class);
      PageSnapshotRepository snapshots = mock(PageSnapshotRepository.class);
      when(snapshots.findByUrl(anyString())).thenReturn(Optional.empty()); // first fetch of a URL always counts as changed
      when(snapshots.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

      UUID taskId = UUID.randomUUID();
      WorkTask task = mock(WorkTask.class);
      when(task.getId()).thenReturn(taskId);
      when(taskService.createAwaitingBatch(any(), any(), any(), any(), any(UUID.class))).thenReturn(task);
      when(llm.collectPrompt(any(), any())).thenReturn("prompt");
      when(llm.submitCollectBatch(any())).thenThrow(new RuntimeException("Gemini request failed with HTTP 402"));

      ResearchSource source = new ResearchSource("테스트 소스", "http://127.0.0.1:" + server.getAddress().getPort() + "/",
          ResearchDomain.SECURITY, 24, 0, 1, null);
      org.springframework.test.util.ReflectionTestUtils.setField(source, "id", UUID.randomUUID());

      SourceCollectionService target = new SourceCollectionService(mock(ResearchSourceService.class),
          new FileProperties("/tmp/originals", "/tmp/obsidian", 30000L), taskService, mock(SecurityCalendarService.class),
          llm, batchRepository, snapshots, mock(TaskWorkflowRunner.class), Runnable::run, mock(CollectionSettingService.class)) {
        @Override InetAddress resolveAndValidate(URI uri) { return InetAddress.getLoopbackAddress(); }
      };

      target.submitBatchForSources(List.of(source));

      verify(taskService, never()).failCollection(any(), any());
      verify(taskService).recordBatchSubmissionAttempt(taskId);
      verify(batchRepository, never()).save(any());
    } finally {
      server.stop(0);
    }
  }

  @Test
  void pollGeminiBatches_resubmitsAnUnsubmittedTask_andAttachesTheJobOnceItSucceeds() throws Exception {
    TaskService taskService = mock(TaskService.class);
    LlmGateway llm = mock(LlmGateway.class);
    GeminiCollectionBatchRepository batchRepository = mock(GeminiCollectionBatchRepository.class);
    when(batchRepository.findByProcessedFalse()).thenReturn(List.of());

    UUID taskId = UUID.randomUUID();
    AtomicInteger attempts = new AtomicInteger(1); // the initial submission already failed once
    WorkTask task = mock(WorkTask.class);
    when(task.getId()).thenReturn(taskId);
    when(task.getDomain()).thenReturn(TaskDomain.SECURITY);
    when(task.getInstruction()).thenReturn("지시문");
    when(task.getBatchSubmissionAttempts()).thenAnswer(invocation -> attempts.get());
    when(task.getLastBatchSubmissionAttemptAt()).thenReturn(Instant.now().minus(Duration.ofHours(3))); // past the 2h backoff for attempt 1
    doAnswer(invocation -> { attempts.incrementAndGet(); return null; }).when(taskService).recordBatchSubmissionAttempt(taskId);
    when(taskService.findAwaitingBatchWithoutJob()).thenReturn(List.of(task));
    when(llm.collectPrompt(TaskDomain.SECURITY, "지시문")).thenReturn("prompt");
    when(llm.submitCollectBatch(any())).thenReturn(new LlmGateway.BatchSubmission("job-retried-ok"));

    SourceCollectionService target = new SourceCollectionService(mock(ResearchSourceService.class),
        new FileProperties("/tmp/originals", "/tmp/obsidian", 30000L), taskService, mock(SecurityCalendarService.class),
        llm, batchRepository, mock(PageSnapshotRepository.class), mock(TaskWorkflowRunner.class), mock(Executor.class),
        mock(CollectionSettingService.class));

    target.pollGeminiBatches();

    verify(taskService).attachBatchJob(taskId, "job-retried-ok");
    verify(batchRepository).save(argThat(batch -> batch.getProviderBatchName().equals("job-retried-ok")));
    verify(taskService, never()).failCollection(any(), any());
  }

  @Test
  void pollGeminiBatches_givesUpAndFailsTheTask_onceRetriesExceedTheBoundedBudget() throws Exception {
    TaskService taskService = mock(TaskService.class);
    LlmGateway llm = mock(LlmGateway.class);
    GeminiCollectionBatchRepository batchRepository = mock(GeminiCollectionBatchRepository.class);
    when(batchRepository.findByProcessedFalse()).thenReturn(List.of());

    UUID taskId = UUID.randomUUID();
    AtomicInteger attempts = new AtomicInteger(2); // one more failure will cross the retry budget
    WorkTask task = mock(WorkTask.class);
    when(task.getId()).thenReturn(taskId);
    when(task.getDomain()).thenReturn(TaskDomain.SECURITY);
    when(task.getInstruction()).thenReturn("지시문");
    when(task.getBatchSubmissionAttempts()).thenAnswer(invocation -> attempts.get());
    when(task.getLastBatchSubmissionAttemptAt()).thenReturn(Instant.now().minus(Duration.ofHours(7))); // past the 6h backoff for attempt 2
    doAnswer(invocation -> { attempts.incrementAndGet(); return null; }).when(taskService).recordBatchSubmissionAttempt(taskId);
    when(taskService.findAwaitingBatchWithoutJob()).thenReturn(List.of(task));
    when(llm.collectPrompt(TaskDomain.SECURITY, "지시문")).thenReturn("prompt");
    when(llm.submitCollectBatch(any())).thenThrow(new RuntimeException("Gemini request failed with HTTP 402"));

    SourceCollectionService target = new SourceCollectionService(mock(ResearchSourceService.class),
        new FileProperties("/tmp/originals", "/tmp/obsidian", 30000L), taskService, mock(SecurityCalendarService.class),
        llm, batchRepository, mock(PageSnapshotRepository.class), mock(TaskWorkflowRunner.class), mock(Executor.class),
        mock(CollectionSettingService.class));

    target.pollGeminiBatches();

    verify(taskService).failCollection(eq(taskId), argThat(reason -> reason.contains("한도")));
    verify(batchRepository, never()).save(any());
  }
}
