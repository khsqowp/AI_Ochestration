package com.orchestration.training;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class BlackBoxWebApiGuidelineTest {
  @Test
  void mapsBroadSkillsToRelevantGuidelineCoverageWithoutUsingAStaticCase() {
    assertThat(BlackBoxWebApiGuideline.candidatesFor("AUTHORIZATION")).contains("4-3 접근제어 우회");
    assertThat(BlackBoxWebApiGuideline.candidatesFor("SQLI_QUERY")).contains("1-2 삽입");
    assertThat(BlackBoxWebApiGuideline.candidatesFor("BUSINESS_LOGIC")).contains("8-1");
    assertThat(BlackBoxWebApiGuideline.candidatesFor("CSRF")).contains("1-1 XSS / CSRF");
    assertThat(BlackBoxWebApiGuideline.candidatesFor("FILE_DOWNLOAD")).contains("2-2 중요 정보 파일 다운로드");
    assertThat(BlackBoxWebApiGuideline.candidatesFor("ERROR_HANDLING")).contains("6-1 오류페이지");
    assertThat(BlackBoxWebApiGuideline.candidatesFor("WEB_HARDENING")).contains("7-4 취약한 보안설정");
  }
}
