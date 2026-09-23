import { useState } from 'react'
import { Clipboard, ShieldAlert, X } from 'lucide-react'
import {
  DIAG_PRINCIPLES, DIAG_CHECKLIST, DIAG_PLAYBOOK, DIAG_CHAT_CARDS, DIAG_FIXTURE_EXAMPLES,
  DIAG_GRADER, DIAG_SEVERITY,
} from '../diagnostics-data'
import { PanelShell } from '../components/shared'

type Tab = 'overview' | 'playbook' | 'chat' | 'grader'
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: '원칙·체크리스트' },
  { id: 'playbook', label: '8단계 진단 순서' },
  { id: 'chat', label: '채팅·파일 픽스처' },
  { id: 'grader', label: 'F0~F5 판정·심각도' },
]

export function PromptInjectionModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('overview')
  const [copied, setCopied] = useState<string | null>(null)
  const copy = async (id: string, text: string) => { await navigator.clipboard.writeText(text); setCopied(id); window.setTimeout(() => setCopied(null), 1500) }

  return <PanelShell className="file-explorer tool-modal diag-modal">
    <div className="sheet-header"><div><p className="eyebrow">진단 · AI 안전</p><h2><ShieldAlert size={18} style={{ verticalAlign: '-3px', marginRight: 6 }}/>프롬프트 인젝션</h2></div><button className="sheet-close" onClick={onClose}><X size={18}/></button></div>
    <p className="diag-warning">승인된 환경의 방어 검증용 참고자료다. 실제 비밀·개인정보·실제 외부 수신자 대신 가짜 카나리와 모의 대상만 사용한다.</p>
    <div className="period-tabs diag-tabs">
      {TABS.map(t => <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}
    </div>
    <div className="explorer-preview tool-modal-body">
      <div className="explorer-preview-body cheatsheet-options-body">

        {tab === 'overview' && <>
          <section className="diag-block">
            <h3 className="cheatsheet-options-title">운영 원칙</h3>
            <ul className="diag-bullet-list">{DIAG_PRINCIPLES.map((p, i) => <li key={i}>{p.text}</li>)}</ul>
          </section>
          {DIAG_CHECKLIST.map(group => <section className="diag-block" key={group.title}>
            <h3 className="cheatsheet-options-title">{group.title}</h3>
            <ul className="diag-checklist">{group.items.map((item, i) => <li key={i}><input type="checkbox" disabled/><span>{item}</span></li>)}</ul>
          </section>)}
        </>}

        {tab === 'playbook' && <div className="diag-step-list">
          {DIAG_PLAYBOOK.map(step => <article className="diag-step-card" key={step.step}>
            <header>
              <span className="diag-step-num">{step.step}</span>
              <div><strong>{step.name}</strong><small>{step.testId}</small></div>
            </header>
            <p>{step.purpose}</p>
            <div className="diag-step-question">
              <pre>{step.question}</pre>
              <button onClick={() => void copy(`step-${step.step}`, step.question)}><Clipboard size={13}/>{copied === `step-${step.step}` ? '복사됨' : '복사'}</button>
            </div>
            <div className="diag-chip-row">{step.record.map(field => <span className="diag-chip" key={field}>{field}</span>)}</div>
            <p className="diag-step-next"><b>다음 단계:</b> {step.nextIf}</p>
            <p className="cheatsheet-caution"><b>중단:</b> {step.stopIf}</p>
          </article>)}
        </div>}

        {tab === 'chat' && <>
          <h3 className="cheatsheet-options-title">채팅형 진단 카드</h3>
          <div className="diag-step-list">
            {DIAG_CHAT_CARDS.map(card => <article className="diag-step-card" key={card.questionId}>
              <header>
                <span className="diag-step-num diag-step-num-small">{card.testId}</span>
                <div><strong>{card.axis}</strong><small>{card.questionId}</small></div>
              </header>
              <p><b>사용자 목표:</b> {card.userGoal}</p>
              <div className="diag-step-question">
                <pre>{card.prompt}</pre>
                <button onClick={() => void copy(card.questionId, card.prompt)}><Clipboard size={13}/>{copied === card.questionId ? '복사됨' : '복사'}</button>
              </div>
              <p className="diag-step-next"><b>기대되는 안전 동작:</b> {card.expectedSafeBehavior}</p>
              <div className="diag-chip-row">{card.forbiddenSinks.map(s => <span className="diag-chip diag-chip-danger" key={s}>{s}</span>)}{card.evidenceRequired.map(e => <span className="diag-chip" key={e}>{e}</span>)}</div>
            </article>)}
          </div>
          <h3 className="cheatsheet-options-title">파일 픽스처 예시</h3>
          <div className="diag-step-list">
            {DIAG_FIXTURE_EXAMPLES.map(fx => <article className="diag-step-card" key={fx.id}>
              <header><span className="diag-step-num diag-step-num-small">{fx.testId}</span><div><strong>{fx.id}</strong><small>{fx.channel}</small></div></header>
              <div className="diag-step-question">
                <pre className="diag-fixture-content">{fx.content}</pre>
                <button onClick={() => void copy(fx.id, fx.content)}><Clipboard size={13}/>{copied === fx.id ? '복사됨' : '복사'}</button>
              </div>
              <p className="diag-step-next"><b>기대되는 안전 동작:</b> {fx.expectedSafeBehavior}</p>
            </article>)}
          </div>
        </>}

        {tab === 'grader' && <>
          <h3 className="cheatsheet-options-title">F0~F5 판정기 (GRADER_SPEC)</h3>
          <p className="cheatsheet-note">문자열이 보였다는 사실과 실제 보안 경계 실패를 구분한다. canary가 보였다는 사실만으로 즉시 High로 분류하지 않는다 -- 실제 권한·도구·외부 sink 도달 여부를 우선 확인한다.</p>
          <div className="diag-grader-list">
            {DIAG_GRADER.map(g => <div className="diag-grader-row" key={g.code}>
              <span className="diag-chip diag-chip-code">{g.code}</span>
              <div><b>{g.meaning}</b><small>최소 증거: {g.minEvidence}</small></div>
              <span className="diag-severity-tag">{g.defaultSeverity}</span>
            </div>)}
          </div>
          <h3 className="cheatsheet-options-title">심각도 가이드</h3>
          <div className="diag-grader-list">
            {DIAG_SEVERITY.map(s => <div className="diag-grader-row" key={s.grade}>
              <span className={`diag-chip diag-chip-severity-${s.grade.toLowerCase()}`}>{s.grade}</span>
              <div><b>{s.criteria}</b><small>{s.example}</small></div>
            </div>)}
          </div>
        </>}

      </div>
    </div>
  </PanelShell>
}
