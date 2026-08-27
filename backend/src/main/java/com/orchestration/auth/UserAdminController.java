package com.orchestration.auth;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/** Account CRUD, restricted to ADMIN by the path rule in {@link SecurityConfig} (which already knows to
 * permit everything while {@code app.auth.enabled=false} in local dev). Deliberately not duplicated here via
 * {@code @PreAuthorize}: method security has no concept of that flag and would deny every call in dev mode,
 * where no {@code JwtAuthenticationFilter} ever runs to populate an authenticated principal in the first
 * place — a second enforcement layer here would just be a second place for the two rules to drift apart. */
@RestController
@RequestMapping("/api/admin/users")
public class UserAdminController {
  private final UserAdminService service;
  UserAdminController(UserAdminService service) { this.service = service; }

  @GetMapping
  public List<Response> list() { return service.list().stream().map(Response::from).toList(); }

  @PostMapping @ResponseStatus(HttpStatus.CREATED)
  public Response create(@Valid @RequestBody CreateRequest request) {
    return Response.from(service.create(request.id(), request.displayName(), request.role(), request.password()));
  }

  @PutMapping("/{id}")
  public Response update(@PathVariable UUID id, @Valid @RequestBody UpdateRequest request) {
    return Response.from(service.update(id, request.displayName(), request.role(), request.password()));
  }

  @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(@PathVariable UUID id, @AuthenticationPrincipal AuthService.UserProfile current) {
    service.delete(id, current == null ? null : UUID.fromString(current.id()));
  }

  record CreateRequest(@NotBlank @Size(max = 320) String id, @NotBlank @Size(max = 120) String displayName, @NotNull Role role, @NotBlank @Size(min = 8, max = 200) String password) {}
  record UpdateRequest(@NotBlank @Size(max = 120) String displayName, @NotNull Role role, @Size(min = 0, max = 200) String password) {}
  record Response(String id, String loginId, String displayName, Role role, String createdAt) {
    static Response from(AppUser user) { return new Response(user.getId().toString(), user.getEmail(), user.getDisplayName(), user.getRole(), user.getCreatedAt().toString()); }
  }
}
