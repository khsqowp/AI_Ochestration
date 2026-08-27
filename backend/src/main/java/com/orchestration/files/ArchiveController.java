package com.orchestration.files;

import com.orchestration.tasks.ArchiveMaintenanceService;
import com.orchestration.tasks.NoteGraphEdgeRepository;
import com.orchestration.tasks.NoteGraphService;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/archive")
public class ArchiveController {
  private static final long MAX_MARKDOWN_BYTES = 1_000_000;
  private static final Pattern WIKI_LINK = Pattern.compile("\\[\\[([^\\]|#]+)(?:\\|[^\\]]+)?]]");
  private static final Pattern FRONT_MATTER_BLOCK = Pattern.compile("(?s)\\A---\\s*\\n(.*?)\\n---\\s*\\n?");
  private static final Pattern FRONT_MATTER_LINE = Pattern.compile("(?m)^([a-zA-Z_]+):\\s*(.*)$");
  private final FileProperties properties;
  private final ArchiveMaintenanceService maintenance;
  private final NoteGraphEdgeRepository graphEdges;
  private final NoteGraphService graphService;
  ArchiveController(FileProperties properties, ArchiveMaintenanceService maintenance, NoteGraphEdgeRepository graphEdges, NoteGraphService graphService) {
    this.properties = properties;
    this.maintenance = maintenance;
    this.graphEdges = graphEdges;
    this.graphService = graphService;
  }

  /** Manual trigger for the weekly dedup sweep, so it can be verified without waiting a week. */
  @PostMapping("/maintenance/run-now")
  public ArchiveMaintenanceService.MaintenanceResult runMaintenanceNow() throws IOException {
    return maintenance.runNow();
  }

  /** Manual trigger for the nightly similarity-graph refresh, so it can be verified without waiting for 06:00. */
  @PostMapping("/graph/refresh-now")
  public NoteGraphService.GraphRefreshResult refreshGraphNow() throws Exception {
    return graphService.runNow();
  }

  @GetMapping("/files")
  public List<FileEntry> files() throws IOException {
    Path root = root();
    Path archivedRoot = root.resolve("_archived");
    try (Stream<Path> paths = Files.walk(root, 5)) {
      return paths.filter(Files::isRegularFile)
          .filter(path -> path.getFileName().toString().toLowerCase().endsWith(".md"))
          .filter(path -> !path.startsWith(archivedRoot))
          .sorted(Comparator.comparing(Path::toString))
          .map(path -> {
            FrontMatter frontMatter = parseFrontMatter(readLimited(path));
            return new FileEntry(root.relativize(path).toString(), path.getFileName().toString(), size(path),
                frontMatter.title(), frontMatter.domain(), frontMatter.topic(), frontMatter.date(), frontMatter.origin(), modifiedAt(path));
          })
          .toList();
    }
  }

  @GetMapping("/content")
  public MarkdownContent content(@RequestParam String path) throws IOException {
    Path file = resolveMarkdown(path);
    if (!Files.isRegularFile(file)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "파일을 찾을 수 없습니다.");
    if (Files.size(file) > MAX_MARKDOWN_BYTES) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "미리보기는 1MB 이하 Markdown만 지원합니다.");
    String raw = Files.readString(file, StandardCharsets.UTF_8);
    return new MarkdownContent(root().relativize(file).toString(), parseFrontMatter(raw), stripFrontMatter(raw));
  }

  @GetMapping("/search")
  public List<SearchResult> search(@RequestParam String query) throws IOException {
    String term = query == null ? "" : query.trim().toLowerCase(java.util.Locale.ROOT);
    if (term.length() < 2) return List.of();
    Path archivedRoot = root().resolve("_archived");
    try (Stream<Path> paths = Files.walk(root(), 5)) {
      return paths.filter(Files::isRegularFile).filter(path -> path.getFileName().toString().toLowerCase().endsWith(".md"))
          .filter(path -> !path.startsWith(archivedRoot))
          .filter(path -> contains(path, term)).limit(50).map(path -> {
            String content = readLimited(path); String relative = rootUnchecked().relativize(path).toString();
            return new SearchResult(relative, path.getFileName().toString(), excerpt(content, term));
          }).toList();
    }
  }

  /** Collection-origin notes (auto-scraped news) are excluded from the graph entirely -- the user only
   * wants uploaded files and question-generated notes visually connected here, even though those notes
   * still show up and get cited normally in RAG search and the file explorer. */
  @GetMapping("/graph")
  public ArchiveGraph graph() throws IOException {
    List<Path> markdowns;
    Path archivedRoot = root().resolve("_archived");
    try (Stream<Path> paths = Files.walk(root(), 5)) {
      markdowns = paths.filter(Files::isRegularFile)
          .filter(path -> path.getFileName().toString().toLowerCase().endsWith(".md"))
          .filter(path -> !path.startsWith(archivedRoot))
          .filter(path -> !"collection".equalsIgnoreCase(parseFrontMatter(readLimited(path)).origin()))
          .toList();
    }
    List<GraphNode> nodes = markdowns.stream().map(path -> {
      String relative = rootUnchecked().relativize(path).toString();
      String name = path.getFileName().toString().replaceFirst("(?i)\\.md$", "").replaceFirst("^\\d{4}-\\d{2}-\\d{2}-", "");
      String domain = relative.contains("/") ? relative.substring(0, relative.indexOf('/')) : "general";
      String category = "security".equals(domain) ? topicOf(name) : domain;
      return new GraphNode(relative, name, category);
    }).toList();
    java.util.Set<String> nodePaths = nodes.stream().map(GraphNode::path).collect(java.util.stream.Collectors.toSet());
    java.util.Map<String, String> byName = new java.util.HashMap<>();
    nodes.forEach(node -> byName.putIfAbsent(node.name(), node.path()));
    List<GraphEdge> edges = new java.util.ArrayList<>();
    for (Path path : markdowns) {
      String from = rootUnchecked().relativize(path).toString();
      if (Files.size(path) > MAX_MARKDOWN_BYTES) continue;
      Matcher matcher = WIKI_LINK.matcher(Files.readString(path, StandardCharsets.UTF_8));
      while (matcher.find()) { String target = byName.get(matcher.group(1).trim()); if (target != null && !target.equals(from)) edges.add(new GraphEdge(from, target)); }
    }
    graphEdges.findAll().stream()
        .filter(edge -> nodePaths.contains(edge.getFromPath()) && nodePaths.contains(edge.getToPath()))
        .forEach(edge -> edges.add(new GraphEdge(edge.getFromPath(), edge.getToPath())));
    return new ArchiveGraph(nodes, edges);
  }

  /** Rough keyword classifier so the knowledge graph can group security notes into the topic zones the
   * user actually thinks in (web/mobile/source-review/pentest/system/cloud/reversing) instead of just the
   * flat "security" domain folder -- checked in priority order so a note matching an earlier, more
   * specific bucket isn't re-caught by a later, broader one. */
  private static final String[][] TOPIC_KEYWORDS = {
    { "소스코드 진단", "소스코드", "정적-분석", "정적분석", "sast", "역직렬화", "deserialization" },
    { "모바일 진단", "모바일", "안드로이드", "android", "apk" },
    { "리버스 엔지니어링", "리버스", "리버싱", "익스플로잇", "바이너리-분석", "reverse" },
    { "클라우드", "클라우드", "aws", "azure", "gcp", "iam", "쿠버네티스", "kubernetes", "cspm", "서버리스", "terraform" },
    { "모의해킹 시나리오", "모의해킹", "침투", "레드팀", "active-directory", "c2-프레임워크", "권한-상승", "privilege-escalation", "사회공학", "무선-네트워크", "공격형-보안", "애플리케이션-해킹-분석" },
    { "시스템", "포렌식", "임베디드", "iot", "시스템-해킹", "웹-서버와-데이터베이스", "암호학", "암호화", "패딩-오라클", "리눅스", "윈도우", "windows", "데이터베이스" },
    { "웹 진단", "웹", "sql", "xss", "csrf", "ssrf", "인젝션", "injection", "쿠키", "cookie", "파일-업로드", "접근제어", "idor", "bola", "bfla", "리다이렉트", "브라우징", "api-요청", "http-메서드", "파라미터", "히든-필드", "사용자-열거", "계정-잠금", "디렉토리-리스팅", "정보-노출", "파일-다운로드", "무결성-검증" },
  };

  private String topicOf(String name) {
    String lower = name.toLowerCase(java.util.Locale.ROOT);
    for (String[] group : TOPIC_KEYWORDS) {
      for (int i = 1; i < group.length; i++) if (lower.contains(group[i])) return group[0];
    }
    return "기타";
  }

  private Path root() throws IOException { Path root = Path.of(properties.obsidianPath()).toAbsolutePath().normalize(); Files.createDirectories(root); return root; }
  private Path rootUnchecked() { return Path.of(properties.obsidianPath()).toAbsolutePath().normalize(); }
  private Path resolveMarkdown(String value) throws IOException {
    if (value == null || !value.toLowerCase().endsWith(".md")) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Markdown 파일만 열 수 있습니다.");
    Path root = root(); Path file = root.resolve(value).normalize();
    if (!file.startsWith(root)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "허용되지 않는 경로입니다.");
    return file;
  }
  private long size(Path path) { try { return Files.size(path); } catch (IOException ignored) { return 0; } }
  /** frontmatter's date: is day-granularity and (by design, see KnowledgeArchiveService) reflects the
   * latest update rather than original creation — multiple files touched the same day previously fell
   * back to alphabetical-by-path order in the file list, which doesn't reflect when they actually
   * appeared. This gives the frontend a real instant to sort/tie-break by instead. */
  private Instant modifiedAt(Path path) { try { return Files.getLastModifiedTime(path).toInstant(); } catch (IOException ignored) { return Instant.EPOCH; } }
  private boolean contains(Path path, String term) { return path.getFileName().toString().toLowerCase(java.util.Locale.ROOT).contains(term) || readLimited(path).toLowerCase(java.util.Locale.ROOT).contains(term); }
  private String readLimited(Path path) { try { return Files.size(path) > MAX_MARKDOWN_BYTES ? "" : Files.readString(path, StandardCharsets.UTF_8); } catch (IOException ignored) { return ""; } }
  private String excerpt(String content, String term) { int index = content.toLowerCase(java.util.Locale.ROOT).indexOf(term); if (index < 0) return "파일 이름과 일치"; int start = Math.max(0, index - 55); int end = Math.min(content.length(), index + term.length() + 95); return content.substring(start, end).replaceAll("\\s+", " "); }

  /** Notes carry a small YAML-ish front-matter block (title/domain/topic/date/tags) written by the archive
   * pipeline. react-markdown has no concept of it, so without stripping it the raw "key: value" lines and
   * "---" delimiters render as visible clutter above every note. Parsing it also lets the file list show a
   * real title instead of the slug filename. */
  private FrontMatter parseFrontMatter(String content) {
    Matcher block = FRONT_MATTER_BLOCK.matcher(content);
    if (!block.find()) return new FrontMatter(null, null, null, null, List.of(), null);
    java.util.Map<String, String> fields = new java.util.LinkedHashMap<>();
    Matcher line = FRONT_MATTER_LINE.matcher(block.group(1));
    while (line.find()) fields.put(line.group(1), unquote(line.group(2).trim()));
    return new FrontMatter(fields.get("title"), fields.get("domain"), fields.get("topic"), fields.get("date"), parseTags(fields.get("tags")), fields.get("origin"));
  }
  private String stripFrontMatter(String content) { return FRONT_MATTER_BLOCK.matcher(content).replaceFirst(""); }
  private String unquote(String value) { return value.replaceAll("^\"|\"$", ""); }
  private List<String> parseTags(String raw) {
    if (raw == null || raw.isBlank()) return List.of();
    String inner = raw.replaceAll("^\\[|]$", "");
    return java.util.Arrays.stream(inner.split(",")).map(String::trim).filter(value -> !value.isEmpty()).toList();
  }

  record FileEntry(String path, String name, long size, String title, String domain, String topic, String date, String origin, Instant modifiedAt) {}
  record MarkdownContent(String path, FrontMatter frontMatter, String body) {}
  record FrontMatter(String title, String domain, String topic, String date, List<String> tags, String origin) {}
  record ArchiveGraph(List<GraphNode> nodes, List<GraphEdge> edges) {}
  record GraphNode(String path, String name, String category) {}
  record GraphEdge(String from, String to) {}
  record SearchResult(String path, String name, String excerpt) {}
}
