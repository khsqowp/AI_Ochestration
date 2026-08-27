package com.orchestration.tasks;

import com.orchestration.n8n.N8nDispatcher;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/digest")
public class DigestController {
  private final DigestService service;
  private final N8nDispatcher dispatcher;

  DigestController(DigestService service, N8nDispatcher dispatcher) { this.service = service; this.dispatcher = dispatcher; }

  @GetMapping
  public DigestService.DigestResult get(@RequestParam(defaultValue = "DAILY") String period) {
    return service.generate(parse(period));
  }

  /** Manual trigger for the n8n dispatch, so delivery can be verified without waiting for the schedule. */
  @PostMapping("/dispatch")
  @ResponseStatus(HttpStatus.ACCEPTED)
  public void dispatch(@RequestParam(defaultValue = "DAILY") String period) {
    dispatcher.dispatchDigest(service.generate(parse(period)));
  }

  private DigestService.Period parse(String value) {
    try {
      return DigestService.parsePeriod(value);
    } catch (IllegalArgumentException exception) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, exception.getMessage());
    }
  }
}
