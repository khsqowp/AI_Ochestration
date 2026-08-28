package com.orchestration.tasks;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/debate")
public class DebateController {
  private final DebateService debates;

  DebateController(DebateService debates) {
    this.debates = debates;
  }

  @PostMapping("/sessions")
  public SessionResponse create(@RequestBody CreateSessionRequest request) {
    DebateSession session = debates.create(request.mode(), request.topic(), request.proModel(), request.conModel(), request.participants(), request.maxTurnsPerSide());
    return toResponse(session);
  }

  @GetMapping("/sessions")
  public List<SessionResponse> list() {
    return debates.list().stream().map(this::toResponse).toList();
  }

  @GetMapping("/sessions/{id}")
  public SessionDetailResponse get(@PathVariable UUID id) {
    DebateSession session = debates.get(id);
    List<TurnResponse> turns = debates.turnsOf(id).stream().map(this::toResponse).toList();
    return new SessionDetailResponse(toResponse(session), turns);
  }

  @PostMapping("/sessions/{id}/advance")
  public TurnResponse advance(@PathVariable UUID id) throws Exception {
    return toResponse(debates.advance(id));
  }

  private SessionResponse toResponse(DebateSession session) {
    List<String> participants = session.getParticipants() == null ? null : List.of(session.getParticipants().split(","));
    return new SessionResponse(session.getId(), session.getMode(), session.getTopic(), session.getProModel(), session.getConModel(), participants,
        session.getMaxTurnsPerSide(), session.getStatus(), session.getTurnsCompleted(), session.getCreatedAt());
  }

  private TurnResponse toResponse(DebateTurn turn) {
    return new TurnResponse(turn.getId(), turn.getTurnIndex(), turn.getRole(), turn.getSpeakerModel(), turn.getContent(), turn.getCreatedAt());
  }

  record CreateSessionRequest(DebateMode mode, String topic, String proModel, String conModel, List<String> participants, int maxTurnsPerSide) {}
  record SessionResponse(UUID id, DebateMode mode, String topic, String proModel, String conModel, List<String> participants,
      int maxTurnsPerSide, DebateStatus status, int turnsCompleted, Instant createdAt) {}
  record TurnResponse(UUID id, int turnIndex, String role, String speakerModel, String content, Instant createdAt) {}
  record SessionDetailResponse(SessionResponse session, List<TurnResponse> turns) {}
}
