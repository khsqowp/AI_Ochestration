package com.orchestration.todo;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

interface TodoRepository extends JpaRepository<TodoItem, UUID> {
  List<TodoItem> findByOwnerIdOrderByCreatedAtAsc(UUID ownerId);
  Optional<TodoItem> findByIdAndOwnerId(UUID id, UUID ownerId);
}
