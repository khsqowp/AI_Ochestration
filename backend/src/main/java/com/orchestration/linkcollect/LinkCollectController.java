package com.orchestration.linkcollect;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
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

  @ExceptionHandler(LinkCollectUnavailableException.class)
  public ResponseEntity<ErrorResponse> unavailable(LinkCollectUnavailableException exception) {
    return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(new ErrorResponse(exception.getMessage()));
  }

  private static ResponseEntity<String> json(String body) {
    return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(body);
  }

  public record ErrorResponse(String error) {}
}
