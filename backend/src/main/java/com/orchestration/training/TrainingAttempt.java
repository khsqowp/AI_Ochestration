package com.orchestration.training;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name="training_attempt", indexes={@Index(name="idx_training_attempt_owner",columnList="owner_id"),@Index(name="idx_training_attempt_case",columnList="case_id")})
public class TrainingAttempt {
  @Id @GeneratedValue(strategy=GenerationType.UUID) private UUID id;
  @Column(name="owner_id",nullable=false) private UUID ownerId;
  // Attempt responses always include the immutable case summary. Keeping this eager avoids serializing a
  // detached lazy proxy after the service transaction has closed.
  @ManyToOne(fetch=FetchType.EAGER) @JoinColumn(name="case_id",nullable=false) private TrainingCase trainingCase;
  @Column(name="case_title_snapshot", length=200) private String caseTitleSnapshot;
  @Lob @Column(name="case_prompt_snapshot", columnDefinition="TEXT") private String casePromptSnapshot;
  // High #8 -- scoring (TrainingAiEvaluator) and grouping (TrainingService.recalculateAssessments) both used
  // to read straight off the live TrainingCase, so editing a case's rubric/skill/difficulty/type after an
  // attempt already started silently changed how that in-flight or even already-scored attempt was judged.
  // These four are snapshotted once at start() alongside the title/prompt above.
  @Column(name="skill_code_snapshot", length=80) private String skillCodeSnapshot;
  private Integer difficultySnapshot;
  @Enumerated(EnumType.STRING) @Column(name="case_type_snapshot", length=30) private TrainingCaseType caseTypeSnapshot;
  @Lob @Column(name="rubric_snapshot", columnDefinition="TEXT") private String rubricSnapshot;
  @Enumerated(EnumType.STRING) @Column(nullable=false,length=20) private AttemptStatus status=AttemptStatus.IN_PROGRESS;
  @Lob @Column(columnDefinition="TEXT",nullable=false) private String answerMd="";
  @Lob @Column(columnDefinition="TEXT") private String feedbackMd;
  private Double score;
  @Column(nullable=false) private Instant startedAt=Instant.now();
  private Instant submittedAt;
  protected TrainingAttempt(){}
  TrainingAttempt(UUID ownerId,TrainingCase trainingCase){
    this.ownerId=ownerId;this.trainingCase=trainingCase;
    this.caseTitleSnapshot=trainingCase.getTitle();this.casePromptSnapshot=trainingCase.getPromptMd();
    this.skillCodeSnapshot=trainingCase.getPrimarySkillCode();this.difficultySnapshot=trainingCase.getDifficulty();
    this.caseTypeSnapshot=trainingCase.getCaseType();this.rubricSnapshot=trainingCase.getRubricJson();
  }
  public UUID getId(){return id;} public UUID getOwnerId(){return ownerId;} public TrainingCase getTrainingCase(){return trainingCase;} public String getCaseTitleSnapshot(){return caseTitleSnapshot;} public String getCasePromptSnapshot(){return casePromptSnapshot;} public AttemptStatus getStatus(){return status;} public String getAnswerMd(){return answerMd;} public String getFeedbackMd(){return feedbackMd;} public Double getScore(){return score;} public Instant getStartedAt(){return startedAt;} public Instant getSubmittedAt(){return submittedAt;}
  void backfillSnapshotIfMissing(String title,String prompt){if(caseTitleSnapshot==null||caseTitleSnapshot.isBlank())caseTitleSnapshot=title;if(casePromptSnapshot==null||casePromptSnapshot.isBlank())casePromptSnapshot=prompt;}
  // "Effective" = the snapshot when present, falling back to the live case only for attempts created
  // before this snapshot existed (their snapshot columns are null) -- same fallback pattern already used
  // for title/prompt above, extended to the other fields that actually drive scoring and grouping.
  String effectiveTitle(){return caseTitleSnapshot==null||caseTitleSnapshot.isBlank()?trainingCase.getTitle():caseTitleSnapshot;}
  String effectivePromptMd(){return casePromptSnapshot==null||casePromptSnapshot.isBlank()?trainingCase.getPromptMd():casePromptSnapshot;}
  String effectiveSkillCode(){return skillCodeSnapshot==null||skillCodeSnapshot.isBlank()?trainingCase.getPrimarySkillCode():skillCodeSnapshot;}
  int effectiveDifficulty(){return difficultySnapshot==null?trainingCase.getDifficulty():difficultySnapshot;}
  TrainingCaseType effectiveCaseType(){return caseTypeSnapshot==null?trainingCase.getCaseType():caseTypeSnapshot;}
  String effectiveRubricJson(){return rubricSnapshot==null||rubricSnapshot.isBlank()?trainingCase.getRubricJson():rubricSnapshot;}
  void saveAnswer(String answer){answerMd=answer;} void submit(Double score,String feedback){this.score=score;feedbackMd=feedback;status=AttemptStatus.SUBMITTED;submittedAt=Instant.now();}
}
