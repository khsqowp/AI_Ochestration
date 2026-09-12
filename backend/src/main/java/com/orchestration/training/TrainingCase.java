package com.orchestration.training;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "training_case", indexes = {@Index(name="idx_training_case_skill", columnList="primary_skill_code"), @Index(name="idx_training_case_type", columnList="case_type")})
public class TrainingCase {
  @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
  @Column(nullable=false, unique=true, length=120) private String slug;
  @Column(nullable=false, length=200) private String title;
  @Enumerated(EnumType.STRING) @Column(name="case_type", nullable=false, length=30) private TrainingCaseType caseType;
  @Column(name="primary_skill_code", nullable=false, length=80) private String primarySkillCode;
  @Column(nullable=false) private int difficulty;
  @Lob @Column(columnDefinition="TEXT", nullable=false) private String promptMd;
  @Lob @Column(columnDefinition="TEXT", nullable=false) private String rubricJson;
  @Column(nullable=false) private boolean published = true;
  @Column(nullable=false) private Instant createdAt = Instant.now();
  protected TrainingCase() {}
  TrainingCase(String slug,String title,TrainingCaseType type,String skill,int difficulty,String promptMd,String rubricJson){this.slug=slug;this.title=title;this.caseType=type;this.primarySkillCode=skill;this.difficulty=difficulty;this.promptMd=promptMd;this.rubricJson=rubricJson;}
  public UUID getId(){return id;} public String getSlug(){return slug;} public String getTitle(){return title;} public TrainingCaseType getCaseType(){return caseType;} public String getPrimarySkillCode(){return primarySkillCode;} public int getDifficulty(){return difficulty;} public String getPromptMd(){return promptMd;} public String getRubricJson(){return rubricJson;} public boolean isPublished(){return published;}
  void replaceRubric(String rubricJson){this.rubricJson=rubricJson;}
  void refresh(String title,TrainingCaseType type,String skill,int difficulty,String promptMd,String rubricJson){
    this.title=title; this.caseType=type; this.primarySkillCode=skill; this.difficulty=difficulty; this.promptMd=promptMd; this.rubricJson=rubricJson;
  }
}
