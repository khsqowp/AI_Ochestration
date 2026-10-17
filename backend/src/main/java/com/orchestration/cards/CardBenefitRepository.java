package com.orchestration.cards;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

interface CardBenefitRepository extends JpaRepository<CardBenefit, UUID> {
  List<CardBenefit> findAllByOrderByUpdatedAtDescCreatedAtDesc();
}
