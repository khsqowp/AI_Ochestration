package com.orchestration.tasks;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;

/** Singleton row: which provider currently answers the PM stage. Lets an admin flip PM between DeepSeek and
 * Bedrock/Claude without a redeploy — e.g. to spend down Bedrock credits, then switch back. */
@Entity
@Table(name = "pm_provider_setting")
public class PmProviderSetting {
  @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
  @Enumerated(EnumType.STRING) @Column(nullable = false) private PmProvider provider = PmProvider.DEEPSEEK;

  protected PmProviderSetting() {}

  public UUID getId() { return id; }
  public PmProvider getProvider() { return provider; }

  void setProvider(PmProvider provider) { this.provider = provider; }
}
