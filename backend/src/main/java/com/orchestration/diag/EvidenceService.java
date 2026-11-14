package com.orchestration.diag;

import com.orchestration.files.FileProperties;
import java.io.*;
import java.nio.file.*;
import java.security.*;
import java.util.HexFormat;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class EvidenceService {
  private final EvidenceRepository repository;
  private final FileProperties files;
  private final UUID ownerId;
  EvidenceService(EvidenceRepository repository, FileProperties files, @Value("${app.diag.evidence.owner-user-id:}") String ownerId) {
    this.repository = repository; this.files = files;
    this.ownerId = ownerId.isBlank() ? null : UUID.fromString(ownerId);
  }

  @Transactional
  boolean save(InputStream input, String toolType, String filename, long size, String contentType, UUID userId) throws IOException {
    if (!"burp-history".equals(toolType) && !"js-parser".equals(toolType)) throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST, "지원하지 않는 toolType입니다.");
    if ("burp-history".equals(toolType) && (ownerId == null || !ownerId.equals(userId))) throw new org.springframework.web.server.ResponseStatusException(HttpStatus.FORBIDDEN);
    filename = filename == null || filename.isBlank() ? "upload" : filename;
    if (filename.length() > 255) filename = filename.substring(filename.length() - 255);
    String ext = safeExtension(filename);
    Path target = Path.of(files.originalsPath()).toAbsolutePath().normalize().resolve("diag-evidence").resolve(toolType).resolve("pending" + ext);
    Files.createDirectories(target.getParent());
    Path temp = Files.createTempFile(target.getParent(), ".diag-evidence-", ".upload");
    String hash;
    try {
      MessageDigest digest;
      try { digest = MessageDigest.getInstance("SHA-256"); } catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
      try (OutputStream out = Files.newOutputStream(temp); DigestInputStream in = new DigestInputStream(input, digest)) { in.transferTo(out); }
      hash = HexFormat.of().formatHex(digest.digest());
      boolean duplicate = repository.existsBySha256(hash);
      if (!duplicate) {
        target = target.resolveSibling(hash + ext);
        try { Files.move(temp, target, StandardCopyOption.ATOMIC_MOVE); }
        catch (FileAlreadyExistsException race) { /* A concurrent same-hash upload already stored the bytes. */ }
        temp = null;
      }
      repository.save(new EvidenceRecord(hash, toolType, filename, size, contentType, userId));
      return duplicate;
    } finally { if (temp != null) Files.deleteIfExists(temp); }
  }
  private String safeExtension(String filename) {
    if (filename == null) return "";
    String name = Path.of(filename).getFileName().toString(); int dot = name.lastIndexOf('.');
    if (dot < 0 || dot == name.length() - 1) return "";
    String ext = name.substring(dot).toLowerCase(java.util.Locale.ROOT);
    return ext.matches("\\.[a-z0-9]{1,12}") ? ext : "";
  }
}
