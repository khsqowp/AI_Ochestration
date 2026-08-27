package com.orchestration.files;

import com.orchestration.tasks.TaskDomain;
import com.orchestration.tasks.TaskOrigin;
import com.orchestration.tasks.TaskService;
import com.orchestration.tasks.WorkTask;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import kr.dogfoot.hwplib.object.HWPFile;
import kr.dogfoot.hwplib.reader.HWPReader;
import kr.dogfoot.hwplib.tool.textextractor.TextExtractMethod;
import kr.dogfoot.hwplib.tool.textextractor.TextExtractor;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.poi.xslf.usermodel.XSLFShape;
import org.apache.poi.xslf.usermodel.XSLFSlide;
import org.apache.poi.xslf.usermodel.XSLFTextShape;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.poi.xwpf.extractor.XWPFWordExtractor;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Turns a newly discovered original file into a GENERAL analysis task. Text formats are extracted
 * locally (fast, no network call) and embedded directly in the task instruction. Images have no local
 * text to pull out, so instead of adding a native OCR dependency, the file is attached to the task by
 * path and {@link com.orchestration.tasks.TaskWorkflowRunner} hands the raw bytes to Gemini's vision
 * input during its own async COLLECT stage — never here, so an upload request never blocks on an LLM call.
 */
@Service
public class DocumentExtractionService {
  private static final Logger log = LoggerFactory.getLogger(DocumentExtractionService.class);
  private static final Set<String> IMAGE_EXTENSIONS = Set.of("png", "jpg", "jpeg", "gif", "webp", "bmp");
  // 실제 업로드된 문서(2026-07~08, 22건) 전수 측정 결과 전부 6000자를 넘었고 최대 151,299자였다 --
  // 기존 캡은 사실상 모든 업로드를 앞부분 몇 %만 보고 요약하게 만들고 있었다. Gemini 컨텍스트 한도에는
  // 전혀 여유가 있고 업로드 빈도도 낮아 비용 영향이 미미하므로, 관측된 최대치에 여유를 둔 값으로 올린다.
  private static final int EXCERPT_BUDGET_CHARS = 200000;

  private final TaskService tasks;

  DocumentExtractionService(TaskService tasks) { this.tasks = tasks; }

  public Optional<UUID> analyze(Path file, String relativePath, String fileName, String extension) {
    String ext = extension.toLowerCase(Locale.ROOT);
    try {
      if (IMAGE_EXTENSIONS.contains(ext)) {
        WorkTask task = tasks.create("[업로드] " + fileName,
            "업로드된 이미지 파일 '" + fileName + "'입니다. 이미지 내용을 분석해 핵심 내용을 한국어로 정리하세요.",
            TaskDomain.GENERAL, TaskOrigin.UPLOAD, relativePath);
        return Optional.of(task.getId());
      }
      String text = extractText(file, ext);
      if (text == null || text.isBlank()) {
        log.info("file_intake_extract_empty file={} extension={}", fileName, ext);
        return Optional.empty();
      }
      String excerpt = text.length() > EXCERPT_BUDGET_CHARS ? text.substring(0, EXCERPT_BUDGET_CHARS) + "\n[길이 제한으로 일부 생략]" : text;
      String instruction = ("업로드된 파일 '%s'에서 추출한 텍스트입니다. 아래 내용을 근거로 핵심 내용을 한국어로 정리하세요. 발췌에 없는 배경지식만 검색으로 보강하세요.\n\n[문서 내용]\n%s")
          .formatted(fileName, excerpt);
      WorkTask task = tasks.create("[업로드] " + fileName, instruction, TaskDomain.GENERAL, TaskOrigin.UPLOAD);
      return Optional.of(task.getId());
    } catch (UnsupportedFormatException exception) {
      log.info("file_intake_extract_unsupported file={} extension={}", fileName, ext);
      return Optional.empty();
    } catch (Exception exception) {
      log.warn("file_intake_extract_failed file={} extension={}", fileName, ext, exception);
      return Optional.empty();
    }
  }

  private String extractText(Path file, String extension) throws Exception {
    return switch (extension) {
      case "txt", "md" -> Files.readString(file, StandardCharsets.UTF_8);
      case "pdf" -> extractPdf(file);
      case "docx" -> extractDocx(file);
      case "xlsx" -> extractXlsx(file);
      case "pptx" -> extractPptx(file);
      case "hwp" -> extractHwp(file);
      default -> throw new UnsupportedFormatException(extension);
    };
  }

  private String extractPdf(Path file) throws IOException {
    try (PDDocument document = Loader.loadPDF(file.toFile())) {
      return new PDFTextStripper().getText(document);
    }
  }

  private String extractDocx(Path file) throws IOException {
    try (XWPFDocument document = new XWPFDocument(Files.newInputStream(file));
         XWPFWordExtractor extractor = new XWPFWordExtractor(document)) {
      return extractor.getText();
    }
  }

  private String extractXlsx(Path file) throws IOException {
    try (XSSFWorkbook workbook = new XSSFWorkbook(Files.newInputStream(file))) {
      DataFormatter formatter = new DataFormatter();
      StringBuilder text = new StringBuilder();
      for (int s = 0; s < workbook.getNumberOfSheets(); s++) {
        Sheet sheet = workbook.getSheetAt(s);
        text.append("## ").append(sheet.getSheetName()).append('\n');
        for (Row row : sheet) {
          for (Cell cell : row) {
            String value = formatter.formatCellValue(cell);
            if (!value.isBlank()) text.append(value).append(" | ");
          }
          text.append('\n');
        }
      }
      return text.toString();
    }
  }

  private String extractPptx(Path file) throws IOException {
    try (XMLSlideShow slideShow = new XMLSlideShow(Files.newInputStream(file))) {
      StringBuilder text = new StringBuilder();
      int index = 1;
      for (XSLFSlide slide : slideShow.getSlides()) {
        text.append("## 슬라이드 ").append(index++).append('\n');
        for (XSLFShape shape : slide.getShapes()) {
          if (shape instanceof XSLFTextShape textShape) text.append(textShape.getText()).append('\n');
        }
      }
      return text.toString();
    }
  }

  private String extractHwp(Path file) throws Exception {
    HWPFile hwpFile = HWPReader.fromFile(file.toFile());
    return TextExtractor.extract(hwpFile, TextExtractMethod.InsertControlTextBetweenParagraphText);
  }

  private static final class UnsupportedFormatException extends RuntimeException {
    UnsupportedFormatException(String extension) { super("unsupported extension: " + extension); }
  }
}
