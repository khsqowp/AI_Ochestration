package com.orchestration.tasks;

import java.util.Locale;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class ArchiveNoteTextUtils {
  private static final Pattern TITLE = Pattern.compile("(?m)^title:\\s*\"?([^\"\\n]+)\"?\\s*$");
  static final Pattern DOMAIN_LINE = Pattern.compile("(?m)^domain:\\s*([^\\n]+)\\s*$");
  static final Pattern TOPIC_LINE = Pattern.compile("(?m)^topic:\\s*.*$");
  static final Pattern FRONT_MATTER_BLOCK = Pattern.compile("(?s)\\A---\\s*\\n(.*?)\\n---\\s*\\n?");
  static final Pattern DATE_PREFIX = Pattern.compile("^(\\d{4}-\\d{2}-\\d{2})-");
  private static final int MERGE_EXCERPT_CHARS = 6000;

  private ArchiveNoteTextUtils() {}

  static String truncate(String value) { return ArchiveNoteTextUtils.truncate(value, MERGE_EXCERPT_CHARS); }
  static String truncate(String value, int limit) { return value.length() <= limit ? value : value.substring(0, limit) + "\n[길이 제한으로 일부 생략]"; }
  static Optional<String> extractTitle(String content) { Matcher matcher = TITLE.matcher(content); return matcher.find() ? Optional.of(matcher.group(1).trim()) : Optional.empty(); }

  static Optional<String> extractDomain(String content) {
    Matcher matcher = DOMAIN_LINE.matcher(content);
    return matcher.find() ? Optional.of(matcher.group(1).trim()) : Optional.empty();
  }

  static Optional<String> extractTopic(String content) {
    Matcher matcher = TOPIC_LINE.matcher(content);
    if (!matcher.find()) return Optional.empty();
    String line = matcher.group();
    int colon = line.indexOf(':');
    if (colon < 0) return Optional.empty();
    String value = line.substring(colon + 1).trim().replaceAll("^\"|\"$", "");
    return value.isBlank() ? Optional.empty() : Optional.of(value);
  }

  static String topicSlug(String label) {
    String slug = label.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9가-힣]+", "-").replaceAll("(^-|-$)", "");
    return slug.length() > 48 ? slug.substring(0, 48).replaceAll("-$", "") : slug;
  }

  static String datePrefix(String relativePath) {
    String name = relativePath.contains("/") ? relativePath.substring(relativePath.lastIndexOf('/') + 1) : relativePath;
    Matcher matcher = DATE_PREFIX.matcher(name);
    return matcher.find() ? matcher.group(1) : "9999-99-99";
  }

  static String stripFrontMatterAndOpeningHeading(String content) {
    String withoutFrontMatter = FRONT_MATTER_BLOCK.matcher(content).replaceFirst("");
    return withoutFrontMatter.replaceFirst("\\A\\s*#{1,3}[ \\t]+.+\\n", "");
  }
}
