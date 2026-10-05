package com.orchestration.omakase;

import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class OmakaseProgressService {
  private final OmakaseProgressRepository progress;

  OmakaseProgressService(OmakaseProgressRepository progress) { this.progress = progress; }

  public List<OmakaseProgress> list(UUID ownerId) { return progress.findByOwnerId(ownerId); }

  public OmakaseProgress save(UUID ownerId, String topicId, String fileId, double scrollFraction) {
    OmakaseProgress existing = progress.findByOwnerIdAndTopicId(ownerId, topicId).orElse(null);
    if (existing != null) {
      existing.apply(fileId, scrollFraction);
      return progress.save(existing);
    }
    return progress.save(new OmakaseProgress(ownerId, topicId, fileId, scrollFraction));
  }
}
