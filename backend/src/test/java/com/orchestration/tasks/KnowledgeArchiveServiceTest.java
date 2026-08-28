package com.orchestration.tasks;

import static org.assertj.core.api.Assertions.assertThat;

import com.orchestration.files.FileProperties;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** 채팅으로 접수된 작업의 아카이브 제목이 사용자 원문 질문 대신 팀장 노트의 실제 헤딩을 쓰는지,
 * 반대로 수집 사이트 파이프라인이 이미 다듬어 둔 제목은 그대로 보존되는지 검증한다. */
class KnowledgeArchiveServiceTest {

  private KnowledgeArchiveService service(Path obsidian) {
    return new KnowledgeArchiveService(new FileProperties("/tmp/originals", obsidian.toString(), 30000L));
  }

  private WorkTask task(String title) {
    return new WorkTask(title, "지시 내용", TaskDomain.SECURITY, TaskOrigin.MANUAL);
  }

  private String writtenTitle(Path obsidian, String relativePath) throws IOException {
    Path note = obsidian.resolve(relativePath);
    return Files.readAllLines(note).stream().filter(line -> line.startsWith("title:")).findFirst().orElseThrow();
  }

  private long headingLineCount(Path obsidian, String relativePath) throws IOException {
    Path note = obsidian.resolve(relativePath);
    return Files.readAllLines(note).stream().filter(line -> line.startsWith("# ")).count();
  }

  private String writtenLine(Path obsidian, String relativePath, String prefix) throws IOException {
    Path note = obsidian.resolve(relativePath);
    return Files.readAllLines(note).stream().filter(line -> line.startsWith(prefix)).findFirst().orElse(null);
  }

  @Test
  void chatRequestTitle_usesLeadNoteOwnHeading(@TempDir Path obsidian) throws IOException {
    WorkTask task = task("Applied Cryptography Researcher에 대해서 공부해야되는 내용들을 작성해줘.");
    String report = "# Applied Cryptography 학습 로드맵\n\n본문 내용입니다.";

    String path = service(obsidian).archive(task, report);

    assertThat(writtenTitle(obsidian, path)).isEqualTo("title: \"Applied Cryptography 학습 로드맵\"");
  }

  @Test
  void sourceCollectionTitle_isPreservedAsIs(@TempDir Path obsidian) throws IOException {
    WorkTask task = task("[보안] Krebs on Security 파일 아카이브");
    String report = "# AI 기반 취약점 발견 및 패치 급증\n\n본문 내용입니다.";

    String path = service(obsidian).archive(task, report);

    assertThat(writtenTitle(obsidian, path)).isEqualTo("title: \"[보안] Krebs on Security 파일 아카이브\"");
  }

  @Test
  void reportWithoutOpeningHeading_fallsBackToOriginalChatTitle(@TempDir Path obsidian) throws IOException {
    WorkTask task = task("패딩오라클에 대해서 이론을 작성해줘.");
    String report = "헤딩 없이 바로 시작하는 본문입니다.";

    String path = service(obsidian).archive(task, report);

    assertThat(writtenTitle(obsidian, path)).isEqualTo("title: \"패딩오라클에 대해서 이론을 작성해줘.\"");
  }

  @Test
  void bodyDoesNotDuplicateHeading_whenReportAlreadyOpensWithOne(@TempDir Path obsidian) throws IOException {
    WorkTask task = task("Applied Cryptography Researcher에 대해서 공부해야되는 내용들을 작성해줘.");
    String report = "# Applied Cryptography 학습 로드맵\n\n본문 내용입니다.";

    String path = service(obsidian).archive(task, report);

    assertThat(headingLineCount(obsidian, path)).isEqualTo(1);
  }

  @Test
  void archive_writesOriginIntoFrontMatter_soFileExplorerCanFilterByIt(@TempDir Path obsidian) throws IOException {
    WorkTask task = new WorkTask("[보안] Krebs on Security 파일 아카이브", "지시 내용", TaskDomain.SECURITY, TaskOrigin.COLLECTION);

    String path = service(obsidian).archive(task, "# 제목\n\n본문");

    assertThat(writtenLine(obsidian, path, "origin:")).isEqualTo("origin: collection");
  }

  @Test
  void archive_omitsOriginLine_whenTaskPredatesOriginTracking(@TempDir Path obsidian) throws IOException {
    WorkTask task = new WorkTask("[보안] Krebs on Security 파일 아카이브", "지시 내용", TaskDomain.SECURITY, null);

    String path = service(obsidian).archive(task, "# 제목\n\n본문");

    assertThat(writtenLine(obsidian, path, "origin:")).isNull();
  }

  @Test
  void archive_seedsHistoryLine_withCreationDateOnANewNote(@TempDir Path obsidian) throws IOException {
    WorkTask task = task("새 노트 히스토리 테스트");

    String path = service(obsidian).archive(task, "# 제목\n\n본문");

    assertThat(writtenLine(obsidian, path, "업데이트 이력:")).isEqualTo("업데이트 이력: " + LocalDate.now());
  }

  @Test
  void bumpDateAndHistory_advancesDateAndExtendsHistory_whenNoteAlreadyHasHistoryLine(@TempDir Path obsidian) {
    String existing = "---\n"
        + "title: \"기존 노트\"\n"
        + "date: 2026-07-17\n"
        + "domain: security\n"
        + "---\n\n"
        + "업데이트 이력: 2026-07-17\n\n"
        + "# 기존 노트\n\n본문";

    String updated = service(obsidian).bumpDateAndHistory(existing, LocalDate.parse("2026-07-22"));

    assertThat(updated).contains("date: 2026-07-22");
    assertThat(updated).contains("업데이트 이력: 2026-07-17 · 2026-07-22");
  }

  @Test
  void bumpDateAndHistory_doesNotDuplicateDate_whenCalledTwiceOnTheSameDay(@TempDir Path obsidian) {
    String existing = "---\n"
        + "title: \"기존 노트\"\n"
        + "date: 2026-07-17\n"
        + "domain: security\n"
        + "---\n\n"
        + "업데이트 이력: 2026-07-17 · 2026-07-22\n\n"
        + "# 기존 노트\n\n본문";

    String updated = service(obsidian).bumpDateAndHistory(existing, LocalDate.parse("2026-07-22"));

    assertThat(updated).contains("업데이트 이력: 2026-07-17 · 2026-07-22");
    assertThat(updated).doesNotContain("2026-07-22 · 2026-07-22");
  }

  @Test
  void bumpDateAndHistory_seedsHistoryLine_forLegacyNoteArchivedBeforeThisFeature(@TempDir Path obsidian) {
    String existing = "---\n"
        + "title: \"레거시 노트\"\n"
        + "date: 2026-07-17\n"
        + "domain: security\n"
        + "---\n\n"
        + "# 레거시 노트\n\n본문 (히스토리 줄 없음)";

    String updated = service(obsidian).bumpDateAndHistory(existing, LocalDate.parse("2026-07-22"));

    assertThat(updated).contains("date: 2026-07-22");
    assertThat(updated).contains("업데이트 이력: 2026-07-17 · 2026-07-22");
  }

  @Test
  void collectionOrigin_securityDomain_routesFlatIntoNewsSegmentBySource(@TempDir Path obsidian) throws Exception {
    WorkTask task = new WorkTask("[보안] Krebs on Security 파일 아카이브", "지시 내용", TaskDomain.SECURITY, TaskOrigin.COLLECTION);

    String path = service(obsidian).archive(task, "# 랜섬웨어 동향\n\n본문 내용입니다.");

    assertThat(path).isEqualTo("security/뉴스/" + LocalDate.now() + "-보안-krebs-on-security.md");
    String content = Files.readString(obsidian.resolve(path));
    assertThat(content).contains("본문 내용입니다.");
  }

  @Test
  void collectionOrigin_differentSourcesSameDay_eachGetsItsOwnFile_noSharedCategoryFolder(@TempDir Path obsidian) throws Exception {
    WorkTask krebs = new WorkTask("[보안] Krebs on Security 파일 아카이브", "지시 내용", TaskDomain.SECURITY, TaskOrigin.COLLECTION);
    WorkTask hackerNews = new WorkTask("[보안] The Hacker News 파일 아카이브", "지시 내용", TaskDomain.SECURITY, TaskOrigin.COLLECTION);

    KnowledgeArchiveService service = service(obsidian);
    String firstPath = service.archive(krebs, "# 클라우드 침해 사례\n\nKrebs 본문.");
    String secondPath = service.archive(hackerNews, "# 별개의 클라우드 이슈\n\nHackerNews 본문.");

    assertThat(firstPath).isNotEqualTo(secondPath);
    assertThat(firstPath).startsWith("security/뉴스/").doesNotContain("/웹/").doesNotContain("/클라우드/");
    assertThat(secondPath).startsWith("security/뉴스/").doesNotContain("/웹/").doesNotContain("/클라우드/");
  }

  @Test
  void collectionOrigin_nonSecurityDomain_keepsThePerSourceFolderScheme(@TempDir Path obsidian) throws Exception {
    WorkTask task = new WorkTask("[경제] Financial Times 파일 아카이브", "지시 내용", TaskDomain.ECONOMY, TaskOrigin.COLLECTION);

    String path = service(obsidian).archive(task, "# 제목\n\n본문");

    assertThat(path).startsWith("economy/").contains("financial-times");
  }
}
