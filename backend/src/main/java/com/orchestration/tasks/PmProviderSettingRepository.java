package com.orchestration.tasks;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

interface PmProviderSettingRepository extends JpaRepository<PmProviderSetting, UUID> {
  Optional<PmProviderSetting> findFirstByOrderByIdAsc();
}
