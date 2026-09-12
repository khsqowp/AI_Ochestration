package com.orchestration.training;

import com.orchestration.tasks.LlmGateway;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * The model only classifies a user's natural-language test intent. It never creates an observation;
 * BlackBoxScenarioEngine remains the authority for all simulated external results.
 */
@Service
class BlackBoxScenarioIntentResolver {
  private static final Pattern ACTION = Pattern.compile("\\\"?action\\\"?\\s*[:=]\\s*\\\"?([A-Z_]+)");
  private final LlmGateway llm;
  private final String provider;

  BlackBoxScenarioIntentResolver(LlmGateway llm,
      @Value("${app.training.black-box-chat-provider:DEEPSEEK}") String provider) {
    this.llm = llm;
    this.provider = provider == null ? "DEEPSEEK" : provider.trim().toUpperCase(Locale.ROOT);
  }

  String resolve(BlackBoxScenarioDefinition scenario, String userMessage) {
    Set<String> actions = actions(scenario.slug());
    if (actions.isEmpty()) return "UNKNOWN";
    String system = """
        당신은 블랙박스 보안 실습의 의도 분류기다. 사용자의 문장을 아래 행동 중 하나로만 분류한다.
        취약점 이름, 정답, 이유, 다음 행동을 절대 쓰지 않는다. 결과는 ACTION 값 하나만 쓴다.
        확실하지 않으면 UNKNOWN을 쓴다.
        """;
    String prompt = "사건: " + scenario.title() + "\n허용 ACTION: " + String.join(", ", actions) + ", UNKNOWN\n사용자 문장: " + userMessage;
    try {
      String raw = switch (provider) {
        case "OPENAI" -> llm.evaluateTrainingWithOpenAi(system, prompt).content();
        default -> llm.classifyWithDeepSeek(system, prompt, 80).content();
      };
      String action = normalizedAction(raw);
      return actions.contains(action) ? action : "UNKNOWN";
    } catch (Exception ignored) {
      return "UNKNOWN";
    }
  }

  private String normalizedAction(String raw) {
    String value = raw == null ? "" : raw.trim().toUpperCase(Locale.ROOT);
    Matcher matcher = ACTION.matcher(value);
    if (matcher.find()) return matcher.group(1);
    return value.replaceAll("[^A-Z_]", "");
  }

  private Set<String> actions(String slug) {
    return switch (slug) {
      case "order-access" -> Set.of("OWN_ORDER", "CROSS_ORDER", "OWNER_CONFIRMATION", "CROSS_ORDER_CHANGE");
      case "coupon-cache" -> Set.of("INITIAL_COUPON", "CROSS_SESSION", "OWNER_CONFIRMATION");
      case "login-enumeration" -> Set.of("KNOWN_LOGIN", "UNKNOWN_LOGIN", "REPEAT_TIMING");
      default -> Set.of();
    };
  }
}
