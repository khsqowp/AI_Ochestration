package com.orchestration.linkcollect;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/linkcollect")
public class LinkCollectController {
  private final LinkCollectClient client;
  private final ObjectMapper objectMapper;

  LinkCollectController(LinkCollectClient client, ObjectMapper objectMapper) {
    this.client = client;
    this.objectMapper = objectMapper;
  }

  @GetMapping(value = "/jobs", produces = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<String> jobs() { return json(client.jobs()); }

  @GetMapping(value = "/knowledge", produces = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<String> knowledge(@RequestParam(name = "include_hidden", defaultValue = "false") boolean includeHidden) { return json(client.knowledge(includeHidden)); }

  @GetMapping(value = "/places", produces = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<String> places(@RequestParam(name = "include_hidden", defaultValue = "false") boolean includeHidden) { return json(client.places(includeHidden)); }

  @PostMapping(value = "/archive/reclassify", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<String> reclassify(@RequestBody String body) {
    LinkCollectClient.ReclassifyResult result = client.reclassify(body);
    return ResponseEntity.status(result.status()).contentType(MediaType.APPLICATION_JSON).body(result.body());
  }

  @PostMapping(value = "/archive/visibility", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<String> visibility(@RequestBody String body) {
    LinkCollectClient.ReclassifyResult result = client.visibility(body);
    return ResponseEntity.status(result.status()).contentType(MediaType.APPLICATION_JSON).body(result.body());
  }

  private static final Pattern PLACE_ID = Pattern.compile("[0-9a-f]{16}");

  @PostMapping(value = "/places/{placeId}/regeocode", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<String> regeocode(@PathVariable String placeId, @RequestBody String body) {
    if (!PLACE_ID.matcher(placeId).matches()) return ResponseEntity.badRequest().body("{\"error\":\"invalid place id\"}");
    if (body.getBytes(StandardCharsets.UTF_8).length > 4096) {
      return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body("{\"error\":\"request body too large\"}");
    }
    final JsonNode payload;
    try {
      payload = objectMapper.readTree(body);
    } catch (JsonProcessingException exception) {
      return ResponseEntity.badRequest().body("{\"error\":\"invalid JSON body\"}");
    }
    JsonNode address = payload == null ? null : payload.isObject() ? payload.get("address") : null;
    if (address == null || !address.isTextual() || address.asText().isBlank() || address.asText().trim().length() > 500) {
      return ResponseEntity.badRequest().body("{\"error\":\"address must be a non-empty string of at most 500 characters\"}");
    }
    final String normalizedBody;
    try {
      normalizedBody = objectMapper.writeValueAsString(java.util.Map.of("address", address.asText().trim()));
    } catch (JsonProcessingException exception) {
      return ResponseEntity.badRequest().body("{\"error\":\"invalid address payload\"}");
    }
    LinkCollectClient.ReclassifyResult result = client.regeocode(placeId, normalizedBody);
    return ResponseEntity.status(result.status()).contentType(MediaType.APPLICATION_JSON).body(result.body());
  }

  private static final Pattern JOB_ID = Pattern.compile("[0-9a-f]{8,40}");

  @GetMapping("/jobs/{jobId}/thumbnail")
  public ResponseEntity<byte[]> thumbnail(@PathVariable String jobId) {
    if (!JOB_ID.matcher(jobId).matches()) {
      return ResponseEntity.badRequest().build();
    }
    LinkCollectClient.Thumbnail thumbnail = client.thumbnail(jobId);
    if (thumbnail == null) {
      return ResponseEntity.notFound().build();
    }
    return ResponseEntity.ok().contentType(MediaType.parseMediaType(thumbnail.contentType())).body(thumbnail.body());
  }

  @ExceptionHandler(LinkCollectUnavailableException.class)
  public ResponseEntity<ErrorResponse> unavailable(LinkCollectUnavailableException exception) {
    return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(new ErrorResponse(exception.getMessage()));
  }

  private static ResponseEntity<String> json(String body) {
    return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(body);
  }

  public record ErrorResponse(String error) {}
}
