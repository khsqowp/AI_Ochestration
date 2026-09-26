package com.orchestration.lunch;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 로그인 없이 아무나 오늘의 후보를 등록하고 시작할 수 있다 -- {@code /api/orders/mine}과 같은
 * 신뢰모델(사내 화면, 낮은 위험도). SecurityConfig에서 permitAll. */
@RestController
@RequestMapping("/api/lunch-roulette")
public class LunchRouletteController {
  private final LunchRouletteService service;

  LunchRouletteController(LunchRouletteService service) { this.service = service; }

  @GetMapping("/today")
  public Response today() { return Response.from(service.today()); }

  @PostMapping("/today/candidates")
  public Response addCandidate(@RequestBody CandidateRequest request) {
    int count = request.count() == null ? 1 : request.count();
    return Response.from(service.addCandidate(request.name(), count));
  }

  @PostMapping("/today/candidates/remove")
  public Response removeCandidate(@RequestBody CandidateRequest request) { return Response.from(service.removeCandidate(request.name())); }

  @PostMapping("/today/start")
  public Response start() { return Response.from(service.start()); }

  record CandidateRequest(String name, Integer count) {}

  record Response(LocalDate day, List<String> candidates, Instant startedAt) {
    static Response from(LunchRoulette roulette) { return new Response(roulette.getDay(), roulette.getCandidates(), roulette.getStartedAt()); }
  }
}
