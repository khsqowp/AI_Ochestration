package com.orchestration.training;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Regression contract for learner questions. A valid request for disclosed facts or the last
 * simulated response must never fall through to the generic scope response or an LLM guess.
 */
class BlackBoxConversationContractTest {
  @Test
  void routes_all_common_questions_about_the_last_http_response_to_the_observation_reader() {
    BlackBoxScenarioDefinition scenario = BlackBoxScenarioCatalog.bySlug("order-access");

    for (String question : List.of(
        "리다이렉트 후 주소는?",
        "로그인 후 어디로 이동해?",
        "세션 쿠키 값은?",
        "방금 응답의 상태 코드는?",
        "응답 헤더를 보여줘.",
        "방금 요청 결과를 다시 보여줘.")) {
      assertThat(BlackBoxCommandParser.parse(scenario, question).type())
          .as(question)
          .isEqualTo(BlackBoxCommand.Type.INSPECT);
    }
  }

  @Test
  void answers_a_location_question_from_the_last_response_instead_of_repeating_lab_scope() {
    BlackBoxVirtualTarget target = BlackBoxVirtualTargets.forScenario("order-access");
    BlackBoxVirtualTarget.Result login = target.execute(target.initialState(), BlackBoxCommand.login("A"));

    BlackBoxVirtualTarget.Result answer = target.execute(login.nextState(), BlackBoxCommand.inspect("리다이렉트 후 주소는?"));

    assertThat(answer.transcript())
        .contains("직전 응답의 리다이렉트 목적지")
        .contains("`/mypage/orders`");
  }

  @Test
  void answers_status_and_cookie_questions_from_the_last_response_without_disclosing_hidden_diagnosis() {
    BlackBoxVirtualTarget target = BlackBoxVirtualTargets.forScenario("order-access");
    BlackBoxVirtualTarget.Result login = target.execute(target.initialState(), BlackBoxCommand.login("A"));

    BlackBoxVirtualTarget.Result status = target.execute(login.nextState(), BlackBoxCommand.inspect("상태 코드는?"));
    BlackBoxVirtualTarget.Result cookie = target.execute(login.nextState(), BlackBoxCommand.inspect("세션 쿠키 값은?"));

    assertThat(status.transcript()).contains("HTTP 상태: `302 FOUND`");
    assertThat(cookie.transcript()).contains("세션 쿠키: `session=lab_a_7b1f`");
    assertThat(status.transcript()).doesNotContain("객체 소유권 인가 누락");
    assertThat(cookie.transcript()).doesNotContain("객체 소유권 인가 누락");
  }

  @Test
  void keeps_the_raw_http_observation_available_across_multiple_follow_up_questions() {
    BlackBoxVirtualTarget target = BlackBoxVirtualTargets.forScenario("order-access");
    BlackBoxVirtualTarget.Result login = target.execute(target.initialState(), BlackBoxCommand.login("A"));
    BlackBoxVirtualTarget.Result redirect = target.execute(login.nextState(), BlackBoxCommand.inspect("리다이렉트 후 주소는?"));

    BlackBoxVirtualTarget.Result cookie = target.execute(redirect.nextState(), BlackBoxCommand.inspect("세션 쿠키 값은?"));
    BlackBoxVirtualTarget.Result status = target.execute(cookie.nextState(), BlackBoxCommand.inspect("상태 코드는?"));

    assertThat(cookie.transcript()).contains("session=lab_a_7b1f");
    assertThat(status.transcript()).contains("HTTP 상태: `302 FOUND`");
  }

  @Test
  void explains_when_a_last_response_does_not_exist_instead_of_inventing_one() {
    BlackBoxVirtualTarget target = BlackBoxVirtualTargets.forScenario("coupon-cache");

    BlackBoxVirtualTarget.Result answer = target.execute(target.initialState(), BlackBoxCommand.inspect("응답 상태 코드는?"));

    assertThat(answer.transcript()).contains("아직 이 세션에서 실행된 요청이 없습니다.");
  }

  @Test
  void executes_an_explicit_login_then_url_request_as_one_ordered_learner_action() {
    BlackBoxScenarioDefinition scenario = BlackBoxScenarioCatalog.bySlug("order-access");
    BlackBoxCommand command = BlackBoxCommandParser.parse(scenario, "A 계정으로 로그인 후 /orders/O-2008 에 접근 시도");
    BlackBoxVirtualTarget target = BlackBoxVirtualTargets.forScenario("order-access");

    BlackBoxVirtualTarget.Result result = target.execute(target.initialState(), command);

    assertThat(command.type()).isEqualTo(BlackBoxCommand.Type.SEQUENCE);
    assertThat(result.nextState().activeAccount()).isEqualTo("A");
    assertThat(result.transcript()).contains("실행 결과 1 · 로그인").contains("실행 결과 2 · GET /orders/O-2008")
        .contains("HTTP/1.1 200 OK").contains("\"orderId\": \"O-2008\"");
  }

  @Test
  void does_not_silently_drop_the_url_when_a_compound_action_contains_an_invalid_order_format() {
    BlackBoxScenarioDefinition scenario = BlackBoxScenarioCatalog.bySlug("order-access");
    BlackBoxCommand command = BlackBoxCommandParser.parse(scenario, "A 계정으로 로그인 후 /orders/0-2008 에 접근 시도");
    BlackBoxVirtualTarget target = BlackBoxVirtualTargets.forScenario("order-access");

    BlackBoxVirtualTarget.Result result = target.execute(target.initialState(), command);

    assertThat(command.type()).isEqualTo(BlackBoxCommand.Type.SEQUENCE);
    assertThat(result.transcript()).contains("실행 결과 2 · GET /orders/0-2008").contains("HTTP/1.1 404 NOT FOUND");
  }

  @Test
  void routes_disclosed_scope_questions_without_requiring_an_ai_model() {
    BlackBoxScenarioDefinition loginScenario = BlackBoxScenarioCatalog.bySlug("login-enumeration");
    BlackBoxScenarioDefinition orderScenario = BlackBoxScenarioCatalog.bySlug("order-access");

    assertThat(BlackBoxCommandParser.parse(loginScenario, "테스트 이메일은?").type()).isEqualTo(BlackBoxCommand.Type.INFO);
    assertThat(BlackBoxCommandParser.parse(loginScenario, "비밀번호가 제공되었나?").type()).isEqualTo(BlackBoxCommand.Type.INFO);
    assertThat(BlackBoxCommandParser.parse(orderScenario, "주문 상세에 허용된 HTTP 메서드는?").type()).isEqualTo(BlackBoxCommand.Type.INFO);
  }

  @Test
  void treats_a_question_about_a_url_as_information_but_an_explicit_access_attempt_as_a_request() {
    BlackBoxScenarioDefinition scenario = BlackBoxScenarioCatalog.bySlug("order-access");

    assertThat(BlackBoxCommandParser.parse(scenario, "/orders/O-2008 주소가 맞아?").type()).isEqualTo(BlackBoxCommand.Type.INFO);
    assertThat(BlackBoxCommandParser.parse(scenario, "/orders/O-2008 로 접근 시도").type()).isEqualTo(BlackBoxCommand.Type.REQUEST);
  }

  @Test
  void preserves_the_same_observation_query_contract_for_every_registered_target() {
    BlackBoxVirtualTarget order = BlackBoxVirtualTargets.forScenario("order-access");
    BlackBoxVirtualTarget.Result orderLogin = order.execute(order.initialState(), BlackBoxCommand.login("A"));
    assertThat(order.execute(orderLogin.nextState(), BlackBoxCommand.inspect("응답 헤더를 보여줘")).transcript())
        .contains("Location: /mypage/orders").contains("Set-Cookie: session=lab_a_7b1f");

    BlackBoxVirtualTarget coupon = BlackBoxVirtualTargets.forScenario("coupon-cache");
    BlackBoxVirtualTarget.Result couponLogin = coupon.execute(coupon.initialState(), BlackBoxCommand.login("B"));
    assertThat(coupon.execute(couponLogin.nextState(), BlackBoxCommand.inspect("세션 쿠키 값은?")).transcript())
        .contains("session=lab_b_coupon");

    BlackBoxVirtualTarget enumeration = BlackBoxVirtualTargets.forScenario("login-enumeration");
    BlackBoxCommand knownLogin = new BlackBoxCommand(BlackBoxCommand.Type.REQUEST, "", "POST", "/login", "known 이메일로 로그인 요청");
    BlackBoxVirtualTarget.Result knownResponse = enumeration.execute(enumeration.initialState(), knownLogin);
    assertThat(enumeration.execute(knownResponse.nextState(), BlackBoxCommand.inspect("방금 응답의 상태 코드는?")).transcript())
        .contains("HTTP 상태: `401 UNAUTHORIZED`");
  }

  @Test
  void allows_the_llm_interpreter_to_execute_only_the_disclosed_coupon_policy_paths() {
    assertThat(BlackBoxScenarioIntentResolver.validPath("coupon-usage-policy", "/orders/O-3001")).isTrue();
    assertThat(BlackBoxScenarioIntentResolver.validPath("coupon-usage-policy", "/mypage/coupon-history")).isTrue();
    assertThat(BlackBoxScenarioIntentResolver.validPath("coupon-usage-policy", "/orders/O-3001/coupons/ONE-TIME-10/apply")).isTrue();
    assertThat(BlackBoxScenarioIntentResolver.validPath("coupon-usage-policy", "/admin/users")).isFalse();
  }

  @Test
  void distinguishes_unknown_login_email_without_matching_known_as_a_substring() {
    BlackBoxVirtualTarget target=BlackBoxVirtualTargets.forScenario("login-enumeration");
    BlackBoxCommand command=new BlackBoxCommand(BlackBoxCommand.Type.REQUEST, "", "POST", "/login", "unknown 이메일로 로그인 요청");

    assertThat(target.execute(target.initialState(), command).transcript()).contains("X-Response-Time: 190ms");
  }
}
