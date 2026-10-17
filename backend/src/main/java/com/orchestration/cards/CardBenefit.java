package com.orchestration.cards;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "card_benefit")
public class CardBenefit {
  @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
  @Column(nullable = false, length = 160) private String name;
  @Column(nullable = false, columnDefinition = "TEXT") private String benefits;
  @Column(name = "created_at", nullable = false) private Instant createdAt = Instant.now();
  @Column(name = "updated_at", nullable = false) private Instant updatedAt = Instant.now();

  protected CardBenefit() {}
  CardBenefit(String name, String benefits) { this.name = name; this.benefits = benefits; }

  void update(String name, String benefits) { this.name = name; this.benefits = benefits; this.updatedAt = Instant.now(); }
  public UUID getId() { return id; }
  public String getName() { return name; }
  public String getBenefits() { return benefits; }
  public Instant getCreatedAt() { return createdAt; }
  public Instant getUpdatedAt() { return updatedAt; }
}
