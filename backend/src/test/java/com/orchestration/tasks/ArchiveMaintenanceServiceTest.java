package com.orchestration.tasks;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.orchestration.files.FileProperties;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/** Covers the two classes of bug this file is most exposed to: a note silently never getting reclassified
 * because the LLM call failed (previously invisible — see the removed classifyTopicOrBlank/classifyBucketOrNull
 * wrappers), and the weekly daily-note merge actually folding the right files together. */
@ExtendWith(MockitoExtension.class)
class ArchiveMaintenanceServiceTest {

  @Mock private KnowledgeArchiveService archive;
  @Mock private LlmGateway llm;

  private ArchiveMaintenanceService service(Path obsidian) {
    return new ArchiveMaintenanceService(new FileProperties("/tmp/originals", obsidian.toString(), 30000L), archive, llm, new SecurityCategoryClassifier(llm));
  }

  private void write(Path obsidian, String relativePath, String content) throws IOException {
    Path target = obsidian.resolve(relativePath);
    Files.createDirectories(target.getParent());
    Files.writeString(target, content, StandardCharsets.UTF_8);
  }

  private LlmGateway.LlmResult result(String content) {
    return new LlmGateway.LlmResult("deepseek", "deepseek-v4-pro", content, 10, 5, 15, 100L);
  }

  @Test
  void reclassify_movesUploadNoteIntoTopicFolder_andWritesTopicFrontMatter(@TempDir Path obsidian) throws Exception {
    write(obsidian, "security/somesource/report-alpha.md", """
        ---
        title: "Alpha Report"
        date: 2026-01-01
        domain: security
        origin: upload
        ---

        # Alpha Report

        본문 내용입니다.
        """);
    // First call classifies the topic label, second (security-only) call picks the fixed category.
    when(llm.classifyWithDeepSeek(anyString(), anyString())).thenReturn(result("랜섬웨어 동향"), result("이외"));

    ArchiveMaintenanceService.MaintenanceResult maintenanceResult = service(obsidian).runNow();

    assertThat(maintenanceResult.reclassified()).isEqualTo(1);
    assertThat(Files.exists(obsidian.resolve("security/somesource/report-alpha.md"))).isFalse();
    Path moved = obsidian.resolve("security/이외/topics/랜섬웨어-동향/report-alpha.md");
    assertThat(Files.exists(moved)).isTrue();
    assertThat(Files.readString(moved)).contains("topic: \"랜섬웨어 동향\"");
  }

  @Test
  void reclassify_leavesCollectionOriginNoteInItsPerSourceFolder(@TempDir Path obsidian) throws Exception {
    write(obsidian, "security/somesource/report-gamma.md", """
        ---
        title: "Gamma Report"
        date: 2026-01-01
        domain: security
        origin: collection
        ---

        # Gamma Report

        본문 내용입니다.
        """);

    // classifyWithDeepSeek is intentionally left unstubbed: if the collection-origin exclusion in
    // reclassifyBySubject ever regressed, the note would reach the LLM call and the unstubbed
    // Mockito default (null) would blow up classifyTopic -- proving exclusion rather than assuming it.
    ArchiveMaintenanceService.MaintenanceResult maintenanceResult = service(obsidian).runNow();

    assertThat(maintenanceResult.reclassified()).isZero();
    assertThat(Files.exists(obsidian.resolve("security/somesource/report-gamma.md"))).isTrue();
    assertThat(Files.exists(obsidian.resolve("security/topics"))).isFalse();
  }

  @Test
  void reclassify_llmFailure_isRecordedAsFailure_notSilentlySkipped(@TempDir Path obsidian) throws Exception {
    write(obsidian, "security/somesource/report-beta.md", """
        ---
        title: "Beta Report"
        date: 2026-01-01
        domain: security
        origin: upload
        ---

        # Beta Report

        본문 내용입니다.
        """);
    when(llm.classifyWithDeepSeek(anyString(), anyString())).thenThrow(new RuntimeException("simulated LLM outage"));

    ArchiveMaintenanceService.MaintenanceResult maintenanceResult = service(obsidian).runNow();

    assertThat(maintenanceResult.reclassified()).isZero();
    assertThat(maintenanceResult.failed()).isGreaterThanOrEqualTo(1);
    assertThat(maintenanceResult.failedNotes()).anyMatch(entry -> entry.contains("report-beta.md") && entry.contains("simulated LLM outage"));
    // The failed note must stay exactly where it was -- a swallowed failure that still moved or
    // half-wrote the file would be worse than doing nothing.
    assertThat(Files.exists(obsidian.resolve("security/somesource/report-beta.md"))).isTrue();
  }

  @Test
  void mergeIfSameTopic_mergesOverlappingNotes_andArchivesTheSecondary(@TempDir Path obsidian) throws Exception {
    write(obsidian, "security/sourceA/left-note.md", """
        ---
        title: "Left Note"
        date: 2026-01-01
        domain: security
        ---

        # Left Note

        왼쪽 노트 내용
        """);
    write(obsidian, "security/sourceB/right-note.md", """
        ---
        title: "Right Note"
        date: 2026-01-01
        domain: security
        ---

        # Right Note

        오른쪽 노트 내용
        """);
    when(archive.overlapRatio(anyString(), anyString())).thenReturn(0.9);
    when(llm.decideWithDeepSeekLongForm(anyString(), anyString(), anyInt()))
        .thenReturn(result("# Merged Title\n\n병합된 내용입니다."));

    ArchiveMaintenanceService.MaintenanceResult maintenanceResult = service(obsidian).runNow();

    assertThat(maintenanceResult.merged()).isEqualTo(1);
    Path primary = obsidian.resolve("security/sourceA/left-note.md");
    assertThat(Files.exists(primary)).isTrue();
    assertThat(Files.readString(primary)).contains("doc_type: merged-archive").contains("병합된 내용입니다");
    assertThat(Files.exists(obsidian.resolve("security/sourceB/right-note.md"))).isFalse();
    assertThat(Files.exists(obsidian.resolve("_archived/security/sourceB/right-note.md"))).isTrue();
  }

  @Test
  void consolidateManualNotes_foldsNoteIntoNewBucket_andArchivesOriginal(@TempDir Path obsidian) throws Exception {
    write(obsidian, "security/question-note.md", """
        ---
        title: "SQL 인젝션 질문"
        date: 2026-01-01
        domain: security
        origin: manual
        ---

        # SQL 인젝션 질문

        본문 내용
        """);
    // First (security-only) call picks the fixed category, second names the bucket within it.
    when(llm.classifyWithDeepSeek(anyString(), anyString())).thenReturn(result("웹"), result("NEW: 웹 진단"));

    ArchiveMaintenanceService.MaintenanceResult maintenanceResult = service(obsidian).runNow();

    assertThat(maintenanceResult.bucketed()).isEqualTo(1);
    assertThat(Files.exists(obsidian.resolve("security/question-note.md"))).isFalse();
    assertThat(Files.exists(obsidian.resolve("_archived/security/question-note.md"))).isTrue();
    Path bucket = obsidian.resolve("security/웹/웹-진단.md");
    assertThat(Files.exists(bucket)).isTrue();
    assertThat(Files.readString(bucket)).contains("## SQL 인젝션 질문").contains("본문 내용");
  }

  @Test
  void weeklyMerge_foldsPastWeekDailyNotesIntoOneDocument_andArchivesDailyOriginals(@TempDir Path obsidian) throws Exception {
    write(obsidian, "security/krebs/2020-01-04-krebs.md", """
        ---
        title: "Krebs 파일 아카이브 (2020-01-04)"
        date: 2020-01-04
        domain: security
        origin: collection
        ---

        # 오늘의 보안 뉴스

        내용 A
        """);
    write(obsidian, "security/krebs/2020-01-05-krebs.md", """
        ---
        title: "Krebs 파일 아카이브 (2020-01-05)"
        date: 2020-01-05
        domain: security
        origin: collection
        ---

        # 오늘의 보안 뉴스

        내용 B
        """);

    // classifyWithDeepSeek is intentionally left unstubbed: the freshly-merged weekly note carries
    // origin: collection, so it must be skipped by the reclassify step rather than reaching the LLM --
    // if that exclusion ever regressed, the unstubbed Mockito default (null) would blow up the call and
    // this test would fail with an unexpected exception instead of the assertions below.
    ArchiveMaintenanceService.MaintenanceResult maintenanceResult = service(obsidian).runNow();

    assertThat(maintenanceResult.weeklyDigested()).isEqualTo(1);
    assertThat(Files.exists(obsidian.resolve("security/krebs/2020-01-04-krebs.md"))).isFalse();
    assertThat(Files.exists(obsidian.resolve("_archived/security/krebs/2020-01-04-krebs.md"))).isTrue();
    assertThat(Files.exists(obsidian.resolve("_archived/security/krebs/2020-01-05-krebs.md"))).isTrue();
    Path weekly = obsidian.resolve("security/krebs/2020-01-04-krebs-주간-정리.md");
    assertThat(Files.exists(weekly)).isTrue();
    String weeklyContent = Files.readString(weekly);
    assertThat(weeklyContent).contains("내용 A").contains("내용 B").contains("주간 정리 (2020-01-04 ~ 2020-01-10)");
    // The merged weekly note itself stays put -- no topics/ reclassification, no LLM call, no failure.
    assertThat(maintenanceResult.reclassified()).isZero();
    assertThat(maintenanceResult.failed()).isZero();
  }

  @Test
  void consolidateManualNotes_reusesExistingSecurityCategory_withoutAskingForItAgain(@TempDir Path obsidian) throws Exception {
    write(obsidian, "security/OS/windows-토큰-탈취/2026-07/note.md", """
        ---
        title: "윈도우 토큰 탈취"
        date: 2026-07-30
        domain: security
        origin: manual
        ---

        # 윈도우 토큰 탈취

        본문 내용
        """);
    when(llm.classifyWithDeepSeek(anyString(), anyString())).thenReturn(result("NEW: 윈도우 진단"));

    ArchiveMaintenanceService.MaintenanceResult maintenanceResult = service(obsidian).runNow();

    assertThat(maintenanceResult.bucketed()).isEqualTo(1);
    Path bucket = obsidian.resolve("security/OS/윈도우-진단.md");
    assertThat(Files.exists(bucket)).isTrue();
    assertThat(Files.readString(bucket)).contains("## 윈도우 토큰 탈취");
    // Only the bucket-name call should have happened -- the category is already known from the note's
    // own path (security/OS/...), so a second "which category" call would be wasted LLM spend.
    verify(llm, times(1)).classifyWithDeepSeek(anyString(), anyString());
  }

  @Test
  void consolidateManualNotes_nonSecurityDomain_stillUsesFlatBucketsFolder(@TempDir Path obsidian) throws Exception {
    write(obsidian, "economy/question-note.md", """
        ---
        title: "금리 질문"
        date: 2026-01-01
        domain: economy
        origin: manual
        ---

        # 금리 질문

        본문 내용
        """);
    when(llm.classifyWithDeepSeek(anyString(), anyString())).thenReturn(result("NEW: 금리 동향"));

    ArchiveMaintenanceService.MaintenanceResult maintenanceResult = service(obsidian).runNow();

    assertThat(maintenanceResult.bucketed()).isEqualTo(1);
    assertThat(Files.exists(obsidian.resolve("economy/buckets/금리-동향.md"))).isTrue();
  }

  @Test
  void pruneEmptyDirectories_removesEmptyLeafAndCascadesToNowEmptyParent(@TempDir Path obsidian) throws IOException {
    Path leaf = obsidian.resolve("security/topics/일회성-주제-라벨");
    Files.createDirectories(leaf);
    write(obsidian, "security/topics/실제-주제/note.md", """
        ---
        title: "실제 주제 노트"
        date: 2026-01-01
        domain: security
        ---

        # 실제 주제 노트

        본문
        """);

    service(obsidian).pruneEmptyDirectories();

    assertThat(Files.exists(leaf)).isFalse();
    // security/topics/일회성-주제-라벨 is gone, but its parent (security/topics) still holds
    // security/topics/실제-주제/, so pruning must not delete a directory that still has content.
    assertThat(Files.exists(obsidian.resolve("security/topics"))).isTrue();
    assertThat(Files.exists(obsidian.resolve("security/topics/실제-주제/note.md"))).isTrue();
  }
}
