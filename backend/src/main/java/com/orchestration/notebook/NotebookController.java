package com.orchestration.notebook;

import com.orchestration.auth.AppUser;
import com.orchestration.auth.AuthService;
import com.orchestration.auth.Role;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

/** Reads the session cookie directly so these endpoints also work with app.auth.enabled=false. */
@RestController
@RequestMapping("/api/notebook")
public class NotebookController {
  private static final String COOKIE = "orchestration_session";
  private static final long MAX_IMAGE_BYTES = 10L * 1024 * 1024;
  private final NotebookService notebook;
  private final AuthService auth;

  NotebookController(NotebookService notebook, AuthService auth) { this.notebook = notebook; this.auth = auth; }

  @GetMapping("/entries")
  public List<Response> list(@CookieValue(value = COOKIE, required = false) String token, @RequestParam(required = false) UUID ownerId) {
    AuthService.UserProfile caller = caller(token);
    if (ownerId != null && caller.role() != Role.ADMIN) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
    UUID target = ownerId == null ? UUID.fromString(caller.id()) : ownerId;
    return notebook.listEntries(target).stream().map(Response::from).toList();
  }
  @GetMapping("/entries/{id}")
  public Response get(@CookieValue(value = COOKIE, required = false) String token, @PathVariable UUID id) {
    AuthService.UserProfile caller = caller(token);
    NotebookEntry entry = entry(id);
    if (!entry.getOwnerId().equals(UUID.fromString(caller.id())) && caller.role() != Role.ADMIN) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
    return Response.from(entry);
  }
  @PostMapping("/entries")
  public Response create(@CookieValue(value = COOKIE, required = false) String token, @Valid @RequestBody CreateRequest request) {
    AuthService.UserProfile caller = caller(token);
    return Response.from(notebook.createEntry(UUID.fromString(caller.id()), caller.email(), caller.displayName(), request.title(), request.status()));
  }
  @PatchMapping("/entries/{id}")
  public Response update(@CookieValue(value = COOKIE, required = false) String token, @PathVariable UUID id, @Valid @RequestBody UpdateRequest request) {
    AuthService.UserProfile caller = caller(token);
    NotebookEntry entry = entry(id);
    requireOwner(caller, entry);
    return Response.from(notebook.updateEntry(entry, request.title(), request.status(), request.content()));
  }
  @DeleteMapping("/entries/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(@CookieValue(value = COOKIE, required = false) String token, @PathVariable UUID id) {
    AuthService.UserProfile caller = caller(token);
    NotebookEntry entry = entry(id);
    requireOwner(caller, entry);
    notebook.deleteEntry(entry);
  }
  @PostMapping("/entries/{id}/images")
  public ImageResponse upload(@CookieValue(value = COOKIE, required = false) String token, @PathVariable UUID id, @RequestParam("file") MultipartFile file) throws IOException {
    AuthService.UserProfile caller = caller(token);
    NotebookEntry entry = entry(id);
    requireOwner(caller, entry);
    String contentType = file.getContentType();
    if (!List.of("image/png", "image/jpeg", "image/gif", "image/webp").contains(contentType) || file.getSize() > MAX_IMAGE_BYTES || file.isEmpty())
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "10MB 이하 이미지 파일만 업로드할 수 있습니다.");
    NotebookImage image = notebook.saveImage(id, entry.getOwnerId(), file.getOriginalFilename(), contentType, file.getBytes());
    return new ImageResponse(image.getId().toString(), "/api/notebook/images/" + image.getId());
  }
  @GetMapping("/images/{id}")
  public ResponseEntity<byte[]> image(@CookieValue(value = COOKIE, required = false) String token, @PathVariable UUID id) {
    AuthService.UserProfile caller = caller(token);
    NotebookImage image = notebook.getImage(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    if (!image.getOwnerId().equals(UUID.fromString(caller.id())) && caller.role() != Role.ADMIN) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
    return ResponseEntity.ok().contentType(MediaType.parseMediaType(image.getContentType())).body(notebook.loadImage(image));
  }
  @GetMapping("/owners")
  public List<OwnerResponse> owners(@CookieValue(value = COOKIE, required = false) String token) {
    AuthService.UserProfile caller = caller(token);
    if (caller.role() != Role.ADMIN) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
    return notebook.listOtherUsers(UUID.fromString(caller.id())).stream().map(OwnerResponse::from).toList();
  }
  private AuthService.UserProfile caller(String token) {
    return auth.validate(token).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
  }
  private NotebookEntry entry(UUID id) { return notebook.getEntry(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND)); }
  private void requireOwner(AuthService.UserProfile caller, NotebookEntry entry) {
    if (!entry.getOwnerId().equals(UUID.fromString(caller.id()))) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
  }
  record CreateRequest(@NotBlank @Size(max = 200) String title, @NotNull NotebookStatus status) {}
  record UpdateRequest(@Size(max = 200) String title, NotebookStatus status, String content) {}
  record Response(String id, String ownerId, String ownerEmail, String ownerDisplayName, String title, NotebookStatus status, String content, Instant createdAt, Instant updatedAt) {
    static Response from(NotebookEntry entry) {
      return new Response(entry.getId().toString(), entry.getOwnerId().toString(), entry.getOwnerEmail(), entry.getOwnerDisplayName(), entry.getTitle(), entry.getStatus(), entry.getContent(), entry.getCreatedAt(), entry.getUpdatedAt());
    }
  }
  record ImageResponse(String id, String url) {}
  record OwnerResponse(String id, String email, String displayName) {
    static OwnerResponse from(AppUser user) { return new OwnerResponse(user.getId().toString(), user.getEmail(), user.getDisplayName()); }
  }
}
