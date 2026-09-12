package com.orchestration.training;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "competency_assessment", uniqueConstraints = @UniqueConstraint(name = "uq_competency_assessment_owner_skill", columnNames = {"owner_id", "skill_code"}))
public class CompetencyAssessment {
  @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
  @Column(name = "owner_id", nullable = false) private UUID ownerId;
  @Column(name = "skill_code", nullable = false, length = 80) private String skillCode;
  @Column(nullable = false) private double score;
  /** Immutable initial diagnostic score. Dynamic practice results must not recursively become the new baseline. */
  private Double baselineScore;
  @Enumerated(EnumType.STRING) @Column(nullable = false, length = 12) private AssessmentConfidence confidence;
  @Lob @Column(columnDefinition = "TEXT", nullable = false) private String rationale;
  @Lob @Column(columnDefinition = "TEXT") private String nextAction;
  @Column(nullable = false) private int evidenceCount;
  @Column(nullable = false) private int evaluationCount;
  private Double blackBoxScore;
  @Column(nullable=false) private int blackBoxEvaluationCount;
  @Lob @Column(columnDefinition="TEXT") private String blackBoxRationale;
  @Lob @Column(columnDefinition="TEXT") private String blackBoxNextAction;
  @Column(nullable = false) private Instant assessedAt = Instant.now();
  protected CompetencyAssessment() {}
  CompetencyAssessment(UUID ownerId, String skillCode, double score, AssessmentConfidence confidence, String rationale, int evidenceCount) {
    this.ownerId=ownerId; this.skillCode=skillCode; this.score=score; this.baselineScore=score; this.confidence=confidence; this.rationale=rationale; this.nextAction=defaultNextAction(skillCode); this.evidenceCount=evidenceCount;
  }
  public UUID getId(){return id;} public UUID getOwnerId(){return ownerId;} public String getSkillCode(){return skillCode;}
  public double getScore(){return score;} public AssessmentConfidence getConfidence(){return confidence;} public String getRationale(){return rationale;}
  public String getNextAction(){return nextAction;} public int getEvidenceCount(){return evidenceCount;} public int getEvaluationCount(){return evaluationCount;} public Instant getAssessedAt(){return assessedAt;}
  public Double getBlackBoxScore(){return blackBoxScore;} public int getBlackBoxEvaluationCount(){return blackBoxEvaluationCount;} public String getBlackBoxRationale(){return blackBoxRationale;} public String getBlackBoxNextAction(){return blackBoxNextAction;}
  double baselineScore(){return baselineScore==null?score:baselineScore;}
  void initializeBaselineIfMissing(){if(baselineScore==null)baselineScore=score;if(nextAction==null||nextAction.isBlank())nextAction=defaultNextAction(skillCode);}
  void updateFromPractice(double score, AssessmentConfidence confidence, String rationale, String nextAction, int evaluationCount) { this.score=score; this.confidence=confidence; this.rationale=rationale; this.nextAction=nextAction; this.evaluationCount=evaluationCount; this.assessedAt=Instant.now(); }
  void updateBlackBox(double score, int evaluationCount, String rationale, String nextAction) { this.blackBoxScore=Math.round(score*10.0)/10.0; this.blackBoxEvaluationCount=evaluationCount; this.blackBoxRationale=rationale; this.blackBoxNextAction=nextAction; this.assessedAt=Instant.now(); }
  private static String defaultNextAction(String skillCode){return skillCode+" 관련 추천 문제에서 판정·근거·조치·재검증을 분리해 제출하세요.";}
}
