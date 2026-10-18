package com.orchestration.tasks;

import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class NoteGraphEdgeWriter {
  private final NoteGraphEdgeRepository edges;

  NoteGraphEdgeWriter(NoteGraphEdgeRepository edges) { this.edges = edges; }

  @Transactional
  public void replace(List<NoteGraphEdge> refreshed) {
    edges.deleteAllInBatch();
    edges.saveAll(refreshed);
  }
}
