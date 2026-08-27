package com.orchestration.tasks;

import org.springframework.stereotype.Service;

@Service
public class PmProviderSettingService {
  private final PmProviderSettingRepository repository;

  PmProviderSettingService(PmProviderSettingRepository repository) { this.repository = repository; }

  public PmProvider current() {
    return repository.findFirstByOrderByIdAsc().map(PmProviderSetting::getProvider).orElse(PmProvider.DEEPSEEK);
  }

  public PmProvider set(PmProvider provider) {
    PmProviderSetting setting = repository.findFirstByOrderByIdAsc().orElseGet(PmProviderSetting::new);
    setting.setProvider(provider);
    return repository.save(setting).getProvider();
  }
}
