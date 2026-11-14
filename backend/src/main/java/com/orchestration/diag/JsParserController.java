package com.orchestration.diag;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/diag/js-parser")
public class JsParserController {
  private final JsParserService parser;
  JsParserController(JsParserService parser) { this.parser = parser; }

  @PostMapping
  public JsParserService.Result parse(@Valid @RequestBody ParseRequest request) {
    return parser.parse(request.content());
  }

  record ParseRequest(@NotNull String content) {}
}
