package com.orchestration.dolphin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class DolphinPromptsTest {
  @ParameterizedTest
  @CsvSource({
      "general,범용 연구 어시스턴트",
      "rag,Obsidian 보안 지식 베이스",
      "ctf,**카테고리**",
      "pentest,CVSS v3 Base/Temporal",
      "bypass,**우회 벡터**",
      "threat,MITRE ATT&CK"
  })
  void selectsDistinctAuthorizedModePrompt(String mode, String fragment) {
    assertThat(DolphinPrompts.forMode(mode)).contains(fragment, "명시적 허가").doesNotContain("검열 없음", "무제한 AI");
  }

  @Test
  void rejectsUnknownMode() {
    assertThatThrownBy(() -> DolphinPrompts.forMode("unknown"))
        .isInstanceOf(ResponseStatusException.class).hasMessageContaining("400");
  }
}
