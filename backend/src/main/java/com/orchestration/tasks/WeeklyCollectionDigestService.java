package com.orchestration.tasks;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
final class WeeklyCollectionDigestService {
  private static final Logger log = LoggerFactory.getLogger(WeeklyCollectionDigestService.class);
  private static final Pattern DAILY_TITLE_DATE_SUFFIX = Pattern.compile("\\s*\\(\\d{4}-\\d{2}-\\d{2}\\)$");

  /**
   * Scans every {@code <domain>/<source>/} folder for daily collection notes ({@code
   * KnowledgeArchiveService#archiveDaily} writes one per day) and, for each ISO-week-Saturday group whose
   * week has fully ended (strictly before the current week), folds them into one
   * {@code <weekStart>-<source>-주간-정리.md} document. Notes from the still-in-progress current week are
   * left alone so they keep accumulating daily until their own week ends. Runs before {@link
   * ArchiveMaintenanceService} reclassification so a freshly folded weekly note stays in its
   * write-time source folder, where that step looks for un-reclassified collection notes.
   */
  List<String> mergeWeeklyCollectionNotes(Path root, List<String> failures) throws IOException {
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
        Matcher dateMatch = ArchiveNoteTextUtils.DATE_PREFIX.matcher(file.getFileName().toString());
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
   * stem. A note moved by {@link ArchiveMaintenanceService} reclassification into {@code topics/<slug>/}
   * keeps its original filename while sitting in a folder named after the topic slug — both would wrongly
   * match a looser "starts with YYYY-MM-DD" check and get re-swept into another merge.
   */
  boolean isDailyCollectionNote(Path path) {
    String fileName = path.getFileName().toString();
    Matcher dateMatch = ArchiveNoteTextUtils.DATE_PREFIX.matcher(fileName);
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
        String title = ArchiveNoteTextUtils.extractTitle(content).orElse(sourceStem);
        baseTitle = DAILY_TITLE_DATE_SUFFIX.matcher(title).replaceFirst("");
      }
      Matcher dateMatch = ArchiveNoteTextUtils.DATE_PREFIX.matcher(file.getFileName().toString());
      String date = dateMatch.find() ? dateMatch.group(1) : weekStart.toString();
      body.append("## ").append(date).append("\n\n").append(ArchiveNoteTextUtils.stripFrontMatterAndOpeningHeading(content).strip()).append("\n\n---\n\n");
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

}
