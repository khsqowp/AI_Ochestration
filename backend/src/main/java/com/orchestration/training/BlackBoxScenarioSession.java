package com.orchestration.training;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name="black_box_scenario_session", indexes={@Index(name="idx_black_box_session_owner", columnList="owner_id"), @Index(name="idx_black_box_session_status", columnList="status")})
public class BlackBoxScenarioSession {
  @Id @GeneratedValue(strategy=GenerationType.UUID) private UUID id;
  @Column(name="owner_id", nullable=false) private UUID ownerId;
  @Column(name="scenario_slug", nullable=false, length=100) private String scenarioSlug;
  @Column(name="scenario_title", nullable=false, length=200) private String scenarioTitle;
  @Column(name="primary_skill_code", nullable=false, length=80) private String primarySkillCode;
  @Lob @Column(name="scenario_intro", columnDefinition="TEXT", nullable=false) private String scenarioIntro;
  @Lob @Column(name="runtime_state", columnDefinition="TEXT", nullable=false) private String runtimeState="";
  @Column(name="ai_generated", nullable=false) private boolean aiGenerated=false;
  @Enumerated(EnumType.STRING) @Column(nullable=false, length=20) private BlackBoxSessionStatus status=BlackBoxSessionStatus.ACTIVE;
  @Lob @Column(name="facts_note", columnDefinition="TEXT", nullable=false) private String factsNote="";
  @Lob @Column(name="hypotheses_note", columnDefinition="TEXT", nullable=false) private String hypothesesNote="";
  @Lob @Column(name="unknowns_note", columnDefinition="TEXT", nullable=false) private String unknownsNote="";
  @ElementCollection @CollectionTable(name="black_box_session_message", joinColumns=@JoinColumn(name="session_id")) @OrderColumn(name="message_order") @Column(name="message", columnDefinition="TEXT", nullable=false)
  private List<String> messages=new ArrayList<>();
  @ElementCollection @CollectionTable(name="black_box_session_observation", joinColumns=@JoinColumn(name="session_id")) @OrderColumn(name="observation_order") @Column(name="observation", columnDefinition="TEXT", nullable=false)
  private List<String> observations=new ArrayList<>();
  @ElementCollection @CollectionTable(name="black_box_session_observation_key", joinColumns=@JoinColumn(name="session_id")) @OrderColumn(name="key_order") @Column(name="observation_key", length=100, nullable=false)
  private List<String> observationKeys=new ArrayList<>();
  @Lob @Column(name="final_report", columnDefinition="TEXT") private String finalReport;
  private Double score;
  @Lob @Column(name="feedback_md", columnDefinition="TEXT") private String feedbackMd;
  @Column(nullable=false) private Instant startedAt=Instant.now();
  private Instant closedAt;
  // High #6 -- message()/messageAi() do read-then-write on the whole message/observation/runtimeState set
  // (session -> mutate in memory -> save). Two overlapping requests for the same session (e.g. a double
  // click, or a retried request racing the original) both load the same version, and without this the
  // second save() silently wins and erases whatever the first one appended. With @Version, the second
  // save() throws OptimisticLockingFailureException instead (mapped to 409 in GlobalExceptionHandler).
  @Version private long version;
  protected BlackBoxScenarioSession() {}
  static BlackBoxScenarioSession start(UUID owner, BlackBoxScenarioDefinition scenario) {
    BlackBoxScenarioSession session=new BlackBoxScenarioSession(); session.ownerId=owner; session.scenarioSlug=scenario.slug(); session.scenarioTitle=scenario.title();
    session.primarySkillCode=scenario.primarySkillCode(); session.scenarioIntro=scenario.intro(); return session;
  }
  static BlackBoxScenarioSession startAi(UUID owner, String skillCode, String title, String intro, String privateState, String firstReply) {
    BlackBoxScenarioSession session=new BlackBoxScenarioSession();
    session.ownerId=owner;
    session.scenarioSlug="ai-"+UUID.randomUUID();
    session.scenarioTitle=title;
    session.primarySkillCode=skillCode;
    session.scenarioIntro=intro;
    session.runtimeState=privateState;
    session.aiGenerated=true;
    session.recordCoachMessage(firstReply);
    return session;
  }
  public UUID getId(){return id;} public UUID getOwnerId(){return ownerId;} public String getScenarioSlug(){return scenarioSlug;} public String getScenarioTitle(){return scenarioTitle;} public String getPrimarySkillCode(){return primarySkillCode;} public String getScenarioIntro(){return scenarioIntro;} public boolean isAiGenerated(){return aiGenerated;}
  // package-private: runtimeState는 시나리오 정답 힌트(memory)를 인코딩해 담고 있어, 사건 안에서만(서비스 계층) 다뤄야 한다 —
  // public이면 향후 DTO나 로그에 실수로 섞여 나가는 순간 그대로 정답 유출로 이어진다.
  String getRuntimeState(){return runtimeState;}
  public BlackBoxSessionStatus getStatus(){return status;} public String getFactsNote(){return factsNote;} public String getHypothesesNote(){return hypothesesNote;} public String getUnknownsNote(){return unknownsNote;} public List<String> getMessages(){return List.copyOf(messages);} public List<String> getObservations(){return List.copyOf(observations);} public List<String> getObservationKeys(){return List.copyOf(observationKeys);} public String getFinalReport(){return finalReport;} public Double getScore(){return score;} public String getFeedbackMd(){return feedbackMd;} public Instant getStartedAt(){return startedAt;} public Instant getClosedAt(){return closedAt;}
  void recordUserMessage(String text){requireActive();messages.add("USER::"+text);} void recordSimulatorMessage(String text){requireActive();messages.add("SIMULATOR::"+text);} void recordCoachMessage(String text){requireActive();if(text!=null&&!text.isBlank())messages.add("COACH::"+text);} void recordObservation(String key,String text){requireActive();if(!observationKeys.contains(key)){observationKeys.add(key);observations.add(text);}} void recordObservation(String text){recordObservation("manual-"+observationKeys.size(),text);} void replaceRuntimeState(String state){requireActive();runtimeState=state==null?"":state;}
  void replaceNotes(String facts,String hypotheses,String unknowns){requireActive();factsNote=facts;hypothesesNote=hypotheses;unknownsNote=unknowns;}
  void close(String verdict,String conclusion){requireActive();status=BlackBoxSessionStatus.CLOSED;closedAt=Instant.now();finalReport="제목: "+scenarioTitle+"\n\n판정: "+verdict+"\n\n진단 결론:\n"+conclusion;}
  // #12, defense-in-depth: the caller (BlackBoxAiSessionService.reply()) is expected to always resolve a
  // non-blank summary before this is ever invoked, but this is the last line of defense against a
  // completed diagnosis silently ending up with an empty final report.
  void closeAi(String summary){requireActive();status=BlackBoxSessionStatus.CLOSED;closedAt=Instant.now();finalReport=(summary==null||summary.isBlank())?("제목: "+scenarioTitle+"\n\n진단이 종료되었습니다."):summary;}
  void attachEvaluation(double nextScore,String feedback){score=nextScore;feedbackMd=feedback;}
  private void requireActive(){if(status!=BlackBoxSessionStatus.ACTIVE)throw new IllegalStateException("종료된 사건 세션은 수정할 수 없습니다.");}
}
