package com.orchestration.training;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import org.junit.jupiter.api.Test;

class BlackBoxScenarioSessionTest {
  @Test
  void keeps_each_attempts_chat_notes_and_observations_independent() {
    UUID owner = UUID.randomUUID();
    BlackBoxScenarioSession first = BlackBoxScenarioSession.start(owner, BlackBoxScenarioCatalog.orderAccess());
    first.recordUserMessage("A 계정으로 다른 주문 번호를 조회했다.");
    first.replaceNotes("확인한 사실: 다른 주문 정보가 보였다.", "가설: 객체 인가 누락", "아직 모르는 것: 캐시 영향");
    first.recordObservation("계정 A에서 타인 주문 번호 조회가 200으로 반환됐다.");
    first.close("취약점 확인", "타인 주문 정보가 일반 회원 A에게 반환됐다.");

    BlackBoxScenarioSession retry = BlackBoxScenarioSession.start(owner, BlackBoxScenarioCatalog.orderAccess());

    assertThat(retry.getMessages()).isEmpty();
    assertThat(retry.getFactsNote()).isBlank();
    assertThat(retry.getHypothesesNote()).isBlank();
    assertThat(retry.getUnknownsNote()).isBlank();
    assertThat(retry.getObservations()).isEmpty();
    assertThat(retry.getStatus()).isEqualTo(BlackBoxSessionStatus.ACTIVE);
  }

  @Test
  void closes_with_a_short_text_diagnostic_report_not_a_seven_field_form() {
    BlackBoxScenarioSession session = BlackBoxScenarioSession.start(UUID.randomUUID(), BlackBoxScenarioCatalog.orderAccess());
    session.recordObservation("A 계정으로 B 주문 번호 조회 시 200 OK와 B 배송지가 반환됐다.");
    session.close("취약점 확인", "일반 회원 간 주문 상세 조회에서 소유권 검증 누락이 확인됐다.");

    assertThat(session.getFinalReport()).contains("판정: 취약점 확인");
    assertThat(session.getFinalReport()).contains("일반 회원 간 주문 상세 조회");
    assertThat(session.getFinalReport()).doesNotContain("재검증");
    assertThat(session.getStatus()).isEqualTo(BlackBoxSessionStatus.CLOSED);
  }

  @Test
  void closeAi_neverPersistsABlankFinalReport_evenIfTheCallerPassesOneIn() {
    // Medium #12, defense-in-depth -- BlackBoxAiSessionService.reply() is now supposed to always fall
    // back to a non-blank summary itself, but closeAi() must not trust that and re-blank the report if
    // some future caller ever passes null/"" straight through.
    BlackBoxScenarioSession session = BlackBoxScenarioSession.start(UUID.randomUUID(), BlackBoxScenarioCatalog.orderAccess());

    session.closeAi("");

    assertThat(session.getFinalReport()).isNotBlank();
    assertThat(session.getStatus()).isEqualTo(BlackBoxSessionStatus.CLOSED);
  }
}
