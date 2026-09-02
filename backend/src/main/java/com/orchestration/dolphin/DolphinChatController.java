package com.orchestration.dolphin;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Enumeration;

@RestController
@RequestMapping("/api/dolphin")
@EnableConfigurationProperties(DolphinProperties.class)
public class DolphinChatController {

  private static final int CHUNK = 8192;

  private final String baseUrl;
  private final RestClient rest;
  private final HttpClient http;

  public DolphinChatController(DolphinProperties props, RestClient.Builder builder) {
    this.baseUrl = props.chatUrl();
    this.rest = builder.baseUrl(props.chatUrl()).build();
    this.http = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        .build();
  }

  // ── SSE streaming proxy ──────────────────────────────────────────────────

  @PostMapping(value = "/chat", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
  public ResponseEntity<StreamingResponseBody> chat(
      @RequestBody byte[] body,
      HttpServletRequest incoming) {

    var req = HttpRequest.newBuilder()
        .uri(URI.create(baseUrl + "/api/chat"))
        .timeout(Duration.ofMinutes(10))
        .header("Content-Type", "application/json")
        .POST(HttpRequest.BodyPublishers.ofByteArray(body))
        .build();

    StreamingResponseBody stream = out -> {
      try {
        var resp = http.send(req, HttpResponse.BodyHandlers.ofInputStream());
        try (InputStream in = resp.body()) {
          byte[] buf = new byte[CHUNK];
          int n;
          while ((n = in.read(buf)) != -1) {
            out.write(buf, 0, n);
            out.flush();
          }
        }
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
      } catch (IOException e) {
        // client disconnect — normal
      }
    };

    return ResponseEntity.ok()
        .header("X-Accel-Buffering", "no")
        .header("Cache-Control", "no-cache")
        .contentType(MediaType.TEXT_EVENT_STREAM)
        .body(stream);
  }

  // ── Generic JSON proxy ───────────────────────────────────────────────────

  @GetMapping("/**")
  public ResponseEntity<byte[]> proxyGet(HttpServletRequest req) {
    return forward(req, HttpMethod.GET, null);
  }

  @PostMapping("/**")
  public ResponseEntity<byte[]> proxyPost(HttpServletRequest req, @RequestBody(required = false) byte[] body) {
    return forward(req, HttpMethod.POST, body);
  }

  @PatchMapping("/**")
  public ResponseEntity<byte[]> proxyPatch(HttpServletRequest req, @RequestBody(required = false) byte[] body) {
    return forward(req, HttpMethod.PATCH, body);
  }

  @DeleteMapping("/**")
  public ResponseEntity<byte[]> proxyDelete(HttpServletRequest req) {
    return forward(req, HttpMethod.DELETE, null);
  }

  private ResponseEntity<byte[]> forward(HttpServletRequest incoming, HttpMethod method, byte[] body) {
    String path = incoming.getRequestURI().replaceFirst("^/api/dolphin", "/api");
    String query = incoming.getQueryString();
    String uri = query == null ? path : path + "?" + query;

    var spec = rest.method(method).uri(uri);

    Enumeration<String> headerNames = incoming.getHeaderNames();
    if (headerNames != null) {
      while (headerNames.hasMoreElements()) {
        String name = headerNames.nextElement();
        if (!name.equalsIgnoreCase("host") && !name.equalsIgnoreCase("content-length")) {
          spec.header(name, incoming.getHeader(name));
        }
      }
    }

    if (body != null && body.length > 0) {
      spec.contentType(MediaType.APPLICATION_JSON).body(body);
    }

    return spec.retrieve()
        .toEntity(byte[].class);
  }
}
