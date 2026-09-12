package com.orchestration.training;

import java.util.Locale;

/** The engine owns hidden scenario truth. The chat layer receives only returned observations, never a cause label. */
final class BlackBoxScenarioEngine {
  ScenarioReply replyForAction(BlackBoxScenarioDefinition scenario, String action) {
    return switch (scenario.slug()) {
      case "order-access" -> orderAction(action);
      case "coupon-cache" -> couponAction(action);
      case "login-enumeration" -> loginAction(action);
      default -> noObservation();
    };
  }

  ScenarioReply reply(BlackBoxScenarioDefinition scenario, String message) {
    String input = message == null ? "" : message.toLowerCase(Locale.ROOT).replaceAll("\\s+", " ").trim();
    return switch (scenario.slug()) {
      case "order-access" -> orderAccess(input);
      case "coupon-cache" -> couponCache(input);
      case "login-enumeration" -> loginEnumeration(input);
      default -> noObservation();
    };
  }

  private ScenarioReply orderAction(String action) {
    return switch (action) {
      case "OWN_ORDER" -> orderAccess("내 주문");
      case "CROSS_ORDER" -> orderAccess("o-2008");
      case "OWNER_CONFIRMATION" -> orderAccess("계정 b");
      case "CROSS_ORDER_CHANGE" -> orderAccess("취소");
      default -> noObservation();
    };
  }
  private ScenarioReply couponAction(String action) {
    return switch (action) {
      case "INITIAL_COUPON" -> couponCache("내 쿠폰");
      case "CROSS_SESSION" -> new ScenarioReply("coupon-cross-session",
          "계정 A에서 쿠폰 화면을 연 뒤 로그아웃하고 계정 B로 다시 로그인해 같은 주소를 열자, 계정 B의 쿠폰 정보가 아닌 앞서 본 내용이 그대로 표시됐다.",
          "계정 전환 전후의 응답이 달랐습니다. 현재 확정된 사실과 가설을 분리해 기록하세요.");
      case "OWNER_CONFIRMATION" -> couponCache("계정 b");
      default -> noObservation();
    };
  }
  private ScenarioReply loginAction(String action) {
    return switch (action) {
      case "KNOWN_LOGIN" -> loginEnumeration("known");
      case "UNKNOWN_LOGIN" -> loginEnumeration("unknown");
      case "REPEAT_TIMING" -> loginEnumeration("10회 반복 측정");
      default -> noObservation();
    };
  }

  private ScenarioReply orderAccess(String input) {
    if (contains(input, "취소", "삭제", "수정")) return new ScenarioReply("cross-order-change",
        "계정 A로 다른 주문의 취소를 시도하자 403 FORBIDDEN이 반환됐다. 주문 상태는 바뀌지 않았다.",
        "상태 변경 결과와 조회 결과를 같은 범위로 묶지 마세요. 지금 확인된 사실과 아직 확인되지 않은 사실을 메모에 분리해 보세요.");
    if (contains(input, "b 계정", "계정 b", "다른 계정", "로그아웃 후")) return new ScenarioReply("owner-confirmation",
        "계정 B로 주문 O-2008을 조회하자 계정 A에서 보였던 수령인·배송지·상품명이 동일하게 표시됐다.",
        "두 계정에서 같은 주문 정보가 확인됐습니다. 이 관측이 직접 입증하는 범위를 한 문장으로 정리해 보세요.");
    if (contains(input, "o-2008", "다른 주문", "주문 번호", "url", "식별자")) return new ScenarioReply("cross-order",
        "계정 A 로그인 상태에서 주문 식별자만 O-2008로 바꿔 조회하자 200 OK가 반환됐고, 수령인 이름 일부·배송지·상품 2개가 표시됐다.",
        "타인 주문인지와 조회 외 기능의 영향은 아직 별개의 질문입니다. 현재 가설과 모르는 점을 갱신해 보세요.");
    if (contains(input, "내 주문", "o-1001", "본인 주문")) return new ScenarioReply("own-order",
        "계정 A로 본인 주문 O-1001을 조회하자 200 OK와 A의 주문 정보가 표시됐다.",
        "정상 기준 관측이 추가됐습니다. 다음 관측은 무엇과 비교해야 의미가 있는지 스스로 정리해 보세요.");
    return noObservation();
  }

  private ScenarioReply couponCache(String input) {
    if (contains(input, "b 계정", "계정 b", "다른 계정", "새 세션", "로그아웃")) return new ScenarioReply("coupon-owner-confirmation",
        "계정 B로 새 로그인 세션을 만든 뒤 쿠폰 화면을 열자, 앞서 계정 A에서 보였던 B 전용 쿠폰 코드와 동일한 내용이 표시됐다.",
        "계정 전환 뒤에도 같은 내용이 보였습니다. 요청 대상과 세션 격리 중 무엇을 분리해 확인해야 하는지 메모하세요.");
    if (contains(input, "새로고침", "쿠폰", "내 쿠폰", "화면")) return new ScenarioReply("coupon-own",
        "계정 A의 쿠폰 화면은 첫 조회에서 A 전용 쿠폰을 표시했지만, 로그아웃·재로그인 뒤 같은 주소를 열자 B 전용 쿠폰 코드가 표시됐다.",
        "같은 주소에서 세션에 따라 다른 사용자 정보가 보였습니다. 이를 즉시 하나의 취약점 이름으로 단정하지 마세요.");
    return noObservation();
  }

  private ScenarioReply loginEnumeration(String input) {
    if (contains(input, "반복", "여러 번", "10회", "측정")) return new ScenarioReply("repeat-timing",
        "각 조건을 10회 반복하자 존재하는 계정의 중앙 응답 시간은 약 820ms, 존재하지 않는 계정은 약 190ms였다. 두 집합 안의 변동은 각각 70ms 이하였다.",
        "시간 차이가 반복 관측에서도 유지되는지 확인됐습니다. 이것이 계정 존재를 어느 수준까지 추정하게 하는지 정리해 보세요.");
    if (contains(input, "없는", "존재하지 않는", "unknown", "unknown@")) return new ScenarioReply("unknown-login",
        "존재하지 않는 테스트 이메일에 틀린 비밀번호를 넣자 401 INVALID_CREDENTIALS가 약 190ms 뒤 반환됐다.",
        "문구와 상태 코드만으로는 두 조건을 구분하기 어렵습니다. 비교 가능한 다른 관측이 있는지 생각해 보세요.");
    if (contains(input, "있는", "존재하는", "known", "known@")) return new ScenarioReply("known-login",
        "존재하는 테스트 이메일에 틀린 비밀번호를 넣자 401 INVALID_CREDENTIALS가 약 820ms 뒤 반환됐다.",
        "한 번의 시간 차이는 네트워크 변동일 수 있습니다. 현재 확정할 수 있는 범위를 메모하세요.");
    return noObservation();
  }

  private ScenarioReply noObservation() {
    return new ScenarioReply(null, null,
        "시도한 블랙박스 행동과 관측 결과가 명확하지 않습니다. 실제로 어떤 계정·주소·값을 사용했고 화면이나 응답이 어떻게 달라졌는지 적어 보세요.");
  }
  private boolean contains(String input, String... terms) { for (String term : terms) if (input.contains(term)) return true; return false; }
  record ScenarioReply(String observationKey, String observation, String coachMessage) {}
}
