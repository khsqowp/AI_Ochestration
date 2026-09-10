package com.orchestration.orders;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** One line of a drink/snack order. Identity of the ordering person is the (personName, pin) pair —
 * the public order page has no accounts, the 4-digit pin is a light lock so a same-named person can't
 * clobber someone else's list. The dashboard "주문" tab (ADMIN) reads every row and toggles the two
 * "bought" flags as the run is shopped. */
@Entity
@Table(name = "product_order_item",
    indexes = @Index(name = "idx_product_order_person", columnList = "person_name, pin, position"))
public class ProductOrderItem {
  @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;

  @Column(name = "person_name", nullable = false, length = 40) private String personName;
  @Column(nullable = false, length = 4) private String pin;
  @Column(nullable = false) private int position;

  @Column(nullable = false, length = 80) private String product;
  @Column(nullable = false) private int qty = 1;
  @Column(nullable = false, length = 8) private String unit = "EA";

  @Column(name = "alt_product", length = 80) private String altProduct;
  @Column(name = "alt_qty") private Integer altQty;
  @Column(name = "alt_unit", length = 8) private String altUnit;

  @Column(name = "bought_primary", nullable = false) private boolean boughtPrimary = false;
  @Column(name = "bought_alt", nullable = false) private boolean boughtAlt = false;

  @Column(name = "created_at", nullable = false) private Instant createdAt = Instant.now();
  @Column(name = "updated_at", nullable = false) private Instant updatedAt = Instant.now();

  protected ProductOrderItem() {}

  ProductOrderItem(String personName, String pin, int position) {
    this.personName = personName;
    this.pin = pin;
    this.position = position;
  }

  void apply(String product, int qty, String unit, String altProduct, Integer altQty, String altUnit) {
    this.product = product;
    this.qty = qty;
    this.unit = unit;
    this.altProduct = altProduct;
    this.altQty = altProduct == null ? null : (altQty == null ? 1 : altQty);
    this.altUnit = altProduct == null ? null : (altUnit == null ? "EA" : altUnit);
    this.updatedAt = Instant.now();
  }

  void setBoughtPrimary(boolean value) { this.boughtPrimary = value; this.updatedAt = Instant.now(); }
  void setBoughtAlt(boolean value) { this.boughtAlt = value; this.updatedAt = Instant.now(); }
  void setPosition(int position) { this.position = position; }

  public UUID getId() { return id; }
  public String getPersonName() { return personName; }
  public String getPin() { return pin; }
  public int getPosition() { return position; }
  public String getProduct() { return product; }
  public int getQty() { return qty; }
  public String getUnit() { return unit; }
  public String getAltProduct() { return altProduct; }
  public Integer getAltQty() { return altQty; }
  public String getAltUnit() { return altUnit; }
  public boolean isBoughtPrimary() { return boughtPrimary; }
  public boolean isBoughtAlt() { return boughtAlt; }
  public Instant getCreatedAt() { return createdAt; }
  public Instant getUpdatedAt() { return updatedAt; }
}
