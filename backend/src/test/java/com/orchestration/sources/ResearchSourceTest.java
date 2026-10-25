package com.orchestration.sources;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** 7회 연속 무콘텐츠 수집 사이클이면 더 이상 크롤/LLM 예산을 낭비하지 않도록 출처가 자동으로 꺼져야 한다. */
class ResearchSourceTest {
  private ResearchSource source() {
    return new ResearchSource("이름", "https://example.com/feed", ResearchDomain.SECURITY, 24, 1, 20, null);
  }

  @Test
  void staysEnabledBeforeTheAutoDisableThreshold() {
    ResearchSource source = source();
    for (int i = 0; i < 6; i++) source.recordNoContent();

    assertThat(source.getConsecutiveNoContentCycles()).isEqualTo(6);
    assertThat(source.isEnabled()).isTrue();
  }

  @Test
  void autoDisablesOnTheSeventhConsecutiveNoContentCycle() {
    ResearchSource source = source();
    for (int i = 0; i < 7; i++) source.recordNoContent();

    assertThat(source.getConsecutiveNoContentCycles()).isEqualTo(7);
    assertThat(source.isEnabled()).isFalse();
  }

  @Test
  void contentFoundResetsTheStreakButLeavesAnAlreadyDisabledSourceOff() {
    ResearchSource source = source();
    for (int i = 0; i < 7; i++) source.recordNoContent();
    source.recordContentFound();

    assertThat(source.getConsecutiveNoContentCycles()).isZero();
    assertThat(source.isEnabled()).isFalse();
  }
}
