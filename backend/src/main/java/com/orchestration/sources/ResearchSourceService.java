package com.orchestration.sources;

import java.net.URI;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ResearchSourceService {
  private final ResearchSourceRepository sources;
  ResearchSourceService(ResearchSourceRepository sources) { this.sources = sources; }

  /** Existing rows predate crawl settings; give them safe defaults when first accessed. */
  @Transactional
  public List<ResearchSource> list() {
    List<ResearchSource> result = sources.findAllByOrderByDomainAscCreatedAtDesc();
    result.forEach(ResearchSource::applyLegacyCrawlDefaults);
    return result;
  }

  @Transactional
  public ResearchSource create(CreateResearchSource request) {
    validateUrl(request.url());
    return sources.save(new ResearchSource(request.name().trim(), request.url().trim(), request.domain(), request.intervalHours(), request.crawlDepth(), request.maxPages(), normalizeNote(request.note())));
  }

  @Transactional
  public List<ResearchSource> due() {
    Instant now = Instant.now();
    List<ResearchSource> registered = sources.findByEnabledTrueOrderByDomainAscCreatedAtAsc();
    registered.forEach(ResearchSource::applyLegacyCrawlDefaults);
    return registered.stream()
        .filter(source -> source.getLastCollectedAt() == null || source.getLastCollectedAt().plus(source.getIntervalHours(), ChronoUnit.HOURS).isBefore(now))
        .toList();
  }

  @Transactional
  public void markCollected(UUID id) {
    ResearchSource source = sources.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    source.markCollected();
  }

  @Transactional
  public List<ResearchSource> dueForRetry() {
    return sources.findByEnabledTrueAndNextRetryAtLessThanEqual(Instant.now());
  }

  @Transactional
  public void clearRetryState(UUID id) {
    sources.findById(id).ifPresent(ResearchSource::clearRetryState);
  }

  @Transactional
  public void recordCollectionFailure(UUID id, long[] backoffHours) {
    sources.findById(id).ifPresent(source -> source.recordCollectionFailure(backoffHours));
  }

  @Transactional
  public void recordNoContent(UUID id) {
    sources.findById(id).ifPresent(ResearchSource::recordNoContent);
  }

  @Transactional
  public void recordContentFound(UUID id) {
    sources.findById(id).ifPresent(ResearchSource::recordContentFound);
  }

  @Transactional(readOnly = true)
  public ResearchSource get(UUID id) { return sources.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND)); }

  @Transactional
  public ResearchSource update(UUID id, UpdateResearchSource request) {
    ResearchSource source = sources.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    source.update(request.name().trim(), request.domain(), request.intervalHours(), request.crawlDepth(), request.maxPages(), normalizeNote(request.note()));
    return source;
  }


  @Transactional
  public void delete(UUID id) { sources.deleteById(id); }

  private void validateUrl(String value) {
    try {
      URI uri = URI.create(value.trim());
      if (!("http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme())) || uri.getHost() == null) throw new IllegalArgumentException();
    } catch (IllegalArgumentException exception) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "http 또는 https URL을 입력하세요.");
    }
  }
  private String normalizeNote(String note) { return note == null || note.isBlank() ? null : note.trim(); }
  public record CreateResearchSource(String name, String url, ResearchDomain domain, int intervalHours, int crawlDepth, int maxPages, String note) {}
  public record UpdateResearchSource(String name, ResearchDomain domain, int intervalHours, int crawlDepth, int maxPages, String note) {}
}
