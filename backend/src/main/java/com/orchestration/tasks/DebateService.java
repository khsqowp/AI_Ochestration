package com.orchestration.tasks;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 찬반토론(PRO_CON)/자유토론(FREE) 진행 로직. Gemini는 어느 모드에서도 토론자가 아니라 매 라운드
 * 끝에 그 라운드 발언들을 근거로 웹검색해 반환하는 RESEARCH 역할로 고정된다. 한 번의 advance() 호출 =
 * 한 번의 LLM 호출 = 한 턴 진행 (aicomf.com 참고 사이트의 수동 "진행" 버튼 UX와 동일).
 */
@Service
public class DebateService {
  private final DebateSessionRepository sessions;
  private final DebateTurnRepository turns;
  private final TaskEventRepository taskEvents;
  private final LlmGateway llm;
  private final LlmProperties properties;

  DebateService(DebateSessionRepository sessions, DebateTurnRepository turns, TaskEventRepository taskEvents, LlmGateway llm, LlmProperties properties) {
    this.sessions = sessions;
    this.turns = turns;
    this.taskEvents = taskEvents;
    this.llm = llm;
    this.properties = properties;
  }

  public DebateSession create(DebateMode mode, String topic, String proModel, String conModel, List<String> participants, int maxTurnsPerSide) {
    if (maxTurnsPerSide <= 0) throw new IllegalArgumentException("maxTurnsPerSide must be positive");
    if (mode == DebateMode.PRO_CON && (proModel == null || conModel == null)) throw new IllegalArgumentException("PRO_CON mode requires proModel and conModel");
    if (mode == DebateMode.FREE && (participants == null || participants.size() < 2)) throw new IllegalArgumentException("FREE mode requires at least 2 participants");
    String participantsCsv = participants == null ? null : String.join(",", participants);
    return sessions.save(new DebateSession(mode, topic, proModel, conModel, participantsCsv, maxTurnsPerSide));
  }

  public List<DebateSession> list() {
    return sessions.findAllByOrderByCreatedAtDesc();
  }

  public DebateSession get(UUID sessionId) {
    return sessions.findById(sessionId).orElseThrow(() -> new IllegalArgumentException("Debate session not found: " + sessionId));
  }

  public List<DebateTurn> turnsOf(UUID sessionId) {
    return turns.findBySessionIdOrderByTurnIndexAsc(sessionId);
  }

  /** Executes exactly the next turn and persists it. Throws if the session is already completed. */
  @Transactional
  public DebateTurn advance(UUID sessionId) throws Exception {
    DebateSession session = get(sessionId);
    if (session.getStatus() == DebateStatus.COMPLETED) throw new IllegalStateException("Debate already completed");

    List<String> participants = session.getMode() == DebateMode.FREE ? participantsOf(session) : List.of();
    int turnsPerRound = session.getMode() == DebateMode.PRO_CON ? 3 : participants.size() + 1;
    int turnIndex = session.getTurnsCompleted();
    int turnInRound = turnIndex % turnsPerRound;
    List<DebateTurn> history = turnsOf(sessionId);

    String role;
    String speakerModel;
    LlmGateway.LlmResult result;
    if (session.getMode() == DebateMode.PRO_CON) {
      if (turnInRound == 0) {
        role = "PRO"; speakerModel = session.getProModel();
        result = callModel(speakerModel, proConSystem("찬성", session.getTopic()), transcript(history));
      } else if (turnInRound == 1) {
        role = "CON"; speakerModel = session.getConModel();
        result = callModel(speakerModel, proConSystem("반대", session.getTopic()), transcript(history));
      } else {
        role = "RESEARCH"; speakerModel = "Gemini";
        result = llm.collectWithGemini(researchPrompt(session.getTopic(), history));
      }
    } else {
      if (turnInRound < participants.size()) {
        speakerModel = participants.get(turnInRound);
        role = "PARTICIPANT_" + (turnInRound + 1);
        result = callModel(speakerModel, freeSystem(session.getTopic(), speakerModel), transcript(history));
      } else {
        role = "RESEARCH"; speakerModel = "Gemini";
        result = llm.collectWithGemini(researchPrompt(session.getTopic(), history));
      }
    }

    DebateTurn turn = turns.save(new DebateTurn(sessionId, turnIndex, role, speakerModel, result.content()));
    taskEvents.save(new TaskEvent(sessionId, role, "%s(%s) 발언 완료: %dms, %d tokens.".formatted(role, speakerModel, result.elapsedMs(), result.totalTokens()), result, costForProvider(result)));

    session.incrementTurnsCompleted();
    if (session.getTurnsCompleted() >= session.getMaxTurnsPerSide() * turnsPerRound) session.setStatus(DebateStatus.COMPLETED);
    sessions.save(session);
    return turn;
  }

  private List<String> participantsOf(DebateSession session) {
    return Arrays.stream(session.getParticipants().split(",")).map(String::trim).filter(s -> !s.isBlank()).toList();
  }

  private LlmGateway.LlmResult callModel(String modelKey, String system, String prompt) throws Exception {
    return switch (modelKey) {
      case "DEEPSEEK" -> llm.decideWithDeepSeek(system, prompt, 1200);
      case "OPENAI" -> llm.reviewWithOpenAi(system, prompt, 1200, properties.decisionTimeoutSeconds());
      case "BEDROCK" -> llm.decideWithBedrock(system, prompt, 1200);
      default -> throw new IllegalArgumentException("Unknown debate model: " + modelKey);
    };
  }

  /** 폴백이 없는 고정 provider 호출이라 TaskWorkflowRunner의 동명 헬퍼와 달리 항상 modelKey 그대로 단가를 찾는다. */
  private BigDecimal costForProvider(LlmGateway.LlmResult result) {
    return switch (result.provider()) {
      case "OpenAI" -> estimatedCost(result, properties.openaiInputUsdPerMillion(), properties.openaiOutputUsdPerMillion());
      case "DeepSeek" -> estimatedCost(result, properties.deepseekInputUsdPerMillion(), properties.deepseekOutputUsdPerMillion());
      case "Gemini" -> estimatedCost(result, properties.geminiInputUsdPerMillion(), properties.geminiOutputUsdPerMillion());
      case "Bedrock" -> BigDecimal.ZERO;
      default -> BigDecimal.ZERO;
    };
  }

  private BigDecimal estimatedCost(LlmGateway.LlmResult result, BigDecimal inputRate, BigDecimal outputRate) {
    return inputRate.multiply(BigDecimal.valueOf(result.inputTokens())).add(outputRate.multiply(BigDecimal.valueOf(result.outputTokens())))
        .movePointLeft(6).setScale(8, java.math.RoundingMode.HALF_UP);
  }

  private String proConSystem(String side, String topic) {
    return """
        당신은 찬반토론의 %s 측 토론자입니다. 주제: %s
        지금까지의 토론 흐름을 참고해 %s 입장에서 논지를 전개하세요. 상대 발언이 있었다면 그 내용에 실제로 반박·대응하세요.
        같은 주장을 반복하지 말고 매 턴 논의를 진전시키세요. 자연스러운 한국어로 400자 내외로 간결하게 작성하세요.
        """.formatted(side, topic, side);
  }

  private String freeSystem(String topic, String speakerModel) {
    return """
        당신은 자유토론 참가자(%s)입니다. 주제: %s
        지금까지의 토론 흐름을 참고해 자신의 관점을 제시하세요. 다른 참가자의 의견이 있었다면 실제로 반응·보완·반박하세요.
        같은 주장을 반복하지 말고 매 턴 논의를 진전시키세요. 자연스러운 한국어로 400자 내외로 간결하게 작성하세요.
        """.formatted(speakerModel, topic);
  }

  private String researchPrompt(String topic, List<DebateTurn> history) {
    List<DebateTurn> lastRound = lastNonResearchTurns(history);
    StringBuilder opinions = new StringBuilder();
    for (DebateTurn turn : lastRound) opinions.append(turn.getRole()).append(": ").append(turn.getContent()).append("\n\n");
    return """
        토론 주제: %s
        아래는 이번 라운드 토론자들의 발언입니다. 이 주장들에 담긴 사실 관계를 웹 검색으로 확인하고, 근거가 되는 자료나 반박 자료를 정리해 한국어로 간결히 반환하세요.
        확인되지 않는 주장은 확인되지 않았다고 명시하세요.

        %s
        """.formatted(topic, opinions);
  }

  /** RESEARCH 턴을 제외한, 직전 라운드에 나온 발언들만 리서치 프롬프트 재료로 쓴다. */
  private List<DebateTurn> lastNonResearchTurns(List<DebateTurn> history) {
    List<DebateTurn> result = new ArrayList<>();
    for (int i = history.size() - 1; i >= 0; i--) {
      DebateTurn turn = history.get(i);
      if ("RESEARCH".equals(turn.getRole())) break;
      result.add(0, turn);
    }
    return result;
  }

  private String transcript(List<DebateTurn> history) {
    if (history.isEmpty()) return "(아직 발언 없음 — 토론을 시작하세요.)";
    StringBuilder builder = new StringBuilder();
    for (DebateTurn turn : history) builder.append("[").append(turn.getRole()).append(" / ").append(turn.getSpeakerModel()).append("]\n").append(turn.getContent()).append("\n\n");
    return builder.toString();
  }
}
