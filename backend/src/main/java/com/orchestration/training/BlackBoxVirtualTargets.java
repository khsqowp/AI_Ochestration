package com.orchestration.training;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Locale;

final class BlackBoxVirtualTargets {
  private BlackBoxVirtualTargets() { }
  static BlackBoxVirtualTarget forScenario(String slug) {
    return switch (slug) {
      case "order-access" -> new OrderAccessTarget();
      case "coupon-cache" -> new CouponCacheTarget();
      case "coupon-usage-policy" -> new CouponUsagePolicyTarget();
      case "login-enumeration" -> new LoginEnumerationTarget();
      default -> throw new IllegalArgumentException("알 수 없는 블랙박스 사건입니다.");
    };
  }

  private abstract static class BaseTarget implements BlackBoxVirtualTarget {
    @Override public State initialState() { return new State("", "", ""); }
    @Override public String encode(State state) {
      // Each field is encoded separately: HTTP observations contain line breaks and must survive a
      // database round-trip intact. The old single-payload format split after the first response line.
      return "v2:"+field(state.activeAccount())+"."+field(state.lastTranscript())+"."+field(state.memory());
    }
    @Override public State decode(String encoded) {
      if (encoded == null || encoded.isBlank()) return initialState();
      try {
        if (encoded.startsWith("v2:")) {
          String[] values = encoded.substring(3).split("\\.", -1);
          if (values.length != 3) return initialState();
          return new State(unfield(values[0]), unfield(values[1]), unfield(values[2]));
        }
        // Best-effort migration for sessions created by the old codec. Its final separator is the only
        // reliable boundary because the response itself can contain arbitrary line breaks.
        String legacy = new String(Base64.getUrlDecoder().decode(encoded), StandardCharsets.UTF_8);
        int first = legacy.indexOf('\n');
        int last = legacy.lastIndexOf('\n');
        if (first < 0) return new State(legacy, "", "");
        if (last <= first) return new State(legacy.substring(0, first), legacy.substring(first + 1), "");
        return new State(legacy.substring(0, first), legacy.substring(first + 1, last), legacy.substring(last + 1));
      }
      catch (IllegalArgumentException ignored) { return initialState(); }
    }
    private static String field(String value) { return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8)); }
    private static String unfield(String value) { return new String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8); }
    Result result(State state, String key, String transcript) { return new Result(new State(state.activeAccount(), transcript, state.memory()), key, transcript); }
    Result answer(State state, String key, String transcript) { return new Result(state, key, transcript); }
    Result login(State state, String account, String transcript) { return new Result(new State(account, transcript, state.memory()), "login-"+account.toLowerCase(Locale.ROOT), transcript); }
    String response(String status, String headers, String body) { return "요청 결과\n```http\n"+status+"\n"+headers+"\n\n"+body+"\n```"; }
    String noSession() { return response("HTTP/1.1 401 UNAUTHORIZED", "Content-Type: application/json", "{\"error\":\"AUTHENTICATION_REQUIRED\",\"message\":\"로그인이 필요합니다.\"}"); }
    String unknown(String message) { return "실행할 요청을 해석하지 못했습니다. 이 실습에서 사용할 계정, HTTP 메서드, URL 또는 주문번호를 포함해 다시 적으세요.\n\n입력한 문장: "+message; }
    Result observed(State state, String question) {
      if (state.lastTranscript().isBlank()) return answer(state, "last-response-query", "아직 이 세션에서 실행된 요청이 없습니다. 먼저 로그인 또는 대상 URL 요청을 수행하세요.");
      String lower = question == null ? "" : question.toLowerCase(Locale.ROOT);
      String status = state.lastTranscript().lines().filter(line -> line.startsWith("HTTP/")).findFirst().orElse("");
      String location = header(state.lastTranscript(), "Location");
      String cookie = header(state.lastTranscript(), "Set-Cookie");
      if (contains(lower, "리다이렉트", "redirect", "location", "로그인 후 어디", "로그인 뒤 어디", "어디로 이동")) {
        return answer(state, "last-response-query", location.isBlank()
            ? "## 직전 응답의 리다이렉트 목적지\n\n직전 응답에는 `Location` 헤더가 없습니다."
            : "## 직전 응답의 리다이렉트 목적지\n\n직전 응답의 `Location` 헤더 값은 `"+location+"`입니다. 브라우저가 리다이렉트를 따르면 다음 요청 주소는 `"+location+"`입니다.");
      }
      if (contains(lower, "세션 쿠키", "쿠키 값", "cookie value", "set-cookie")) {
        String value = cookie.isBlank() ? "" : cookie.split(";", 2)[0];
        return answer(state, "last-response-query", value.isBlank()
            ? "## 직전 응답의 세션 쿠키\n\n직전 응답에는 `Set-Cookie` 헤더가 없습니다."
            : "## 직전 응답의 세션 쿠키\n\n세션 쿠키: `"+value+"`\n\n속성 전체: `"+cookie+"`");
      }
      if (contains(lower, "상태 코드", "status code", "http 상태")) {
        String value = status.replaceFirst("^HTTP/\\S+\\s+", "");
        return answer(state, "last-response-query", "## 직전 응답의 상태\n\nHTTP 상태: `"+value+"`");
      }
      if (contains(lower, "응답 헤더", "response header", "헤더 보여")) {
        String headers = state.lastTranscript().lines()
            .dropWhile(line -> !line.startsWith("HTTP/"))
            .takeWhile(line -> !line.isBlank())
            .reduce("", (all, line) -> all + (all.isBlank() ? "" : "\n") + line);
        return answer(state, "last-response-query", "## 직전 응답 헤더\n\n```http\n"+headers+"\n```");
      }
      return answer(state, "last-response-query", "## 직전 요청 결과\n\n"+state.lastTranscript());
    }
    private static String header(String transcript, String name) {
      return transcript.lines().filter(line -> line.regionMatches(true, 0, name+":", 0, name.length()+1))
          .map(line -> line.substring(name.length()+1).trim()).findFirst().orElse("");
    }
    private static boolean contains(String input, String... values) { for (String value : values) if (input.contains(value)) return true; return false; }
  }

  private static final class OrderAccessTarget extends BaseTarget {
    @Override public String initialBriefing() {
      return "## 실습 대상 정보\n\n- 대상: `https://shop.training.local`\n- 로그인: `POST /login`\n- 주문 상세: `GET /orders/{orderId}`\n- 테스트 계정 A: `a.user@example.test` / `Training!A23`, 주문 `O-1001`\n- 테스트 계정 B: `b.user@example.test` / `Training!B23`, 주문 `O-2008`\n- 로그인 성공 시 브라우저에는 `session` 쿠키가 설정됩니다. Bearer 토큰은 사용하지 않습니다.\n\n코드, 서버 로그, 설정은 제공되지 않습니다. 대화창에 질문하거나 수행할 요청을 적으세요.";
    }
    @Override public Result execute(State state, BlackBoxCommand command) {
      return switch (command.type()) {
        case INFO -> orderInfo(state, command.question());
        case LOGIN -> loginOrder(state, command.account());
        case LOGOUT -> result(new State("", "", state.memory()), "logout", response("HTTP/1.1 204 NO CONTENT", "Set-Cookie: session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax", ""));
        case REQUEST -> orderRequest(state, command.method(), command.path());
        case SEQUENCE -> orderSequence(state, command);
        case INSPECT -> observed(state, command.question());
        case UNKNOWN -> answer(state, null, unknown(command.question()));
      };
    }
    private Result orderSequence(State state, BlackBoxCommand command) {
      Result login = loginOrder(state, command.account());
      Result request = orderRequest(login.nextState(), command.method(), command.path());
      String transcript = "## 실행 결과 1 · 로그인\n\n"+login.transcript()+"\n\n## 실행 결과 2 · "+command.method()+" "+command.path()+"\n\n"+request.transcript();
      return new Result(request.nextState(), request.observationKey(), transcript);
    }
    private Result orderInfo(State state, String question) {
      String lower = question == null ? "" : question.toLowerCase(Locale.ROOT);
      if ((lower.contains("리다이렉트") || lower.contains("redirect") || lower.contains("location"))
          && state.lastTranscript().contains("Location:")) {
        String location = state.lastTranscript().lines()
            .filter(line -> line.startsWith("Location:"))
            .map(line -> line.substring("Location:".length()).trim())
            .findFirst().orElse("");
        return answer(state, "last-redirect-location", "## 직전 응답의 리다이렉트 목적지\n\n직전 `302 FOUND` 응답의 `Location` 헤더 값은 `"+location+"`입니다. 브라우저가 리다이렉트를 따르면 다음 요청 주소는 `"+location+"`입니다.");
      }
      return answer(state, "initial-scope", "## 제공 가능한 대상 정보\n\n테스트 계정 A의 정상 주문은 `O-1001`, B의 정상 주문은 `O-2008`입니다. 주문 상세 조회는 `GET /orders/{orderId}`입니다. 인증은 `session` 쿠키를 사용하며 쿠키 값은 로그인 요청의 `Set-Cookie`에서 확인합니다. Bearer 토큰은 사용하지 않습니다.");
    }
    private Result loginOrder(State state, String account) {
      if (!"A".equals(account) && !"B".equals(account)) return result(state, null, "테스트 계정은 A 또는 B만 사용할 수 있습니다.");
      String email = "A".equals(account) ? "a.user@example.test" : "b.user@example.test";
      String cookie = "A".equals(account) ? "lab_a_7b1f" : "lab_b_19ce";
      return login(state, account, response("HTTP/1.1 302 FOUND", "Location: /mypage/orders\nSet-Cookie: session="+cookie+"; Path=/; HttpOnly; Secure; SameSite=Lax", ""));
    }
    private Result orderRequest(State state, String method, String path) {
      String normalized = path == null ? "" : path.replaceAll("[?#].*$", "");
      if (!"GET".equals(method)) return result(state, "order-write-denied", response("HTTP/1.1 405 METHOD NOT ALLOWED", "Allow: GET\nContent-Type: application/json", "{\"error\":\"METHOD_NOT_ALLOWED\"}"));
      if (state.activeAccount().isBlank()) return result(state, "unauthenticated-order", noSession());
      if (!normalized.matches("/orders/O-\\d{4}")) return result(state, "order-route-miss", response("HTTP/1.1 404 NOT FOUND", "Content-Type: application/json", "{\"error\":\"NOT_FOUND\"}"));
      String orderId=normalized.substring("/orders/".length());
      if ("O-1000".equals(orderId)) return result(state, "neighbor-order", response("HTTP/1.1 404 NOT FOUND", "Content-Type: application/json", "{\"error\":\"ORDER_NOT_FOUND\"}"));
      if ("O-1001".equals(orderId)) return result(state, "own-order", orderBody(orderId, "김서준", "서울시 마포구 월드컵로 12", "노트북 파우치", state.activeAccount()));
      if ("O-2008".equals(orderId)) return result(state, "cross-order", orderBody(orderId, "박민지", "부산시 해운대구 센텀로 88", "무선 키보드, USB-C 허브", state.activeAccount()));
      return result(state, "order-route-miss", response("HTTP/1.1 404 NOT FOUND", "Content-Type: application/json", "{\"error\":\"ORDER_NOT_FOUND\"}"));
    }
    private String orderBody(String id, String recipient, String address, String products, String account) {
      return response("HTTP/1.1 200 OK", "Content-Type: application/json\nCache-Control: no-store\nX-Request-Account: "+account,
          "{\n  \"orderId\": \""+id+"\",\n  \"recipient\": \""+recipient+"\",\n  \"shippingAddress\": \""+address+"\",\n  \"products\": [\""+products.replace(", ", "\", \"")+"\"]\n}");
    }
  }

  private static final class CouponCacheTarget extends BaseTarget {
    @Override public String initialBriefing() { return "## 실습 대상 정보\n\n- 대상: `https://shop.training.local`\n- 테스트 계정 A와 B가 제공됩니다.\n- 쿠폰 화면: `GET /mypage/coupons`\n- A는 자신이 등록하지 않은 할인 정보가 보였다고 제보했습니다.\n\n계정 전환과 요청 결과를 직접 관측하세요."; }
    @Override public Result execute(State state, BlackBoxCommand command) {
      if (command.type()==BlackBoxCommand.Type.INFO) return answer(state,"coupon-scope","테스트 계정 A/B로 로그인할 수 있고 쿠폰 화면 주소는 `/mypage/coupons`입니다.");
      if (command.type()==BlackBoxCommand.Type.LOGIN) return login(state, command.account(), response("HTTP/1.1 302 FOUND", "Set-Cookie: session=lab_"+command.account().toLowerCase(Locale.ROOT)+"_coupon; Path=/; HttpOnly; Secure; SameSite=Lax", ""));
      if (command.type()==BlackBoxCommand.Type.LOGOUT) return result(new State("", "", state.memory()), "coupon-logout", response("HTTP/1.1 204 NO CONTENT", "Set-Cookie: session=; Max-Age=0", ""));
      if (command.type()==BlackBoxCommand.Type.SEQUENCE) return couponSequence(state, command);
      if (command.type()==BlackBoxCommand.Type.INSPECT) return observed(state, command.question());
      if (command.type()!=BlackBoxCommand.Type.REQUEST || !"GET".equals(command.method()) || !command.path().startsWith("/mypage/coupons")) return answer(state,null,unknown(command.question()));
      if (state.activeAccount().isBlank()) return result(state,"coupon-unauthenticated",noSession());
      boolean aCouponAlreadySeen=state.memory().contains("coupon-a-seen");
      String code = "A".equals(state.activeAccount()) ? "A-SPRING-10" : aCouponAlreadySeen ? "A-SPRING-10" : "B-SUMMER-30";
      String key="A".equals(state.activeAccount()) ? "coupon-own" : aCouponAlreadySeen ? "coupon-cross-session" : "coupon-owner-confirmation";
      String transcript=response("HTTP/1.1 200 OK", "Content-Type: application/json\nCache-Control: private, max-age=60", "{\"couponCode\":\""+code+"\",\"discountPercent\":10}");
      return new Result(new State(state.activeAccount(), transcript, "A".equals(state.activeAccount()) ? "coupon-a-seen" : state.memory()), key, transcript);
    }
    private Result couponSequence(State state, BlackBoxCommand command) {
      Result login = execute(state, BlackBoxCommand.login(command.account()));
      Result request = execute(login.nextState(), BlackBoxCommand.request(command.method(), command.path()));
      String transcript = "## 실행 결과 1 · 로그인\n\n"+login.transcript()+"\n\n## 실행 결과 2 · "+command.method()+" "+command.path()+"\n\n"+request.transcript();
      return new Result(request.nextState(), request.observationKey(), transcript);
    }
  }

  /** A business-rule target. It exposes effects through orders and coupon history, never a diagnosis. */
  private static final class CouponUsagePolicyTarget extends BaseTarget {
    private static final String COUPON = "ONE-TIME-10";

    @Override public State initialState() { return new State("", "", "used=0;discounted="); }
    @Override public String initialBriefing() {
      return "## 실습 대상 정보\n\n- 대상: `https://shop.training.local`\n- 로그인: `POST /login` · 테스트 계정: A (`a.user@example.test` / `Training!A23`)\n- 주문 조회: `GET /orders/{orderId}`\n- 쿠폰 적용: `POST /orders/{orderId}/coupons/{couponCode}/apply`\n- 쿠폰 이력: `GET /mypage/coupon-history`\n- 쿠폰 `ONE-TIME-10`: 계정당 1회, 10% 할인, 최소 주문금액 50,000원, 결제 전 주문만 적용\n- 주문: O-3001(결제 전 60,000원), O-3002(결제 전 80,000원), O-3003(결제 전 40,000원), O-3004(결제 완료 60,000원)\n\n코드·로그·관리자 화면은 제공되지 않습니다. 질문하거나 수행할 요청을 적으세요.";
    }

    @Override public Result execute(State state, BlackBoxCommand command) {
      return switch (command.type()) {
        case INFO -> answer(state, "coupon-policy-scope", "쿠폰 적용 경로는 `POST /orders/{orderId}/coupons/ONE-TIME-10/apply`입니다. 주문 재조회와 `GET /mypage/coupon-history`로 결과를 확인할 수 있습니다.");
        case LOGIN -> loginPolicy(state, command.account());
        case LOGOUT -> result(new State("", "", state.memory()), "coupon-policy-logout", response("HTTP/1.1 204 NO CONTENT", "Set-Cookie: session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax", ""));
        case REQUEST -> request(state, command.method(), command.path());
        case SEQUENCE -> sequence(state, command);
        case INSPECT -> observed(state, command.question());
        case UNKNOWN -> answer(state, null, unknown(command.question()));
      };
    }

    private Result loginPolicy(State state, String account) {
      if (!"A".equals(account)) return result(state, null, "이 사건에서는 테스트 계정 A만 사용할 수 있습니다.");
      return login(state, "A", response("HTTP/1.1 302 FOUND", "Location: /mypage/orders\nSet-Cookie: session=lab_a_coupon_policy; Path=/; HttpOnly; Secure; SameSite=Lax", ""));
    }

    private Result sequence(State state, BlackBoxCommand command) {
      Result login=loginPolicy(state, command.account());
      Result request=request(login.nextState(), command.method(), command.path());
      String transcript="## 실행 결과 1 · 로그인\n\n"+login.transcript()+"\n\n## 실행 결과 2 · "+command.method()+" "+command.path()+"\n\n"+request.transcript();
      return new Result(request.nextState(), request.observationKey(), transcript);
    }

    private Result request(State state, String method, String rawPath) {
      if (state.activeAccount().isBlank()) return result(state, "coupon-policy-unauthenticated", noSession());
      String path=rawPath==null?"":rawPath;
      if ("GET".equals(method) && "/mypage/coupon-history".equals(path)) return history(state);
      if ("GET".equals(method) && path.matches("/orders/O-300[1-4]")) return order(state, path.substring("/orders/".length()));
      if ("POST".equals(method) && "/orders/O-3001/coupons/ONE-TIME-10/apply?parallel=10".equals(path)) return parallelTen(state);
      if ("POST".equals(method) && path.matches("/orders/O-300[1-4]/coupons/"+COUPON+"/apply")) return apply(state, path.substring("/orders/".length(), "/orders/O-3001".length()));
      if ("POST".equals(method) && "/orders/coupons/ONE-TIME-10/apply?parallel=O-3001,O-3002".equals(path)) return parallel(state);
      if (path.startsWith("/orders") || path.startsWith("/mypage")) return result(state, "coupon-policy-route-miss", response("HTTP/1.1 404 NOT FOUND", "Content-Type: application/json", "{\"error\":\"NOT_FOUND\"}"));
      return answer(state, null, unknown(path));
    }

    private Result apply(State state, String orderId) {
      if (used(state)) return result(state, "coupon-reuse-rejected", response("HTTP/1.1 409 CONFLICT", "Content-Type: application/json", "{\"error\":\"COUPON_ALREADY_USED\",\"couponCode\":\""+COUPON+"\"}"));
      if ("O-3003".equals(orderId)) return result(state, "coupon-minimum-amount", response("HTTP/1.1 422 UNPROCESSABLE ENTITY", "Content-Type: application/json", "{\"error\":\"MINIMUM_ORDER_AMOUNT_NOT_MET\",\"minimumAmount\":50000}"));
      if ("O-3004".equals(orderId)) return result(state, "coupon-completed-order", response("HTTP/1.1 409 CONFLICT", "Content-Type: application/json", "{\"error\":\"ORDER_NOT_COUPON_ELIGIBLE\",\"orderStatus\":\"PAID\"}"));
      String memory=memory(true, orderId);
      String body="{\"orderId\":\""+orderId+"\",\"couponCode\":\""+COUPON+"\",\"discountApplied\":true,\"finalAmount\":"+finalAmount(orderId, memory)+"}";
      String transcript=response("HTTP/1.1 200 OK", "Content-Type: application/json\nCache-Control: no-store", body);
      return new Result(new State(state.activeAccount(), transcript, memory), "coupon-first-apply", transcript);
    }

    private Result parallel(State state) {
      if (used(state)) return result(state, "coupon-reuse-rejected", response("HTTP/1.1 409 CONFLICT", "Content-Type: application/json", "{\"error\":\"COUPON_ALREADY_USED\",\"couponCode\":\""+COUPON+"\"}"));
      String memory=memory(true, "O-3001,O-3002");
      String body="{\"requestCount\": 2,\"responses\":[{\"orderId\":\"O-3001\",\"status\":200,\"discountApplied\":true},{\"orderId\":\"O-3002\",\"status\":200,\"discountApplied\":true}]}";
      String transcript=response("HTTP/1.1 200 OK", "Content-Type: application/json\nCache-Control: no-store", body);
      return new Result(new State(state.activeAccount(), transcript, memory), "coupon-parallel-apply", transcript);
    }

    private Result parallelTen(State state) {
      if (used(state)) return result(state, "coupon-reuse-rejected", response("HTTP/1.1 409 CONFLICT", "Content-Type: application/json", "{\"error\":\"COUPON_ALREADY_USED\",\"couponCode\":\""+COUPON+"\"}"));
      String responses=java.util.stream.IntStream.rangeClosed(1, 10).mapToObj(index -> "{\"request\":"+index+",\"status\":200,\"discountApplied\":true}").collect(java.util.stream.Collectors.joining(","));
      String body="{\"requestCount\":10,\"orderId\":\"O-3001\",\"responses\":["+responses+"]}";
      String transcript=response("HTTP/1.1 200 OK", "Content-Type: application/json\nCache-Control: no-store", body);
      return new Result(new State(state.activeAccount(), transcript, memory(true, "O-3001")), "coupon-parallel-single-order", transcript);
    }

    private Result order(State state, String orderId) {
      int base=baseAmount(orderId); boolean discounted=discounted(state, orderId);
      String status="O-3004".equals(orderId)?"PAID":"PENDING_PAYMENT";
      String body="{\"orderId\":\""+orderId+"\",\"orderStatus\":\""+status+"\",\"originalAmount\":"+base+",\"couponCode\":"+(discounted?"\""+COUPON+"\"":"null")+",\"finalAmount\":"+finalAmount(orderId, state.memory())+"}";
      return result(state, "coupon-order-"+orderId, response("HTTP/1.1 200 OK", "Content-Type: application/json\nCache-Control: no-store", body));
    }

    private Result history(State state) {
      String body="{\"couponCode\":\""+COUPON+"\",\"usageCount\": "+(used(state)?1:0)+",\"status\":\""+(used(state)?"USED":"AVAILABLE")+"\"}";
      return result(state, "coupon-history-"+(used(state)?"one":"zero"), response("HTTP/1.1 200 OK", "Content-Type: application/json\nCache-Control: no-store", body));
    }

    private int baseAmount(String orderId) { return switch(orderId) { case "O-3001", "O-3004" -> 60000; case "O-3002" -> 80000; case "O-3003" -> 40000; default -> 0; }; }
    private int finalAmount(String orderId, String memory) { return discounted(memory, orderId) ? baseAmount(orderId)*9/10 : baseAmount(orderId); }
    private boolean used(State state) { return state.memory().contains("used=1"); }
    private boolean discounted(State state, String orderId) { return discounted(state.memory(), orderId); }
    private boolean discounted(String stored, String orderId) { return stored.contains("discounted="+orderId) || stored.contains(","+orderId); }
    private String memory(boolean used, String discounted) { return "used="+(used?1:0)+";discounted="+discounted; }
  }

  private static final class LoginEnumerationTarget extends BaseTarget {
    @Override public String initialBriefing() { return "## 실습 대상 정보\n\n- 대상: `https://portal.training.local/login`\n- 존재하는 테스트 이메일: `member.known@example.test`\n- 존재하지 않는 테스트 이메일: `member.unknown@example.test`\n- 둘 다 비밀번호는 제공되지 않습니다.\n\n로그인 요청을 만들고 응답의 관측 가능한 차이를 기록하세요."; }
    @Override public Result execute(State state, BlackBoxCommand command) {
      if (command.type()==BlackBoxCommand.Type.INFO) return answer(state,"login-scope","로그인 경로는 `/login`입니다. 존재하는 이메일과 존재하지 않는 이메일이 하나씩 제공됩니다. 비밀번호는 둘 다 알 수 없습니다.");
      if (command.type()==BlackBoxCommand.Type.INSPECT) return observed(state, command.question());
      if (command.type()==BlackBoxCommand.Type.SEQUENCE) return answer(state, null, unknown(command.question()));
      if (command.type()==BlackBoxCommand.Type.REQUEST && "POST".equals(command.method()) && command.path().startsWith("/login")) {
        String question=command.question().toLowerCase(Locale.ROOT);
        if (question.contains("unknown") || question.contains("존재하지")) return result(state,"unknown-login",response("HTTP/1.1 401 UNAUTHORIZED", "Content-Type: application/json\nX-Response-Time: 190ms", "{\"error\":\"INVALID_CREDENTIALS\"}"));
        if (question.contains("known") || question.contains("존재하는")) return result(state,"known-login",response("HTTP/1.1 401 UNAUTHORIZED", "Content-Type: application/json\nX-Response-Time: 820ms", "{\"error\":\"INVALID_CREDENTIALS\"}"));
      }
      return answer(state,null,unknown(command.question()));
    }
  }
}
