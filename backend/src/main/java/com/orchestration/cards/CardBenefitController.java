package com.orchestration.cards;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/cards")
public class CardBenefitController {
  private final CardBenefitService service;
  CardBenefitController(CardBenefitService service) { this.service = service; }

  @GetMapping
  public List<CardResponse> list() { return service.list().stream().map(CardResponse::from).toList(); }

  @PostMapping @ResponseStatus(HttpStatus.CREATED)
  public CardResponse create(@Valid @RequestBody CardRequest request) {
    return CardResponse.from(service.create(request.name(), request.benefits()));
  }

  @PutMapping("/{id}")
  public CardResponse update(@PathVariable UUID id, @Valid @RequestBody CardRequest request) {
    return CardResponse.from(service.update(id, request.name(), request.benefits()));
  }

  @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(@PathVariable UUID id) { service.delete(id); }

  record CardRequest(@NotBlank @Size(max = 160) String name,
                     @NotBlank @Size(max = 10000) String benefits) {}
  record CardResponse(String id, String name, String benefits, Instant createdAt, Instant updatedAt) {
    static CardResponse from(CardBenefit card) {
      return new CardResponse(card.getId().toString(), card.getName(), card.getBenefits(), card.getCreatedAt(), card.getUpdatedAt());
    }
  }
}
