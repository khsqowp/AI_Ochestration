package com.orchestration.tasks;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/archive")
public class RagController {
  private final RagSearchService service;

  RagController(RagSearchService service) { this.service = service; }

  @PostMapping("/ask")
  public RagSearchService.RagAnswer ask(@Valid @RequestBody Request request) {
    try {
      return service.ask(request.question(), request.domain(), request.origin());
    } catch (LlmGateway.ProviderException exception) {
      throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, exception.getMessage());
    } catch (Exception exception) {
      throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "질문 처리 중 오류가 발생했습니다.");
    }
  }

  @GetMapping("/ask/history")
  public List<RagSearchService.RagHistoryEntry> history() { return service.history(); }

  record Request(@NotBlank @Size(max = 2000) String question, String domain, String origin) {}
}
