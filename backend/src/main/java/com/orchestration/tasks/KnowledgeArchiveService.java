package com.orchestration.tasks;

import com.orchestration.files.FileProperties;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class KnowledgeArchiveService {
  private static final Logger log = LoggerFactory.getLogger(KnowledgeArchiveService.class);
  private final FileProperties files;
  private final SecurityNewsItemClassifier newsItemClassifier;
  KnowledgeArchiveService(FileProperties files, SecurityNewsItemClassifier newsItemClassifier) {
    this.files = files;
    this.newsItemClassifier = newsItemClassifier;
  }

  public String archive(WorkTask task, String report) throws IOException {
    String domain = task.getDomain() == TaskDomain.GENERAL ? "ideas" : task.getDomain().name().toLowerCase(Locale.ROOT);
    Path root = Path.of(files.obsidianPath()).toAbsolutePath().normalize();
    String title = archiveTitle(task.getTitle(), report);
    String slug = title.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9가-힣]+", "-").replaceAll("(^-|-$)", "");
    if (slug.isBlank()) slug = "task";
    String topic = slug.length() > 48 ? slug.substring(0, 48).replaceAll("-$", "") : slug;

    if (task.getOrigin() == TaskOrigin.COLLECTION) return archiveDaily(root, domain, topic, title, task, report);

    String month = LocalDate.now().toString().substring(0, 7);
    Path directory = root.resolve(domain).resolve(topic).resolve(month);
    Files.createDirectories(directory);
    Path note = directory.resolve(LocalDate.now() + "-" + slug + ".md");
    if (!Files.exists(note)) {
      Optional<Path> previous = findPriorNote(root.resolve(domain), slug.replaceFirst("-파일-아카이브$", ""));
      if (previous.isPresent()) {
        Files.move(previous.get(), note);
      }
    }
    return writeOrAppend(root, note, domain, title, task, report);
  }

  /**
   * Collection sources used to get exactly one note that appended forever ("업데이트 이력" growing without
   * bound), which turned into an ever-scrolling wall of text within days. This no longer writes directly
   * into a week-spanning file either (that produced a file titled "...주간 정리 (범위)" from day one that
   * only ever held a single day's content until later collections happened to append into it) — instead
   * each collection cycle gets its own dated note per source, and {@link ArchiveMaintenanceService}'s
   * Saturday sweep folds a completed week's worth of these daily notes into one real "주간 정리" document
   * once the week is actually over, moving the originals into {@code _archived/}.
   */
  private String archiveDaily(Path root, String domain, String topic, String title, WorkTask task, String report) throws IOException {
    String sourceTitle = title.replaceFirst("\\s*파일 아카이브$", "");
    if (SecurityCategoryClassifier.SECURITY_DOMAIN.equals(domain)) {
      return archiveDailyByCategory(root, domain, sourceTitle, task, report);
    }
    String sourceStem = topic.replaceFirst("-파일-아카이브$", "");
    Path directory = root.resolve(domain).resolve(sourceStem);
    Files.createDirectories(directory);
    LocalDate today = LocalDate.now();
    Path note = directory.resolve(today + "-" + sourceStem + ".md");
    String dailyTitle = sourceTitle + " (" + today + ")";
    return writeOrAppend(root, note, domain, dailyTitle, task, report);
  }

  /**
   * 보안 수집 소스는 예전에 11개 고정 카테고리({@link SecurityCategoryClassifier})로 하위폴더를 나눠 모았으나,
   * 사이트별 리포트 하나를 통째로 카테고리 하나에 분류하는 게 의미가 크지 않아(리포트 하나가 흔히 서로
   * 무관한 소식 여러 개를 섞어 다룸) 폴더만 늘어 2026-08-28에 폐지하고 날짜 하나로만 합쳤었다.
   * 지금은 {@link SecurityNewsItemClassifier}가 그 문제를 정면으로 푼다 — 리포트를 먼저 개별 소식 단위로
   * 쪼갠 다음 각 조각에 유형(해킹사고·랜섬웨어·AI 보안 등, 고정 목록 아님 — {@link #NEWS_TYPE_REGISTRY_FILE}
   * 로 계속 재사용·성장)을 붙인다. 파일 자체는 여전히 그날 하루 전체가 {@code <date>.md} 파일 하나 — 서로
   * 다른 출처의 소식이라도 파일을 쪼개지 않고, 그 한 파일 안에서 "## 유형" 섹션으로만 나뉜다. 같은 유형
   * 섹션이 이미 있으면 그 아래로 이어 붙이고(출처가 여러 번 등장할 수 있음), 새 유형이면 파일 끝에 새
   * 섹션을 연다.
   */
  private String archiveDailyByCategory(Path root, String domain, String sourceTitle, WorkTask task, String report) throws IOException {
    LocalDate today = LocalDate.now();
    Path newsRoot = root.resolve(domain).resolve(SecurityCategoryClassifier.NEWS_SEGMENT);
    Path note = newsRoot.resolve(today + ".md");
    List<String> knownTypes = readNewsTypeRegistry(newsRoot);
    List<SecurityNewsItemClassifier.NewsItem> items = newsItemClassifier.split(sourceTitle, report, knownTypes);
    growNewsTypeRegistry(newsRoot, knownTypes, items);
    Files.createDirectories(newsRoot);
    writeNewsItemsIntoDailyFile(note, domain, today, sourceTitle, items);
    return root.relativize(note).toString();
  }

  private static final String NEWS_TYPE_REGISTRY_FILE = ".news-type-labels";
  private static final Pattern NEWS_SECTION_HEADING = Pattern.compile("(?m)^## (.+)$");

  // 서로 다른 출처가 미세하게 다른 공백으로 같은 유형을 돌려줘도(예: "AI  보안") 섹션이 갈라지지 않게
  // 공백만 정규화한다 — 폴더명이 아니라 마크다운 섹션 제목이라 나머지 문자는 그대로 둔다.
  private String normalizeNewsType(String type) {
    String normalized = type.strip().replaceAll("\\s+", " ");
    return normalized.isBlank() ? SecurityNewsItemClassifier.FALLBACK_TYPE : normalized;
  }

  private List<String> readNewsTypeRegistry(Path newsRoot) {
    Path registry = newsRoot.resolve(NEWS_TYPE_REGISTRY_FILE);
    if (!Files.exists(registry)) return List.of();
    try {
      return Files.readAllLines(registry, StandardCharsets.UTF_8).stream()
          .map(String::strip).filter(line -> !line.isBlank()).distinct().toList();
    } catch (IOException exception) {
      log.warn("news_type_registry_read_failed", exception);
      return List.of();
    }
  }

  private void growNewsTypeRegistry(Path newsRoot, List<String> existing, List<SecurityNewsItemClassifier.NewsItem> items) {
    Set<String> merged = new LinkedHashSet<>(existing);
    boolean changed = false;
    for (SecurityNewsItemClassifier.NewsItem item : items) {
      changed |= merged.add(normalizeNewsType(item.type()));
    }
    if (!changed) return;
    try {
      Files.createDirectories(newsRoot);
      Files.write(newsRoot.resolve(NEWS_TYPE_REGISTRY_FILE), merged, StandardCharsets.UTF_8);
    } catch (IOException exception) {
      log.warn("news_type_registry_write_failed", exception);
    }
  }

  /**
   * 기존 파일이 있으면 앞부분(프런트매터 + 날짜 이력 + H1 제목)은 {@link #bumpDateAndHistory}로만 갱신하고,
   * 그 뒤 본문만 "## 유형" 단위로 파싱해 이번 항목들을 맞는 섹션에 끼워 넣는다 — {@link #writeOrAppend}처럼
   * 새 블록을 파일 끝에 무조건 붙이면 유형별로 섹션이 갈라지지 않으므로 이 파일만은 별도 경로로 쓴다.
   */
  private void writeNewsItemsIntoDailyFile(Path note, String domain, LocalDate today, String sourceTitle,
      List<SecurityNewsItemClassifier.NewsItem> items) throws IOException {
    String dailyTitle = "보안 뉴스 (" + today + ")";
    String headingLine = "# " + dailyTitle;
    String head;
    LinkedHashMap<String, String> sections = new LinkedHashMap<>();
    if (Files.exists(note)) {
      String existing = Files.readString(note, StandardCharsets.UTF_8);
      String bumped = bumpDateAndHistory(existing, today);
      int headingIndex = bumped.indexOf(headingLine);
      if (headingIndex < 0) {
        // 제목 줄을 못 찾을 만큼 형식이 어긋난 레거시 파일이면 안전하게 그대로 두고 끝에 이어 붙인다.
        head = bumped.stripTrailing() + "\n\n";
      } else {
        int bodyStart = headingIndex + headingLine.length();
        head = bumped.substring(0, bodyStart) + "\n\n";
        sections.putAll(parseNewsSections(bumped.substring(bodyStart)));
      }
    } else {
      head = "---\n"
          + "title: \"" + dailyTitle + "\"\n"
          + "date: " + today + "\n"
          + "domain: " + domain + "\n"
          + "doc_type: pm-report\n"
          + "origin: collection\n"
          + "tags: [orchestration, " + domain + "]\n"
          + "---\n\n"
          + "업데이트 이력: " + today + "\n\n"
          + headingLine + "\n\n";
    }
    for (SecurityNewsItemClassifier.NewsItem item : items) {
      String type = normalizeNewsType(item.type());
      String block = "**출처: " + sourceTitle + " · " + item.title() + "**\n\n" + item.body().strip();
      sections.merge(type, block, (existingContent, newBlock) -> existingContent.stripTrailing() + "\n\n---\n\n" + newBlock);
    }
    StringBuilder body = new StringBuilder();
    for (var entry : sections.entrySet()) {
      body.append("## ").append(entry.getKey()).append("\n\n").append(entry.getValue().strip()).append("\n\n");
    }
    Files.writeString(note, head + body, StandardCharsets.UTF_8);
  }

  private LinkedHashMap<String, String> parseNewsSections(String body) {
    LinkedHashMap<String, String> sections = new LinkedHashMap<>();
    Matcher matcher = NEWS_SECTION_HEADING.matcher(body);
    List<String> headings = new ArrayList<>();
    List<int[]> spans = new ArrayList<>();
    while (matcher.find()) {
      headings.add(matcher.group(1).trim());
      spans.add(new int[]{matcher.start(), matcher.end()});
    }
    for (int i = 0; i < headings.size(); i++) {
      int contentStart = spans.get(i)[1];
      int contentEnd = i + 1 < headings.size() ? spans.get(i + 1)[0] : body.length();
      sections.put(headings.get(i), body.substring(contentStart, contentEnd).trim());
    }
    return sections;
  }

  private String writeOrAppend(Path root, Path note, String domain, String title, WorkTask task, String report) throws IOException {
    // report가 이미 자기 제목으로 여는 헤딩을 갖고 있으면(팀장 노트는 항상 그렇다), title을 다시 "# "로
    // 앞에 붙이지 않는다 — 그렇게 하면 같은 제목이 헤딩으로 두 번 찍힌다.
    String body = OPENING_HEADING.matcher(report).find() ? report : "# " + title + "\n\n" + report;
    String markdown = "---\n"
        + "title: \"" + title.replace("\"", "'") + "\"\n"
        + "date: " + LocalDate.now() + "\n"
        + "domain: " + domain + "\n"
        + "doc_type: pm-report\n"
        + "task_id: " + task.getId() + "\n"
        // null for tasks created before origin tracking existed — omitted rather than written as
        // a literal "null" string, so the file explorer's category filter just treats it as uncategorized.
        + (task.getOrigin() == null ? "" : "origin: " + task.getOrigin().name().toLowerCase(Locale.ROOT) + "\n")
        + "tags: [orchestration, " + domain + "]\n"
        + "---\n\n"
        + "업데이트 이력: " + LocalDate.now() + "\n\n"
        + body + "\n";
    if (Files.exists(note)) {
      String existing = Files.readString(note, StandardCharsets.UTF_8);
      if (sameMaterial(existing, report)) return root.relativize(note).toString();
      String refreshed = bumpDateAndHistory(existing, LocalDate.now());
      markdown = refreshed.stripTrailing() + "\n\n---\n\n## 추가 수집 내용 (" + LocalDate.now() + ")\n\n" + report.strip() + "\n";
    }
    Files.writeString(note, markdown, StandardCharsets.UTF_8);
    return root.relativize(note).toString();
  }

  private static final Pattern OPENING_HEADING = Pattern.compile("\\A\\s*#{1,3}[ \\t]+(.+)");
  private static final Pattern DATE_LINE = Pattern.compile("(?m)^date: (\\d{4}-\\d{2}-\\d{2})$");
  private static final Pattern HISTORY_LINE = Pattern.compile("(?m)^업데이트 이력: (.+)$");
  private static final Pattern FRONT_MATTER_DELIMITER = Pattern.compile("(?m)^---\\s*$");

  /**
   * A file that keeps growing via appends previously kept its original creation date forever — the
   * append branch only ever tacked new text on after the existing content, never touching the
   * frontmatter above it. This brings date: current and extends the "업데이트 이력" line so the file
   * list's date column (and its default date-descending sort) reflect that the note is still active.
   * Legacy notes archived before this line existed get one seeded from their original date: value.
   *
   * <p>Package-visible so tests can pass a fixed {@code today} directly — {@link #archive} always
   * derives it from {@link LocalDate#now()}, which a test cannot roll forward to simulate a later day.
   */
  String bumpDateAndHistory(String existing, LocalDate today) {
    Matcher dateMatch = DATE_LINE.matcher(existing);
    String originalDate = dateMatch.find() ? dateMatch.group(1) : today.toString();
    String updated = DATE_LINE.matcher(existing).replaceFirst("date: " + today);

    Matcher historyMatch = HISTORY_LINE.matcher(updated);
    if (historyMatch.find()) {
      List<String> dates = new ArrayList<>(Arrays.asList(historyMatch.group(1).trim().split("\\s*·\\s*")));
      if (!dates.contains(today.toString())) dates.add(today.toString());
      return updated.substring(0, historyMatch.start()) + "업데이트 이력: " + String.join(" · ", dates) + updated.substring(historyMatch.end());
    }
    Matcher delimiterMatch = FRONT_MATTER_DELIMITER.matcher(updated);
    if (delimiterMatch.find() && delimiterMatch.find()) {
      String history = originalDate.equals(today.toString()) ? originalDate : originalDate + " · " + today;
      int insertAt = delimiterMatch.end();
      return updated.substring(0, insertAt) + "\n\n업데이트 이력: " + history + updated.substring(insertAt);
    }
    return updated;
  }

  /**
   * 채팅으로 접수된 작업은 프런트가 사용자 원문 질문을 그대로 잘라 task 제목으로 보내므로, 그대로
   * 아카이브 제목에 쓰면 "제목이 없는" 것처럼 보인다(질문 문장 자체가 제목 자리에 뜬다). 팀장 노트는
   * 이미 주제에 맞는 제목을 스스로 정해 쓰도록 지시받으므로, 그 노트가 실제로 여는 첫 헤딩을 제목으로
   * 대신 쓴다. 수집 사이트 파이프라인이 만든 "[보안] 소스명 파일 아카이브" 같은 이미 다듬어진 제목은
   * 건드리지 않는다 — 대괄호로 시작하는 것으로 구분한다.
   */
  private String archiveTitle(String original, String report) {
    String base = original.replaceFirst("\\s*(수집 자료 검토|원본\\s*\\d+개\\s*검토|파일 아카이브)$", "").trim();
    boolean craftedLabel = original.trim().matches("^\\[.+?].*");
    if (!craftedLabel) {
      Matcher heading = OPENING_HEADING.matcher(report);
      if (heading.find()) {
        String extracted = heading.group(1).trim();
        if (!extracted.isBlank() && extracted.length() <= 160) return extracted;
      }
    }
    return base.equals(original.trim()) ? original : base + " 파일 아카이브";
  }

  private Optional<Path> findPriorNote(Path domainRoot, String stableSlug) throws IOException {
    if (!Files.exists(domainRoot)) return Optional.empty();
    try (Stream<Path> paths = Files.walk(domainRoot, 4)) {
      return paths.filter(Files::isRegularFile)
          .filter(path -> path.getFileName().toString().toLowerCase(Locale.ROOT).contains(stableSlug))
          .findFirst();
    }
  }

  private boolean sameMaterial(String existing, String incoming) {
    String a = compact(existing);
    String b = compact(incoming);
    if (a.equals(b) || a.contains(b) || b.contains(a)) return true;
    return overlapRatio(existing, incoming) >= 0.82;
  }

  /** Package-visible so {@link ArchiveMaintenanceService} can cheaply pre-filter cross-topic duplicate
   * candidates locally, before spending an LLM call confirming and merging any of them. */
  double overlapRatio(String left, String right) {
    Set<String> a = terms(left);
    Set<String> b = terms(right);
    if (a.isEmpty() || b.isEmpty()) return 0;
    Set<String> overlap = new HashSet<>(a);
    overlap.retainAll(b);
    Set<String> union = new HashSet<>(a);
    union.addAll(b);
    return (double) overlap.size() / union.size();
  }

  private String compact(String value) { return value.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9가-힣]", ""); }
  private Set<String> terms(String value) {
    Set<String> result = new HashSet<>();
    for (String term : value.toLowerCase(Locale.ROOT).split("[^a-z0-9가-힣]+")) if (term.length() >= 3) result.add(term);
    return result;
  }
}
