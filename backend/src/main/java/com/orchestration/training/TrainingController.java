package com.orchestration.training;

import com.orchestration.auth.AuthService;
import jakarta.validation.constraints.NotBlank;
import java.time.Instant;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController @RequestMapping("/api/training")
public class TrainingController {
  private static final String COOKIE="orchestration_session"; private final TrainingService service; private final AuthService auth;
  TrainingController(TrainingService service,AuthService auth){this.service=service;this.auth=auth;}
  @GetMapping("/dashboard") public Dashboard dashboard(@CookieValue(value=COOKIE,required=false) String token){UUID owner=owner(token);service.ensureAssessments(owner);return new Dashboard(service.dashboard(owner).stream().map(AssessmentResponse::from).toList(),service.recommendations(owner).stream().map(CaseResponse::from).toList());}
  @GetMapping("/cases") public List<CaseResponse> cases(){return service.listCases().stream().map(CaseResponse::from).toList();}
  @PostMapping("/cases/{caseId}/attempts") @ResponseStatus(HttpStatus.CREATED) public AttemptResponse start(@CookieValue(value=COOKIE,required=false)String token,@PathVariable UUID caseId){return AttemptResponse.from(service.start(owner(token),caseId));}
  @GetMapping("/attempts") public List<AttemptResponse> history(@CookieValue(value=COOKIE,required=false)String token){return service.history(owner(token)).stream().map(AttemptResponse::from).toList();}
  @GetMapping("/attempts/{attemptId}") public AttemptResponse get(@CookieValue(value=COOKIE,required=false)String token,@PathVariable UUID attemptId){return AttemptResponse.from(service.attempt(owner(token),attemptId));}
  @PutMapping("/attempts/{attemptId}/answer") public AttemptResponse save(@CookieValue(value=COOKIE,required=false)String token,@PathVariable UUID attemptId,@RequestBody AnswerRequest req){return AttemptResponse.from(service.save(owner(token),attemptId,req.answer()));}
  @PostMapping("/attempts/{attemptId}/submit") public AttemptResponse submit(@CookieValue(value=COOKIE,required=false)String token,@PathVariable UUID attemptId,@RequestBody AnswerRequest req){return AttemptResponse.from(service.submit(owner(token),attemptId,req.answer()));}
  @PostMapping("/attempts/{attemptId}/evaluate") public AttemptResponse evaluate(@CookieValue(value=COOKIE,required=false)String token,@PathVariable UUID attemptId){return AttemptResponse.from(service.evaluateExisting(owner(token),attemptId));}
  private UUID owner(String token){return auth.validate(token).map(p->UUID.fromString(p.id())).orElseThrow(()->new ResponseStatusException(HttpStatus.UNAUTHORIZED));}
  record AnswerRequest(@NotBlank String answer){}
  record Dashboard(List<AssessmentResponse> assessments,List<CaseResponse> recommendations){}
  record AssessmentResponse(String skillCode,double score,String confidence,String rationale,String nextAction,int evidenceCount,int evaluationCount,Instant assessedAt){static AssessmentResponse from(CompetencyAssessment x){return new AssessmentResponse(x.getSkillCode(),x.getScore(),x.getConfidence().name(),x.getRationale(),x.getNextAction(),x.getEvidenceCount(),x.getEvaluationCount(),x.getAssessedAt());}}
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
}
