package com.orchestration.sources;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

/** Critical #1, defense-in-depth -- registering a source pointed straight at a private/loopback/link-local
 * literal IP should be rejected immediately, not left to fail (or worse, silently succeed) only once a
 * crawl attempt reaches it. Crawl-time validation ({@link SourceCollectionService#rejectPrivateTarget})
 * remains the real defense for hostnames, since a hostname's DNS resolution can change after registration
 * -- this only ever catches an already-obvious literal IP up front. */
@ExtendWith(MockitoExtension.class)
class ResearchSourceServiceTest {
  @Mock private ResearchSourceRepository sources;

  private ResearchSourceService service() { return new ResearchSourceService(sources); }

  private ResearchSourceService.CreateResearchSource request(String url) {
    return new ResearchSourceService.CreateResearchSource("이름", url, ResearchDomain.SECURITY, 24, 1, 20, null);
  }

  @Test
  void create_rejectsALoopbackLiteralIp() {
    assertThatThrownBy(() -> service().create(request("http://127.0.0.1/admin")))
        .isInstanceOf(ResponseStatusException.class);
  }

  @Test
  void create_rejectsAnAwsMetadataStyleLinkLocalLiteralIp() {
    assertThatThrownBy(() -> service().create(request("http://169.254.169.254/latest/meta-data/")))
        .isInstanceOf(ResponseStatusException.class);
  }

  @Test
  void create_rejectsAPrivateRfc1918LiteralIp() {
    assertThatThrownBy(() -> service().create(request("http://10.0.0.5/")))
        .isInstanceOf(ResponseStatusException.class);
    assertThatThrownBy(() -> service().create(request("http://192.168.1.1/")))
        .isInstanceOf(ResponseStatusException.class);
  }

  @Test
  void create_allowsAPublicLiteralIp() {
    when(sources.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

    ResearchSource created = service().create(request("http://8.8.8.8/"));

    assertThat(created.getUrl()).isEqualTo("http://8.8.8.8/");
  }

  @Test
  void create_allowsAnOrdinaryPublicHostname() {
    when(sources.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

    ResearchSource created = service().create(request("https://example.com/feed"));

    assertThat(created.getUrl()).isEqualTo("https://example.com/feed");
  }
}
