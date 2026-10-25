package com.orchestration.linkcollect;

public class LinkCollectUnavailableException extends RuntimeException {
  public LinkCollectUnavailableException(String message, Throwable cause) {
    super(message, cause);
  }

  public LinkCollectUnavailableException(String message) {
    super(message);
  }
}
