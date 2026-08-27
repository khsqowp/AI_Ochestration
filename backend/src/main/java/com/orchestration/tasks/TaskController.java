package com.orchestration.tasks;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/tasks")
public class TaskController {
  private final TaskService service;
  private final PmProviderSettingService pmProviderSettings;
  TaskController(TaskService service, PmProviderSettingService pmProviderSettings) { this.service = service; this.pmProviderSettings = pmProviderSettings; }

  @PostMapping @ResponseStatus(HttpStatus.CREATED)
  public Response create(@Valid @RequestBody Request request) { return Response.from(service.create(request.title(), request.instruction(), request.domain(), TaskOrigin.MANUAL)); }
  @GetMapping public List<Response> recent() { return service.recent().stream().map(Response::from).toList(); }
  @GetMapping("/{id}") public Response get(@PathVariable UUID id) { return Response.from(service.get(id)); }
  @PostMapping("/{id}/retry") @ResponseStatus(HttpStatus.ACCEPTED) public void retry(@PathVariable UUID id) { service.retry(id); }
  @PostMapping("/{id}/cancel") @ResponseStatus(HttpStatus.ACCEPTED) public void cancel(@PathVariable UUID id) { service.cancel(id); }
  @GetMapping("/{id}/events") public List<EventResponse> events(@PathVariable UUID id) { return service.events(id).stream().map(EventResponse::from).toList(); }

  // 조회는 USER+ADMIN(SecurityConfig의 GET /api/tasks/** 규칙), 전환은 ADMIN 전용(그 외 /api/tasks/** 규칙).
  @GetMapping("/pm-provider") public PmProviderResponse pmProvider() { return new PmProviderResponse(pmProviderSettings.current()); }
  @PostMapping("/pm-provider") public PmProviderResponse setPmProvider(@Valid @RequestBody PmProviderRequest request) { return new PmProviderResponse(pmProviderSettings.set(request.provider())); }

  record PmProviderRequest(@NotNull PmProvider provider) {}
  record PmProviderResponse(PmProvider provider) {}

  record Request(@NotBlank @Size(max = 160) String title, @NotBlank @Size(max = 6000) String instruction, @NotNull TaskDomain domain) {}
  record Response(String id, String title, String instruction, TaskDomain domain, TaskStatus status, String createdAt, String completedAt, String archivePath, String finalReport, String failureReason) {
    static Response from(WorkTask task) { return new Response(task.getId().toString(), task.getTitle(), task.getInstruction(), task.getDomain(), task.getStatus(), task.getCreatedAt().toString(), task.getCompletedAt() == null ? null : task.getCompletedAt().toString(), task.getArchivePath(), task.getFinalReport(), task.getFailureReason()); }
  }
  record EventResponse(String id, String stage, String message, String model, String createdAt, Integer inputTokens, Integer outputTokens, Integer totalTokens, Long elapsedMs) {
    static EventResponse from(TaskEvent event) { return new EventResponse(event.getId().toString(), event.getStage(), event.getMessage(), event.getModel(), event.getCreatedAt().toString(), event.getInputTokens(), event.getOutputTokens(), event.getTotalTokens(), event.getElapsedMs()); }
  }
}
