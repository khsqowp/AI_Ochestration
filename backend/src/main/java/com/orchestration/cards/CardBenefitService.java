package com.orchestration.cards;

import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CardBenefitService {
  private final CardBenefitRepository cards;
  CardBenefitService(CardBenefitRepository cards) { this.cards = cards; }

  @Transactional(readOnly = true)
  public List<CardBenefit> list() { return cards.findAllByOrderByUpdatedAtDescCreatedAtDesc(); }

  @Transactional
  public CardBenefit create(String name, String benefits) {
    return cards.save(new CardBenefit(name.trim(), benefits.trim()));
  }

  @Transactional
  public CardBenefit update(UUID id, String name, String benefits) {
    CardBenefit card = cards.findById(id).orElseThrow(CardBenefitService::notFound);
    card.update(name.trim(), benefits.trim());
    return cards.save(card);
  }

  @Transactional
  public void delete(UUID id) {
    if (!cards.existsById(id)) throw notFound();
    cards.deleteById(id);
  }

  private static ResponseStatusException notFound() {
    return new ResponseStatusException(HttpStatus.NOT_FOUND, "카드를 찾을 수 없습니다.");
  }
}
