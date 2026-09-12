package com.orchestration.training;

import java.util.List;
import java.util.Locale;
import java.util.NoSuchElementException;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class BlackBoxScenarioService {
  private final BlackBoxScenarioSessionRepository sessions;
  private final CompetencyAssessmentRepository assessments;
  private final BlackBoxScenarioEngine engine = new BlackBoxScenarioEngine();

  BlackBoxScenarioService(BlackBoxScenarioSessionRepository sessions, CompetencyAssessmentRepository assessments) {
    this.sessions=sessions; this.assessments=assessments;
  }

  List<BlackBoxScenarioDefinition> scenarios() { return BlackBoxScenarioCatalog.all(); }

  @Transactional BlackBoxScenarioSession start(UUID ownerId, String slug) {
    BlackBoxScenarioSession session=BlackBoxScenarioSession.start(ownerId, BlackBoxScenarioCatalog.bySlug(slug));
    session.recordCoachMessage("사건을 시작합니다. 코드·로그·설정은 제공되지 않습니다. 직접 시도한 블랙박스 행동과 관측한 결과를 자유롭게 기록하세요.");
    return sessions.save(session);
  }

  @Transactional BlackBoxScenarioSession message(UUID ownerId, UUID sessionId, String rawMessage) {
    BlackBoxScenarioSession session=owned(ownerId, sessionId); String message=clean(rawMessage, 1800, "대화 내용");
    BlackBoxScenarioEngine.ScenarioReply reply=engine.reply(BlackBoxScenarioCatalog.bySlug(session.getScenarioSlug()), message);
    session.recordUserMessage(message);
    if(reply.observationKey()!=null) session.recordObservation(reply.observationKey(), reply.observation());
    session.recordCoachMessage(reply.coachMessage());
    return sessions.save(session);
  }

  @Transactional BlackBoxScenarioSession notes(UUID ownerId, UUID sessionId, String facts, String hypotheses, String unknowns) {
    BlackBoxScenarioSession session=owned(ownerId, sessionId);
    session.replaceNotes(cleanOptional(facts, 5000), cleanOptional(hypotheses, 5000), cleanOptional(unknowns, 5000));
    return sessions.save(session);
  }

  @Transactional BlackBoxScenarioSession close(UUID ownerId, UUID sessionId, String verdict, String conclusion) {
    BlackBoxScenarioSession session=owned(ownerId, sessionId); BlackBoxScenarioDefinition scenario=BlackBoxScenarioCatalog.bySlug(session.getScenarioSlug());
    String cleanVerdict=cleanVerdict(verdict); String cleanConclusion=clean(conclusion, 1800, "진단 결론");
    session.close(cleanVerdict, cleanConclusion);
    double score=score(session, scenario, cleanVerdict); String feedback=feedback(session, scenario, cleanVerdict, score);
    session.attachEvaluation(score, feedback); sessions.save(session); refreshBlackBoxAssessment(ownerId, session.getPrimarySkillCode());
    return session;
  }

  @Transactional(readOnly=true) BlackBoxScenarioSession session(UUID ownerId, UUID sessionId) { return owned(ownerId, sessionId); }
  @Transactional(readOnly=true) List<BlackBoxScenarioSession> history(UUID ownerId) { return sessions.findByOwnerIdOrderByStartedAtDesc(ownerId); }

  private BlackBoxScenarioSession owned(UUID ownerId, UUID sessionId) { return sessions.findByIdAndOwnerId(sessionId, ownerId).orElseThrow(NoSuchElementException::new); }
  private String clean(String value, int limit, String field) { String result=cleanOptional(value, limit); if(result.isBlank()) throw new IllegalArgumentException(field+"을 입력하세요."); return result; }
  private String cleanOptional(String value, int limit) { if(value==null) return ""; String result=value.replaceAll("[\\p{Cntrl}&&[^\\n\\t]]", "").trim(); if(result.length()>limit) throw new IllegalArgumentException("입력 길이가 너무 깁니다."); return result; }
  private String cleanVerdict(String value) { String verdict=clean(value, 30, "판정"); if(!List.of("취약점 확인", "추가 증거 필요", "취약점 아님").contains(verdict)) throw new IllegalArgumentException("판정 값이 올바르지 않습니다."); return verdict; }
  private double score(BlackBoxScenarioSession session, BlackBoxScenarioDefinition scenario, String verdict) {
    int critical=(int)scenario.criticalObservationKeys().stream().filter(session.getObservationKeys()::contains).count();
    double score=(verdict.equals(scenario.expectedVerdict())?45:10)+critical*15;
    if(!session.getFactsNote().isBlank()) score+=5; if(!session.getHypothesesNote().isBlank()) score+=5; if(!session.getUnknownsNote().isBlank()) score+=5;
    return Math.min(100, score);
  }
  private String feedback(BlackBoxScenarioSession session, BlackBoxScenarioDefinition scenario, String verdict, double score) {
    List<String> missing=scenario.criticalObservationKeys().stream().filter(key -> !session.getObservationKeys().contains(key)).toList();
    String verdictFeedback=verdict.equals(scenario.expectedVerdict())?"최종 판정은 사건의 확인 기준과 일치합니다.":"최종 판정이 현재 사건의 확인 기준과 다릅니다. 관측 범위와 결론을 다시 분리해야 합니다.";
    String evidenceFeedback=missing.isEmpty()?"핵심 블랙박스 관측을 모두 확보했습니다.":"아직 확보하지 않은 핵심 관측: "+String.join(", ", missing)+".";
    return "## 사건 분석 피드백\n"+Math.round(score)+"점\n\n- "+verdictFeedback+"\n- "+evidenceFeedback+"\n- 다음 훈련: "+scenario.feedbackFocus();
  }
  private void refreshBlackBoxAssessment(UUID ownerId, String skillCode) {
    List<BlackBoxScenarioSession> closed=sessions.findByOwnerIdAndStatusOrderByClosedAtDesc(ownerId, BlackBoxSessionStatus.CLOSED).stream()
        .filter(item -> item.getPrimarySkillCode().equals(skillCode) && item.getScore()!=null).limit(8).toList();
    if(closed.isEmpty()) return; double average=closed.stream().mapToDouble(item -> item.getScore()).average().orElse(0);
    CompetencyAssessment assessment=assessments.findByOwnerIdAndSkillCode(ownerId, skillCode).orElseGet(() -> assessments.save(new CompetencyAssessment(ownerId, skillCode, 50, AssessmentConfidence.LOW, "블랙박스 사건 분석 기록을 수집 중입니다.", 0)));
    assessment.updateBlackBox(average, closed.size(), "최근 "+closed.size()+"회 블랙박스 사건 분석 평균 "+Math.round(average)+"점.", closed.size()<3?"서로 다른 사건을 더 풀어 신뢰도를 높이세요.":"반복 누락된 관측을 줄이는 사건을 선택하세요.");
    assessments.save(assessment);
  }
}
