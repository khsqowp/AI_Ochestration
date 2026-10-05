package com.orchestration.omakase;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;
import java.util.UUID;

/** 로그인 사용자가 오마카세 커리큘럼(토픽)별로 마지막으로 본 파일과 그 안의 스크롤 위치.
 * 토픽을 다시 열면 이 값으로 바로 복귀한다 -- 토픽당 행 하나(owner_id, topic_id 유일). */
@Entity
@Table(name = "omakase_progress", uniqueConstraints = @UniqueConstraint(columnNames = {"owner_id", "topic_id"}))
public class OmakaseProgress {
  @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
  @Column(nullable = false) private UUID ownerId;
  @Column(nullable = false, length = 80) private String topicId;
  @Column(nullable = false, length = 80) private String fileId;
  @Column(nullable = false) private double scrollFraction;
  @Column(nullable = false) private Instant updatedAt = Instant.now();

  protected OmakaseProgress() {}

  OmakaseProgress(UUID ownerId, String topicId, String fileId, double scrollFraction) {
    this.ownerId = ownerId;
    this.topicId = topicId;
    this.fileId = fileId;
    this.scrollFraction = scrollFraction;
  }

  public UUID getId() { return id; }
  public UUID getOwnerId() { return ownerId; }
  public String getTopicId() { return topicId; }
  public String getFileId() { return fileId; }
  public double getScrollFraction() { return scrollFraction; }
  public Instant getUpdatedAt() { return updatedAt; }

  void apply(String fileId, double scrollFraction) {
    this.fileId = fileId;
    this.scrollFraction = scrollFraction;
    this.updatedAt = Instant.now();
  }
}
