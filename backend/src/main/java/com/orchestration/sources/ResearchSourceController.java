package com.orchestration.sources;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/research-sources")
public class ResearchSourceController {
  private final ResearchSourceService service;
  private final SourceCollectionService collector;
  private final CollectionSettingService collectionSettings;
  ResearchSourceController(ResearchSourceService service, SourceCollectionService collector, CollectionSettingService collectionSettings) {
    this.service = service; this.collector = collector; this.collectionSettings = collectionSettings;
  }

  @GetMapping public List<Response> list() { return service.list().stream().map(Response::from).toList(); }
  @GetMapping("/due") public List<Response> due() { return service.due().stream().map(Response::from).toList(); }
  @GetMapping("/collection-enabled") public CollectionEnabledResponse collectionEnabled() { return new CollectionEnabledResponse(collectionSettings.enabled()); }
  @PostMapping("/collection-enabled") public CollectionEnabledResponse setCollectionEnabled(@Valid @RequestBody CollectionEnabledRequest request) {
    return new CollectionEnabledResponse(collectionSettings.set(request.enabled()));
  }
  @PostMapping @ResponseStatus(HttpStatus.CREATED) public Response create(@Valid @RequestBody Request request) {
    return Response.from(service.create(new ResearchSourceService.CreateResearchSource(request.name(), request.url(), request.domain(), request.intervalHours(), request.crawlDepth(), request.maxPages(), request.note())));
  }
  @PutMapping("/{id}") public Response update(@PathVariable UUID id, @Valid @RequestBody UpdateRequest request) {
    return Response.from(service.update(id, new ResearchSourceService.UpdateResearchSource(request.name(), request.domain(), request.intervalHours(), request.crawlDepth(), request.maxPages(), request.note())));
  }
  @PostMapping("/{id}/collect-now") public SourceCollectionService.CollectionResult collectNow(@PathVariable UUID id) { return collector.collectNow(id); }
  @PostMapping("/{id}/collected") @ResponseStatus(HttpStatus.NO_CONTENT) public void collected(@PathVariable UUID id) { service.markCollected(id); }
  @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void delete(@PathVariable UUID id) { service.delete(id); }

  record CollectionEnabledRequest(@NotNull Boolean enabled) {}
  record CollectionEnabledResponse(boolean enabled) {}
  record Request(@NotBlank @Size(max = 120) String name, @NotBlank @Size(max = 2048) String url, @NotNull ResearchDomain domain,
                 @Min(1) @Max(168) int intervalHours, @Min(0) @Max(2) int crawlDepth, @Min(1) @Max(100) int maxPages, @Size(max = 500) String note) {}
  record UpdateRequest(@NotBlank @Size(max = 120) String name, @NotNull ResearchDomain domain, @Min(1) @Max(168) int intervalHours,
                       @Min(0) @Max(2) int crawlDepth, @Min(1) @Max(100) int maxPages, @Size(max = 500) String note) {}
  record Response(String id, String name, String url, ResearchDomain domain, int intervalHours, int crawlDepth, int maxPages, boolean enabled, String note, String lastCollectedAt, int consecutiveNoContentCycles) {
    static Response from(ResearchSource source) {
      return new Response(source.getId().toString(), source.getName(), source.getUrl(), source.getDomain(), source.getIntervalHours(), source.getCrawlDepth(), source.getMaxPages(), source.isEnabled(), source.getNote(), source.getLastCollectedAt() == null ? null : source.getLastCollectedAt().toString(), source.getConsecutiveNoContentCycles());
    }
  }
}
