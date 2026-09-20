package com.orchestration.training;

/** Server-owned target for a single simulated black-box lab. It never exposes its hidden diagnosis. */
interface BlackBoxVirtualTarget {
  State initialState();
  String initialBriefing();
  Result execute(State state, BlackBoxCommand command);
  String encode(State state);
  State decode(String encoded);

  record State(String activeAccount, String lastTranscript, String memory) {
    public State { activeAccount = activeAccount == null ? "" : activeAccount; lastTranscript = lastTranscript == null ? "" : lastTranscript; memory = memory == null ? "" : memory; }
    State(String activeAccount, String lastTranscript) { this(activeAccount, lastTranscript, ""); }
  }
  record Result(State nextState, String observationKey, String transcript) { }
}
