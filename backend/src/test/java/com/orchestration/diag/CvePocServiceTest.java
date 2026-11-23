package com.orchestration.diag;

import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.URI;
import java.net.http.HttpHeaders;
import java.net.http.HttpClient.Version;
import javax.net.ssl.SSLSession;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.Optional;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLParameters;
import org.junit.jupiter.api.Test;

class CvePocServiceTest {
  private final ObjectMapper json = new ObjectMapper();

  @Test
  void returnsCveScoreVectorAndExploitReferences() throws Exception {
    String body = """
        {"vulnerabilities":[{"cve":{"metrics":{"cvssMetricV31":[{"cvssData":{"baseScore":9.8,"vectorString":"CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"}}]},"references":[{"url":"https://example.test/poc","tags":["Exploit"]},{"url":"https://example.test/advisory","tags":["Vendor Advisory"]}]}}]}
        """;
    FakeHttpClient client = new FakeHttpClient(200, body);
    CvePocService service = new CvePocService(null, json, "", "", client);
    CvePocService.Response result = service.lookup("CVE-2021-44228", false);
    assertTrue(result.exists());
    assertEquals(9.8, result.cvssScore());
    assertEquals("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", result.cvssVector());
    assertEquals(java.util.List.of("https://example.test/poc"), result.pocReferenceUrls());
    assertNull(result.aiSummary());
  }

  @Test
  void returnsNotFoundForNvd404() {
    CvePocService service = new CvePocService(null, json, "", "", new FakeHttpClient(404, ""));
    CvePocService.Response result = service.lookup("CVE-2099-12345", false);
    assertFalse(result.exists());
    assertTrue(result.pocReferenceUrls().isEmpty());
    assertEquals("NVD에 해당 CVE가 없습니다.", result.error());
  }

  @Test
  void skipsVulnersWhenApiKeyIsAbsent() throws Exception {
    FakeHttpClient client = new FakeHttpClient(200, "{\"vulnerabilities\":[{\"cve\":{\"references\":[]}}]}");
    CvePocService service = new CvePocService(null, json, "", "", client);
    CvePocService.Response result = service.lookup("CVE-2024-1234", false);
    assertTrue(result.exists());
    assertEquals(1, client.calls);
  }

  @Test
  void skipsPrivateHostReferenceWhenFetchingForAiSummary() throws Exception {
    // "localhost" resolves to a loopback address via the JVM's built-in/hosts-file resolution, with
    // no real network call needed, making this deterministic in CI. The reference must still be
    // surfaced to the user as a PoC link, but must never be fetched server-side (SSRF guard).
    String body = """
        {"vulnerabilities":[{"cve":{"metrics":{},"references":[{"url":"https://localhost/exploit","tags":["Exploit"]}]}}]}
        """;
    FakeHttpClient client = new FakeHttpClient(200, body);
    CvePocService service = new CvePocService(null, json, "", "", client);
    CvePocService.Response result = service.lookup("CVE-2024-9999", true);
    assertTrue(result.exists());
    assertEquals(java.util.List.of("https://localhost/exploit"), result.pocReferenceUrls());
    assertNull(result.aiSummary());
    assertEquals(1, client.calls); // only the NVD lookup call; the private-host reference was never fetched
  }

  @Test
  void handlesNvdUnreachableWithoutThrowing() {
    FakeHttpClient client = new FakeHttpClient();
    CvePocService service = new CvePocService(null, json, "", "", client);
    CvePocService.Response result = service.lookup("CVE-2024-1234", false);
    assertFalse(result.exists());
    assertTrue(result.error().startsWith("NVD 조회 중 오류:"));
    assertTrue(result.pocReferenceUrls().isEmpty());
  }

  private static final class FakeHttpClient extends HttpClient {
    private final int status;
    private final String body;
    private final boolean fail;
    private int calls;
    FakeHttpClient(int status, String body) { this.status = status; this.body = body; this.fail = false; }
    FakeHttpClient() { this.status = 0; this.body = ""; this.fail = true; }
    @Override public <T> HttpResponse<T> send(HttpRequest request, HttpResponse.BodyHandler<T> handler) throws java.io.IOException {
      calls++;
      if (fail) throw new java.io.IOException("offline");
      return new FakeResponse<>(request, status, (T) body);
    }
    @Override public <T> CompletableFuture<HttpResponse<T>> sendAsync(HttpRequest request, HttpResponse.BodyHandler<T> handler) { throw new UnsupportedOperationException(); }
    @Override public <T> CompletableFuture<HttpResponse<T>> sendAsync(HttpRequest request, HttpResponse.BodyHandler<T> handler, HttpResponse.PushPromiseHandler<T> pushPromiseHandler) { throw new UnsupportedOperationException(); }
    @Override public Optional<java.net.CookieHandler> cookieHandler() { return Optional.empty(); }
    @Override public Optional<java.time.Duration> connectTimeout() { return Optional.empty(); }
    @Override public Redirect followRedirects() { return Redirect.NEVER; }
    @Override public Optional<java.net.ProxySelector> proxy() { return Optional.empty(); }
    @Override public SSLContext sslContext() { return null; }
    @Override public SSLParameters sslParameters() { return new SSLParameters(); }
    @Override public Optional<java.net.Authenticator> authenticator() { return Optional.empty(); }
    @Override public Version version() { return Version.HTTP_1_1; }
    @Override public Optional<Executor> executor() { return Optional.empty(); }
  }

  private record FakeResponse<T>(HttpRequest request, int statusCode, T body) implements HttpResponse<T> {
    @Override public Optional<HttpResponse<T>> previousResponse() { return Optional.empty(); }
    @Override public HttpHeaders headers() { return HttpHeaders.of(Map.of(), (name, value) -> true); }
    @Override public Optional<SSLSession> sslSession() { return Optional.empty(); }
    @Override public URI uri() { return request.uri(); }
    @Override public Version version() { return Version.HTTP_1_1; }
  }
}
