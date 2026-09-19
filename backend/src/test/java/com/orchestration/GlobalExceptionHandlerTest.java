package com.orchestration;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.orm.ObjectOptimisticLockingFailureException;

/** High #6 -- concurrent edits to the same row (e.g. two black-box session messages saved at once) must
 * surface as a 409 the client can retry on, not fall through to the generic 500 handler. */
class GlobalExceptionHandlerTest {
  private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

  @Test
  void onOptimisticLock_returnsConflict_withASafeKoreanMessage_neverTheRawExceptionText() {
    var exception = new ObjectOptimisticLockingFailureException("black_box_scenario_session", "some-id");

    ResponseEntity<GlobalExceptionHandler.Message> response = handler.onOptimisticLock(exception);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    assertThat(response.getBody().message()).doesNotContain("ObjectOptimisticLockingFailureException");
  }
}
