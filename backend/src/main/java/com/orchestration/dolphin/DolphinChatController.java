package com.orchestration.dolphin;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.nio.charset.StandardCharsets;
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

  private static final Logger log = LoggerFactory.getLogger(DolphinChatController.class);
  private static final int CHUNK = 8192;

  private final String baseUrl;
  private final RestClient rest;
  private final HttpClient http;

  public DolphinChatController(DolphinProperties props, RestClient.Builder builder) {
    this.baseUrl = props.chatUrl();
    this.rest = builder.baseUrl(props.chatUrl()).build();
    // uvicorn(dolphin)은 HTTP/2 미지원. JDK HttpClient 기본값(HTTP_2)이면 cleartext h2c 업그레이드를
    // 시도하다 본문이 유실돼 dolphin 이 422(body missing)를 낸다 — HTTP/1.1 로 고정한다.
    this.http = HttpClient.newBuilder()
        .version(HttpClient.Version.HTTP_1_1)
        .connectTimeout(Duration.ofSeconds(5))
        .build();
  }

  // ── SSE streaming proxy ──────────────────────────────────────────────────

  @PostMapping(value = "/chat", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
  public ResponseEntity<StreamingResponseBody> chat(
      @RequestBody byte[] body,
      HttpServletRequest incoming) {

    log.info("dolphin /chat proxy: body={} bytes, content-type={}, content-length={}",
        body == null ? -1 : body.length, incoming.getContentType(), incoming.getContentLengthLong());

    var req = HttpRequest.newBuilder()
        .uri(URI.create(baseUrl + "/api/chat"))
        .timeout(Duration.ofMinutes(10))
        .header("Content-Type", "application/json")
        .POST(HttpRequest.BodyPublishers.ofByteArray(body))
        .build();

    StreamingResponseBody stream = out -> {
      try {
        var resp = http.send(req, HttpResponse.BodyHandlers.ofInputStream());
        if (resp.statusCode() != 200) {
          byte[] errBody;
          try (InputStream in = resp.body()) { errBody = in.readAllBytes(); }
          String detail = new String(errBody, StandardCharsets.UTF_8).replace("\"", "'").replace("\n", " ");
          log.warn("dolphin /api/chat returned {} : {}", resp.statusCode(), detail);
          writeError(out, "dolphin " + resp.statusCode() + ": " + detail);
          return;
        }
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
        // 클라이언트 연결 종료면 정상. 그 외(업스트림 연결 실패 등)는 남긴다.
        if (!"Broken pipe".equalsIgnoreCase(String.valueOf(e.getMessage()))) {
          log.warn("dolphin /api/chat proxy IO error", e);
          try { writeError(out, "proxy IO: " + e.getMessage()); } catch (IOException ignored) { }
        }
      } catch (RuntimeException e) {
        log.warn("dolphin /api/chat proxy failed", e);
        try { writeError(out, "proxy: " + e.getClass().getSimpleName() + " " + e.getMessage()); } catch (IOException ignored) { }
      }
    };

    return ResponseEntity.ok()
        .header("X-Accel-Buffering", "no")
        .header("Cache-Control", "no-cache")
        .contentType(MediaType.TEXT_EVENT_STREAM)
        .body(stream);
  }

  private static void writeError(java.io.OutputStream out, String message) throws IOException {
    out.write(("data: {\"error\": \"" + message.replace("\"", "'") + "\"}\n\ndata: [DONE]\n\n")
        .getBytes(StandardCharsets.UTF_8));
    out.flush();
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
