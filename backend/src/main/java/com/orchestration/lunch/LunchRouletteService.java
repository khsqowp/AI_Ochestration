package com.orchestration.lunch;

import java.time.LocalDate;
import java.time.ZoneId;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class LunchRouletteService {
  private static final ZoneId KST = ZoneId.of("Asia/Seoul");
  private static final int MAX_CANDIDATES = 16;
  private static final int MIN_CANDIDATES_TO_START = 2;
  private final LunchRouletteRepository repository;

  LunchRouletteService(LunchRouletteRepository repository) { this.repository = repository; }

  @Transactional
  public LunchRoulette today() {
    LocalDate today = LocalDate.now(KST);
    return repository.findByDay(today).orElseGet(() -> repository.save(new LunchRoulette(today)));
  }

  @Transactional
  public LunchRoulette addCandidate(String rawName) {
    LunchRoulette roulette = today();
    if (roulette.getStartedAt() != null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이미 시작된 룰렛에는 후보를 추가할 수 없습니다.");
    String name = clean(rawName);
    if (roulette.getCandidates().size() >= MAX_CANDIDATES) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "후보는 최대 " + MAX_CANDIDATES + "명까지입니다.");
    if (roulette.getCandidates().contains(name)) throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 등록된 이름입니다.");
    roulette.addCandidate(name);
    return repository.save(roulette);
  }

  @Transactional
  public LunchRoulette start() {
    LunchRoulette roulette = today();
    if (roulette.getCandidates().size() < MIN_CANDIDATES_TO_START) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "후보가 " + MIN_CANDIDATES_TO_START + "명 이상이어야 시작할 수 있습니다.");
    roulette.startIfNotStarted();
    return repository.save(roulette);
  }

  private String clean(String rawName) {
    if (rawName == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이름을 입력하세요.");
    String name = rawName.replaceAll("[\\p{Cntrl}]", "").trim();
    if (name.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이름을 입력하세요.");
    if (name.length() > 20) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이름은 20자 이내로 입력하세요.");
    return name;
  }
}
