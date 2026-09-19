package com.orchestration.training;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orchestration.tasks.LlmGateway;
import com.orchestration.tasks.LlmProperties;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
class TrainingAiEvaluator {
  static final String PROMPT_VERSION = "training-evaluator-v1";
  private static final List<String> VERDICTS = List.of("CORRECT", "PARTIALLY_CORRECT", "INCORRECT", "INSUFFICIENT_EVIDENCE");
  private final LlmGateway llm;
  private final LlmProperties properties;
  private final ObjectMapper json;
  private final String provider;

  TrainingAiEvaluator(LlmGateway llm, LlmProperties properties, ObjectMapper json,
      @Value("${app.training.evaluator-provider:OPENAI}") String provider) {
    this.llm = llm; this.properties = properties; this.json = json;
    this.provider = provider == null ? "OPENAI" : provider.trim().toUpperCase(Locale.ROOT);
  }

  String provider() { return provider; }
  String model() { return "DEEPSEEK".equals(provider) ? properties.deepseekModel() : properties.openaiModel(); }
  // High #8 -- caseId/promptMd/rubricJson are taken as plain values (not a live TrainingCase) so the caller
  // is forced to pass whatever it decided actually governs this attempt's scoring -- normally the attempt's
  // own snapshot, never whatever the case's row currently happens to say.
  String cacheKey(java.util.UUID caseId, String rubricJson, String answer) {
    return sha256(caseId + "\n" + rubricJson + "\n" + answer + "\n" + provider() + "\n" + model() + "\n" + PROMPT_VERSION);
  }
  String answerHash(String answer) { return sha256(answer); }

  EvaluationResult evaluate(String promptMd, String rubricJson, String answer) throws Exception {
    String system = """
        당신은 개인 보안·개발 실무 훈련의 엄격한 채점기다. 제공된 문제, 루브릭, 답안만 근거로 채점한다.
        문제에 없는 사실을 만들어내지 말고, 증거가 불충분하면 INSUFFICIENT_EVIDENCE를 선택한다.
        HTTP 메서드 존재, 포트 개방, 에러 메시지 같은 단일 관측값만으로 취약점을 확정하지 않는다.
        사용자의 추론 전문을 요구하거나 반환하지 않는다. 한국어의 짧고 구체적인 피드백만 작성한다.
        점수는 0부터 100의 정수이며, 루브릭 밖의 기준으로 감점하지 않는다.
        반드시 아래 JSON 객체만 반환한다. Markdown 코드펜스나 추가 문장은 금지한다.
        {"verdict":"CORRECT|PARTIALLY_CORRECT|INCORRECT|INSUFFICIENT_EVIDENCE","score":0,"sectionScores":{"verdict":0,"evidence":0,"conditions":0,"impact":0,"rootCause":0,"remediation":0,"verification":0},"correctPoints":["..."],"incorrectPoints":["..."],"missingPoints":["..."],"feedbackSummary":"...","nextAction":"..."}
        """;
    String prompt = """
        ## 문제
        %s

        ## 채점 루브릭
        %s

        ## 제출 답안
        %s
        """.formatted(promptMd, rubricJson, answer);
    LlmGateway.LlmResult response = switch (provider) {
      case "OPENAI" -> llm.evaluateTrainingWithOpenAi(system, prompt);
      case "DEEPSEEK" -> llm.evaluateTrainingWithDeepSeek(system, prompt);
      default -> throw new IllegalStateException("Unsupported training evaluator provider: " + provider);
    };
    JsonNode node = json.readTree(stripFence(response.content()));
    String verdict = node.path("verdict").asText("").trim().toUpperCase(Locale.ROOT);
    if (!VERDICTS.contains(verdict)) throw new IllegalArgumentException("Evaluator returned an invalid verdict");
    int score = Math.max(0, Math.min(100, node.path("score").asInt(-1)));
    if (node.path("score").asInt(-1) < 0) throw new IllegalArgumentException("Evaluator returned no score");
    String normalizedJson = json.writeValueAsString(node);
    String feedback = feedback(verdict, score, textList(node, "correctPoints"), textList(node, "incorrectPoints"),
        textList(node, "missingPoints"), text(node, "feedbackSummary"), text(node, "nextAction"));
    return new EvaluationResult(response, score, normalizedJson, feedback);
  }

  BigDecimal estimatedCost(LlmGateway.LlmResult result) {
    BigDecimal input = "DEEPSEEK".equals(result.provider()) ? properties.deepseekInputUsdPerMillion() : properties.openaiInputUsdPerMillion();
    BigDecimal output = "DEEPSEEK".equals(result.provider()) ? properties.deepseekOutputUsdPerMillion() : properties.openaiOutputUsdPerMillion();
    return BigDecimal.valueOf(result.inputTokens()).multiply(input).add(BigDecimal.valueOf(result.outputTokens()).multiply(output))
        .movePointLeft(6).setScale(8, RoundingMode.HALF_UP);
  }

  private String feedback(String verdict, int score, List<String> correct, List<String> incorrect, List<String> missing, String summary, String nextAction) {
    return "## AI 판정\n" + verdictLabel(verdict) + " · " + score + "점\n\n"
        + section("맞은 판단", correct) + section("수정할 판단", incorrect) + section("누락된 판단", missing)
        + "## 피드백\n" + (summary.isBlank() ? "구체적 피드백이 반환되지 않았습니다." : summary) + "\n\n"
        + "## 다음 재시도\n" + (nextAction.isBlank() ? "누락된 근거와 검증 조건을 보완해 다시 제출하세요." : nextAction);
  }
  private String section(String title, List<String> values) {
    if (values.isEmpty()) return "## " + title + "\n- 없음\n\n";
    return "## " + title + "\n" + String.join("\n", values.stream().map(value -> "- " + value).toList()) + "\n\n";
  }
  private String verdictLabel(String verdict) {
    return switch (verdict) { case "CORRECT" -> "정답"; case "PARTIALLY_CORRECT" -> "부분 정답"; case "INCORRECT" -> "오답"; default -> "추가 증거 필요"; };
  }
  private List<String> textList(JsonNode node, String field) {
    List<String> values = new ArrayList<>();
    JsonNode array = node.path(field);
    if (!array.isArray()) return values;
    for (JsonNode value : array) { String text = text(value); if (!text.isBlank()) values.add(text); if (values.size() == 5) break; }
    return values;
  }
  private String text(JsonNode node, String field) { return text(node.path(field)); }
  private String text(JsonNode node) {
    String value = node.asText("").replaceAll("[\\p{Cntrl}&&[^\\n\\t]]", "").trim();
    return value.substring(0, Math.min(800, value.length()));
  }
  private String stripFence(String value) { return value.trim().replaceFirst("^```(?:json)?\\s*", "").replaceFirst("\\s*```$", ""); }
  private String sha256(String value) {
    try { byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)); return java.util.HexFormat.of().formatHex(digest); }
    catch (Exception exception) { throw new IllegalStateException("SHA-256 unavailable", exception); }
  }
  record EvaluationResult(LlmGateway.LlmResult providerResponse, int score, String resultJson, String feedbackMd) {}
}
