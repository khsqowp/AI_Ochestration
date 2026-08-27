package com.orchestration.tasks;

import com.orchestration.files.FileProperties;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * {@link KnowledgeArchiveService} only dedups when a *new* task writes into the *same* topic-slug
 * folder. Two collectors covering the same real-world story (e.g. krebsonsecurity vs. thehackernews
 * reporting the same breach) land in two different topic slugs and are never compared against each
 * other at write time. This weekly sweep catches that cross-topic case: a cheap local term-overlap
 * pre-filter (near-zero cost) narrows the field, an LLM call confirms and merges only the pairs that
 * clear the bar, and the losing file is moved to {@code _archived/} rather than deleted.
 *
 * <p>Collection sources write one dated note per day (see {@link KnowledgeArchiveService}), under
 * a folder named after the source (e.g. the site name). Once a week is fully over, {@link
 * #mergeWeeklyCollectionNotes} folds that week's daily notes for each source into a single "주간 정리"
 * document, moves the daily originals into {@code _archived/}, and leaves the weekly note in that same
 * per-source folder — so a source's history reads as one file per week, indefinitely. Collection-origin
 * notes are deliberately excluded from {@link #reclassifyBySubject} for this reason: an earlier version
 * moved them into {@code <domain>/topics/<topic-slug>/} based on an LLM-assigned subject label, but a
 * fresh, narrow label per note (and per week, since the merged filename changes weekly) fragmented the
 * archive into near one-file-per-folder topic slugs instead of the predictable per-source grouping
 * users could actually navigate.
 *
 * <p>{@link #reclassifyBySubject} still runs for upload-origin and legacy (originless) notes, which
 * have no natural per-source folder to stay in — for those, an LLM-assigned topic label under {@code
 * <domain>/topics/<topic-slug>/} is still the better grouping.
 *
 * <p>Manual (Q&amp;A) notes go through a different, coarser scheme instead: {@link
 * #consolidateManualNotes} folds each note into one of a small number of broad subject "buckets" under
 * {@code <domain>/buckets/} (e.g. "웹 진단", "리눅스 진단") rather than giving every question its own
 * narrow topic folder — a fresh SQL injection question should land in the same document as the last
 * one, not spawn a third scattered file. This step is manual-trigger-only ({@link #runNow}) — only a
 * human reviewing their own questions can judge which bucket a note really belongs in, so the automatic
 * weekly sweep never calls it. {@link #splitOversizedBuckets} is the release valve on the other end:
 * once a bucket document has accumulated several distinct notes clustered around a narrower sub-topic
 * since it last grew, the LLM is asked whether that cluster is now coherent enough to carve out into
 * its own document — rather than just because the file got large; a single long note with no peers is
 * left alone. The prompt keeps this rule abstract rather than tied to a concrete worked example: an
 * earlier version spelled out one specific security topic as a worked example, and the model latched
 * onto matching that literal topic instead of generalizing the underlying principle to whatever subject
 * the bucket actually contains. This direction runs automatically on the weekly schedule as well as the
 * manual "지금 정리" trigger, since it only reorganizes notes a human already placed.
 */
@Service
public class ArchiveMaintenanceService {
  private static final Logger log = LoggerFactory.getLogger(ArchiveMaintenanceService.class);
  private static final Pattern TITLE = Pattern.compile("(?m)^title:\\s*\"?([^\"\\n]+)\"?\\s*$");
  private static final Pattern DOMAIN_LINE = Pattern.compile("(?m)^domain:\\s*([^\\n]+)\\s*$");
  private static final Pattern TOPIC_LINE = Pattern.compile("(?m)^topic:\\s*.*$");
  private static final Pattern ORIGIN_LINE = Pattern.compile("(?m)^origin:\\s*(.*)$");
  private static final Pattern FRONT_MATTER_BLOCK = Pattern.compile("(?s)\\A---\\s*\\n(.*?)\\n---\\s*\\n?");
  private static final Pattern RELATED_SECTION = Pattern.compile("(?s)\\n## 관련 노트\\n.*$");
  private static final Pattern DATE_PREFIX = Pattern.compile("^(\\d{4}-\\d{2}-\\d{2})-");
  private static final Pattern DAILY_TITLE_DATE_SUFFIX = Pattern.compile("\\s*\\(\\d{4}-\\d{2}-\\d{2}\\)$");
  private static final Pattern GROUP_MARKER = Pattern.compile("===그룹:\\s*(.+?)\\s*===\\n");
  private static final Pattern CHUNK_HEADING = Pattern.compile("\\A## (.+)$", Pattern.MULTILINE);
  private static final double CANDIDATE_THRESHOLD = 0.42;
  private static final double RELATED_THRESHOLD = 0.16;
  private static final int MAX_MERGES_PER_RUN = 20;
  private static final int MAX_RECLASSIFY_PER_RUN = 30;
  private static final int MAX_BUCKET_PER_RUN = 15;
  private static final int MAX_SPLITS_PER_RUN = 3;
  private static final int MAX_RELATED_LINKS = 6;
  private static final int MERGE_EXCERPT_CHARS = 6000;
  private static final int TOPIC_EXCERPT_CHARS = 1500;
  private static final int BUCKET_SPLIT_THRESHOLD_CHARS = 30000;
  private static final String TOPICS_SEGMENT = "topics";
  private static final String BUCKETS_SEGMENT = "buckets";
  private static final String MANUAL_ORIGIN = "manual";
  private static final String COLLECTION_ORIGIN = "collection";

  private final FileProperties files;
  private final KnowledgeArchiveService archive;
  private final LlmGateway llm;
  private final SecurityCategoryClassifier categoryClassifier;

  ArchiveMaintenanceService(FileProperties files, KnowledgeArchiveService archive, LlmGateway llm, SecurityCategoryClassifier categoryClassifier) {
    this.files = files; this.archive = archive; this.llm = llm; this.categoryClassifier = categoryClassifier;
  }

  /**
   * Folding raw Q&A notes into a bucket ({@link #consolidateManualNotes}) is manual-trigger-only —
   * only the person who asked the questions can judge whether a note belongs with an existing bucket
   * or deserves a new one, so the automatic sweep skips that step entirely and only handles bucket
   * splitting (which operates on notes already placed by a human, via the manual trigger).
   */
  @Scheduled(cron = "${app.archive.maintenance-cron:0 0 0 * * SAT}", zone = "Asia/Seoul")
  public void weeklySweep() {
    try {
      MaintenanceResult result = run(false);
      log.info("archive_maintenance_completed examined={} merged={} reclassified={} bucketed={} split={} weeklyDigested={} linked={} failed={}",
          result.notesExamined(), result.merged(), result.reclassified(), result.bucketed(), result.split(), result.weeklyDigested(), result.linked(), result.failed());
    } catch (Exception exception) {
      log.warn("archive_maintenance_failed", exception);
    }
  }

  /**
   * Merging, reclassifying, and bucket-splitting all move files out of whatever directory they used to
   * live in, but none of those steps ever look back to check whether that directory is now empty -- a
   * topic folder that only ever held the one note that just got merged elsewhere, for instance, is left
   * behind as a bare empty shell. Runs once daily rather than as part of the weekly sweep (which already
   * shares its own moves-then-cleans-up pattern) so at 5am it doesn't race the collection pipeline's own
   * nightly batch/file-creation activity. Bottom-up (deepest paths first) in one pass, since deleting a
   * leaf directory can make its now-childless parent prunable in the same run.
   */
  @Scheduled(cron = "${app.archive.empty-dir-cron:0 0 5 * * *}", zone = "Asia/Seoul")
  public void pruneEmptyDirectories() {
    Path root = Path.of(files.obsidianPath()).toAbsolutePath().normalize();
    if (!Files.exists(root)) return;
    List<Path> directories;
    try (Stream<Path> paths = Files.walk(root)) {
      directories = paths.filter(Files::isDirectory)
          .filter(path -> !path.equals(root))
          .sorted(Comparator.comparingInt(Path::getNameCount).reversed())
          .toList();
    } catch (IOException exception) {
      log.warn("archive_empty_dir_scan_failed", exception);
      return;
    }
    int removed = 0;
    for (Path dir : directories) {
      try (Stream<Path> entries = Files.list(dir)) {
        if (entries.findAny().isEmpty()) {
          Files.delete(dir);
          removed++;
        }
      } catch (IOException exception) {
        log.warn("archive_empty_dir_prune_failed path={}", root.relativize(dir), exception);
      }
    }
    if (removed > 0) log.info("archive_empty_dirs_pruned count={}", removed);
  }

  /** Exposed for a manual "지금 정리" trigger — the only path that also folds raw Q&A notes into buckets. */
  public MaintenanceResult runNow() throws IOException {
    return run(true);
  }

  // The scheduled sweep and the manual "지금 정리" button both call run() on the same file
  // tree; without this, a manual trigger fired at the same moment the Saturday-midnight cron fires
  // can race the two runs against each other and corrupt an in-flight move/split.
  private synchronized MaintenanceResult run(boolean consolidateManual) throws IOException {
    Path root = Path.of(files.obsidianPath()).toAbsolutePath().normalize();
    Path archivedRoot = root.resolve("_archived");
    if (!Files.exists(root)) return new MaintenanceResult(0, 0, List.of(), 0, List.of(), 0, List.of(), 0, List.of(), 0, List.of(), 0, 0, List.of());
    // Collects one entry per note/step that threw during this run, so a classification or parsing
    // failure is visible in the result (and the manual "지금 정리" UI) instead of only ever showing up
    // as a WARN line in the container log that nobody's watching -- see the catch sites below.
    List<String> failures = new ArrayList<>();
    List<String> weeklyDigested = mergeWeeklyCollectionNotes(root, failures);
    List<Note> notes = scanNotes(root, archivedRoot);
    Set<Path> consumed = new HashSet<>();
    List<String> merged = new ArrayList<>();
    scan:
    for (int i = 0; i < notes.size(); i++) {
      Note left = notes.get(i);
      if (consumed.contains(left.path())) continue;
      for (int j = i + 1; j < notes.size(); j++) {
        Note right = notes.get(j);
        if (consumed.contains(right.path()) || !left.domain().equals(right.domain())) continue;
        if (archive.overlapRatio(left.content(), right.content()) < CANDIDATE_THRESHOLD) continue;
        if (merged.size() >= MAX_MERGES_PER_RUN) break scan; // bound LLM spend per run; leftover candidates roll into next sweep
        try {
          Optional<String> mergedBody = mergeIfSameTopic(left, right);
          if (mergedBody.isPresent()) {
            writeMerged(root, left, right, mergedBody.get());
            consumed.add(left.path());
            consumed.add(right.path());
            merged.add(left.relativePath() + " + " + right.relativePath());
          }
        } catch (Exception exception) {
          log.warn("archive_merge_failed left={} right={}", left.relativePath(), right.relativePath(), exception);
          failures.add(left.relativePath() + " + " + right.relativePath() + ": 병합 실패 (" + exception.getMessage() + ")");
        }
      }
    }
    List<String> reclassified = reclassifyBySubject(root, notes, consumed, failures);
    Set<Path> touchedBuckets = new HashSet<>();
    List<String> bucketed = consolidateManual ? consolidateManualNotes(root, notes, consumed, touchedBuckets, failures) : List.of();
    List<String> splits = splitOversizedBuckets(root, touchedBuckets, failures);
    // Merging, reclassifying, and bucketing all move files around, so the in-memory `notes` list's paths
    // are stale for anything that moved — re-walk fresh before linking so writes land on where files
    // actually are now.
    int linked = linkRelatedNotes(scanNotes(root, archivedRoot), failures);
    return new MaintenanceResult(notes.size(), merged.size(), merged, reclassified.size(), reclassified,
        bucketed.size(), bucketed, splits.size(), splits, weeklyDigested.size(), weeklyDigested, linked,
        failures.size(), failures);
  }

  private List<Note> scanNotes(Path root, Path archivedRoot) throws IOException {
    try (Stream<Path> paths = Files.walk(root, 6)) {
      return paths.filter(Files::isRegularFile)
          .filter(path -> path.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".md"))
          .filter(path -> !path.startsWith(archivedRoot))
          .map(path -> readNote(root, path))
          .filter(Objects::nonNull)
          .toList();
    }
  }

  /**
   * Cross-references notes that are related but not near-duplicate enough to merge (below
   * CANDIDATE_THRESHOLD, above RELATED_THRESHOLD), using the same free local term-overlap heuristic as the
   * merge pre-filter — no LLM call needed. Rewrites each note's "## 관련 노트" section from scratch every
   * run rather than appending, so re-running the sweep never accumulates duplicate links as relationships
   * change. Link targets are the *filename* stem (not the human title), since that's what
   * {@link com.orchestration.files.ArchiveController#graph} resolves [[wikilinks]] against.
   */
  private int linkRelatedNotes(List<Note> notes, List<String> failures) {
    int updated = 0;
    for (Note note : notes) {
      try {
        List<String> relatedStems = new ArrayList<>();
        for (Note other : notes) {
          if (other.path().equals(note.path()) || !other.domain().equals(note.domain())) continue;
          double overlap = archive.overlapRatio(note.content(), other.content());
          if (overlap >= RELATED_THRESHOLD && overlap < CANDIDATE_THRESHOLD) relatedStems.add(stem(other.path()));
          if (relatedStems.size() >= MAX_RELATED_LINKS) break;
        }
        String current = Files.readString(note.path(), StandardCharsets.UTF_8);
        String withoutSection = RELATED_SECTION.matcher(current).replaceFirst("");
        String next = relatedStems.isEmpty() ? withoutSection
            : withoutSection.stripTrailing() + "\n\n## 관련 노트\n" + relatedStems.stream().map(s -> "- [[" + s + "]]").collect(Collectors.joining("\n")) + "\n";
        if (!next.equals(current)) { Files.writeString(note.path(), next, StandardCharsets.UTF_8); updated++; }
      } catch (Exception exception) {
        log.warn("archive_link_failed path={}", note.relativePath(), exception);
        failures.add(note.relativePath() + ": 관련 노트 링크 갱신 실패 (" + exception.getMessage() + ")");
      }
    }
    return updated;
  }

  private String stem(Path path) { return path.getFileName().toString().replaceFirst("(?i)\\.md$", ""); }

  /**
   * Scans every {@code <domain>/<source>/} folder for daily collection notes ({@code
   * KnowledgeArchiveService#archiveDaily} writes one per day) and, for each ISO-week-Saturday group whose
   * week has fully ended (strictly before the current week), folds them into one
   * {@code <weekStart>-<source>-주간-정리.md} document. Notes from the still-in-progress current week are
   * left alone so they keep accumulating daily until their own week ends. Runs before {@link
   * #reclassifyBySubject} so a freshly folded weekly note is still sitting in its write-time source
   * folder, exactly where that step looks for un-reclassified collection notes.
   */
  private List<String> mergeWeeklyCollectionNotes(Path root, List<String> failures) throws IOException {
    List<String> digested = new ArrayList<>();
    if (!Files.exists(root)) return digested;
    Path archivedRoot = root.resolve("_archived");
    LocalDate currentWeekStart = LocalDate.now().with(TemporalAdjusters.previousOrSame(DayOfWeek.SATURDAY));
    Map<Path, List<Path>> bySourceFolder = new LinkedHashMap<>();
    try (Stream<Path> paths = Files.walk(root, 4)) {
      paths.filter(Files::isRegularFile)
          .filter(path -> !path.startsWith(archivedRoot))
          .filter(this::isDailyCollectionNote)
          .forEach(path -> bySourceFolder.computeIfAbsent(path.getParent(), key -> new ArrayList<>()).add(path));
    }
    for (Map.Entry<Path, List<Path>> entry : bySourceFolder.entrySet()) {
      Map<LocalDate, List<Path>> byWeek = new TreeMap<>();
      for (Path file : entry.getValue()) {
        Matcher dateMatch = DATE_PREFIX.matcher(file.getFileName().toString());
        if (!dateMatch.find()) continue;
        LocalDate weekStart = LocalDate.parse(dateMatch.group(1)).with(TemporalAdjusters.previousOrSame(DayOfWeek.SATURDAY));
        if (!weekStart.isBefore(currentWeekStart)) continue; // this week is still in progress
        byWeek.computeIfAbsent(weekStart, key -> new ArrayList<>()).add(file);
      }
      for (Map.Entry<LocalDate, List<Path>> weekEntry : byWeek.entrySet()) {
        try {
          digested.add(mergeWeek(root, entry.getKey(), weekEntry.getKey(), weekEntry.getValue()));
        } catch (Exception exception) {
          log.warn("archive_weekly_digest_failed dir={} week={}", root.relativize(entry.getKey()), weekEntry.getKey(), exception);
          failures.add(root.relativize(entry.getKey()) + " (" + weekEntry.getKey() + " 주): 주간 취합 실패 (" + exception.getMessage() + ")");
        }
      }
    }
    return digested;
  }

  /**
   * A genuine not-yet-merged daily note's filename is exactly {@code <date>-<containing folder name>.md}
   * — {@code KnowledgeArchiveService#archiveDaily} derives both from the same source stem. This must be an
   * exact match, not just "starts with a date": the weekly-merged file this step itself produces is named
   * {@code <date>-<source>-주간-정리.md}, which starts with a date too but has extra text after the source
   * stem, and a note {@link #reclassifyBySubject} has since moved into {@code topics/<slug>/} keeps its
   * original filename while sitting in a folder named after the topic slug instead — both would wrongly
   * match a looser "starts with YYYY-MM-DD" check and get re-swept into another merge.
   */
  private boolean isDailyCollectionNote(Path path) {
    String fileName = path.getFileName().toString();
    Matcher dateMatch = DATE_PREFIX.matcher(fileName);
    if (!dateMatch.find()) return false;
    String sourceStem = path.getParent().getFileName().toString();
    return fileName.substring(dateMatch.end()).equals(sourceStem + ".md");
  }

  private String mergeWeek(Path root, Path sourceDir, LocalDate weekStart, List<Path> dailyFiles) throws IOException {
    dailyFiles.sort(Comparator.comparing(path -> path.getFileName().toString()));
    LocalDate weekEnd = weekStart.plusDays(6);
    String domain = root.relativize(sourceDir).getName(0).toString();
    String sourceStem = sourceDir.getFileName().toString();
    String baseTitle = null;
    StringBuilder body = new StringBuilder();
    for (Path file : dailyFiles) {
      String content = Files.readString(file, StandardCharsets.UTF_8);
      if (baseTitle == null) {
        String title = extractTitle(content).orElse(sourceStem);
        baseTitle = DAILY_TITLE_DATE_SUFFIX.matcher(title).replaceFirst("");
      }
      Matcher dateMatch = DATE_PREFIX.matcher(file.getFileName().toString());
      String date = dateMatch.find() ? dateMatch.group(1) : weekStart.toString();
      body.append("## ").append(date).append("\n\n").append(stripFrontMatterAndOpeningHeading(content).strip()).append("\n\n---\n\n");
    }
    if (baseTitle == null) baseTitle = sourceStem;
    String weeklyTitle = baseTitle + " 주간 정리 (" + weekStart + " ~ " + weekEnd + ")";
    String markdown = "---\n"
        + "title: \"" + weeklyTitle.replace("\"", "'") + "\"\n"
        + "date: " + LocalDate.now() + "\n"
        + "domain: " + domain + "\n"
        + "doc_type: pm-report\n"
        + "origin: collection\n"
        + "tags: [orchestration, " + domain + "]\n"
        + "---\n\n"
        + "# " + weeklyTitle + "\n\n"
        + body.toString().stripTrailing() + "\n";
    Path weeklyNote = sourceDir.resolve(weekStart + "-" + sourceStem + "-주간-정리.md");
    Files.writeString(weeklyNote, markdown, StandardCharsets.UTF_8);
    for (Path file : dailyFiles) {
      Path archivedTarget = root.resolve("_archived").resolve(root.relativize(file));
      Files.createDirectories(archivedTarget.getParent());
      Files.move(file, archivedTarget, StandardCopyOption.REPLACE_EXISTING);
    }
    return root.relativize(weeklyNote) + " (" + dailyFiles.size() + "건)";
  }

  /**
   * Moves collection-origin notes that are still filed under their write-time source folder into
   * {@code <domain>/topics/<topic-slug>/}, based on a subject label the LLM assigns from the note's
   * title and opening content. Manual-origin notes skip this path entirely — they go through
   * {@link #consolidateManualNotes} instead, which groups by broad subject rather than one folder per
   * note. Notes already under a {@code topics/} folder are skipped so this doesn't reclassify the same
   * note every week. Runs after merging so a just-merged primary note is reclassified using its
   * consolidated content rather than its pre-merge draft. Still-unmerged daily notes ({@link
   * #isDailyCollectionNote}) are skipped too — they're transient by design (folded into one weekly
   * document once their week ends, see {@link #mergeWeeklyCollectionNotes}), so classifying and moving
   * them individually would both waste an LLM call on content that's about to be replaced and — worse —
   * relocate the file out from under the deterministic path {@code KnowledgeArchiveService#archiveDaily}
   * expects to find and append into on the next day's collection.
   */
  // mergeWeeklyCollectionNotes writes a brand-new filename every week (the weekStart date changes),
  // so the existingLabel front-matter reuse below never fires for a freshly merged weekly note even
  // though it's the same recurring source as last week's — the LLM was re-asked to name the subject
  // from scratch each time, and a general news source (e.g. CISA) drifted across a different topic-slug
  // folder every week depending on whatever that week's content happened to emphasize. This sidecar
  // file remembers the label last assigned for a given source folder so the classification prompt can
  // be biased toward staying consistent, without hard-locking it in case the source's actual subject
  // genuinely shifts.
  private static final String TOPIC_MEMORY_FILE = ".topic-label";

  private List<String> reclassifyBySubject(Path root, List<Note> notes, Set<Path> consumed, List<String> failures) {
    List<String> moved = new ArrayList<>();
    for (Note note : notes) {
      if (moved.size() >= MAX_RECLASSIFY_PER_RUN) break;
      if (consumed.contains(note.path()) || isReclassified(note) || MANUAL_ORIGIN.equals(note.origin()) || COLLECTION_ORIGIN.equals(note.origin()) || isDailyCollectionNote(note.path())) continue;
      try {
        String content = Files.exists(note.path()) ? Files.readString(note.path(), StandardCharsets.UTF_8) : note.content();
        // If a later collection for the same source pulled this note back out of topics/ (KnowledgeArchiveService's
        // "continue the existing note" match works by filename across the whole domain tree, topics/ included),
        // it still carries the "topic:" line from its earlier classification — reuse that label and just move it
        // home instead of spending another LLM call and duplicating the front-matter line.
        Optional<String> existingLabel = extractTopic(content);
        Optional<String> previousLabel = existingLabel.isPresent() ? Optional.empty() : readSourceTopicMemory(note.path());
        // classifyTopic is called directly (not through a swallow-and-return-blank wrapper) so a
        // classification failure surfaces to this catch block and gets recorded into `failures`, instead
        // of silently looking identical to "the model legitimately returned nothing".
        String label = existingLabel.isPresent() ? existingLabel.get() : classifyTopic(note, content, previousLabel);
        if (label.isBlank()) continue;
        String slug = topicSlug(label);
        if (slug.isBlank()) continue;
        Path domainRoot = root.resolve(note.domain());
        if (SecurityCategoryClassifier.SECURITY_DOMAIN.equals(note.domain())) {
          String category = existingSecurityCategory(note).orElse(null);
          if (category == null) category = categoryClassifier.classify(extractTitle(content).orElse(note.relativePath()), content);
          domainRoot = domainRoot.resolve(category);
        }
        Path destination = uniqueDestination(domainRoot.resolve(TOPICS_SEGMENT).resolve(slug), note.path().getFileName().toString());
        Files.createDirectories(destination.getParent());
        if (existingLabel.isEmpty()) {
          Files.writeString(note.path(), withTopicFrontMatter(content, label), StandardCharsets.UTF_8);
          writeSourceTopicMemory(note.path(), label);
        }
        Files.move(note.path(), destination, StandardCopyOption.REPLACE_EXISTING);
        moved.add(note.relativePath() + " -> " + root.relativize(destination));
      } catch (Exception exception) {
        log.warn("archive_reclassify_failed path={}", note.relativePath(), exception);
        failures.add(note.relativePath() + ": 주제 분류 실패 (" + exception.getMessage() + ")");
      }
    }
    return moved;
  }

  private Optional<String> readSourceTopicMemory(Path notePath) {
    Path memory = notePath.getParent().resolve(TOPIC_MEMORY_FILE);
    if (!Files.exists(memory)) return Optional.empty();
    try {
      String label = Files.readString(memory, StandardCharsets.UTF_8).strip();
      return label.isBlank() ? Optional.empty() : Optional.of(label);
    } catch (IOException exception) {
      return Optional.empty();
    }
  }

  private void writeSourceTopicMemory(Path notePath, String label) {
    try {
      Files.writeString(notePath.getParent().resolve(TOPIC_MEMORY_FILE), label, StandardCharsets.UTF_8);
    } catch (IOException exception) {
      log.warn("archive_topic_memory_write_failed path={}", notePath, exception);
    }
  }

  private boolean isReclassified(Note note) {
    String relative = note.relativePath();
    int firstSlash = relative.indexOf('/');
    if (firstSlash < 0) return false;
    String afterDomain = relative.substring(firstSlash + 1);
    if (afterDomain.startsWith(TOPICS_SEGMENT + "/")) return true;
    return existingSecurityCategory(note).filter(category -> afterDomain.startsWith(category + "/" + TOPICS_SEGMENT + "/")).isPresent();
  }

  private boolean isBucketed(Note note) {
    String relative = note.relativePath();
    int firstSlash = relative.indexOf('/');
    if (firstSlash < 0) return false;
    String afterDomain = relative.substring(firstSlash + 1);
    if (afterDomain.startsWith(BUCKETS_SEGMENT + "/")) return true;
    // A note already sitting in one of the 11 fixed category folders only counts as "bucketed" once
    // it's a flat file directly in that folder (an actual consolidated bucket document) -- a note still
    // nested one level deeper (e.g. its own leftover topic subfolder from the one-time reorg) is exactly
    // the kind of not-yet-consolidated note consolidateManualNotes should still sweep up.
    return existingSecurityCategory(note).filter(category -> afterDomain.substring(category.length() + 1).indexOf('/') < 0).isPresent();
  }

  private Optional<String> existingSecurityCategory(Note note) {
    if (!SecurityCategoryClassifier.SECURITY_DOMAIN.equals(note.domain())) return Optional.empty();
    String relative = note.relativePath();
    int firstSlash = relative.indexOf('/');
    if (firstSlash < 0) return Optional.empty();
    String afterDomain = relative.substring(firstSlash + 1);
    return SecurityCategoryClassifier.CATEGORIES.stream().filter(category -> afterDomain.startsWith(category + "/")).findFirst();
  }

  /**
   * Folds each not-yet-bucketed manual note into one of a small number of broad subject documents per
   * domain (e.g. "웹 진단", "암호학") instead of giving every question its own topic folder — the LLM picks
   * an existing bucket if one genuinely fits, or names a new broad one if not, so a fresh SQL injection
   * question lands next to the last one instead of starting a fourth scattered file.
   */
  private List<String> consolidateManualNotes(Path root, List<Note> notes, Set<Path> consumed, Set<Path> touchedBuckets, List<String> failures) {
    List<String> merged = new ArrayList<>();
    for (Note note : notes) {
      if (merged.size() >= MAX_BUCKET_PER_RUN) break;
      if (consumed.contains(note.path()) || isBucketed(note) || !MANUAL_ORIGIN.equals(note.origin())) continue;
      try {
        String content = Files.exists(note.path()) ? Files.readString(note.path(), StandardCharsets.UTF_8) : note.content();
        // Security notes bucket one level deeper, inside whichever of the 11 fixed categories the note
        // already lives under (from the one-time reorg) or is freshly classified into here -- everything
        // else keeps the original flat <domain>/buckets/ scheme.
        boolean isSecurity = SecurityCategoryClassifier.SECURITY_DOMAIN.equals(note.domain());
        String category = null;
        if (isSecurity) {
          category = existingSecurityCategory(note).orElse(null);
          if (category == null) category = categoryClassifier.classify(extractTitle(content).orElse(note.relativePath()), content);
        }
        Path bucketsRoot = isSecurity ? root.resolve(note.domain()).resolve(category) : root.resolve(note.domain()).resolve(BUCKETS_SEGMENT);
        List<BucketInfo> existingBuckets = scanBucketsIn(bucketsRoot);
        // classifyBucket is called directly (not through a swallow-and-return-null wrapper) so a
        // classification failure surfaces to this catch block and gets recorded into `failures`.
        BucketDecision decision = classifyBucket(note, content, existingBuckets);
        Path bucketPath;
        String resolvedTitle;
        if (decision.existing() != null) {
          bucketPath = decision.existing().path();
          resolvedTitle = decision.existing().title();
        } else {
          if (decision.newTitle() == null || decision.newTitle().isBlank()) continue;
          resolvedTitle = decision.newTitle();
          bucketPath = uniqueDestination(bucketsRoot, topicSlug(resolvedTitle) + ".md");
        }
        appendIntoBucket(bucketPath, note.domain(), resolvedTitle, content);
        Path archived = archiveOriginal(root, note);
        consumed.add(archived);
        touchedBuckets.add(bucketPath);
        merged.add(note.relativePath() + " -> " + root.relativize(bucketPath));
      } catch (Exception exception) {
        log.warn("archive_bucket_failed path={}", note.relativePath(), exception);
        failures.add(note.relativePath() + ": 버킷 분류 실패 (" + exception.getMessage() + ")");
      }
    }
    return merged;
  }

  private List<BucketInfo> scanBucketsIn(Path bucketsRoot) throws IOException {
    if (!Files.exists(bucketsRoot)) return List.of();
    try (Stream<Path> paths = Files.walk(bucketsRoot, 1)) {
      return paths.filter(Files::isRegularFile)
          .filter(path -> path.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".md"))
          .map(path -> {
            try {
              String content = Files.readString(path, StandardCharsets.UTF_8);
              return new BucketInfo(path, extractTitle(content).orElse(path.getFileName().toString()));
            } catch (IOException exception) {
              return null;
            }
          })
          .filter(Objects::nonNull)
          .toList();
    }
  }

  /**
   * Asks the LLM to pick an existing bucket by *number* rather than free-text name — an earlier version
   * asked for the bucket title verbatim and matched it back with an exact string comparison, which broke
   * the very first time it ran: the model paraphrased an existing bucket name slightly differently each
   * call (e.g. "CMD 인젝션 방어" vs "CMD 인젝션 취약점과 방어"), so notes that should have landed in the same
   * bucket each spawned their own near-duplicate one instead. A number can't be paraphrased.
   */
  private BucketDecision classifyBucket(Note note, String content, List<BucketInfo> existing) throws Exception {
    String system = "당신은 개인 지식 아카이브의 큐레이터입니다. 주어진 노트가 어떤 실무 분야 버킷에 속하는지 판단하세요. "
        + "버킷은 \"웹 진단\", \"리눅스 진단\", \"모바일 진단\", \"암호학\", \"제로데이\"처럼 넓은 실무 분야 단위여야 하며, "
        + "노트 하나하나의 좁은 개별 주제(예: SQL Injection, XSS 자체)를 버킷 이름으로 쓰지 마세요. "
        + "아래 기존 버킷 목록 중 이 노트가 자연스럽게 속할 만한 것이 있으면 그 번호만 한 줄로 정확히 출력하세요(예: 2). "
        + "적절한 기존 버킷이 하나도 없을 때만 새로 만들 넓은 버킷 이름을 \"NEW: <이름>\" 형식으로 한 줄 출력하세요(이름은 2~6단어의 한국어 명사구). "
        + "다른 설명이나 문장부호 없이 정확히 그 형식 한 줄만 출력하세요.";
    String bucketList = existing.isEmpty() ? "(아직 없음)"
        : IntStream.range(0, existing.size()).mapToObj(i -> (i + 1) + ". " + existing.get(i).title()).collect(Collectors.joining("\n"));
    String title = extractTitle(content).orElse(note.relativePath());
    String prompt = "기존 버킷 목록:\n" + bucketList + "\n\n분류할 노트 제목: " + title + "\n\n본문 일부:\n" + truncate(content, TOPIC_EXCERPT_CHARS);
    LlmGateway.LlmResult result = llm.classifyWithDeepSeek(system, prompt);
    String raw = result.content().trim();
    if (raw.matches("\\d+")) {
      int index = Integer.parseInt(raw) - 1;
      if (index >= 0 && index < existing.size()) return new BucketDecision(existing.get(index), null);
      // The model returned a number outside the list it was just given — a bare numeral is never a
      // usable bucket name, so treating it as one (as an earlier version did) produced files literally
      // named "2.md". Fail this note cleanly instead; it stays unbucketed and gets retried next run.
      throw new IllegalStateException("classifyBucket returned out-of-range index: " + raw);
    }
    String newTitle = raw.replaceFirst("(?i)^new:\\s*", "").replaceAll("^[\"'“”\\s]+|[\"'“”\\s.]+$", "");
    return new BucketDecision(null, newTitle);
  }

  /** Appends a manual note's body (its own front-matter and opening heading stripped, since this sub-
   * section gets its own "## 제목" heading instead) into the target bucket document, creating the bucket
   * fresh on its first note. */
  private void appendIntoBucket(Path bucketPath, String domain, String bucketTitle, String noteContent) throws IOException {
    String noteTitle = extractTitle(noteContent).orElse(bucketTitle);
    String noteBody = stripFrontMatterAndOpeningHeading(noteContent);
    String section = "## " + noteTitle + "\n\n" + noteBody.strip() + "\n";
    if (Files.exists(bucketPath)) {
      String existing = Files.readString(bucketPath, StandardCharsets.UTF_8);
      String updated = existing.stripTrailing() + "\n\n---\n\n" + section;
      Files.writeString(bucketPath, updated, StandardCharsets.UTF_8);
      return;
    }
    Files.createDirectories(bucketPath.getParent());
    String markdown = "---\n"
        + "title: \"" + bucketTitle.replace("\"", "'") + "\"\n"
        + "date: " + LocalDate.now() + "\n"
        + "domain: " + domain + "\n"
        + "doc_type: subject-bucket\n"
        + "origin: manual\n"
        + "tags: [orchestration, " + domain + ", bucket]\n"
        + "---\n\n"
        + "# " + bucketTitle + "\n\n" + section;
    Files.writeString(bucketPath, markdown, StandardCharsets.UTF_8);
  }

  private String stripFrontMatterAndOpeningHeading(String content) {
    String withoutFrontMatter = FRONT_MATTER_BLOCK.matcher(content).replaceFirst("");
    return withoutFrontMatter.replaceFirst("\\A\\s*#{1,3}[ \\t]+.+\\n", "");
  }

  private Path archiveOriginal(Path root, Note note) throws IOException {
    Path archivedTarget = root.resolve("_archived").resolve(note.relativePath());
    Files.createDirectories(archivedTarget.getParent());
    if (Files.exists(note.path())) Files.move(note.path(), archivedTarget, StandardCopyOption.REPLACE_EXISTING);
    return archivedTarget;
  }

  /**
   * Once a bucket document grows past a point where it stops being a useful single file, asks the LLM
   * whether it now contains distinct enough sub-topics to justify breaking apart (e.g. "웹 진단" splitting
   * into "SQL Injection", "XSS/CSRF", "취약한 서버 헤더 설정" once each has its own real material) rather than
   * splitting on a fixed schedule — most buckets never need this. Buckets touched by this run's own
   * consolidation step are left for the next sweep so a just-created bucket isn't immediately re-split.
   */
  private List<String> splitOversizedBuckets(Path root, Set<Path> consumed, List<String> failures) {
    List<String> splits = new ArrayList<>();
    List<Path> bucketFiles;
    try (Stream<Path> paths = Files.walk(root, 3)) {
      bucketFiles = paths.filter(Files::isRegularFile)
          .filter(path -> path.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".md"))
          .filter(path -> path.getParent() != null && (path.getParent().getFileName().toString().equals(BUCKETS_SEGMENT) || isSecurityCategoryDir(path.getParent())))
          .filter(path -> !consumed.contains(path))
          .toList();
    } catch (IOException exception) {
      log.warn("archive_bucket_scan_failed", exception);
      failures.add("버킷 목록 조회 실패: " + exception.getMessage());
      return splits;
    }
    for (Path bucketPath : bucketFiles) {
      if (splits.size() >= MAX_SPLITS_PER_RUN) break;
      try {
        String content = Files.readString(bucketPath, StandardCharsets.UTF_8);
        if (content.length() < BUCKET_SPLIT_THRESHOLD_CHARS) continue;
        String domain = extractDomain(content).orElse(bucketPath.getParent().getParent().getFileName().toString());
        List<SplitPart> parts = trySplitBucket(content);
        if (parts.isEmpty()) continue;
        writeSplitParts(root, bucketPath, domain, parts);
        splits.add(root.relativize(bucketPath) + " -> " + parts.stream().map(SplitPart::title).collect(Collectors.joining(", ")));
      } catch (Exception exception) {
        log.warn("archive_bucket_split_failed path={}", bucketPath, exception);
        failures.add(root.relativize(bucketPath) + ": 버킷 분할 실패 (" + exception.getMessage() + ")");
      }
    }
    return splits;
  }

  /**
   * Asking the LLM to regenerate a whole oversized bucket's content verbatim (an earlier version did
   * exactly this) silently loses data the moment the document is bigger than the model's output budget
   * allows back out — a 78KB bucket came back as ~24KB of "split parts" the first time this ran, with the
   * missing two-thirds never flagged as lost. This version never asks the model to reproduce body text at
   * all: it splits the bucket into its per-note chunks along the "---" divider {@link #appendIntoBucket}
   * itself inserts between notes, asks the model only to *group the chunk titles* (a handful of short
   * lines, trivial output size regardless of how large the bucket has grown), and then reassembles each
   * group by literally slicing the original chunks back together — the LLM never sees or re-emits a
   * single character of note body content, so there is nothing for it to truncate or paraphrase away.
   */
  private boolean isSecurityCategoryDir(Path dir) {
    Path parent = dir.getParent();
    if (parent == null) return false;
    return SecurityCategoryClassifier.SECURITY_DOMAIN.equals(parent.getFileName().toString()) && SecurityCategoryClassifier.CATEGORIES.contains(dir.getFileName().toString());
  }

  private List<SplitPart> trySplitBucket(String content) throws Exception {
    List<String> chunks = splitIntoNoteChunks(content);
    if (chunks.size() < 2) return List.of();
    List<String> chunkTitles = chunks.stream().map(this::chunkHeading).toList();
    if (chunkTitles.stream().anyMatch(Objects::isNull)) return List.of();

    // Chunks are referenced by number, never by heading text: several notes in the same bucket can
    // legitimately share an identical heading (e.g. multiple "핵심 정리" summary sections), and a
    // title-keyed lookup silently collapses those onto one chunk's content, dropping the others even
    // though a text-based coverage check would still report every heading as "covered". Numbers can't collide.
    String system = "당신은 지식 아카이브 정리 담당자입니다. 아래는 한 버킷 문서 안에 있는 하위 항목(원래 각각 별개의 노트였던 것) 제목 목록입니다(번호가 붙어 있습니다).\n\n"
        + "분리 기준을 엄격하게 적용하세요: 단순히 문서가 커졌다는 이유로 나누면 안 됩니다. 서로 다른 시점에 만들어진 여러 개의 별개 항목들이 모여 뚜렷하고 좁은 하위 주제 하나를 이룰 만큼 쌓였을 때만 그 항목들을 묶어 새 그룹으로 분리하세요. "
        + "단 하나의 항목(노트)만으로는 그룹을 만들 수 없습니다 — 아무리 그 항목이 길거나 내용이 많아도, 관련된 다른 항목이 함께 쌓이지 않았다면 그 항목은 그대로 두세요.\n\n"
        + "예시(원리 설명용이며 실제 항목 내용과는 무관합니다): 어떤 주제 A에 대한 노트가 하나 있는데 그 뒤로 A와 관련된 노트가 하나도 추가되지 않았다면, \"문서가 크니까 나누자\"는 판단은 잘못된 것입니다. "
        + "반면 A와 관련이 있으면서도 뚜렷이 구분되는 하위 주제들(B, C 등)에 대한 노트가 여러 개 쌓였다면, 그것들을 묶어 새 하위 주제로 분리할 수 있습니다. "
        + "이 원칙은 실제 항목의 구체적인 내용이 무엇이든 동일하게 적용하세요 — 특정 키워드나 사례에 얽매이지 말고, 오직 \"서로 다른 노트가 몇 개나 뚜렷한 하나의 하위 주제로 뭉칠 만큼 쌓였는가\"만 판단 기준으로 삼으세요.\n\n"
        + "모두 하나의 주제로 보는 게 자연스럽거나 새 그룹으로 묶을 만큼 관련 항목이 쌓이지 않았다면 다른 설명 없이 정확히 NOT_SPLITTABLE 한 줄만 출력하세요. "
        + "나눌 수 있다면 각 그룹을 '===그룹: <새 하위 문서 제목>===' 한 줄로 시작하고, 그다음 줄부터 그 그룹에 속하는 항목의 번호만 한 줄에 하나씩 쓰세요(예: 3). 각 그룹은 반드시 서로 다른 항목 2개 이상으로 구성되어야 합니다. "
        + "항목 텍스트는 절대 다시 쓰지 말고 번호만 쓰세요. 모든 번호는 반드시 그룹 중 하나에 정확히 한 번씩만 포함시키세요.";
    String prompt = "항목 목록:\n" + IntStream.range(0, chunkTitles.size()).mapToObj(i -> (i + 1) + ". " + chunkTitles.get(i)).collect(Collectors.joining("\n"));
    LlmGateway.LlmResult result = llm.classifyWithDeepSeek(system, prompt, 8000);
    String responseBody = result.content().trim();
    if (responseBody.regionMatches(true, 0, "NOT_SPLITTABLE", 0, "NOT_SPLITTABLE".length())) return List.of();

    List<SplitPart> parts = new ArrayList<>();
    Set<Integer> assigned = new HashSet<>();
    Matcher marker = GROUP_MARKER.matcher(responseBody);
    List<Integer> starts = new ArrayList<>();
    List<String> groupTitles = new ArrayList<>();
    while (marker.find()) { starts.add(marker.end()); groupTitles.add(marker.group(1).trim()); }
    for (int i = 0; i < starts.size(); i++) {
      int end2 = i + 1 < starts.size() ? starts.get(i + 1) : responseBody.length();
      String listing = responseBody.substring(starts.get(i), end2);
      List<Integer> groupIndices = new ArrayList<>();
      for (String line : listing.split("\n")) {
        String token = line.replaceFirst("^-\\s*", "").replaceFirst("\\.$", "").trim();
        if (token.isEmpty() || !token.matches("\\d+")) continue; // model didn't emit a bare number — dropped, not guessed
        int index = Integer.parseInt(token) - 1;
        if (index < 0 || index >= chunks.size() || assigned.contains(index) || groupIndices.contains(index)) continue; // out-of-range or duplicate reference
        groupIndices.add(index);
      }
      // A group must contain at least two originally-distinct notes to count as a real subtopic
      // cluster — a single note carved out alone just means that one note got long, not that enough
      // related material has accumulated to justify its own document. Reject it and leave its chunk
      // unassigned, which then correctly fails the coverage check below and aborts the whole split.
      if (groupIndices.size() < 2) continue;
      groupIndices.forEach(assigned::add);
      List<String> groupChunks = groupIndices.stream().map(chunks::get).toList();
      parts.add(new SplitPart(groupTitles.get(i), String.join("\n\n---\n\n", groupChunks)));
    }
    // Every original chunk index must land in exactly one new group — if the model dropped or mangled
    // even one, silently proceeding would quietly lose that chunk's content, so bail out to NOT_SPLITTABLE.
    if (parts.size() < 2 || assigned.size() != chunks.size()) return List.of();
    return parts;
  }

  private static final Pattern NOTE_CHUNK_DIVIDER = Pattern.compile("\n-{3,}\n");

  private List<String> splitIntoNoteChunks(String content) {
    String withoutFrontMatterAndTitle = FRONT_MATTER_BLOCK.matcher(content).replaceFirst("")
        .replaceFirst("\\A\\s*#{1,3}[ \t]+.+\n", "");
    List<String> rawChunks = Arrays.stream(NOTE_CHUNK_DIVIDER.split(withoutFrontMatterAndTitle))
        .map(String::strip).filter(s -> !s.isBlank()).toList();
    List<String> merged = new ArrayList<>();
    for (String chunk : rawChunks) {
      if (!merged.isEmpty() && chunkHeading(chunk) == null) {
        int lastIndex = merged.size() - 1;
        merged.set(lastIndex, merged.get(lastIndex) + "\n\n---\n\n" + chunk);
      } else {
        merged.add(chunk);
      }
    }
    return merged;
  }

  private String chunkHeading(String chunk) {
    Matcher matcher = CHUNK_HEADING.matcher(chunk);
    return matcher.find() ? matcher.group(1).trim() : null;
  }

  private void writeSplitParts(Path root, Path bucketPath, String domain, List<SplitPart> parts) throws IOException {
    Path bucketsDir = bucketPath.getParent();
    for (SplitPart part : parts) {
      Path destination = uniqueDestination(bucketsDir, topicSlug(part.title()) + ".md");
      String markdown = "---\n"
          + "title: \"" + part.title().replace("\"", "'") + "\"\n"
          + "date: " + LocalDate.now() + "\n"
          + "domain: " + domain + "\n"
          + "doc_type: subject-bucket\n"
          + "origin: manual\n"
          + "tags: [orchestration, " + domain + ", bucket]\n"
          + "---\n\n"
          + "# " + part.title() + "\n\n" + part.body().strip() + "\n";
      Files.writeString(destination, markdown, StandardCharsets.UTF_8);
    }
    Path archivedTarget = root.resolve("_archived").resolve(root.relativize(bucketPath));
    Files.createDirectories(archivedTarget.getParent());
    Files.move(bucketPath, archivedTarget, StandardCopyOption.REPLACE_EXISTING);
  }

  private String classifyTopic(Note note, String content, Optional<String> previousLabel) throws Exception {
    String system = "당신은 지식 아카이브 분류 담당자입니다. 주어진 노트가 다루는 핵심 주제를 짧은 한국어 명사구 하나로 답하세요. "
        + "예: \"랜섬웨어 동향\", \"SQL 인젝션 방어\", \"금리 인상 전망\". 다른 설명이나 문장부호 없이 2~6단어 분량의 주제 명사구 한 줄만 출력하세요."
        + previousLabel.map(label -> " 이 수집 출처의 최근 분류 라벨은 \"" + label + "\"였습니다. 이번 내용도 같은 주제 범주면 그 라벨을 그대로 반환하고, "
            + "확실히 다른 주제로 바뀐 경우에만 새 라벨을 지으세요.").orElse("");
    String title = extractTitle(content).orElse(note.relativePath());
    String prompt = "제목: " + title + "\n\n본문 일부:\n" + truncate(content, TOPIC_EXCERPT_CHARS);
    LlmGateway.LlmResult result = llm.classifyWithDeepSeek(system, prompt);
    return result.content().trim().replaceAll("^[\"'“”\s]+|[\"'“”\s.]+$", "");
  }

  private Optional<String> extractTopic(String content) {
    Matcher matcher = TOPIC_LINE.matcher(content);
    if (!matcher.find()) return Optional.empty();
    String line = matcher.group();
    int colon = line.indexOf(':');
    if (colon < 0) return Optional.empty();
    String value = line.substring(colon + 1).trim().replaceAll("^\"|\"$", "");
    return value.isBlank() ? Optional.empty() : Optional.of(value);
  }

  private Optional<String> extractDomain(String content) {
    Matcher matcher = DOMAIN_LINE.matcher(content);
    return matcher.find() ? Optional.of(matcher.group(1).trim()) : Optional.empty();
  }

  private String topicSlug(String label) {
    String slug = label.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9가-힣]+", "-").replaceAll("(^-|-$)", "");
    return slug.length() > 48 ? slug.substring(0, 48).replaceAll("-$", "") : slug;
  }

  private Path uniqueDestination(Path directory, String fileName) {
    Path candidate = directory.resolve(fileName);
    if (!Files.exists(candidate)) return candidate;
    String stem = fileName.replaceFirst("(?i)\\.md$", "");
    for (int suffix = 2; suffix < 100; suffix++) {
      Path next = directory.resolve(stem + "-" + suffix + ".md");
      if (!Files.exists(next)) return next;
    }
    return candidate;
  }

  /**
   * A note that {@link KnowledgeArchiveService#archive} pulls back out of {@code topics/} (its "same
   * source, continue the existing note" match walks the whole domain tree by filename, so a later
   * collection for the same source moves the note back to the flat write-time path) already has a
   * "topic:" line from its earlier reclassification — replace it in place instead of inserting a second
   * one, which is what produced a file with two duplicate "topic:" lines the first time this ran.
   */
  private String withTopicFrontMatter(String content, String label) {
    String escaped = Matcher.quoteReplacement(label.replace("\"", "'"));
    String replacement = "topic: \"" + escaped + "\"";
    if (TOPIC_LINE.matcher(content).find()) return TOPIC_LINE.matcher(content).replaceFirst(replacement);
    if (DOMAIN_LINE.matcher(content).find()) return DOMAIN_LINE.matcher(content).replaceFirst("$0\n" + replacement);
    return content.replaceFirst("(?m)^---\\s*$", "---\n" + replacement);
  }

  private Note readNote(Path root, Path path) {
    try {
      String content = Files.readString(path, StandardCharsets.UTF_8);
      String relative = root.relativize(path).toString();
      String domain = relative.contains("/") ? relative.substring(0, relative.indexOf('/')) : "general";
      Matcher origin = ORIGIN_LINE.matcher(content);
      return new Note(path, relative, domain, content, origin.find() ? origin.group(1).trim() : null);
    } catch (IOException exception) {
      log.warn("archive_note_unreadable path={}", path, exception);
      return null;
    }
  }

  private Optional<String> mergeIfSameTopic(Note left, Note right) throws Exception {
    String system = "당신은 지식 아카이브 정리 담당자입니다. 두 노트가 실제로 같은 주제·사건을 다루는지 먼저 판단하세요. "
        + "같은 주제가 아니면 다른 설명 없이 정확히 NOT_DUPLICATE 한 줄만 출력하세요. "
        + "같은 주제라면 두 노트의 내용을 중복 없이 하나로 합친 완성된 Markdown 노트를 새로 작성하세요. "
        + "제목, 소제목, 개념 설명, 핵심 정리 구조를 유지하고, 서로 다른 사실·수치·날짜·출처는 모두 보존하세요. "
        + "판단 근거나 병합 과정 같은 메타 설명은 절대 쓰지 마세요.";
    String prompt = "노트 A (" + left.relativePath() + "):\n" + truncate(left.content())
        + "\n\n노트 B (" + right.relativePath() + "):\n" + truncate(right.content());
    LlmGateway.LlmResult result = llm.decideWithDeepSeekLongForm(system, prompt, 9000);
    String content = result.content().trim();
    if (content.regionMatches(true, 0, "NOT_DUPLICATE", 0, "NOT_DUPLICATE".length())) return Optional.empty();
    return Optional.of(content);
  }

  private void writeMerged(Path root, Note left, Note right, String mergedBody) throws IOException {
    boolean leftIsPrimary = datePrefix(left.relativePath()).compareTo(datePrefix(right.relativePath())) <= 0;
    Note primary = leftIsPrimary ? left : right;
    Note secondary = leftIsPrimary ? right : left;
    String title = extractTitle(primary.content()).orElse(primary.relativePath());
    String markdown = "---\n"
        + "title: \"" + title.replace("\"", "'") + "\"\n"
        + "date: " + LocalDate.now() + "\n"
        + "domain: " + primary.domain() + "\n"
        + "doc_type: merged-archive\n"
        + "tags: [orchestration, " + primary.domain() + ", merged]\n"
        + "---\n\n" + mergedBody.strip() + "\n";
    Files.writeString(primary.path(), markdown, StandardCharsets.UTF_8);
    Path archivedTarget = root.resolve("_archived").resolve(secondary.relativePath());
    Files.createDirectories(archivedTarget.getParent());
    Files.move(secondary.path(), archivedTarget, StandardCopyOption.REPLACE_EXISTING);
  }

  private String truncate(String value) { return truncate(value, MERGE_EXCERPT_CHARS); }
  private String truncate(String value, int limit) { return value.length() <= limit ? value : value.substring(0, limit) + "\n[길이 제한으로 일부 생략]"; }
  private Optional<String> extractTitle(String content) { Matcher matcher = TITLE.matcher(content); return matcher.find() ? Optional.of(matcher.group(1).trim()) : Optional.empty(); }
  private String datePrefix(String relativePath) {
    String name = relativePath.contains("/") ? relativePath.substring(relativePath.lastIndexOf('/') + 1) : relativePath;
    Matcher matcher = DATE_PREFIX.matcher(name);
    return matcher.find() ? matcher.group(1) : "9999-99-99";
  }

  private record Note(Path path, String relativePath, String domain, String content, String origin) {}
  private record BucketInfo(Path path, String title) {}
  private record BucketDecision(BucketInfo existing, String newTitle) {}
  private record SplitPart(String title, String body) {}

  public record MaintenanceResult(int notesExamined, int merged, List<String> mergedPairs, int reclassified,
      List<String> reclassifiedNotes, int bucketed, List<String> bucketedNotes, int split, List<String> splitBuckets,
      int weeklyDigested, List<String> weeklyDigestedNotes, int linked, int failed, List<String> failedNotes) {}
}
