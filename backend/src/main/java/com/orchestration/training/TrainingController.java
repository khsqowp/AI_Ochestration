package com.orchestration.training;

import com.orchestration.auth.AuthService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.time.Instant;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController @RequestMapping("/api/training")
public class TrainingController {
  private static final String COOKIE="orchestration_session"; private final TrainingService service; private final AuthService auth; private final BlackBoxScenarioService blackBoxService;
  TrainingController(TrainingService service,AuthService auth,BlackBoxScenarioService blackBoxService){this.service=service;this.auth=auth;this.blackBoxService=blackBoxService;}
  @GetMapping("/dashboard") public Dashboard dashboard(@CookieValue(value=COOKIE,required=false) String token){UUID owner=owner(token);service.ensureAssessments(owner);return new Dashboard(service.dashboard(owner).stream().map(AssessmentResponse::from).toList(),service.recommendations(owner).stream().map(CaseResponse::from).toList());}
  @GetMapping("/cases") public List<CaseResponse> cases(){return service.listCases().stream().map(CaseResponse::from).toList();}
  @PostMapping("/cases/{caseId}/attempts") @ResponseStatus(HttpStatus.CREATED) public AttemptResponse start(@CookieValue(value=COOKIE,required=false)String token,@PathVariable UUID caseId){return AttemptResponse.from(service.start(owner(token),caseId));}
  @GetMapping("/attempts") public List<AttemptResponse> history(@CookieValue(value=COOKIE,required=false)String token){return service.history(owner(token)).stream().map(AttemptResponse::from).toList();}
  @GetMapping("/attempts/{attemptId}") public AttemptResponse get(@CookieValue(value=COOKIE,required=false)String token,@PathVariable UUID attemptId){return AttemptResponse.from(service.attempt(owner(token),attemptId));}
  @PutMapping("/attempts/{attemptId}/answer") public AttemptResponse save(@CookieValue(value=COOKIE,required=false)String token,@PathVariable UUID attemptId,@Valid @RequestBody AnswerRequest req){return AttemptResponse.from(service.save(owner(token),attemptId,req.answer()));}
  @PostMapping("/attempts/{attemptId}/submit") public AttemptResponse submit(@CookieValue(value=COOKIE,required=false)String token,@PathVariable UUID attemptId,@Valid @RequestBody AnswerRequest req){return AttemptResponse.from(service.submit(owner(token),attemptId,req.answer()));}
  @PostMapping("/attempts/{attemptId}/evaluate") public AttemptResponse evaluate(@CookieValue(value=COOKIE,required=false)String token,@PathVariable UUID attemptId){return AttemptResponse.from(service.evaluateExisting(owner(token),attemptId));}
  @GetMapping("/black-box/active-session") public ActiveBlackBoxSessionResponse activeBlackBox(@CookieValue(value=COOKIE,required=false)String token){return new ActiveBlackBoxSessionResponse(blackBox().active(owner(token)).map(BlackBoxSessionResponse::from).orElse(null));}
  @PostMapping("/black-box/sessions") @ResponseStatus(HttpStatus.CREATED) public BlackBoxSessionResponse startRecommendedBlackBox(@CookieValue(value=COOKIE,required=false)String token,@RequestBody(required=false) BlackBoxStartRequest req){return BlackBoxSessionResponse.from(blackBox().startRecommended(owner(token),req==null?null:req.skillCode()));}
  @GetMapping("/black-box/sessions") public List<BlackBoxSessionResponse> blackBoxHistory(@CookieValue(value=COOKIE,required=false)String token){return blackBox().history(owner(token)).stream().map(BlackBoxSessionResponse::from).toList();}
  @GetMapping("/black-box/sessions/{sessionId}") public BlackBoxSessionResponse blackBoxSession(@CookieValue(value=COOKIE,required=false)String token,@PathVariable UUID sessionId){return BlackBoxSessionResponse.from(blackBox().session(owner(token),sessionId));}
  @PostMapping("/black-box/sessions/{sessionId}/messages") public BlackBoxSessionResponse blackBoxMessage(@CookieValue(value=COOKIE,required=false)String token,@PathVariable UUID sessionId,@RequestBody BlackBoxMessageRequest req){return BlackBoxSessionResponse.from(blackBox().message(owner(token),sessionId,req.message()));}
  @PutMapping("/black-box/sessions/{sessionId}/notes") public BlackBoxSessionResponse blackBoxNotes(@CookieValue(value=COOKIE,required=false)String token,@PathVariable UUID sessionId,@RequestBody BlackBoxNotesRequest req){return BlackBoxSessionResponse.from(blackBox().notes(owner(token),sessionId,req.facts(),req.hypotheses(),req.unknowns()));}
  @PostMapping("/black-box/sessions/{sessionId}/close") public BlackBoxSessionResponse closeBlackBox(@CookieValue(value=COOKIE,required=false)String token,@PathVariable UUID sessionId,@RequestBody BlackBoxCloseRequest req){return BlackBoxSessionResponse.from(blackBox().close(owner(token),sessionId,req.verdict(),req.conclusion()));}
  @PostMapping("/black-box/sessions/{sessionId}/reevaluate") public BlackBoxSessionResponse reevaluateBlackBox(@CookieValue(value=COOKIE,required=false)String token,@PathVariable UUID sessionId){return BlackBoxSessionResponse.from(blackBox().reevaluate(owner(token),sessionId));}
  private UUID owner(String token){return auth.validate(token).map(p->UUID.fromString(p.id())).orElseThrow(()->new ResponseStatusException(HttpStatus.UNAUTHORIZED));}
  record AnswerRequest(@NotBlank String answer){}
  private BlackBoxScenarioService blackBox(){return blackBoxService;}
  record Dashboard(List<AssessmentResponse> assessments,List<CaseResponse> recommendations){}
  record AssessmentResponse(String skillCode,double score,String confidence,String rationale,String nextAction,int evidenceCount,int evaluationCount,Double blackBoxScore,int blackBoxEvaluationCount,String blackBoxRationale,String blackBoxNextAction,Instant assessedAt){static AssessmentResponse from(CompetencyAssessment x){return new AssessmentResponse(x.getSkillCode(),x.getScore(),x.getConfidence().name(),x.getRationale(),x.getNextAction(),x.getEvidenceCount(),x.getEvaluationCount(),x.getBlackBoxScore(),x.getBlackBoxEvaluationCount(),x.getBlackBoxRationale(),x.getBlackBoxNextAction(),x.getAssessedAt());}}
  record CaseResponse(String id,String slug,String title,String caseType,String skillCode,int difficulty,String promptMd){
    static CaseResponse from(TrainingCase x){return new CaseResponse(x.getId().toString(),x.getSlug(),x.getTitle(),x.getCaseType().name(),x.getPrimarySkillCode(),x.getDifficulty(),x.getPromptMd());}
    static CaseResponse fromAttempt(TrainingAttempt attempt){
      TrainingCase current=attempt.getTrainingCase();
      String title=attempt.getCaseTitleSnapshot()==null||attempt.getCaseTitleSnapshot().isBlank()?current.getTitle():attempt.getCaseTitleSnapshot();
      String prompt=attempt.getCasePromptSnapshot()==null||attempt.getCasePromptSnapshot().isBlank()?current.getPromptMd():attempt.getCasePromptSnapshot();
      return new CaseResponse(current.getId().toString(),current.getSlug(),title,current.getCaseType().name(),current.getPrimarySkillCode(),current.getDifficulty(),prompt);
    }
  }
  record AttemptResponse(String id,CaseResponse trainingCase,String status,String answerMd,String feedbackMd,Double score,Instant startedAt,Instant submittedAt){
    static AttemptResponse from(TrainingAttempt x){return new AttemptResponse(x.getId().toString(),CaseResponse.fromAttempt(x),x.getStatus().name(),x.getAnswerMd(),x.getFeedbackMd(),x.getScore(),x.getStartedAt(),x.getSubmittedAt());}
  }
  record BlackBoxMessageRequest(@NotBlank String message) {}
  record BlackBoxStartRequest(String skillCode) {}
  record ActiveBlackBoxSessionResponse(BlackBoxSessionResponse session) {}
  record BlackBoxNotesRequest(String facts,String hypotheses,String unknowns) {}
  record BlackBoxCloseRequest(@NotBlank String verdict,@NotBlank String conclusion) {}
  record BlackBoxScenarioResponse(String slug,String title,String intro,String skillCode,int difficulty){static BlackBoxScenarioResponse from(BlackBoxScenarioDefinition x){return new BlackBoxScenarioResponse(x.slug(),x.title(),x.intro(),x.primarySkillCode(),x.difficulty());}}
  record BlackBoxSessionResponse(String id,String scenarioSlug,String title,String intro,String skillCode,String status,List<String> messages,List<String> observations,String facts,String hypotheses,String unknowns,String finalReport,Double score,String feedbackMd,Instant startedAt,Instant closedAt){static BlackBoxSessionResponse from(BlackBoxScenarioSession x){return new BlackBoxSessionResponse(x.getId().toString(),x.getScenarioSlug(),x.getScenarioTitle(),x.getScenarioIntro(),x.getPrimarySkillCode(),x.getStatus().name(),x.getMessages(),x.getObservations(),x.getFactsNote(),x.getHypothesesNote(),x.getUnknownsNote(),x.getFinalReport(),x.getScore(),x.getFeedbackMd(),x.getStartedAt(),x.getClosedAt());}}
}
