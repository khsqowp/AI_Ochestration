package com.orchestration.sources;

import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/source-candidates")
public class SourceCandidateController {
  private final SourceCandidateRepository candidates;
  private final SourceDiscoveryService discovery;

  SourceCandidateController(SourceCandidateRepository candidates, SourceDiscoveryService discovery) {
    this.candidates = candidates;
    this.discovery = discovery;
  }

  @GetMapping
  public List<Response> pending() { return candidates.findByStatusOrderByDiscoveredAtDesc(CandidateStatus.PENDING).stream().map(Response::from).toList(); }

  /** Manual trigger so discovery can be verified without waiting a week. */
  @PostMapping("/discover-now")
  public DiscoverResult discoverNow(@RequestParam ResearchDomain domain) { return new DiscoverResult(discovery.discoverNow(domain)); }

  @PostMapping("/{id}/approve")
  public ResearchSourceController.Response approve(@PathVariable UUID id) { return ResearchSourceController.Response.from(discovery.approve(id)); }

  @PostMapping("/{id}/reject")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void reject(@PathVariable UUID id) { discovery.reject(id); }

  record DiscoverResult(int proposed) {}
  record Response(String id, String name, String url, ResearchDomain domain, String justification, String discoveredAt) {
    static Response from(SourceCandidate candidate) {
      return new Response(candidate.getId().toString(), candidate.getName(), candidate.getUrl(), candidate.getDomain(), candidate.getJustification(), candidate.getDiscoveredAt().toString());
    }
  }
}
