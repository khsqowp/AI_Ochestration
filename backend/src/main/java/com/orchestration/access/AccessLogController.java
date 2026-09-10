package com.orchestration.access;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 관리 › 접근기록 데이터. ADMIN 전용 ({@code /api/admin/**} 규칙). */
@RestController
@RequestMapping("/api/admin/access-log")
public class AccessLogController {
  private final AccessLogService service;

  AccessLogController(AccessLogService service) { this.service = service; }

  @GetMapping
  public AccessLogService.Summary summary() {
    return service.summary();
  }
}
