package com.orchestration.dolphin;

import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
class DolphinTurnPersistence {
  private final DolphinSessionRepository sessions;
  private final DolphinMessageRepository messages;

  DolphinTurnPersistence(DolphinSessionRepository sessions, DolphinMessageRepository messages) {
    this.sessions = sessions;
    this.messages = messages;
  }

  @Transactional(rollbackFor = Exception.class)
  public void persistTurn(String ownerId, UUID id, String mode, String question, String answer, String sourcesJson) {
    DolphinSession session = sessions.findByIdForUpdate(id)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Session not found"));
    if (!session.getOwnerId().equals(ownerId))
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Session not found");
    int next = Math.toIntExact(messages.countBySessionId(id));
    messages.save(new DolphinMessage(id, next, "user", question, null));
    messages.save(new DolphinMessage(id, next + 1, "assistant", answer, sourcesJson));
    session.touch(question);
    session.setMode(mode);
    sessions.save(session);
  }
}
