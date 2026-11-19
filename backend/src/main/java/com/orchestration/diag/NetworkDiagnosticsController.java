package com.orchestration.diag;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/diag/network-diagnose")
class NetworkDiagnosticsController {
  private final NetworkDiagnosticsService service;
  NetworkDiagnosticsController(NetworkDiagnosticsService service) { this.service = service; }

  @PostMapping
  NetworkDiagnosticsService.Response diagnose(@RequestBody NetworkDiagnosticsService.Request request) throws Exception {
    return service.diagnose(request);
  }
}
