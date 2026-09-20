package com.orchestration.training;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Deterministic parser for explicit requests. Ambiguous language is delegated to the LLM interpreter. */
final class BlackBoxCommandParser {
  private static final Pattern PATH = Pattern.compile("(?:https?://[^/\\s]+)?(/[^\\s?#]+)", Pattern.CASE_INSENSITIVE);
  private static final Pattern ORDER = Pattern.compile("(?<![A-Z0-9-])O-\\d{4}(?!\\d)", Pattern.CASE_INSENSITIVE);
  private BlackBoxCommandParser() { }

  static BlackBoxCommand parse(BlackBoxScenarioDefinition scenario, String raw) {
    String input=raw==null?"":raw.trim(); String lower=input.toLowerCase(Locale.ROOT);
    if (input.isBlank()) return BlackBoxCommand.unknown();
    if (contains(lower, "로그아웃", "logout", "세션 종료")) return BlackBoxCommand.logout();
    if (isLastResponseQuestion(lower)) return BlackBoxCommand.inspect(input);
    String loginAccount=loginAccount(lower);
    String path=path(input);
    Matcher order=ORDER.matcher(input.toUpperCase(Locale.ROOT));
    if (path==null && "order-access".equals(scenario.slug()) && order.find()) path="/orders/"+order.group();
    if ("coupon-usage-policy".equals(scenario.slug())) path=couponUsagePath(input, lower, path);
    if (path!=null && isQuestion(input, lower) && !isOperationIntent(lower)) return BlackBoxCommand.info(input);
    if (!loginAccount.isBlank() && path!=null) return BlackBoxCommand.sequence(loginAccount, method(lower, path), pathWithQuery(path, input), input);
    if (!loginAccount.isBlank()) return BlackBoxCommand.login(loginAccount);
    if (path!=null) return new BlackBoxCommand(BlackBoxCommand.Type.REQUEST, "", method(lower, path), pathWithQuery(path, input), input);
    if ("coupon-cache".equals(scenario.slug()) && contains(lower, "쿠폰", "coupon", "할인 정보")) return BlackBoxCommand.request("GET", "/mypage/coupons");
    if ("login-enumeration".equals(scenario.slug()) && contains(lower, "존재하는", "존재하지", "known", "unknown", "로그인 요청")) return new BlackBoxCommand(BlackBoxCommand.Type.REQUEST, "", "POST", "/login", input);
    if (isQuestion(input, lower) || contains(lower, "계정", "쿠키", "세션", "토큰", "주소", "url", "경로", "대상 정보", "무엇이 주어", "알려줘", "이메일", "비밀번호", "인증", "메서드", "method", "제공")) return BlackBoxCommand.info(input);
    return BlackBoxCommand.unknown();
  }

  private static String path(String input) { Matcher match=PATH.matcher(input); while(match.find()) { String value=match.group(1); if(value.startsWith("/")) return value; } return null; }
  private static String pathWithQuery(String path, String input) { return path; }
  private static String method(String lower, String path) { if(path.startsWith("/login") || path.contains("/apply") || contains(lower,"post ","post로","로그인 요청", "적용")) return "POST"; if(contains(lower,"delete ","삭제")) return "DELETE"; if(contains(lower,"put ","수정")) return "PUT"; return "GET"; }
  private static String couponUsagePath(String input, String lower, String existingPath) {
    if (contains(lower, "사용 이력", "coupon history", "쿠폰 이력")) return "/mypage/coupon-history";
    Matcher matcher=ORDER.matcher(input.toUpperCase(Locale.ROOT));
    java.util.List<String> orders=new java.util.ArrayList<>();
    while(matcher.find()) orders.add(matcher.group());
    boolean apply=contains(lower,"적용", "apply", "사용 시도") || (contains(lower,"쿠폰", "coupon") && contains(lower,"요청", "전송", "시도"));
    if (apply && contains(lower,"동시", "parallel") && orders.size()>=2)
      return "/orders/coupons/ONE-TIME-10/apply?parallel="+orders.get(0)+","+orders.get(1);
    if (apply && contains(lower,"동시", "parallel") && contains(lower,"10개", "10 건", "10건", "ten"))
      return "/orders/O-3001/coupons/ONE-TIME-10/apply?parallel=10";
    if (!orders.isEmpty() && apply) return "/orders/"+orders.get(0)+"/coupons/ONE-TIME-10/apply";
    if (!orders.isEmpty() && existingPath==null) return "/orders/"+orders.get(0);
    return existingPath;
  }
  private static String loginAccount(String lower) {
    if (!contains(lower, "로그인", "login", "sign in")) return "";
    if (contains(lower, "계정 a", "a 계정", "a로", "a 로그인")) return "A";
    if (contains(lower, "계정 b", "b 계정", "b로", "b 로그인")) return "B";
    return "";
  }
  private static boolean isQuestion(String input, String lower) {
    return input.endsWith("?") || input.endsWith("？") || contains(lower, "인가", "인가요", "맞아", "맞나요", "무엇", "뭐야", "어디", "어떻게", "알 수 있", "제공되");
  }
  private static boolean isOperationIntent(String lower) {
    return contains(lower, "접근", "접속", "요청", "전송", "실행", "시도", "조회", "호출", "열어", "보내", "get ", "post ", "put ", "delete ");
  }
  private static boolean isLastResponseQuestion(String lower) {
    return contains(lower,
        "마지막 응답", "이전 응답", "last response", "응답 다시", "방금 응답", "직전 응답",
        "방금 요청", "직전 요청", "방금 결과", "직전 결과", "요청 결과",
        "리다이렉트", "redirect", "location", "상태 코드", "status code", "http 상태",
        "응답 헤더", "response header", "세션 쿠키", "쿠키 값", "cookie value",
        "로그인 후 어디", "로그인 뒤 어디", "로그인 후 어디로", "어디로 이동");
  }
  private static boolean contains(String input,String... values){for(String value:values)if(input.contains(value))return true;return false;}
}
