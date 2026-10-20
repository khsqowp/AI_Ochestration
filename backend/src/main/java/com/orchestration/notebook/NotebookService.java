package com.orchestration.notebook;

import com.orchestration.auth.AppUser;
import com.orchestration.auth.AppUserRepository;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class NotebookService {
  private static final Logger log = LoggerFactory.getLogger(NotebookService.class);
  private final NotebookEntryRepository entries;
  private final NotebookImageRepository images;
  private final AppUserRepository users;
  private final Path imagesRoot;

  NotebookService(NotebookEntryRepository entries, NotebookImageRepository images, AppUserRepository users, NotebookProperties properties) {
    this.entries = entries; this.images = images; this.users = users;
    this.imagesRoot = Path.of(properties.imagesPath()).toAbsolutePath().normalize();
  }

  public List<NotebookEntry> listEntries(UUID ownerId) { return entries.findByOwnerIdOrderByUpdatedAtDesc(ownerId); }
  public Optional<NotebookEntry> getEntry(UUID id) { return entries.findById(id); }
  public NotebookEntry createEntry(UUID ownerId, String ownerEmail, String ownerDisplayName, String title, NotebookStatus status) {
    return entries.save(new NotebookEntry(ownerId, ownerEmail, ownerDisplayName, title, status, Instant.now()));
  }
  public NotebookEntry updateEntry(NotebookEntry entry, String title, NotebookStatus status, String content) {
    if (title != null) entry.setTitle(title);
    if (status != null) entry.setStatus(status);
    if (content != null) entry.setContent(content);
    entry.setUpdatedAt(Instant.now());
    return entries.save(entry);
  }
  @Transactional
  public void deleteEntry(NotebookEntry entry) {
    for (NotebookImage image : images.findByEntryId(entry.getId())) {
      try { Files.deleteIfExists(imagePath(image)); }
      catch (IOException error) { log.warn("Could not delete notebook image {}", image.getId(), error); }
    }
    entries.delete(entry);
  }
  public NotebookImage saveImage(UUID entryId, UUID ownerId, String originalFilename, String contentType, byte[] bytes) {
    UUID id = UUID.randomUUID();
    String safeName = sanitizeFilename(originalFilename);
    String filename = id + "_" + safeName;
    Path path = imagesRoot.resolve(filename);
    try {
      Files.createDirectories(imagesRoot);
      Files.write(path, bytes);
      try { return images.save(new NotebookImage(id, entryId, ownerId, filename, safeName, contentType, Instant.now())); }
      catch (RuntimeException error) { Files.deleteIfExists(path); throw error; }
    } catch (IOException error) { throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "이미지를 저장하지 못했습니다.", error); }
  }
  public Optional<NotebookImage> getImage(UUID id) { return images.findById(id); }
  public byte[] loadImage(NotebookImage image) {
    try { return Files.readAllBytes(imagePath(image)); }
    catch (IOException error) { throw new ResponseStatusException(HttpStatus.NOT_FOUND, "이미지를 찾을 수 없습니다.", error); }
  }
  public List<AppUser> listOtherUsers(UUID callerId) {
    return users.findAll().stream().filter(user -> !callerId.equals(user.getId())).toList();
  }
  private Path imagePath(NotebookImage image) { return imagesRoot.resolve(image.getStoredFilename()); }

  static String sanitizeFilename(String originalFilename) {
    String safeName = originalFilename == null ? "image" : originalFilename.replace('\\', '/').replaceAll("^.*/", "").replaceAll("[^\\p{L}\\p{N}._-]", "_");
    if (safeName.isBlank() || safeName.equals(".") || safeName.equals("..")) safeName = "image";
    if (safeName.length() > 200) safeName = safeName.substring(safeName.length() - 200);
    return safeName;
  }
}
