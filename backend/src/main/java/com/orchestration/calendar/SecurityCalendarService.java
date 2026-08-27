package com.orchestration.calendar;

import com.orchestration.sources.ResearchSource;
import com.orchestration.tasks.LlmGateway;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Scans the same excerpt text {@link com.orchestration.sources.SourceCollectionService} just fed to the
 * analysis pipeline for explicit, dated security 행사/세미나/피해사고 mentions, and records them as calendar
 * entries. A recently-recorded story is offered back to the model as numbered candidates so a later report
 * on the same incident (remediation, attribution, impact update) is recognized as a follow-up and bumps that
 * story's {@code lastUpdatedDate} instead of being filed as an unrelated new entry — this is what lets the
 * calendar's timeline feed keep an actively-developing story at the top rather than stuck at its first date.
 * This is intentionally narrow — it only extracts items with an explicit date actually present in the
 * collected text; it never infers or guesses a date, and finds nothing rather than fabricate an entry.
 */
@Service
public class SecurityCalendarService {
  private static final Logger log = LoggerFactory.getLogger(SecurityCalendarService.class);
  private static final Pattern NEW_LINE = Pattern.compile("^\\s*NEW\\s*\\|\\s*(EVENT|SEMINAR|INCIDENT)\\s*\\|\\s*(\\d{4}-\\d{2}-\\d{2})\\s*\\|\\s*(.+?)\\s*\\|\\s*(.+?)\\s*$");
  private static final Pattern UPDATE_LINE = Pattern.compile("^\\s*UPDATE\\s*\\|\\s*(\\d+)\\s*\\|\\s*(\\d{4}-\\d{2}-\\d{2})\\s*\\|\\s*(.+?)\\s*$");
  private static final int MAX_ITEMS_PER_COLLECTION = 8;
  private static final int CANDIDATE_WINDOW_DAYS = 45;
  private static final int MAX_CANDIDATES_IN_PROMPT = 12;

  private final SecurityCalendarEventRepository events;
  private final SecurityCalendarUpdateRepository updates;
  private final LlmGateway llm;

  SecurityCalendarService(SecurityCalendarEventRepository events, SecurityCalendarUpdateRepository updates, LlmGateway llm) {
    this.events = events;
    this.updates = updates;
    this.llm = llm;
  }

  @Transactional
  public void extractFromCollection(ResearchSource source, String excerpt) {
    if (excerpt == null || excerpt.isBlank()) return;
    try {
      List<SecurityCalendarEvent> candidates = recentCandidates();
      LlmGateway.LlmResult result = llm.classifyWithDeepSeek(SYSTEM_PROMPT, USER_PROMPT.formatted(candidateListing(candidates), excerpt));
      int savedNew = 0;
      int savedUpdates = 0;
      for (String line : result.content().lines().toList()) {
        if (savedNew + savedUpdates >= MAX_ITEMS_PER_COLLECTION) break;
        if (line.isBlank() || line.strip().equalsIgnoreCase("없음")) continue;
        if (tryRecordUpdate(candidates, line, source)) { savedUpdates++; continue; }
        if (tryRecordNew(line, source)) savedNew++;
      }
      log.info("security_calendar_extraction_ran sourceId={} new={} updates={}", source.getId(), savedNew, savedUpdates);
    } catch (Exception exception) {
      log.warn("security_calendar_extraction_failed sourceId={}", source.getId(), exception);
    }
  }

  private List<SecurityCalendarEvent> recentCandidates() {
    List<SecurityCalendarEvent> recent = events.findByEventDateGreaterThanEqualOrderByEventDateDesc(LocalDate.now().minusDays(CANDIDATE_WINDOW_DAYS));
    return recent.size() > MAX_CANDIDATES_IN_PROMPT ? recent.subList(0, MAX_CANDIDATES_IN_PROMPT) : recent;
  }

  private String candidateListing(List<SecurityCalendarEvent> candidates) {
    if (candidates.isEmpty()) return "없음";
    return IntStream.range(0, candidates.size())
        .mapToObj(index -> (index + 1) + ". [" + candidates.get(index).getCategory() + "] " + candidates.get(index).getTitle() + " (" + candidates.get(index).getEventDate() + ")")
        .collect(Collectors.joining("\n"));
  }

  private boolean tryRecordUpdate(List<SecurityCalendarEvent> candidates, String line, ResearchSource source) {
    Matcher matcher = UPDATE_LINE.matcher(line);
    if (!matcher.matches()) return false;
    int index = Integer.parseInt(matcher.group(1)) - 1;
    if (index < 0 || index >= candidates.size()) return false;
    LocalDate updateDate;
    try { updateDate = LocalDate.parse(matcher.group(2)); } catch (Exception badDate) { return false; }
    String summary = matcher.group(3).trim();
    if (summary.isBlank()) return false;
    SecurityCalendarEvent target = candidates.get(index);
    // Several sources independently re-report the same already-known fact about an ongoing story --
    // without this check, each one adds another update row with essentially the same summary text, and
    // "이전 업데이트 N건 보기" ends up listing the same sentence over and over instead of real progression.
    if (updates.existsByEventAndSummary(target, summary)) return false;
    target.bumpUpdated(updateDate);
    events.save(target);
    updates.save(new SecurityCalendarUpdate(target, updateDate, summary, source.getName(), source.getUrl()));
    return true;
  }

  private boolean tryRecordNew(String line, ResearchSource source) {
    Matcher matcher = NEW_LINE.matcher(line);
    if (!matcher.matches()) return false;
    SecurityCalendarCategory category = SecurityCalendarCategory.valueOf(matcher.group(1));
    LocalDate eventDate;
    try { eventDate = LocalDate.parse(matcher.group(2)); } catch (Exception badDate) { return false; }
    String title = matcher.group(3).trim();
    String summary = matcher.group(4).trim();
    if (title.isBlank() || events.existsByEventDateAndTitle(eventDate, title)) return false;
    try {
      // saveAndFlush (not save) so a unique-constraint violation surfaces here, synchronously, instead of
      // at extractFromCollection's transaction commit -- where it would abort every other line still
      // waiting to be processed in this same collection run, not just this one duplicate.
      events.saveAndFlush(new SecurityCalendarEvent(eventDate, category, title, summary, source.getName(), source.getUrl()));
      return true;
    } catch (DataIntegrityViolationException raceLostToAnotherSource) {
      log.info("security_calendar_duplicate_skipped date={} title={}", eventDate, title);
      return false;
    }
  }

  public List<SecurityCalendarEvent> forMonth(YearMonth month) {
    return events.findByEventDateBetweenOrderByEventDateAsc(month.atDay(1), month.atEndOfMonth());
  }

  public List<SecurityCalendarEvent> timeline(int limit) {
    List<SecurityCalendarEvent> all = events.findAllByOrderByLastUpdatedDateDesc();
    return all.size() > limit ? all.subList(0, limit) : all;
  }

  public List<SecurityCalendarUpdate> updatesFor(SecurityCalendarEvent event) {
    return updates.findByEventOrderByUpdateDateAsc(event);
  }

  private static final String SYSTEM_PROMPT = "당신은 보안 뉴스 원문에서 캘린더에 기록할 만한 사실만 정확히 골라내는 분석가입니다. 확실하지 않으면 아무것도 답하지 않습니다.";
  private static final String USER_PROMPT = """
      아래는 방금 수집한 보안 관련 원문 발췌입니다. 이 안에서 명확한 날짜가 함께 언급된 다음 세 종류의 항목만 찾으세요:
      - EVENT(행사): 컨퍼런스, 박람회 등 참가·개최 행사
      - SEMINAR(세미나): 세미나, 웨비나, 워크숍, 교육
      - INCIDENT(피해사고): 실제로 발생해 보도된 침해사고, 유출, 랜섬웨어 피해

      최근 등록된 사고/행사/세미나 목록입니다 (번호로 참조하세요):
      %s

      규칙:
      - 원문에 연도-월-일 또는 그에 준하는 구체적 날짜가 실제로 적혀 있는 항목만 쓰세요. "최근", "지난주"처럼 상대적 표현만 있으면 쓰지 마세요.
      - 원문의 내용이 위 목록 중 하나와 같은 사건의 후속 소식(조치 발표, 배후 확인, 피해 규모 갱신 등)이면 다음 형식으로 쓰세요:
      UPDATE|번호|YYYY-MM-DD|후속 소식 한 줄 요약
      - 위 목록에 없는 완전히 새로운 사고·행사·세미나라면 다음 형식으로 쓰세요:
      NEW|카테고리|YYYY-MM-DD|제목|한 줄 요약
      - 날짜를 추측하거나 일반론적인 내용을 쓰지 말고, 원문에 실제로 언급된 구체적 사건·행사만 쓰세요.
      - 해당하는 항목이 전혀 없으면 다른 말 없이 정확히 "없음"이라고만 답하세요.
      - 여러 항목이 있으면 각각 한 줄씩, 위 형식 그대로만 답하세요 (설명, 번호 매기기, 마크다운 없이).

      [원문 발췌]
      %s
      """;
}
