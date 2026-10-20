package com.orchestration.notebook;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class NotebookServiceTest {
  @Test
  void sanitizedFilenamesStayWithinTheImageDirectory() {
    assertEquals("passwd", NotebookService.sanitizeFilename("../../etc/passwd"));
    assertEquals("windows", NotebookService.sanitizeFilename("..\\..\\windows"));
    assertEquals("image", NotebookService.sanitizeFilename(".."));
    assertEquals("image", NotebookService.sanitizeFilename(""));
    assertEquals("a".repeat(200), NotebookService.sanitizeFilename("a".repeat(300)));
    for (String input : new String[] {"../../etc/passwd", "..\\..\\windows", "..", "", "a".repeat(300)}) {
      String name = NotebookService.sanitizeFilename(input);
      assertFalse(name.contains("/") || name.contains("\\"));
      assertFalse(name.equals(".") || name.equals(".."));
      assertTrue(name.length() <= 200);
    }
  }
}
