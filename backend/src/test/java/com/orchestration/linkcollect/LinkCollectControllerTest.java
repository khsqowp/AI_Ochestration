package com.orchestration.linkcollect;

import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import org.mockito.Mockito;

class LinkCollectControllerTest {
  private final LinkCollectClient client = Mockito.mock(LinkCollectClient.class);
  private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new LinkCollectController(client)).build();

  @Test
  void returnsRawJsonForAllEndpoints() throws Exception {
    when(client.jobs()).thenReturn("{\"jobs\":[]}");
    when(client.knowledge()).thenReturn("{\"items\":[]}");
    when(client.places()).thenReturn("{\"places\":[]}");

    mvc.perform(get("/api/linkcollect/jobs")).andExpect(status().isOk()).andExpect(content().contentType(MediaType.APPLICATION_JSON)).andExpect(content().string("{\"jobs\":[]}"));
    mvc.perform(get("/api/linkcollect/knowledge")).andExpect(status().isOk()).andExpect(content().string("{\"items\":[]}"));
    mvc.perform(get("/api/linkcollect/places")).andExpect(status().isOk()).andExpect(content().string("{\"places\":[]}"));
  }

  @Test
  void returnsServiceUnavailableWhenLinkCollectIsUnavailable() throws Exception {
    when(client.jobs()).thenThrow(new LinkCollectUnavailableException("LinkCollect 연결 실패 — SSH 터널 상태를 확인하세요."));

    mvc.perform(get("/api/linkcollect/jobs"))
        .andExpect(status().isServiceUnavailable())
        .andExpect(content().contentType(MediaType.APPLICATION_JSON))
        .andExpect(content().json("{\"error\":\"LinkCollect 연결 실패 — SSH 터널 상태를 확인하세요.\"}"));
  }
}
