package com.orchestration.files;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.web.server.ResponseStatusException;

/** path/query가 base64url인 이유: ArchiveController.decodeParam 위 주석 참고 -- 보안 리서치 노트
 * 제목에 자연스럽게 섞이는 "injection"/"공격" 같은 단어가 URL에 그대로 노출되면 Cloudflare WAF가
 * 공격 패턴으로 오인해 요청을 origin까지 오기도 전에 403으로 막는 사고가 실제로 있었다. */
class ArchiveControllerTest {

  @TempDir private Path obsidian;
  private ArchiveController controller;

  @BeforeEach
  void setUp() {
    FileProperties properties = new FileProperties(obsidian.resolve("originals").toString(), obsidian.toString(), 30000);
    controller = new ArchiveController(properties, null, null, null);
  }

  private static String encode(String value) {
    return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
  }

  @Test
  void content_decodesABase64urlPathContainingWafTriggeringKeywords() throws IOException {
    Files.createDirectories(obsidian.resolve("security"));
    String relative = "security/간접-프롬프트-인젝션-indirect-injection-attack.md";
    Files.writeString(obsidian.resolve(relative), "---\ntitle: \"공격 벡터\"\n---\n본문");

    ArchiveController.MarkdownContent content = controller.content(encode(relative));

    assertThat(content.path()).isEqualTo(relative);
    assertThat(content.body()).contains("본문");
  }

  @Test
  void content_rejectsMalformedBase64WithBadRequest_notA500() {
    assertThatThrownBy(() -> controller.content("not-valid-base64!!"))
        .isInstanceOf(ResponseStatusException.class)
        .hasMessageContaining("400");
  }

  @Test
  void search_decodesABase64urlQueryContainingWafTriggeringKeywords() throws IOException {
    Files.createDirectories(obsidian.resolve("security"));
    Files.writeString(obsidian.resolve("security/note.md"), "SQL injection 공격 벡터 설명");

    List<ArchiveController.SearchResult> results = controller.search(encode("injection"));

    assertThat(results).hasSize(1);
    assertThat(results.get(0).name()).isEqualTo("note.md");
  }
}
