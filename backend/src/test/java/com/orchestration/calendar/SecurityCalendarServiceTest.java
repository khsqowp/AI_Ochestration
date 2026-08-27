package com.orchestration.calendar;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.orchestration.sources.ResearchSource;
import com.orchestration.tasks.LlmGateway;
import org.springframework.dao.DataIntegrityViolationException;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/** 실제 뉴스가 언제 후속 기사를 낼지는 통제할 수 없으므로(라이브 수집으로는 검증 불가), DeepSeek 응답을
 * 시나리오대로 스크립트해 NEW/UPDATE 분류가 각각 올바른 저장 동작으로 이어지는지 검증한다 — 특히
 * 사용자가 요구한 "같은 사고에 후속 소식이 오면 원래 자리 대신 맨 위로(lastUpdatedDate 갱신)" 동작. */
@ExtendWith(MockitoExtension.class)
class SecurityCalendarServiceTest {

  @Mock private SecurityCalendarEventRepository events;
  @Mock private SecurityCalendarUpdateRepository updates;
  @Mock private LlmGateway llm;

  private SecurityCalendarService service() { return new SecurityCalendarService(events, updates, llm); }

  private ResearchSource source() {
    ResearchSource source = mock(ResearchSource.class);
    when(source.getName()).thenReturn("Ars Technica (Security)");
    when(source.getUrl()).thenReturn("https://arstechnica.com/information-technology/");
    return source;
  }

  private LlmGateway.LlmResult result(String content) { return new LlmGateway.LlmResult("DeepSeek", "deepseek-chat", content, 0, 0, 0, 0); }

  @Test
  void newLine_savesFreshEvent_whenNoRecentCandidates() throws Exception {
    when(events.findByEventDateGreaterThanEqualOrderByEventDateDesc(any())).thenReturn(List.of());
    when(llm.classifyWithDeepSeek(any(), any())).thenReturn(result("NEW|INCIDENT|2026-06-12|PeopleSoft 0-day|수백 개 조직에서 데이터 유출"));

    service().extractFromCollection(source(), "발췌 원문");

    ArgumentCaptor<SecurityCalendarEvent> saved = ArgumentCaptor.forClass(SecurityCalendarEvent.class);
    verify(events, times(1)).saveAndFlush(saved.capture());
    assertThat(saved.getValue().getTitle()).isEqualTo("PeopleSoft 0-day");
    assertThat(saved.getValue().getEventDate()).isEqualTo(LocalDate.parse("2026-06-12"));
    assertThat(saved.getValue().getLastUpdatedDate()).isEqualTo(LocalDate.parse("2026-06-12"));
    verify(updates, never()).save(any());
  }

  @Test
  void updateLine_bumpsExistingEventInstead_ofCreatingDuplicate() throws Exception {
    SecurityCalendarEvent existing = new SecurityCalendarEvent(LocalDate.parse("2026-06-10"), SecurityCalendarCategory.INCIDENT, "A사 침해사고", "최초 보고", "최초 출처", "https://example.com/first");
    when(events.findByEventDateGreaterThanEqualOrderByEventDateDesc(any())).thenReturn(List.of(existing));
    when(llm.classifyWithDeepSeek(any(), any())).thenReturn(result("UPDATE|1|2026-06-15|피해 기업이 조치 및 복구 완료를 발표함"));

    service().extractFromCollection(source(), "후속 기사 원문");

    assertThat(existing.getLastUpdatedDate()).isEqualTo(LocalDate.parse("2026-06-15"));
    verify(events, times(1)).save(existing);
    ArgumentCaptor<SecurityCalendarUpdate> savedUpdate = ArgumentCaptor.forClass(SecurityCalendarUpdate.class);
    verify(updates, times(1)).save(savedUpdate.capture());
    assertThat(savedUpdate.getValue().getEvent()).isSameAs(existing);
    assertThat(savedUpdate.getValue().getSummary()).isEqualTo("피해 기업이 조치 및 복구 완료를 발표함");
  }

  @Test
  void updateLine_skipsDuplicate_whenAnotherSourceAlreadyReportedTheSameSummary() throws Exception {
    // Several sources independently rediscover the same already-known fact about an ongoing story --
    // without this check every one of them adds another update row with the same summary text, which is
    // exactly what produced 18 near-identical rows under one real event in production.
    SecurityCalendarEvent existing = new SecurityCalendarEvent(LocalDate.parse("2026-07-21"), SecurityCalendarCategory.INCIDENT, "Hugging Face discloses an autonomous agentic breach", "최초 보고", "최초 출처", "https://example.com/first");
    when(events.findByEventDateGreaterThanEqualOrderByEventDateDesc(any())).thenReturn(List.of(existing));
    when(updates.existsByEventAndSummary(existing, "자율 에이전트 침해 사고 후속 보도")).thenReturn(true);
    when(llm.classifyWithDeepSeek(any(), any())).thenReturn(result("UPDATE|1|2026-07-22|자율 에이전트 침해 사고 후속 보도"));

    // Not source() here on purpose: a duplicate must be recognized and skipped before source.getName()/
    // getUrl() would ever be read for the (never-created) update row -- stubbing them would just be
    // unused code that hides whether the early-return actually fired.
    service().extractFromCollection(mock(ResearchSource.class), "또 다른 소스의 후속 기사 원문");

    verify(updates, never()).save(any());
    assertThat(existing.getLastUpdatedDate()).isEqualTo(LocalDate.parse("2026-07-21"));
  }

  @Test
  void updateLine_withOlderDate_doesNotRewindLastUpdatedDate() throws Exception {
    SecurityCalendarEvent existing = new SecurityCalendarEvent(LocalDate.parse("2026-06-10"), SecurityCalendarCategory.INCIDENT, "A사 침해사고", "최초 보고", "최초 출처", "https://example.com/first");
    existing.bumpUpdated(LocalDate.parse("2026-06-20"));
    when(events.findByEventDateGreaterThanEqualOrderByEventDateDesc(any())).thenReturn(List.of(existing));
    when(llm.classifyWithDeepSeek(any(), any())).thenReturn(result("UPDATE|1|2026-06-12|과거 시점의 후속 기사가 뒤늦게 발견됨"));

    service().extractFromCollection(source(), "발췌");

    assertThat(existing.getLastUpdatedDate()).isEqualTo(LocalDate.parse("2026-06-20"));
  }

  @Test
  void newLine_skipsGracefully_whenAnotherSourceWonTheRaceOnTheSameStory() throws Exception {
    // existsByEventDateAndTitle is a check-then-act pre-filter, not the real guard -- two collection
    // tasks for different sources can both pass it before either commits. The unique DB constraint is
    // what actually stops the duplicate; this proves the resulting exception is swallowed, not left to
    // blow up the whole extraction run for every other line still waiting to be processed.
    when(events.findByEventDateGreaterThanEqualOrderByEventDateDesc(any())).thenReturn(List.of());
    when(events.saveAndFlush(any())).thenThrow(new DataIntegrityViolationException("duplicate key"));
    when(llm.classifyWithDeepSeek(any(), any())).thenReturn(result("NEW|INCIDENT|2026-07-21|Hugging Face discloses an autonomous agentic breach|자율 에이전트 침해 사고"));

    service().extractFromCollection(source(), "발췌 원문");

    verify(events, times(1)).saveAndFlush(any());
    verify(updates, never()).save(any());
  }

  @Test
  void noneLine_savesNothing() throws Exception {
    when(events.findByEventDateGreaterThanEqualOrderByEventDateDesc(any())).thenReturn(List.of());
    when(llm.classifyWithDeepSeek(any(), any())).thenReturn(result("없음"));

    service().extractFromCollection(mock(ResearchSource.class), "발췌");

    verify(events, never()).save(any());
    verify(updates, never()).save(any());
  }
}
