package com.orchestration.lunch;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OrderColumn;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * 하루에 하나 -- {@code day}가 유니크라 오늘 것이 없으면 새로 만든다(자정 지나면 자동으로 새 방).
 * 후보 순서는 그대로 마블 시작 위치 순서로 쓴다({@code @OrderColumn}) -- 물리 시뮬레이션은 서버가
 * 아니라 각 클라이언트가 동일 후보 순서+동일 맵으로 로컬 재생하므로(WASM 부동소수점은 스펙상
 * 결정론적), 서버는 "누가 후보로 등록했는지"와 "언제 시작했는지"만 들고 있으면 된다 -- 승자 계산은
 * 서버 책임이 아니다.
 */
@Entity
@Table(name = "lunch_roulette", uniqueConstraints = @UniqueConstraint(name = "uq_lunch_roulette_day", columnNames = "day"))
public class LunchRoulette {
  @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
  @Column(nullable = false) private LocalDate day;
  @ElementCollection
  @CollectionTable(name = "lunch_roulette_candidate", joinColumns = @JoinColumn(name = "roulette_id"))
  @OrderColumn(name = "candidate_order")
  @Column(name = "name", length = 40, nullable = false)
  private List<String> candidates = new ArrayList<>();
  private Instant startedAt;

  protected LunchRoulette() {}

  LunchRoulette(LocalDate day) { this.day = day; }

  public UUID getId() { return id; }
  public LocalDate getDay() { return day; }
  public List<String> getCandidates() { return List.copyOf(candidates); }
  public Instant getStartedAt() { return startedAt; }

  void addCandidate(String name) { candidates.add(name); }

  /** 멱등 -- 이미 시작된 방에 여러 클라이언트가 동시에 "시작" 눌러도 최초 시작 시각을 그대로 유지한다.
   * 이 시각을 기준으로 각 클라이언트가 경과시간만큼 시뮬레이션을 빨리감기해 늦게 들어온 사람도 같은
   * 장면을 본다. */
  void startIfNotStarted() { if (startedAt == null) startedAt = Instant.now(); }
}
