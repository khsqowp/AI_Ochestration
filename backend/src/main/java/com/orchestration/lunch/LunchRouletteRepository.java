package com.orchestration.lunch;

import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

interface LunchRouletteRepository extends JpaRepository<LunchRoulette, UUID> {
  Optional<LunchRoulette> findByDay(LocalDate day);
}
