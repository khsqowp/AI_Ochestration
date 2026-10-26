package com.orchestration.linkcollect;

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
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/linkcollect")
public class LinkCollectController {
  private final LinkCollectClient client;

  LinkCollectController(LinkCollectClient client) {
    this.client = client;
  }

  @GetMapping(value = "/jobs", produces = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<String> jobs() { return json(client.jobs()); }

  @GetMapping(value = "/knowledge", produces = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<String> knowledge() { return json(client.knowledge()); }

  @GetMapping(value = "/places", produces = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<String> places() { return json(client.places()); }

  @PostMapping(value = "/archive/reclassify", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<String> reclassify(@RequestBody String body) {
    LinkCollectClient.ReclassifyResult result = client.reclassify(body);
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
