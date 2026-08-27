package com.orchestration.sources;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;

/** Singleton row: a master kill-switch for the scheduled (automatic) source collection, independent of
 * each ResearchSource's own enabled flag -- lets the owner pause all background collection spend during a
 * busy stretch without having to remember and restore every individual source's state afterward. Manual
 * "collect now" stays unaffected since that's an explicit, deliberate spend either way. */
@Entity
@Table(name = "collection_setting")
public class CollectionSetting {
  @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
  @Column(nullable = false) private boolean enabled = true;

  protected CollectionSetting() {}

  public UUID getId() { return id; }
  public boolean isEnabled() { return enabled; }

  void setEnabled(boolean enabled) { this.enabled = enabled; }
}
