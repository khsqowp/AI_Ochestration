package com.orchestration.diag;

import com.orchestration.auth.AuthService;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/diag/evidence")
class EvidenceController {
  private final EvidenceService service;
  EvidenceController(EvidenceService service) { this.service = service; }

  /** 조회 API 없음(의도됨, 자기방어용 write-only 로그). 이 컨트롤러는 POST만 제공한다. */
  @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  Response uploadMultipart(@RequestParam String toolType, @RequestParam("file") MultipartFile file,
      @AuthenticationPrincipal AuthService.UserProfile user) throws IOException {
    UUID userId = requireUser(user);
    if (file.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "파일이 비어 있습니다.");
    boolean duplicate = service.save(file.getInputStream(), toolType, file.getOriginalFilename(), file.getSize(),
        file.getContentType() == null ? "application/octet-stream" : file.getContentType(), userId);
    return new Response(true, duplicate);
  }

  @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
  Response uploadJson(@RequestParam String toolType, @RequestBody JsonContent body,
      @AuthenticationPrincipal AuthService.UserProfile user) throws IOException {
    UUID userId = requireUser(user);
    if (body == null || body.content() == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "content가 필요합니다.");
    byte[] bytes = body.content().getBytes(StandardCharsets.UTF_8);
    boolean duplicate = service.save(new ByteArrayInputStream(bytes), toolType, "content.txt", bytes.length, "text/plain; charset=UTF-8", userId);
    return new Response(true, duplicate);
  }
  private UUID requireUser(AuthService.UserProfile user) {
    if (user == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "인증이 필요합니다.");
    return UUID.fromString(user.id());
  }
  record JsonContent(String content) {}
  record Response(boolean ok, boolean duplicate) {}
}
