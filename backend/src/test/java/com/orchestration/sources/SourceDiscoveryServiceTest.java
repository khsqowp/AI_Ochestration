package com.orchestration.sources;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import com.orchestration.tasks.LlmGateway;
import org.junit.jupiter.api.Test;

/** Gemini의 thinking 토큰이 maxOutputTokens 예산을 다 먹어버리면 후보 근거 마지막 줄이 문장 중간에서
 * 끊긴 채로 저장되던 실제 사례들을 재현해, looksTruncated가 이를 제대로 걸러내는지 검증한다. */
class SourceDiscoveryServiceTest {

  private final SourceDiscoveryService service = new SourceDiscoveryService(
      mock(ResearchSourceRepository.class), mock(SourceCandidateRepository.class),
      mock(ResearchSourceService.class), mock(LlmGateway.class));

  @Test
  void detectsRealTruncatedExamplesFromProduction() {
    assertThat(service.looksTruncated("Cisco Talos의 방대한 위")).isTrue();
    assertThat(service.looksTruncated("광범위한 위협 및 취약점에 대한")).isTrue();
    assertThat(service.looksTruncated("고도로 기술적인 원본 보안 연구와 취약점 공개가 강")).isTrue();
    assertThat(service.looksTruncated("높은 저널리즘 기준과 탐사 보")).isTrue();
    assertThat(service.looksTruncated("제로데이 취약점에 대한 독보적인 원본 연구와")).isTrue();
    assertThat(service.looksTruncated("개발 경제학")).isTrue();
  }

  @Test
  void acceptsCompleteSentences() {
    assertThat(service.looksTruncated(
        "최전선 침해 조사에 기반한 독보적인 위협 인텔리전스와 APT 분석을 제공하며 정부 기관에서도 자주 인용될 정도로 신뢰도가 높으나, 기업 블로그이므로 잠재적인 벤더 편향성이 존재할 수 있습니다."))
        .isFalse();
    assertThat(service.looksTruncated(
        "심층적인 분석과 학술적 엄격함이 강점이나, 속보성 뉴스보다는 장기적인 트렌드와 심층 기사에 집중하는 경향이 있음"))
        .isFalse();
  }
}
