package com.orchestration.tasks;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.orchestration.files.FileProperties;
import com.orchestration.n8n.N8nDispatcher;
import com.orchestration.sources.ResearchSourceService;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/** REVIEW/TEAM_LEAD/PM \uB2E8\uACC4\uC758 provider \uD3F4\uBC31(app.llm.max-provider-attempts)\uACFC, \uBCF4\uC548 \uB3C4\uBA54\uC778\uC5D0\uC11C
 * DeepSeek\uC774 \uC8FC \uAC80\uD1A0\uC790\uAC00 \uB418\uB294 \uB77C\uC6B0\uD305, PM \uB2E8\uACC4\uC758 DeepSeek/Bedrock \uD1A0\uAE00 \uB77C\uC6B0\uD305\uC744 \uAC80\uC99D\uD55C\uB2E4. */
@ExtendWith(MockitoExtension.class)
class TaskWorkflowRunnerTest {

  @Mock private TaskService tasks;
  @Mock private LlmGateway llm;
  @Mock private KnowledgeArchiveService archive;
  @Mock private N8nDispatcher dispatcher;
  @Mock private ResearchSourceService sourceUsage;
  @Mock private PmProviderSettingService pmProviderSettings;

  private final FileProperties files = new FileProperties("/tmp/originals", "/tmp/obsidian", 30000L);
  private final UUID taskId = UUID.randomUUID();

  private TaskWorkflowRunner runner(int maxProviderAttempts) {
    LlmProperties properties = new LlmProperties(
        "gemini-key", "deepseek-key", "openai-key",
        "gemini-2.5-flash", "deepseek-v4-pro", "gpt-4o-mini", "text-embedding-3-small",
        900, 180, 420, maxProviderAttempts, 12000, 9000,
        BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO,
        "bedrock-key", "bedrock-model", "ap-northeast-2", BigDecimal.ZERO, BigDecimal.ZERO);
    return new TaskWorkflowRunner(tasks, llm, archive, properties, files, dispatcher, sourceUsage, pmProviderSettings);
  }

  private WorkTask task(TaskDomain domain) {
    return new WorkTask("\uC81C\uBAA9", "\uC9C0\uC2DC \uB0B4\uC6A9", domain, TaskOrigin.MANUAL);
  }

  private LlmGateway.LlmResult result(String provider, String content) {
    return new LlmGateway.LlmResult(provider, provider + "-model", content, 10, 10, 20, 50L);
  }

  @Test
  void nonSecurityDomain_fallsBackToDeepSeekWhenOpenAiFails() throws Exception {
    when(tasks.get(taskId)).thenReturn(task(TaskDomain.GENERAL));
    when(archive.archive(any(WorkTask.class), anyString())).thenReturn("obsidian/note.md");
    when(llm.collectWithGemini(any(TaskDomain.class), anyString())).thenReturn(result("Gemini", "\uC218\uC9D1 \uB0B4\uC6A9"));
    when(llm.reviewWithOpenAi(anyString(), anyString())).thenThrow(new LlmGateway.ProviderException("OpenAI down"));
    when(llm.decideWithDeepSeek(anyString(), anyString())).thenReturn(result("DeepSeek", "\uAC80\uD1A0 \uB0B4\uC6A9"));
    when(llm.decideWithDeepSeekLongForm(anyString(), anyString(), anyInt())).thenReturn(result("DeepSeek", "\uD300\uC7A5 \uB178\uD2B8"));
    when(llm.decideWithDeepSeek(anyString(), anyString(), eq(6000))).thenReturn(result("DeepSeek", "\uCD5C\uC885 \uBCF4\uACE0\uC11C"));

    runner(2).execute(taskId);

    verify(llm, times(2)).reviewWithOpenAi(anyString(), anyString());
    verify(llm, times(2)).decideWithDeepSeek(anyString(), anyString());
    verify(tasks).complete(eq(taskId), anyString(), anyString());
    verify(tasks, never()).fail(eq(taskId), anyString());
  }

  @Test
  void noFallback_whenMaxProviderAttemptsIsOne() throws Exception {
    when(tasks.get(taskId)).thenReturn(task(TaskDomain.GENERAL));
    when(llm.collectWithGemini(any(TaskDomain.class), anyString())).thenReturn(result("Gemini", "\uC218\uC9D1 \uB0B4\uC6A9"));
    when(llm.reviewWithOpenAi(anyString(), anyString())).thenThrow(new LlmGateway.ProviderException("OpenAI down"));

    runner(1).execute(taskId);

    verify(llm, never()).decideWithDeepSeek(anyString(), anyString());
    verify(tasks).fail(eq(taskId), anyString());
    verify(tasks, never()).complete(eq(taskId), anyString(), anyString());
  }

  @Test
  void securityDomain_usesDeepSeekAsPrimaryReviewer() throws Exception {
    when(tasks.get(taskId)).thenReturn(task(TaskDomain.SECURITY));
    when(archive.archive(any(WorkTask.class), anyString())).thenReturn("obsidian/note.md");
    when(llm.collectWithGemini(any(TaskDomain.class), anyString())).thenReturn(result("Gemini", "\uC218\uC9D1 \uB0B4\uC6A9"));
    when(llm.decideWithDeepSeek(anyString(), anyString())).thenReturn(result("DeepSeek", "\uAC80\uD1A0 \uB0B4\uC6A9"));
    when(llm.decideWithDeepSeekLongForm(anyString(), anyString(), anyInt())).thenReturn(result("DeepSeek", "\uD300\uC7A5 \uB178\uD2B8"));
    when(llm.decideWithDeepSeek(anyString(), anyString(), eq(6000))).thenReturn(result("DeepSeek", "\uCD5C\uC885 \uBCF4\uACE0\uC11C"));

    runner(2).execute(taskId);

    verify(llm, times(2)).decideWithDeepSeek(anyString(), anyString());
    verify(llm, never()).reviewWithOpenAi(anyString(), anyString());
    verify(tasks).complete(eq(taskId), anyString(), anyString());
  }

  @Test
  void pmStage_usesBedrockWhenToggleIsOn() throws Exception {
    when(tasks.get(taskId)).thenReturn(task(TaskDomain.GENERAL));
    when(archive.archive(any(WorkTask.class), anyString())).thenReturn("obsidian/note.md");
    when(pmProviderSettings.current()).thenReturn(PmProvider.BEDROCK);
    when(llm.collectWithGemini(any(TaskDomain.class), anyString())).thenReturn(result("Gemini", "\uC218\uC9D1 \uB0B4\uC6A9"));
    when(llm.reviewWithOpenAi(anyString(), anyString())).thenReturn(result("OpenAI", "\uAC80\uD1A0 \uB0B4\uC6A9"));
    when(llm.decideWithDeepSeekLongForm(anyString(), anyString(), anyInt())).thenReturn(result("DeepSeek", "\uD300\uC7A5 \uB178\uD2B8"));
    when(llm.decideWithBedrock(anyString(), anyString(), eq(6000))).thenReturn(result("Bedrock", "\uCD5C\uC885 \uBCF4\uACE0\uC11C"));

    runner(2).execute(taskId);

    verify(llm).decideWithBedrock(anyString(), anyString(), eq(6000));
    verify(llm, never()).decideWithDeepSeek(anyString(), anyString(), eq(6000));
    verify(tasks).complete(eq(taskId), anyString(), anyString());
  }

  @Test
  void pmStage_forcesDeepSeekForCollectionOriginEvenWhenBedrockToggleIsOn() throws Exception {
    WorkTask collectionTask = new WorkTask("제목", "지시 내용", TaskDomain.GENERAL, TaskOrigin.COLLECTION);
    when(tasks.get(taskId)).thenReturn(collectionTask);
    when(archive.archive(any(WorkTask.class), anyString())).thenReturn("obsidian/note.md");
    when(pmProviderSettings.current()).thenReturn(PmProvider.BEDROCK);
    when(llm.collectWithGemini(any(TaskDomain.class), anyString())).thenReturn(result("Gemini", "수집 내용"));
    when(llm.reviewWithOpenAi(anyString(), anyString())).thenReturn(result("OpenAI", "검토 내용"));
    when(llm.decideWithDeepSeekLongForm(anyString(), anyString(), anyInt())).thenReturn(result("DeepSeek", "팀장 노트"));
    when(llm.decideWithDeepSeek(anyString(), anyString(), eq(6000))).thenReturn(result("DeepSeek", "최종 보고서"));

    runner(2).execute(taskId);

    verify(llm, never()).decideWithBedrock(anyString(), anyString(), anyInt());
    verify(llm).decideWithDeepSeek(anyString(), anyString(), eq(6000));
    verify(tasks).complete(eq(taskId), anyString(), anyString());
  }

  @Test
  void pmStage_fallsBackToDeepSeekWhenBedrockFails() throws Exception {
    when(tasks.get(taskId)).thenReturn(task(TaskDomain.GENERAL));
    when(archive.archive(any(WorkTask.class), anyString())).thenReturn("obsidian/note.md");
    when(pmProviderSettings.current()).thenReturn(PmProvider.BEDROCK);
    when(llm.collectWithGemini(any(TaskDomain.class), anyString())).thenReturn(result("Gemini", "\uC218\uC9D1 \uB0B4\uC6A9"));
    when(llm.reviewWithOpenAi(anyString(), anyString())).thenReturn(result("OpenAI", "\uAC80\uD1A0 \uB0B4\uC6A9"));
    when(llm.decideWithDeepSeekLongForm(anyString(), anyString(), anyInt())).thenReturn(result("DeepSeek", "\uD300\uC7A5 \uB178\uD2B8"));
    when(llm.decideWithBedrock(anyString(), anyString(), eq(6000))).thenThrow(new LlmGateway.ProviderException("Bedrock down"));
    when(llm.decideWithDeepSeek(anyString(), anyString(), eq(6000))).thenReturn(result("DeepSeek", "\uCD5C\uC885 \uBCF4\uACE0\uC11C"));

    runner(2).execute(taskId);

    verify(llm).decideWithBedrock(anyString(), anyString(), eq(6000));
    verify(llm).decideWithDeepSeek(anyString(), anyString(), eq(6000));
    verify(tasks).complete(eq(taskId), anyString(), anyString());
  }
}
