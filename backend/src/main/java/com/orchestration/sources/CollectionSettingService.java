package com.orchestration.sources;

import org.springframework.stereotype.Service;

@Service
public class CollectionSettingService {
  private final CollectionSettingRepository repository;

  CollectionSettingService(CollectionSettingRepository repository) { this.repository = repository; }

  public boolean enabled() {
    return repository.findFirstByOrderByIdAsc().map(CollectionSetting::isEnabled).orElse(true);
  }

  public boolean set(boolean enabled) {
    CollectionSetting setting = repository.findFirstByOrderByIdAsc().orElseGet(CollectionSetting::new);
    setting.setEnabled(enabled);
    return repository.save(setting).isEnabled();
  }
}
