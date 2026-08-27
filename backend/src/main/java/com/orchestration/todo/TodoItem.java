package com.orchestration.todo;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** A single to-do entry, scoped to whichever account created it — the floating widget and the dashboard
 * card both read/write the same rows for the signed-in user, so it stays in sync everywhere in the app. */
@Entity
@Table(name = "todo_item", indexes = @Index(name = "idx_todo_item_owner_id", columnList = "owner_id"))
public class TodoItem {
  @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
  @Column(nullable = false) private UUID ownerId;
  @Lob @Column(columnDefinition = "TEXT", nullable = false) private String text;
  @Column(nullable = false) private boolean completed = false;
  @Column(nullable = false) private Instant createdAt = Instant.now();
  private Instant completedAt;

  protected TodoItem() {}

  TodoItem(UUID ownerId, String text) {
    this.ownerId = ownerId;
    this.text = text;
  }

  public UUID getId() { return id; }
  public UUID getOwnerId() { return ownerId; }
  public String getText() { return text; }
  public boolean isCompleted() { return completed; }
  public Instant getCreatedAt() { return createdAt; }
  public Instant getCompletedAt() { return completedAt; }

  void setCompleted(boolean completed) {
    this.completed = completed;
    this.completedAt = completed ? Instant.now() : null;
  }
}
