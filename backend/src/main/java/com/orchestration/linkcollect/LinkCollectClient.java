package com.orchestration.linkcollect;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import org.springframework.stereotype.Component;

@Component
public class LinkCollectClient {
  private final LinkCollectProperties properties;
  private final HttpClient client;

  LinkCollectClient(LinkCollectProperties properties) {
    this.properties = properties;
    this.client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
  }

  public String jobs() { return get("/api/jobs"); }
  public String knowledge() { return get("/api/knowledge"); }
  public String places() { return get("/api/places"); }

  public Thumbnail thumbnail(String jobId) {
    HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(properties.baseUrl() + "/api/jobs/" + jobId + "/thumbnail"))
        .timeout(Duration.ofSeconds(8)).GET();
    if (properties.token() != null && !properties.token().isBlank()) {
      request.header("Authorization", "Bearer " + properties.token());
    }
    try {
      HttpResponse<byte[]> response = client.send(request.build(), HttpResponse.BodyHandlers.ofByteArray());
      if (response.statusCode() == 404) {
        return null;
      }
      if (response.statusCode() < 200 || response.statusCode() >= 300) {
        throw new LinkCollectUnavailableException("LinkCollect HTTP " + response.statusCode());
      }
      String contentType = response.headers().firstValue("Content-Type").orElse("application/octet-stream");
      return new Thumbnail(response.body(), contentType);
    } catch (IOException exception) {
      throw new LinkCollectUnavailableException("LinkCollect 연결 실패 — SSH 터널 상태를 확인하세요.", exception);
    } catch (InterruptedException exception) {
      Thread.currentThread().interrupt();
      throw new LinkCollectUnavailableException("LinkCollect 연결 실패 — SSH 터널 상태를 확인하세요.", exception);
    }
  }

  public record Thumbnail(byte[] body, String contentType) {}

  private String get(String path) {
    HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(properties.baseUrl() + path))
        .timeout(Duration.ofSeconds(8)).GET();
    if (properties.token() != null && !properties.token().isBlank()) {
      request.header("Authorization", "Bearer " + properties.token());
    }
    try {
      HttpResponse<String> response = client.send(request.build(), HttpResponse.BodyHandlers.ofString());
      if (response.statusCode() < 200 || response.statusCode() >= 300) {
        String body = response.body();
        String snippet = body.length() > 300 ? body.substring(0, 300) : body;
        throw new LinkCollectUnavailableException("LinkCollect HTTP " + response.statusCode() + ": " + snippet);
      }
      return response.body();
    } catch (IOException exception) {
      throw new LinkCollectUnavailableException("LinkCollect 연결 실패 — SSH 터널 상태를 확인하세요.", exception);
    } catch (InterruptedException exception) {
      Thread.currentThread().interrupt();
      throw new LinkCollectUnavailableException("LinkCollect 연결 실패 — SSH 터널 상태를 확인하세요.", exception);
    }
  }
}
