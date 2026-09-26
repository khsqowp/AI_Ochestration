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
    LunchRoulette roulette = repository.findByDay(today).orElseGet(() -> repository.save(new LunchRoulette(today)));
    return hydrate(roulette);
  }

  @Transactional
  public LunchRoulette addCandidate(String rawName, int count) {
    LunchRoulette roulette = today();
    if (roulette.getStartedAt() != null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이미 시작된 룰렛에는 후보를 추가할 수 없습니다.");
    if (count < 1) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "개수는 1 이상이어야 합니다.");
    String name = clean(rawName);
    // 같은 이름을 여러 번 등록하는 게 곧 가중치라 중복 자체는 막지 않는다("test1*2" = test1을
    // 2번 등록) -- 전체 개수 상한만 지킨다.
    if (roulette.getCandidates().size() + count > MAX_CANDIDATES) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "후보는 최대 " + MAX_CANDIDATES + "명까지입니다.");
    for (int i = 0; i < count; i++) roulette.addCandidate(name);
    return hydrate(repository.save(roulette));
  }

  /** 등록된 표 하나를 뗀다(가중치 낮추기) -- 마지막 한 표가 지워지면 메뉴 자체가 목록에서 사라진다. */
  @Transactional
  public LunchRoulette removeCandidate(String rawName) {
    LunchRoulette roulette = today();
    if (roulette.getStartedAt() != null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이미 시작된 룰렛은 후보를 변경할 수 없습니다.");
    String name = clean(rawName);
    if (!roulette.removeOneCandidate(name)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "등록되지 않은 이름입니다.");
    return hydrate(repository.save(roulette));
  }

  @Transactional
  public LunchRoulette start() {
    LunchRoulette roulette = today();
    if (roulette.getCandidates().size() < MIN_CANDIDATES_TO_START) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "후보가 " + MIN_CANDIDATES_TO_START + "명 이상이어야 시작할 수 있습니다.");
    roulette.startIfNotStarted();
    return hydrate(repository.save(roulette));
  }

  // open-in-view=false라 트랜잭션 끝나면 세션도 끝난다 -- candidates(@ElementCollection, 기본
  // LAZY)를 컨트롤러가 Response로 매핑할 때 처음 건드리면 세션 없이 지연로딩하다 그대로 500.
  // 여기서 미리 한 번 읽어(size 트리거) 초기화해두면 컨트롤러는 이미 로드된 값만 읽는다.
  private LunchRoulette hydrate(LunchRoulette roulette) { roulette.getCandidates().size(); return roulette; }

  private String clean(String rawName) {
    if (rawName == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이름을 입력하세요.");
    String name = rawName.replaceAll("[\\p{Cntrl}]", "").trim();
    if (name.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이름을 입력하세요.");
    if (name.length() > 20) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이름은 20자 이내로 입력하세요.");
    return name;
  }
}
