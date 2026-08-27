package com.orchestration.todo;

import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class TodoService {
  private final TodoRepository repository;

  TodoService(TodoRepository repository) { this.repository = repository; }

  public List<TodoItem> list(UUID ownerId) {
    return repository.findByOwnerIdOrderByCreatedAtAsc(ownerId);
  }

  public TodoItem add(UUID ownerId, String text) {
    return repository.save(new TodoItem(ownerId, text.trim()));
  }

  public TodoItem setCompleted(UUID ownerId, UUID id, boolean completed) {
    TodoItem item = repository.findByIdAndOwnerId(id, ownerId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    item.setCompleted(completed);
    return repository.save(item);
  }
}
