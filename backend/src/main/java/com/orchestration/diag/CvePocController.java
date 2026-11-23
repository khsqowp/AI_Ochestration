package com.orchestration.diag;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/diag/cve-poc")
class CvePocController {
  private final CvePocService service;

  CvePocController(CvePocService service) { this.service = service; }

  @PostMapping
  CvePocService.Response lookup(@RequestBody Request request) {
    return service.lookup(request == null ? null : request.cveId(), request != null && request.includeAiSummary());
  }

  record Request(String cveId, boolean includeAiSummary) {}
}
