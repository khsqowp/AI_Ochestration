package com.orchestration.linkcollect;

import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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

  @Test
  void passesThroughSuccessfulReclassificationResponse() throws Exception {
    String requestBody = "{\"kind\":\"knowledge\",\"id\":\"abc\",\"target\":\"place\"}";
    String responseBody = "{\"requeued\":1}";
    when(client.reclassify(requestBody)).thenReturn(new LinkCollectClient.ReclassifyResult(200, responseBody));

    mvc.perform(post("/api/linkcollect/archive/reclassify").contentType(MediaType.APPLICATION_JSON).content(requestBody))
        .andExpect(status().isOk())
        .andExpect(content().contentType(MediaType.APPLICATION_JSON))
        .andExpect(content().string(responseBody));
  }

  @Test
  void passesThroughReclassificationNotFoundResponse() throws Exception {
    String requestBody = "{\"kind\":\"knowledge\",\"id\":\"missing\",\"target\":\"place\"}";
    String responseBody = "{\"error\":\"not found\"}";
    when(client.reclassify(requestBody)).thenReturn(new LinkCollectClient.ReclassifyResult(404, responseBody));

    mvc.perform(post("/api/linkcollect/archive/reclassify").contentType(MediaType.APPLICATION_JSON).content(requestBody))
        .andExpect(status().isNotFound())
        .andExpect(content().contentType(MediaType.APPLICATION_JSON))
        .andExpect(content().string(responseBody));
  }

  @Test
  void returnsServiceUnavailableWhenReclassificationLinkCollectIsUnavailable() throws Exception {
    String requestBody = "{\"kind\":\"knowledge\",\"id\":\"abc\",\"target\":\"place\"}";
    when(client.reclassify(requestBody)).thenThrow(new LinkCollectUnavailableException("LinkCollect 연결 실패 — SSH 터널 상태를 확인하세요."));

    mvc.perform(post("/api/linkcollect/archive/reclassify").contentType(MediaType.APPLICATION_JSON).content(requestBody))
        .andExpect(status().isServiceUnavailable())
        .andExpect(content().contentType(MediaType.APPLICATION_JSON))
        .andExpect(content().json("{\"error\":\"LinkCollect 연결 실패 — SSH 터널 상태를 확인하세요.\"}"));
  }

  @Test
  void returnsThumbnailBytesWhenPresent() throws Exception {
    byte[] jpeg = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF};
    when(client.thumbnail("45fe87b4d52a")).thenReturn(new LinkCollectClient.Thumbnail(jpeg, "image/jpeg"));

    mvc.perform(get("/api/linkcollect/jobs/45fe87b4d52a/thumbnail"))
        .andExpect(status().isOk())
        .andExpect(content().contentType(MediaType.IMAGE_JPEG))
        .andExpect(content().bytes(jpeg));
  }

  @Test
  void returnsNotFoundWhenThumbnailMissing() throws Exception {
    when(client.thumbnail("45fe87b4d52a")).thenReturn(null);

    mvc.perform(get("/api/linkcollect/jobs/45fe87b4d52a/thumbnail")).andExpect(status().isNotFound());
  }

  @Test
  void rejectsInvalidJobIdForThumbnail() throws Exception {
    mvc.perform(get("/api/linkcollect/jobs/not-a-valid-id/thumbnail")).andExpect(status().isBadRequest());
  }
}
