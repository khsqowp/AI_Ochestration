package com.orchestration.orders;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ProductOrderService {
  private static final List<String> UNITS = List.of("EA", "BOX");

  private final ProductOrderRepository repository;

  ProductOrderService(ProductOrderRepository repository) { this.repository = repository; }

  public List<ProductOrderItem> list(String personName, String pin) {
    return repository.findByPersonNameAndPinOrderByPositionAsc(normName(personName), normPin(pin));
  }

  /** Replace the whole list for one person. Existing rows are reused slot-by-slot so the two "bought"
   * flags set from the dashboard survive an edit that keeps row order. */
  @Transactional
  public List<ProductOrderItem> replace(String personName, String pin, List<ItemInput> items) {
    String name = normName(personName);
    String code = normPin(pin);
    if (items.size() > 40) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "항목이 너무 많습니다.");

    List<ProductOrderItem> existing = repository.findByPersonNameAndPinOrderByPositionAsc(name, code);
    if (items.isEmpty()) { // 전체 삭제 = 주문 취소
      repository.deleteAll(existing);
      return List.of();
    }
    List<ProductOrderItem> result = new ArrayList<>();
    for (int i = 0; i < items.size(); i++) {
      ItemInput in = items.get(i);
      ProductOrderItem row = i < existing.size() ? existing.get(i) : new ProductOrderItem(name, code, i);
      row.setPosition(i);
      row.apply(reqText(in.product(), "제품", 80), clampQty(in.qty()), unit(in.unit()),
          optText(in.altProduct(), 80), in.altQty() == null ? null : clampQty(in.altQty()), unit(in.altUnit()));
      result.add(repository.save(row));
    }
    if (existing.size() > items.size()) {
      repository.deleteAll(existing.subList(items.size(), existing.size()));
    }
    return result;
  }

  public List<ProductOrderItem> all() {
    return repository.findAllByOrderByPersonNameAscPinAscPositionAsc();
  }

  public ProductOrderItem setBought(UUID id, Boolean primary, Boolean alt) {
    ProductOrderItem row = repository.findById(id)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    if (primary != null) row.setBoughtPrimary(primary);
    if (alt != null) row.setBoughtAlt(alt);
    return repository.save(row);
  }

  private static String normName(String raw) {
    String v = raw == null ? "" : raw.trim();
    if (v.isEmpty() || v.length() > 40) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이름을 확인하세요.");
    return v;
  }

  private static String normPin(String raw) {
    String v = raw == null ? "" : raw.trim();
    if (!v.matches("\\d{4}")) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "숫자 4자리를 입력하세요.");
    return v;
  }

  private static String reqText(String raw, String label, int max) {
    String v = raw == null ? "" : raw.trim();
    if (v.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, label + "을(를) 입력하세요.");
    return v.length() > max ? v.substring(0, max) : v;
  }

  private static String optText(String raw, int max) {
    String v = raw == null ? "" : raw.trim();
    if (v.isEmpty()) return null;
    return v.length() > max ? v.substring(0, max) : v;
  }

  private static int clampQty(Integer q) {
    int v = q == null ? 1 : q;
    return Math.max(1, Math.min(999, v));
  }

  private static String unit(String raw) {
    String v = raw == null ? "EA" : raw.trim().toUpperCase();
    return UNITS.contains(v) ? v : "EA";
  }

  public record ItemInput(String product, Integer qty, String unit, String altProduct, Integer altQty, String altUnit) {}
}
