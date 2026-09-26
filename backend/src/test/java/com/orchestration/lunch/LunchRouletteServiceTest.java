package com.orchestration.lunch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class LunchRouletteServiceTest {
  @Mock private LunchRouletteRepository repository;
  private LunchRouletteService service;

  private void stubSaveReturnsArgument() {
    when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
  }

  @Test
  void today_createsARoomWhenNoneExistsYetForTheDate() {
    when(repository.findByDay(any())).thenReturn(Optional.empty());
    stubSaveReturnsArgument();
    service = new LunchRouletteService(repository);

    LunchRoulette room = service.today();

    assertThat(room.getDay()).isEqualTo(LocalDate.now(java.time.ZoneId.of("Asia/Seoul")));
    assertThat(room.getCandidates()).isEmpty();
  }

  @Test
  void addCandidate_appendsATrimmedName() {
    when(repository.findByDay(any())).thenReturn(Optional.empty());
    stubSaveReturnsArgument();
    service = new LunchRouletteService(repository);

    LunchRoulette room = service.addCandidate("  국밥집  ", 1);

    assertThat(room.getCandidates()).containsExactly("국밥집");
  }

  @Test
  void addCandidate_allowsDuplicateNamesAsWeight() {
    // 같은 이름을 여러 번 등록하는 게 곧 "표(가중치)" -- 예전엔 중복을 막았지만 지금은
    // "짜장면*3" 같은 표기를 위해 의도적으로 허용한다.
    LunchRoulette existing = existingRoomWithCandidates("국밥집");
    when(repository.findByDay(any())).thenReturn(Optional.of(existing));
    stubSaveReturnsArgument();
    service = new LunchRouletteService(repository);

    LunchRoulette room = service.addCandidate("국밥집", 1);

    assertThat(room.getCandidates()).containsExactly("국밥집", "국밥집");
  }

  @Test
  void addCandidate_withCountAppendsThatManyCopies() {
    when(repository.findByDay(any())).thenReturn(Optional.empty());
    stubSaveReturnsArgument();
    service = new LunchRouletteService(repository);

    LunchRoulette room = service.addCandidate("짜장면", 3);

    assertThat(room.getCandidates()).containsExactly("짜장면", "짜장면", "짜장면");
  }

  @Test
  void addCandidate_rejectsCountBelowOne() {
    when(repository.findByDay(any())).thenReturn(Optional.empty());
    stubSaveReturnsArgument();
    service = new LunchRouletteService(repository);

    assertThatThrownBy(() -> service.addCandidate("짜장면", 0))
        .isInstanceOf(ResponseStatusException.class)
        .hasMessageContaining("1 이상");
  }

  @Test
  void addCandidate_rejectsWhenTheRoomAlreadyStarted() {
    LunchRoulette started = existingRoomWithCandidates("국밥집", "냉면집");
    started.startIfNotStarted();
    when(repository.findByDay(any())).thenReturn(Optional.of(started));
    service = new LunchRouletteService(repository);

    assertThatThrownBy(() -> service.addCandidate("돈까스집", 1))
        .isInstanceOf(ResponseStatusException.class)
        .hasMessageContaining("이미 시작된");
  }

  @Test
  void addCandidate_rejectsPastTheSixteenthCandidate() {
    String[] sixteen = new String[16];
    for (int i = 0; i < 16; i++) sixteen[i] = "식당" + i;
    LunchRoulette full = existingRoomWithCandidates(sixteen);
    when(repository.findByDay(any())).thenReturn(Optional.of(full));
    service = new LunchRouletteService(repository);

    assertThatThrownBy(() -> service.addCandidate("한식당17", 1))
        .isInstanceOf(ResponseStatusException.class)
        .hasMessageContaining("최대 16명");
  }

  @Test
  void addCandidate_rejectsWhenCountWouldExceedTheLimit() {
    LunchRoulette almostFull = existingRoomWithCandidates("식당1", "식당2");
    when(repository.findByDay(any())).thenReturn(Optional.of(almostFull));
    service = new LunchRouletteService(repository);

    assertThatThrownBy(() -> service.addCandidate("짜장면", 15))
        .isInstanceOf(ResponseStatusException.class)
        .hasMessageContaining("최대 16명");
  }

  @Test
  void addCandidate_rejectsABlankName() {
    when(repository.findByDay(any())).thenReturn(Optional.empty());
    stubSaveReturnsArgument();
    service = new LunchRouletteService(repository);

    assertThatThrownBy(() -> service.addCandidate("   ", 1))
        .isInstanceOf(ResponseStatusException.class)
        .hasMessageContaining("이름을 입력");
  }

  @Test
  void removeCandidate_removesOneOccurrenceKeepingTheRest() {
    LunchRoulette existing = existingRoomWithCandidates("짜장면", "짜장면", "짜장면");
    when(repository.findByDay(any())).thenReturn(Optional.of(existing));
    stubSaveReturnsArgument();
    service = new LunchRouletteService(repository);

    LunchRoulette room = service.removeCandidate("짜장면");

    assertThat(room.getCandidates()).containsExactly("짜장면", "짜장면");
  }

  @Test
  void removeCandidate_rejectsAnUnregisteredName() {
    LunchRoulette existing = existingRoomWithCandidates("국밥집");
    when(repository.findByDay(any())).thenReturn(Optional.of(existing));
    service = new LunchRouletteService(repository);

    assertThatThrownBy(() -> service.removeCandidate("냉면집"))
        .isInstanceOf(ResponseStatusException.class)
        .hasMessageContaining("등록되지 않은");
  }

  @Test
  void removeCandidate_rejectsWhenTheRoomAlreadyStarted() {
    LunchRoulette started = existingRoomWithCandidates("국밥집", "냉면집");
    started.startIfNotStarted();
    when(repository.findByDay(any())).thenReturn(Optional.of(started));
    service = new LunchRouletteService(repository);

    assertThatThrownBy(() -> service.removeCandidate("국밥집"))
        .isInstanceOf(ResponseStatusException.class)
        .hasMessageContaining("이미 시작된");
  }

  @Test
  void start_rejectsWhenFewerThanTwoCandidates() {
    LunchRoulette lonely = existingRoomWithCandidates("국밥집");
    when(repository.findByDay(any())).thenReturn(Optional.of(lonely));
    service = new LunchRouletteService(repository);

    assertThatThrownBy(() -> service.start())
        .isInstanceOf(ResponseStatusException.class)
        .hasMessageContaining("2명 이상");
  }

  @Test
  void start_isIdempotent_keepingTheFirstStartedTimestamp() {
    LunchRoulette room = existingRoomWithCandidates("국밥집", "냉면집");
    when(repository.findByDay(any())).thenReturn(Optional.of(room));
    stubSaveReturnsArgument();
    service = new LunchRouletteService(repository);

    LunchRoulette first = service.start();
    java.time.Instant firstStartedAt = first.getStartedAt();
    LunchRoulette second = service.start();

    assertThat(second.getStartedAt()).isEqualTo(firstStartedAt);
  }

  private LunchRoulette existingRoomWithCandidates(String... names) {
    LunchRoulette room = new LunchRoulette(LocalDate.now(java.time.ZoneId.of("Asia/Seoul")));
    for (String name : names) room.addCandidate(name);
    return room;
  }
}
