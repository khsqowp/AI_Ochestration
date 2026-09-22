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
  private final BlackBoxScenarioIntentResolver intents;
  private final BlackBoxCoach coach;
  private final BlackBoxConclusionEvaluator conclusionEvaluator;
  private final BlackBoxCompletionJudge completionJudge;
  private final BlackBoxAiSessionService aiSessions;
  private final BlackBoxPatternAnalyzer patternAnalyzer;

  BlackBoxScenarioService(BlackBoxScenarioSessionRepository sessions, CompetencyAssessmentRepository assessments, BlackBoxScenarioIntentResolver intents, BlackBoxCoach coach, BlackBoxConclusionEvaluator conclusionEvaluator, BlackBoxCompletionJudge completionJudge, BlackBoxAiSessionService aiSessions, BlackBoxPatternAnalyzer patternAnalyzer) {
    this.sessions=sessions; this.assessments=assessments; this.intents=intents; this.coach=coach; this.conclusionEvaluator=conclusionEvaluator; this.completionJudge=completionJudge; this.aiSessions=aiSessions; this.patternAnalyzer=patternAnalyzer;
  }

  List<BlackBoxScenarioDefinition> scenarios() { return BlackBoxScenarioCatalog.all(); }

  @Transactional(readOnly=true) java.util.Optional<BlackBoxScenarioSession> active(UUID ownerId) {
    return sessions.findFirstByOwnerIdAndStatusAndAiGeneratedTrueOrderByStartedAtDesc(ownerId, BlackBoxSessionStatus.ACTIVE).map(this::hydrate);
  }

  @Transactional BlackBoxScenarioSession startRecommended(UUID ownerId, String requestedSkillCode) {
    java.util.Optional<BlackBoxScenarioSession> existing=active(ownerId);
    if (existing.isPresent()) return existing.get();
    String skillCode=clean(requestedSkillCode,80,"훈련 주제");
    if(!BlackBoxSecurityTopics.contains(skillCode)) throw new IllegalArgumentException("보안 블랙박스 훈련 주제가 아닙니다.");
    CompetencyAssessment assessment=assessments.findByOwnerIdAndSkillCode(ownerId,skillCode)
        .orElseThrow(() -> new IllegalArgumentException("종합 역량에 없는 주제입니다."));
    BlackBoxAiSessionService.Created created=aiSessions.create(skillCode,assessment);
    return hydrate(sessions.save(BlackBoxScenarioSession.startAi(ownerId,skillCode,created.title(),created.briefing(),created.privateState(),created.firstReply())));
  }

  @Transactional BlackBoxScenarioSession start(UUID ownerId, String slug) {
    BlackBoxScenarioSession session=BlackBoxScenarioSession.start(ownerId, BlackBoxScenarioCatalog.bySlug(slug));
    BlackBoxVirtualTarget target=BlackBoxVirtualTargets.forScenario(slug);
    session.replaceRuntimeState(target.encode(target.initialState()));
    session.recordSimulatorMessage(target.initialBriefing());
    return hydrate(sessions.save(session));
  }

  @Transactional BlackBoxScenarioSession message(UUID ownerId, UUID sessionId, String rawMessage) {
    BlackBoxScenarioSession session=owned(ownerId, sessionId); String message=clean(rawMessage, 1800, "대화 내용");
    if(session.isAiGenerated()) return messageAi(session,message);
    BlackBoxScenarioDefinition scenario=BlackBoxScenarioCatalog.bySlug(session.getScenarioSlug());
    BlackBoxVirtualTarget target=BlackBoxVirtualTargets.forScenario(session.getScenarioSlug());
    BlackBoxVirtualTarget.State state=target.decode(session.getRuntimeState());
    BlackBoxCommand command=intents.resolve(scenario, state, session.getMessages(), message);
    BlackBoxVirtualTarget.Result reply=target.execute(state, command);
    session.recordUserMessage(message);
    if(reply.observationKey()!=null) session.recordObservation(reply.observationKey(), reply.transcript());
    session.replaceRuntimeState(target.encode(reply.nextState()));
    session.recordSimulatorMessage(reply.transcript());
    session.recordCoachMessage(coach.reply(scenario, session.getMessages(), message, reply.transcript()));
    closeAutomaticallyWhenSufficient(session, scenario);
    return hydrate(sessions.save(session));
  }

  private BlackBoxScenarioSession messageAi(BlackBoxScenarioSession session,String message) {
    // High #7 -- record the learner's message BEFORE calling out to the AI, and catch a failed call here
    // instead of letting it propagate: previously aiSessions.reply() ran first, so an AI outage threw
    // before recordUserMessage() ever ran, losing the message the learner just sent along with the failed
    // reply. Catching (rather than rethrowing) also means the transaction commits normally with the
    // message saved, instead of rolling everything back.
    session.recordUserMessage(message);
    BlackBoxAiSessionService.Reply reply;
    try {
      reply=aiSessions.reply(session,message);
    } catch(RuntimeException exception) {
      session.recordCoachMessage("(일시적인 오류로 응답을 생성하지 못했습니다. 메시지는 저장되었으니 다시 시도해 주세요.)");
      return hydrate(sessions.save(session));
    }
    session.replaceRuntimeState(reply.privateState());
    session.recordCoachMessage(reply.text());
    if(reply.shouldClose()) {
      try {
        BlackBoxAiSessionService.Evaluation evaluation=aiSessions.evaluate(session);
        session.closeAi(reply.closeSummary());
        session.attachEvaluation(evaluation.score(),evaluation.feedback());
        refreshBlackBoxAssessment(session.getOwnerId(),session.getPrimarySkillCode(),evaluation.nextAction());
      } catch(RuntimeException exception) {
        // The AI's reply itself already succeeded and is kept -- only the closing evaluation failed, so
        // the session simply stays open rather than losing the reply too.
      }
    }
    return hydrate(sessions.save(session));
  }

  @Transactional BlackBoxScenarioSession notes(UUID ownerId, UUID sessionId, String facts, String hypotheses, String unknowns) {
    BlackBoxScenarioSession session=owned(ownerId, sessionId);
    session.replaceNotes(cleanOptional(facts, 5000), cleanOptional(hypotheses, 5000), cleanOptional(unknowns, 5000));
    return hydrate(sessions.save(session));
  }

  @Transactional BlackBoxScenarioSession close(UUID ownerId, UUID sessionId, String verdict, String conclusion) {
    BlackBoxScenarioSession session=owned(ownerId, sessionId); if(session.isAiGenerated()) throw new IllegalStateException("AI 대화 세션은 AI가 종료 시점을 판단합니다."); BlackBoxScenarioDefinition scenario=BlackBoxScenarioCatalog.bySlug(session.getScenarioSlug());
    String cleanVerdict=cleanVerdict(verdict); String cleanConclusion=clean(conclusion, 1800, "진단 결론");
    session.close(cleanVerdict, cleanConclusion);
    BlackBoxConclusionEvaluator.Result evaluation=conclusionEvaluator.evaluate(scenario, session.getObservationKeys(), session.getObservations(), cleanVerdict, cleanConclusion);
    session.attachEvaluation(evaluation.score(), evaluation.feedback()); sessions.save(session); refreshBlackBoxAssessment(ownerId, session.getPrimarySkillCode());
    return hydrate(session);
  }

  /** Re-runs scoring for a closed session without changing its learner-authored conclusion. */
  @Transactional BlackBoxScenarioSession reevaluate(UUID ownerId, UUID sessionId) {
    BlackBoxScenarioSession session=owned(ownerId, sessionId);
    if (session.getStatus()!=BlackBoxSessionStatus.CLOSED) throw new IllegalStateException("종료된 사건만 재평가할 수 있습니다.");
    if(session.isAiGenerated()) {
      BlackBoxAiSessionService.Evaluation evaluation=aiSessions.evaluate(session);
      session.attachEvaluation(evaluation.score(),evaluation.feedback()); sessions.save(session); refreshBlackBoxAssessment(ownerId,session.getPrimarySkillCode(),evaluation.nextAction()); return hydrate(session);
    }
    BlackBoxScenarioDefinition scenario=BlackBoxScenarioCatalog.bySlug(session.getScenarioSlug());
    String verdict=session.getFinalReport().lines().filter(line -> line.startsWith("판정:")).map(line -> line.substring("판정:".length()).trim()).findFirst().orElseThrow(() -> new IllegalStateException("저장된 판정을 찾을 수 없습니다."));
    String conclusion=session.getFinalReport().contains("진단 결론:\n")?session.getFinalReport().substring(session.getFinalReport().indexOf("진단 결론:\n")+"진단 결론:\n".length()):"";
    BlackBoxConclusionEvaluator.Result evaluation=conclusionEvaluator.evaluate(scenario, session.getObservationKeys(), session.getObservations(), verdict, conclusion);
    session.attachEvaluation(evaluation.score(), evaluation.feedback()); sessions.save(session); refreshBlackBoxAssessment(ownerId, session.getPrimarySkillCode());
    return hydrate(session);
  }

  @Transactional(readOnly=true) BlackBoxScenarioSession session(UUID ownerId, UUID sessionId) { return hydrate(owned(ownerId, sessionId)); }
  @Transactional(readOnly=true) List<BlackBoxScenarioSession> history(UUID ownerId, int page, int size) {
    List<BlackBoxScenarioSession> items=sessions.findByOwnerIdAndAiGeneratedTrueOrderByStartedAtDesc(ownerId, org.springframework.data.domain.PageRequest.of(page, size));
    items.forEach(this::hydrate);
    return items;
  }

  private BlackBoxScenarioSession owned(UUID ownerId, UUID sessionId) { return sessions.findByIdAndOwnerId(sessionId, ownerId).orElseThrow(NoSuchElementException::new); }
  private BlackBoxScenarioSession hydrate(BlackBoxScenarioSession session) {
    session.getMessages(); session.getObservations(); session.getObservationKeys();
    return session;
  }
  private String clean(String value, int limit, String field) { String result=cleanOptional(value, limit); if(result.isBlank()) throw new IllegalArgumentException(field+"을 입력하세요."); return result; }
  private String cleanOptional(String value, int limit) { if(value==null) return ""; String result=value.replaceAll("[\\p{Cntrl}&&[^\\n\\t]]", "").trim(); if(result.length()>limit) throw new IllegalArgumentException("입력 길이가 너무 깁니다."); return result; }
  private String cleanVerdict(String value) { String verdict=clean(value, 30, "판정"); if(!List.of("취약점 확인", "추가 증거 필요", "취약점 아님").contains(verdict)) throw new IllegalArgumentException("판정 값이 올바르지 않습니다."); return verdict; }
  private void refreshBlackBoxAssessment(UUID ownerId, String skillCode) { refreshBlackBoxAssessment(ownerId,skillCode,null); }
  private void refreshBlackBoxAssessment(UUID ownerId, String skillCode, String evaluatedNextAction) {
    List<BlackBoxScenarioSession> closed=sessions.findByOwnerIdAndStatusOrderByClosedAtDesc(ownerId, BlackBoxSessionStatus.CLOSED).stream()
        .filter(item -> item.isAiGenerated() && item.getPrimarySkillCode().equals(skillCode) && item.getScore()!=null).limit(8).toList();
    if(closed.isEmpty()) return; double average=closed.stream().mapToDouble(item -> item.getScore()).average().orElse(0);
    CompetencyAssessment assessment=assessments.findByOwnerIdAndSkillCode(ownerId, skillCode).orElseGet(() -> assessments.save(new CompetencyAssessment(ownerId, skillCode, 50, AssessmentConfidence.LOW, "블랙박스 사건 분석 기록을 수집 중입니다.", 0)));
    String next=evaluatedNextAction==null||evaluatedNextAction.isBlank()?(closed.size()<3?"서로 다른 사건을 더 풀어 신뢰도를 높이세요.":"반복 누락된 관측을 줄이는 사건을 선택하세요."):evaluatedNextAction;
    assessment.updateBlackBox(average, closed.size(), "최근 "+closed.size()+"회 블랙박스 사건 분석 평균 "+Math.round(average)+"점.", next);
    // 세션이 새로 닫힐 때만 재호출(캐시) -- 대시보드 열 때마다 LLM 부르지 않는다. 실패/데이터 부족이면
    // null이 와서 기존 summary를 그대로 둔다(analyze()의 계약).
    List<String> feedbacks=closed.stream().map(BlackBoxScenarioSession::getFeedbackMd).filter(item -> item!=null && !item.isBlank()).toList();
    String pattern=patternAnalyzer.analyze(skillCode, feedbacks);
    if(pattern!=null) assessment.updatePatternSummary(pattern);
    assessments.save(assessment);
  }

  /** 레이더/추이 차트용 경량 조회 -- 메시지·관측 등 무거운 컬렉션은 건드리지 않아(hydrate 안 함)
   * 세션 본문을 끌어오지 않는다. */
  @Transactional(readOnly=true) List<ScorePoint> scoreTrend(UUID ownerId) {
    return sessions.findByOwnerIdAndStatusOrderByClosedAtDesc(ownerId, BlackBoxSessionStatus.CLOSED).stream()
        .filter(item -> item.isAiGenerated() && item.getScore()!=null)
        .map(item -> new ScorePoint(item.getPrimarySkillCode(), item.getScore(), item.getClosedAt()))
        .toList();
  }

  record ScorePoint(String skillCode, double score, java.time.Instant closedAt) {}
  private void closeAutomaticallyWhenSufficient(BlackBoxScenarioSession session, BlackBoxScenarioDefinition scenario) {
    BlackBoxCompletionJudge.Decision decision=completionJudge.decide(scenario, session.getMessages(), session.getObservationKeys(), session.getObservations());
    if (!decision.shouldClose()) return;
    String conclusion=session.getMessages().stream().filter(item -> item.startsWith("USER::")).map(item -> item.substring(6)).reduce("", (a,b) -> a+"\n"+b);
    session.recordCoachMessage(decision.summary());
    session.close(scenario.expectedVerdict(), conclusion);
    BlackBoxConclusionEvaluator.Result evaluation=conclusionEvaluator.evaluate(scenario, session.getObservationKeys(), session.getObservations(), scenario.expectedVerdict(), conclusion);
    session.attachEvaluation(evaluation.score(), evaluation.feedback());
    refreshBlackBoxAssessment(session.getOwnerId(), session.getPrimarySkillCode());
  }
}
