package com.orchestration.cards;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class CardBenefitServiceTest {
  @Mock private CardBenefitRepository cards;
  private CardBenefitService service() { return new CardBenefitService(cards); }

  @Test
  void listReturnsSavedCardsNewestFirst() {
    when(cards.findAllByOrderByUpdatedAtDescCreatedAtDesc()).thenReturn(List.of());
    assertThat(service().list()).isEmpty();
    verify(cards).findAllByOrderByUpdatedAtDescCreatedAtDesc();
  }

  @Test
  void createTrimsCardNameAndBenefitText() {
    when(cards.save(any(CardBenefit.class))).thenAnswer(invocation -> invocation.getArgument(0));
    CardBenefit created = service().create("  생활 카드  ", "  점심 결제 10% 할인  ");
    assertThat(created.getName()).isEqualTo("생활 카드");
    assertThat(created.getBenefits()).isEqualTo("점심 결제 10% 할인");
  }

  @Test
  void updateChangesOnlyRequestedCard() {
    UUID id = UUID.randomUUID();
    CardBenefit card = new CardBenefit("기존 카드", "기존 혜택");
    when(cards.findById(id)).thenReturn(Optional.of(card));
    when(cards.save(card)).thenReturn(card);
    CardBenefit updated = service().update(id, "새 카드명", "주유 할인");
    assertThat(updated.getName()).isEqualTo("새 카드명");
    assertThat(updated.getBenefits()).isEqualTo("주유 할인");
    verify(cards).save(card);
  }

  @Test
  void updateUnknownCardReturnsNotFound() {
    UUID id = UUID.randomUUID();
    when(cards.findById(id)).thenReturn(Optional.empty());
    assertThatThrownBy(() -> service().update(id, "카드", "혜택"))
        .isInstanceOf(ResponseStatusException.class)
        .hasMessageContaining("404 NOT_FOUND");
  }

  @Test
  void deleteUnknownCardReturnsNotFound() {
    UUID id = UUID.randomUUID();
    when(cards.existsById(id)).thenReturn(false);
    assertThatThrownBy(() -> service().delete(id))
        .isInstanceOf(ResponseStatusException.class)
        .hasMessageContaining("404 NOT_FOUND");
  }
}
