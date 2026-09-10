package com.orchestration.orders;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

interface ProductOrderRepository extends JpaRepository<ProductOrderItem, UUID> {
  List<ProductOrderItem> findByPersonNameAndPinOrderByPositionAsc(String personName, String pin);

  List<ProductOrderItem> findAllByOrderByPersonNameAscPinAscPositionAsc();
}
