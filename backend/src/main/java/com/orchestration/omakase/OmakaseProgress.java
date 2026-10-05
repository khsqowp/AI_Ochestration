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

/** 로그인 사용자가 오마카세 커리큘럼(토픽) 안의 파일별로 마지막 스크롤 위치를 기억한다.
 * 토픽을 다시 열면 그 토픽에서 가장 최근(updatedAt)에 본 파일로 복귀하고, 파일을 바꿔가며
 * 봐도 각 파일은 자기 위치를 각자 기억한다 -- 행 하나당 (owner_id, topic_id, file_id) 유일. */
@Entity
@Table(name = "omakase_progress", uniqueConstraints = @UniqueConstraint(columnNames = {"owner_id", "topic_id", "file_id"}))
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
