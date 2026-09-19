package com.orchestration;

import com.orchestration.auth.InvalidCredentialsException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

/**
 * Last line of defense for exception handling: whatever a controller didn't already turn into a
 * {@code ResponseStatusException} (those already map to a safe status via Spring's default handling) lands
 * here. The rule is the same everywhere — log the real exception server-side, but never hand the client a
 * stack trace, an exception class name, or a raw {@code exception.getMessage()}, since any of those can leak
 * internal paths, SQL, or library versions to whoever is probing the API.
 */
@RestControllerAdvice
class GlobalExceptionHandler {
  private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

  @ExceptionHandler(InvalidCredentialsException.class)
  public ResponseEntity<Message> onInvalidCredentials(InvalidCredentialsException exception) {
    return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(new Message(exception.getMessage()));
  }

  /** Passes an already-deliberate {@code ResponseStatusException} through with its own status and reason —
   * without this, the catch-all below would outrank Spring's default handling and flatten every existing
   * 400/404/etc. thrown across the controllers into a generic 500. */
  @ExceptionHandler(ResponseStatusException.class)
  public ResponseEntity<Message> onResponseStatus(ResponseStatusException exception) {
    return ResponseEntity.status(exception.getStatusCode()).body(new Message(exception.getReason()));
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  public ResponseEntity<Message> onValidationFailed(MethodArgumentNotValidException exception) {
    String detail = exception.getBindingResult().getFieldErrors().stream()
        .map(error -> error.getField() + ": " + error.getDefaultMessage())
        .reduce((a, b) -> a + "; " + b).orElse("입력값이 올바르지 않습니다.");
    return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(new Message(detail));
  }

  @ExceptionHandler(HttpMessageNotReadableException.class)
  public ResponseEntity<Message> onMalformedBody(HttpMessageNotReadableException exception) {
    return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(new Message("요청 본문을 읽을 수 없습니다."));
  }

  /**
   * Every {@code IllegalArgumentException} thrown across the services is a hand-written, already-safe
   * Korean validation message (e.g. "판정 값이 올바르지 않습니다.") — none of them wrap a raw library or SQL
   * exception. Without this handler they fell through to {@link #onUnexpected}, which replaces that
   * curated message with a generic "서버 오류가 발생했습니다." — safe, but it silently threw away input
   * feedback the caller was specifically designed to show the user.
   */
  @ExceptionHandler(IllegalArgumentException.class)
  public ResponseEntity<Message> onInvalidArgument(IllegalArgumentException exception) {
    String message = exception.getMessage();
    return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(new Message(message == null || message.isBlank() ? "요청 값이 올바르지 않습니다." : message));
  }

  /** Same rationale as {@link #onInvalidArgument}: request-time state-precondition messages (e.g.
   * "종료된 사건만 재평가할 수 있습니다.") are hand-written and already safe to show — only the two config-time
   * throws in this codebase (startup validation) are English/internal, and those never reach an HTTP
   * request in the first place since they fail application boot. */
  @ExceptionHandler(IllegalStateException.class)
  public ResponseEntity<Message> onInvalidState(IllegalStateException exception) {
    String message = exception.getMessage();
    return ResponseEntity.status(HttpStatus.CONFLICT).body(new Message(message == null || message.isBlank() ? "현재 상태에서는 처리할 수 없습니다." : message));
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<Message> onUnexpected(Exception exception, jakarta.servlet.http.HttpServletRequest request) {
    log.error("unhandled_exception path={} method={}", request.getRequestURI(), request.getMethod(), exception);
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(new Message("서버 오류가 발생했습니다."));
  }

  record Message(String message) {}
}
