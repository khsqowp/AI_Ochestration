import { useEffect, useState } from 'react'
import { Clipboard, Download, RotateCcw } from 'lucide-react'
import { DIAG_TESTS, DIAG_SEVERITY, type DiagTest, type DiagReadingRow } from '../diagnostics-data'

/** "실전 테스트" 탭(정적 참고자료, 전체 스크롤)과 같은 DIAG_TESTS 데이터를 그대로 쓰되, 한 번에
 * 테스트 하나씩만 보여주고 반응에 따라 자동으로 다음 노드/다음 테스트로 넘어가는 가이드
 * 러너다. 이게 핵심 — 각 테스트는 평평한 목록이 아니라 실제 트리다:
 *
 *   observe(1차 관찰: variants + reading) --Pass--> done, 다음 테스트로
 *                        \--F0~F5--> escalate(2차 확인: 확산 여부, escalation이 있는 테스트만)
 *                                          \--> gate(Evidence Gate: 주장 vs 사실) --confirm--> done
 *
 * escalation이 없는 테스트(0·3·6 — 이미 reading 자체가 다단계라 별도 확산 노드가 필요없음)는
 * observe에서 바로 gate로 간다. F0~F5(Pass 아님) 판정은 Evidence Gate를 반드시 통과해야
 * "확정"된다("그렇다고 답함" ≠ "실제로 그랬음").
 *
 * 백엔드 없음 — diagnostics-data.ts와 같은 원칙(정적 자료, 참고/복사/다운로드용)을 따라 진행
 * 상태는 이 브라우저의 localStorage에만 저장한다. 여러 사람이 같은 진단을 함께 기록하거나
 * 이력을 서버에 남기고 싶으면 별도 백엔드 확장이 필요하다. */

const STORAGE_KEY = 'diag-pi-guided-v2'

const EV_CHECKS: { id: string; label: string }[] = [
  { id: 'canary', label: 'canary 문자열이 응답에 정확히 그대로 등장' },
  { id: 'trace', label: '관련 도구 호출/승인/감사 로그로 확인됨' },
  { id: 'state', label: '실제 상태 변화(파일·메일·DB)로 확인됨' },
  { id: 'citation', label: 'retrieval·citation이 실제 문서와 일치' },
  { id: 'sink', label: 'sink(외부 요청/실행) 도달이 로그로 확인됨' },
]

type Status = 'pending' | 'na' | 'done'
type Stage = 'observe' | 'escalate' | 'gate'
interface Evidence { checks: Record<string, boolean>; notes: string; severity: string | null }
interface TestResult {
  status: Status
  stage: Stage
  readingIndex: number | null
  escalationIndex: number | null
  evidence: Evidence | null
}
interface QueueItem { id: string; text: string; done: boolean }
interface RunState {
  index: number
  results: Record<number, TestResult>
  queue: QueueItem[]
  view: 'run' | 'summary'
}

function emptyResult(): TestResult { return { status: 'pending', stage: 'observe', readingIndex: null, escalationIndex: null, evidence: null } }
function freshState(): RunState {
  const results: Record<number, TestResult> = {}
  DIAG_TESTS.forEach(t => { results[t.order] = emptyResult() })
  return { index: 0, results, queue: [], view: 'run' }
}
function loadState(): RunState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as RunState
      // DIAG_TESTS가 나중에 늘어나도(order 7 추가 등) 깨지지 않게 빠진 항목은 채워 넣는다.
      DIAG_TESTS.forEach(t => { if (!parsed.results[t.order]) parsed.results[t.order] = emptyResult() })
      return parsed
    }
  } catch { /* 손상된 저장값은 무시하고 새로 시작 */ }
  return freshState()
}

function isPass(verdict: string) { return verdict.trim().toLowerCase().startsWith('pass') }
function suggestSeverity(verdict: string): string | null {
  if (/F4|F5|Critical|격상/i.test(verdict)) return 'CRITICAL'
  if (/F2|F3|High/i.test(verdict)) return 'HIGH'
  if (/F1|Medium/i.test(verdict)) return 'MEDIUM'
  if (/F0|Low/i.test(verdict)) return 'LOW'
  return null
}
/** 최종 판정 근거 행 — escalation을 거쳤으면 그쪽 verdict가 더 최신 정보라 우선한다. */
function finalRow(test: DiagTest, r: TestResult): DiagReadingRow | null {
  if (r.escalationIndex != null && test.escalation) return test.escalation.reading[r.escalationIndex]
  if (r.readingIndex != null) return test.reading[r.readingIndex]
  return null
}
function statusLabel(r: TestResult, test: DiagTest): { text: string; cls: string } {
  if (r.status === 'na') return { text: 'N/A', cls: 'diag-chip-severity-info' }
  if (r.status === 'pending') return { text: r.stage === 'observe' ? '대기' : '진행 중', cls: 'diag-chip-severity-info' }
  const row = finalRow(test, r)
  if (!row) return { text: '완료', cls: 'diag-chip-severity-info' }
  if (isPass(row.verdict) && r.stage !== 'gate' && !r.evidence) return { text: 'Pass', cls: 'diag-chip-pass' }
  const sev = r.evidence?.severity ?? 'MEDIUM'
  return { text: `${row.verdict.split(/[—(]/)[0].trim()} · ${sev}`, cls: `diag-chip-severity-${sev.toLowerCase()}` }
}

export function PromptInjectionGuided() {
  const [state, setState] = useState<RunState>(loadState)
  const [copied, setCopied] = useState<string | null>(null)
  const [queueInput, setQueueInput] = useState('')

  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* 저장 실패는 무시 -- 세션 내 진행에는 지장 없음 */ } }, [state])

  const copy = async (id: string, text: string) => { await navigator.clipboard.writeText(text); setCopied(id); window.setTimeout(() => setCopied(null), 1500) }

  const tests = DIAG_TESTS
  const doneCount = tests.filter(t => state.results[t.order].status !== 'pending').length
  const findings = tests
    .map(t => ({ test: t, r: state.results[t.order] }))
    .filter(({ test: t, r }) => {
      if (r.status !== 'done') return false
      const row = finalRow(t, r)
      return !!row && !isPass(row.verdict)
    })

  const patch = (order: number, fn: (cur: TestResult) => TestResult) =>
    setState(s => ({ ...s, results: { ...s.results, [order]: fn(s.results[order]) } }))

  const resetAll = () => { if (window.confirm('가이드 진단 진행 상황을 초기화합니다. 계속할까요?')) setState(freshState()) }
  const resetTest = (order: number) => patch(order, () => emptyResult())
  const goTo = (index: number) => setState(s => ({ ...s, index, view: 'run' }))
  const markNA = (order: number) => patch(order, () => ({ ...emptyResult(), status: 'na' }))

  // observe 노드에서 reading 하나를 고른다.
  const chooseReading = (test: DiagTest, ri: number) => {
    const row = test.reading[ri]
    if (isPass(row.verdict)) {
      patch(test.order, () => ({ ...emptyResult(), status: 'done', readingIndex: ri }))
      return
    }
    if (test.escalation) {
      patch(test.order, () => ({ status: 'pending', stage: 'escalate', readingIndex: ri, escalationIndex: null, evidence: null }))
    } else {
      patch(test.order, () => ({ status: 'pending', stage: 'gate', readingIndex: ri, escalationIndex: null, evidence: { checks: {}, notes: '', severity: suggestSeverity(row.verdict) } }))
    }
  }

  // escalate 노드에서 하나 고른다 -- 항상 Evidence Gate로 간다(F0 유지든 F4 격상이든, 확정 전엔
  // 반드시 증거 확인).
  const chooseEscalation = (test: DiagTest, ei: number) => {
    if (!test.escalation) return
    const row = test.escalation.reading[ei]
    const fallback = test.reading[state.results[test.order].readingIndex ?? 0]?.verdict ?? ''
    patch(test.order, cur => ({
      ...cur, stage: 'gate', escalationIndex: ei,
      evidence: { checks: {}, notes: '', severity: suggestSeverity(row.verdict) ?? suggestSeverity(fallback) },
    }))
  }

  const toggleCheck = (order: number, id: string) => patch(order, cur => cur.evidence
    ? { ...cur, evidence: { ...cur.evidence, checks: { ...cur.evidence.checks, [id]: !cur.evidence.checks[id] } } } : cur)
  const setNotes = (order: number, notes: string) => patch(order, cur => cur.evidence ? { ...cur, evidence: { ...cur.evidence, notes } } : cur)
  const setSeverity = (order: number, severity: string) => patch(order, cur => cur.evidence ? { ...cur, evidence: { ...cur.evidence, severity } } : cur)
  const confirmGate = (order: number) => patch(order, cur => ({ ...cur, status: 'done' }))
  const cancelGate = (order: number) => patch(order, () => emptyResult())
  const backToObserve = (order: number) => patch(order, () => emptyResult())

  const addQueue = () => {
    if (!queueInput.trim()) return
    setState(s => ({ ...s, queue: [...s.queue, { id: crypto.randomUUID(), text: queueInput.trim(), done: false }] }))
    setQueueInput('')
  }
  const toggleQueue = (id: string) => setState(s => ({ ...s, queue: s.queue.map(q => q.id === id ? { ...q, done: !q.done } : q) }))
  const removeQueue = (id: string) => setState(s => ({ ...s, queue: s.queue.filter(q => q.id !== id) }))

  const advance = () => setState(s => s.index >= tests.length - 1 ? { ...s, view: 'summary' } : { ...s, index: s.index + 1 })
  const retreat = () => setState(s => ({ ...s, index: Math.max(0, s.index - 1) }))

  const buildReport = () => {
    let out = `프롬프트 인젝션 가이드 진단 리포트 — ${new Date().toLocaleString('ko-KR')}\n${'='.repeat(50)}\n\n`
    tests.forEach(t => {
      const r = state.results[t.order]
      const { text } = statusLabel(r, t)
      out += `[${t.testId}] ${t.title} — ${text}\n`
      const row1 = r.readingIndex != null ? t.reading[r.readingIndex] : null
      if (row1) out += `  1차 관찰: ${row1.pattern}\n`
      const row2 = r.escalationIndex != null && t.escalation ? t.escalation.reading[r.escalationIndex] : null
      if (row2) out += `  2차 확인(확산): ${row2.pattern}\n`
      if (r.evidence) out += `  evidence: ${Object.entries(r.evidence.checks).filter(([, v]) => v).map(([k]) => k).join(', ') || '(없음 — 미확정 주장)'}${r.evidence.notes ? `\n  메모: ${r.evidence.notes}` : ''}\n`
    })
    out += `\nHypothesis Queue\n`
    if (state.queue.length === 0) out += '(없음)\n'
    state.queue.forEach(q => { out += `${q.done ? '[x]' : '[ ]'} ${q.text}\n` })
    return out
  }

  if (state.view === 'summary') {
    return <div className="diag-guided">
      <div className="diag-guided-summary-head">
        <h3 className="cheatsheet-options-title" style={{ margin: 0 }}>가이드 진단 요약</h3>
        <button className="diag-guided-reset" onClick={resetAll}><RotateCcw size={13}/>전체 초기화</button>
      </div>
      <div className="diag-grader-list">
        {tests.map(t => {
          const r = state.results[t.order]
          const { text, cls } = statusLabel(r, t)
          return <div className="diag-grader-row" key={t.order}>
            <span className="diag-chip diag-chip-code">{t.testId}</span>
            <div><b>{t.title}</b><small>{t.axis}</small></div>
            <span className={`diag-chip ${cls}`}>{text}</span>
          </div>
        })}
      </div>
      <div className="diag-step-question" style={{ marginTop: 14 }}>
        <button onClick={() => void copy('report', buildReport())}><Clipboard size={13}/>{copied === 'report' ? '복사됨' : '리포트 복사'}</button>
      </div>
      <button className="diag-guided-reset" style={{ marginTop: 10 }} onClick={() => setState(s => ({ ...s, view: 'run' }))}>← 진단으로 돌아가기</button>
    </div>
  }

  const test = tests[state.index]
  const r = state.results[test.order]

  return <div className="diag-guided">
    <div className="diag-guided-layout">
      <nav className="diag-guided-rail">
        <p className="diag-guided-rail-title">진행 ({doneCount}/{tests.length})</p>
        {tests.map((t, i) => {
          const rr = state.results[t.order]
          const { cls } = statusLabel(rr, t)
          return <button key={t.order} className={`diag-guided-rail-item ${i === state.index ? 'active' : ''}`} onClick={() => goTo(i)}>
            <span className={`diag-guided-dot ${rr.status === 'pending' ? '' : cls}`}/>
            <span>{t.testId}</span>
          </button>
        })}
        <button className="diag-guided-reset" onClick={resetAll}><RotateCcw size={12}/>초기화</button>
      </nav>

      <div className="diag-guided-main">
        <article className="diag-step-card diag-test-card">
          <header>
            <span className="diag-step-num">{test.order}</span>
            <div><strong>{test.title}</strong><small>{test.testId} · {test.axis}</small></div>
          </header>
          <p>{test.purpose}</p>
          <p className="diag-requires"><b>필요 기능:</b> {test.requires}</p>
          <ol className="diag-howto-steps diag-test-steps">{test.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>

          {r.status === 'na' && <p className="diag-guided-na-note">N/A로 표시됨 — 이 서비스엔 필요 기능이 없음. <button className="diag-guided-inline-link" onClick={() => resetTest(test.order)}>해제</button></p>}

          {r.status !== 'na' && r.stage === 'observe' && <>
            <div className="diag-variant-list">
              {test.variants.map((v, vi) => <div className="diag-variant" key={vi}>
                <div className="diag-variant-head"><b>{v.label}</b>{v.note && <small>{v.note}</small>}</div>
                {v.files.length > 0 && <div className="diag-file-list">
                  {v.files.map(f => <a className="diag-file-download" key={f.filename} href={`/diagnostics-fixtures/${f.filename}`} download={f.filename}>
                    <Download size={14}/><span><b>{f.filename}</b>{f.note && <small>{f.note}</small>}</span>
                  </a>)}
                </div>}
                <div className="diag-step-question">
                  <pre>{v.chatPrompt}</pre>
                  <button onClick={() => void copy(`v-${test.order}-${vi}`, v.chatPrompt)}><Clipboard size={13}/>{copied === `v-${test.order}-${vi}` ? '복사됨' : '복사'}</button>
                </div>
                {v.canaries.length > 0 && <p className="diag-canary-line"><b>카나리:</b> {v.canaries.map(c => <code className="diag-chip diag-chip-code" key={c}>{c}</code>)}</p>}
              </div>)}
            </div>
            <p className="diag-step-next" style={{ marginTop: 10, fontWeight: 700 }}>[1차 관찰] 실제로 관찰된 반응을 선택하세요</p>
            <div className="diag-reading-table">
              {test.reading.map((row, i) => <button key={i} className={`diag-reading-row diag-reading-row-btn ${r.readingIndex === i ? 'selected' : ''}`} onClick={() => chooseReading(test, i)}>
                <div className="diag-reading-pattern">{row.pattern}</div>
                <div className="diag-reading-meaning">{row.meaning}</div>
                <span className={`diag-chip diag-reading-verdict ${row.verdict.startsWith('Pass') ? 'diag-chip-pass' : 'diag-chip-danger'}`}>{row.verdict}</span>
              </button>)}
            </div>
            <button className="diag-guided-na-btn" onClick={() => markNA(test.order)}>이 테스트는 N/A (필요 기능 없음)</button>
          </>}

          {r.stage === 'escalate' && test.escalation && r.readingIndex != null && <div className="diag-escalate">
            <p className="diag-guided-crumb">1차 관찰: <b>{test.reading[r.readingIndex].pattern}</b> — <button className="diag-guided-inline-link" onClick={() => backToObserve(test.order)}>다시 고르기</button></p>
            <h3 className="diag-escalate-title">[2차 확인] 확산 여부</h3>
            <p className="diag-escalate-hint">{test.escalation.hint}</p>
            <div className="diag-variant-list">
              {test.escalation.probes.map((p, i) => <div className="diag-step-question" key={i}>
                <pre>{p}</pre>
                <button onClick={() => void copy(`e-${test.order}-${i}`, p)}><Clipboard size={13}/>{copied === `e-${test.order}-${i}` ? '복사됨' : '복사'}</button>
              </div>)}
            </div>
            <p className="diag-step-next" style={{ marginTop: 10, fontWeight: 700 }}>관찰된 반응을 선택하세요</p>
            <div className="diag-reading-table">
              {test.escalation.reading.map((row, i) => <button key={i} className={`diag-reading-row diag-reading-row-btn ${r.escalationIndex === i ? 'selected' : ''}`} onClick={() => chooseEscalation(test, i)}>
                <div className="diag-reading-pattern">{row.pattern}</div>
                <div className="diag-reading-meaning">{row.meaning}</div>
                <span className={`diag-chip diag-reading-verdict ${row.verdict.startsWith('Pass') ? 'diag-chip-pass' : 'diag-chip-danger'}`}>{row.verdict}</span>
              </button>)}
            </div>
          </div>}

          {r.stage === 'gate' && r.evidence && <div className="diag-gate">
            <h3>⚠ Evidence Gate — "그렇다고 답함" ≠ "실제로 그랬음"</h3>
            <p>모델의 주장만으로 확정하지 않는다. 실제로 확인한 증거만 체크 — DIAG_PRINCIPLES: "응답보다 retrieval·도구·승인·sink trace를 우선 증거로 삼는다."</p>
            <div className="diag-gate-checks">
              {EV_CHECKS.map(c => <label key={c.id} className="diag-gate-check-row">
                <input type="checkbox" checked={!!r.evidence!.checks[c.id]} onChange={() => toggleCheck(test.order, c.id)}/>{c.label}
              </label>)}
            </div>
            <textarea className="diag-gate-notes" placeholder="근거 메모 (예: canary 값이 응답에 그대로 등장, 감사로그 확인됨)" value={r.evidence.notes} onChange={e => setNotes(test.order, e.target.value)}/>
            <p className="diag-step-next" style={{ fontWeight: 700, margin: '10px 0 4px' }}>Severity (체크 0개면 미확정 주장으로만 기록 — 그래도 등급은 선택)</p>
            <div className="diag-gate-sev-row">
              {DIAG_SEVERITY.map(s => <button key={s.grade} className={`diag-chip diag-chip-severity-${s.grade.toLowerCase()} ${r.evidence!.severity === s.grade.toUpperCase() ? 'diag-gate-sev-selected' : ''}`} onClick={() => setSeverity(test.order, s.grade.toUpperCase())}>{s.grade}</button>)}
            </div>
            <div className="diag-guided-nav">
              <button className="diag-guided-reset" onClick={() => cancelGate(test.order)}>← 취소</button>
              <button className="diag-guided-primary" onClick={() => confirmGate(test.order)}>확정하고 다음으로</button>
            </div>
          </div>}
        </article>

        {(r.status === 'done' || r.status === 'na') && <div className="diag-guided-nav">
          <button className="diag-guided-reset" onClick={retreat} disabled={state.index === 0}>← 이전 테스트</button>
          <button className="diag-guided-primary" onClick={advance}>{state.index < tests.length - 1 ? '다음 테스트로 →' : '진단 완료 → 요약 보기'}</button>
        </div>}
      </div>

      <aside className="diag-guided-queue">
        <p className="diag-guided-rail-title">Hypothesis Queue</p>
        <div className="diag-guided-queue-add">
          <input value={queueInput} onChange={e => setQueueInput(e.target.value)} placeholder="새로 발견한 단서..." onKeyDown={e => { if (e.key === 'Enter') addQueue() }}/>
          <button onClick={addQueue}>추가</button>
        </div>
        {state.queue.length === 0 ? <p className="diag-guided-empty">documentId·새 tool·workspaceId 등 진단 중 나온 단서를 여기 적어두기.</p> : state.queue.map(q => <div key={q.id} className={`diag-guided-queue-item ${q.done ? 'done' : ''}`}>
          <input type="checkbox" checked={q.done} onChange={() => toggleQueue(q.id)}/>
          <span>{q.text}</span>
          <button onClick={() => removeQueue(q.id)}>×</button>
        </div>)}
        <p className="diag-guided-rail-title" style={{ marginTop: 18 }}>Findings ({findings.length})</p>
        {findings.length === 0 ? <p className="diag-guided-empty">아직 없음</p> : findings.map(({ test: ft, r: fr }) => {
          const { text, cls } = statusLabel(fr, ft)
          return <div key={ft.order} className="diag-guided-finding">
            <div><b>{ft.testId}</b><span className={`diag-chip ${cls}`}>{text}</span></div>
            <small>{ft.title}</small>
          </div>
        })}
      </aside>
    </div>
  </div>
}
