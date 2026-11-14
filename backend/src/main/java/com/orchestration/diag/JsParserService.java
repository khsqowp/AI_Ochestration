package com.orchestration.diag;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;

@Service
public class JsParserService {
  private static final Pattern ENDPOINT = Pattern.compile("(?:\\\"|')(?:https?://|/api/|/v\\d+/)[^\\\"'\\s]*(?:\\\"|')|https?://[^\\s\\\"'<>]+", Pattern.CASE_INSENSITIVE);
  private static final Pattern SECRET = Pattern.compile("(?:api[_-]?key|secret|token|passwd|password)\\s*[:=]\\s*[\\\"'][^\\\"']{8,}[\\\"']|Bearer\\s+[A-Za-z0-9._-]{10,}", Pattern.CASE_INSENSITIVE);
  private static final Pattern COMMENT = Pattern.compile("//[^\\n]*|/\\*[\\s\\S]*?\\*/");
  private static final Pattern CRYPTO = Pattern.compile("-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----|\\b(?:aes|des(?:-?ede3?)?|rc2|rc4|rc5|blowfish|camellia|aria|seed|idea|cast5|chacha20)-(?:128-|192-|256-)?(?:cbc|ecb|gcm|ctr|cfb\\d*|ofb|ccm|xts|poly1305|ede3|ede|wrap)\\b|\\b(?:RSA|AES|DES|HMAC|crypt|decrypt|encrypt|private[_-]?key)\\b|\\bprivateKey\\b", Pattern.CASE_INSENSITIVE);
  private static final Pattern PHONE = Pattern.compile("(?<!\\d)(?:\\+\\d{1,3}[ .-]?)?(?:0?\\d{1,3}[ .-]?)?\\d{3,4}[ .-]?\\d{4}(?!\\d)");
  private static final Pattern RRN = Pattern.compile("\\b\\d{6}-[1-8]\\d{6}\\b");
  private static final Pattern VERSION = Pattern.compile("(?<![\\w.])\\d+\\.\\d+\\.\\d+(?:-(?:beta|rc)(?:\\.\\d+)?)?\\b(?!\\.\\d)", Pattern.CASE_INSENSITIVE);
  private static final Pattern BASE64 = Pattern.compile("[A-Za-z0-9+/]{24,}={0,2}");
  private static final Pattern EMAIL = Pattern.compile("[\\w.+-]+@[\\w-]+\\.[\\w.-]+");
  private static final List<Pattern> SECRET_PATTERNS = List.of(
      Pattern.compile("\\bAKIA[0-9A-Z]{16}\\b"), Pattern.compile("\\bAIza[0-9A-Za-z_-]{35}\\b"),
      Pattern.compile("\\bxox[baprs]-[0-9A-Za-z-]{10,}\\b"), Pattern.compile("https?://hooks\\.slack\\.com/services/[A-Z0-9]{6,}/[^\\s\\\"']+"),
      Pattern.compile("\\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\\b"),
      Pattern.compile("\\beyJ[\\w-]{5,}\\.[\\w-]{5,}\\.[\\w-]{5,}\\b"),
      Pattern.compile("\\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{10,}\\b"), Pattern.compile("\\bAC[a-f0-9]{32}\\b", Pattern.CASE_INSENSITIVE),
      Pattern.compile("\\bSG\\.[A-Za-z0-9_-]{16,}\\.[A-Za-z0-9_-]{16,}\\b"), Pattern.compile("\\bkey-[a-f0-9]{32}\\b", Pattern.CASE_INSENSITIVE),
      Pattern.compile("\\bnpm_[A-Za-z0-9]{30,}\\b"), Pattern.compile("\\bsq0(?:atp|csp)-[A-Za-z0-9_-]{20,}\\b"),
      Pattern.compile("https?://[^\\s/:@]+:[^\\s/@]+@[^\\s\\\"']+"));

  public Result parse(String content) {
    String input = content == null ? "" : content;
    Set<String> secrets = new LinkedHashSet<>(extract(input, SECRET));
    SECRET_PATTERNS.forEach(pattern -> secrets.addAll(extract(input, pattern)));
    return new Result(beautify(input), extract(input, ENDPOINT), List.copyOf(secrets), extract(input, COMMENT),
        extract(input, CRYPTO), extract(input, PHONE), extract(input, RRN), extract(input, VERSION),
        extract(input, BASE64), extract(input, EMAIL));
  }

  private List<String> extract(String input, Pattern pattern) {
    Matcher matcher = pattern.matcher(input);
    Set<String> values = new LinkedHashSet<>();
    while (matcher.find()) values.add(matcher.group().trim());
    return List.copyOf(values);
  }

  private String beautify(String code) {
    if (code.isBlank()) return "";
    StringBuilder result = new StringBuilder();
    Character quote = null;
    boolean escaped = false;
    for (int i = 0; i < code.length(); i++) {
      char ch = code.charAt(i);
      if (escaped) { result.append(ch); escaped = false; continue; }
      if (ch == '\\') { result.append(ch); escaped = true; continue; }
      if (quote != null) {
        if (ch == quote) quote = null;
        result.append(ch);
      } else if (ch == '\'' || ch == '"' || ch == '`') { quote = ch; result.append(ch); }
      else if (ch == '{' || ch == '}' || ch == ';') result.append(ch).append('\n');
      else result.append(ch);
    }
    List<String> lines = new ArrayList<>();
    int indent = 0;
    for (String raw : result.toString().split("\\n")) {
      String line = raw.trim();
      if (line.isEmpty()) continue;
      if (line.startsWith("}")) indent = Math.max(0, indent - 1);
      lines.add("  ".repeat(indent) + line);
      if (line.endsWith("{")) indent++;
    }
    return String.join("\n", lines);
  }

  public record Result(String beautified, List<String> endpoints, List<String> secrets, List<String> comments,
      List<String> crypto, List<String> phones, List<String> rrns, List<String> versions,
      List<String> base64, List<String> emails) {}
}
