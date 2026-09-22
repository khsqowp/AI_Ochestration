package com.orchestration.tasks;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

/**
 * collectPrompt() 은 순수 문자열 템플릿 함수라 Mockito/HTTP 없이 바로 검증 가능. 채팅으로 타이핑한
 * 짧은 질문은 원문(발췌)이 instruction 안에 없어서, "간결히" 로 압축하면 압축할 원본 자체가 얇아
 * 아카이브 노트가 표면적으로 나온다(2026-09-22 사용자 제보) — 반대로 웹수집/업로드/노트
 * 재가공("다음 노트 작성"/"AI 재가공", frontend/src/panels/FileExplorer.tsx)은 instruction 안에
 * 실제 원문이 이미 들어있어 "간결히"를 걸어도 결과가 얇지 않다. instruction 길이로 이 둘을 가른다.
 */
class LlmGatewayTest {

  private final LlmGateway gateway = new LlmGateway(properties(), new com.fasterxml.jackson.databind.ObjectMapper());

  private LlmProperties properties() {
    return new LlmProperties(
        "gemini-key", "deepseek-key", "openai-key",
        "gemini-2.5-flash", "deepseek-v4-pro", "gpt-4o-mini", "text-embedding-3-small",
        900, 180, 420, 2, 12000, 9000,
        BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO,
        "bedrock-key", "bedrock-model", "ap-northeast-2", BigDecimal.ZERO, BigDecimal.ZERO);
  }

  @Test
  void collectPrompt_asksForBroadResearch_whenInstructionIsAShortBareQuestion() {
    String prompt = gateway.collectPrompt(TaskDomain.SECURITY, "SQL Injection이 뭐야?");

    assertThat(prompt).contains("폭넓게");
    assertThat(prompt).doesNotContain("간결히");
  }

  @Test
  void collectPrompt_staysConcise_whenInstructionAlreadyEmbedsSourceText() {
    String longInstruction = "아래 기존 Markdown 노트를 재가공하세요.\n\n원본 내용:\n" + "가".repeat(1200);

    String prompt = gateway.collectPrompt(TaskDomain.GENERAL, longInstruction);

    assertThat(prompt).contains("간결히");
    assertThat(prompt).doesNotContain("폭넓게");
  }
}
