import { Suspense, useEffect, useState, type FormEvent } from 'react'
import { ChevronRight, Loader2, MessagesSquare, Plus, X } from 'lucide-react'
import type { DebateMode, DebateModelKey, DebateSession, DebateTurn } from '../lib/types'
import { DEBATE_MODEL_LABEL, DEBATE_ROLE_LABEL, debateRoleClass, debateTotalTurns } from '../lib/util'
import { MarkdownBody, PanelShell } from '../components/shared'

export function DebatePanel({ onClose, embedded }: { onClose?: () => void; embedded?: boolean }) {
  const [pane, setPane] = useState<'empty' | 'create' | 'detail'>('empty')
  const [sessions, setSessions] = useState<DebateSession[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<DebateSession | null>(null)
  const [turns, setTurns] = useState<DebateTurn[]>([])
  const [advancing, setAdvancing] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<DebateMode>('PRO_CON')
  const [topic, setTopic] = useState('')
  const [proModel, setProModel] = useState<DebateModelKey>('DEEPSEEK')
  const [conModel, setConModel] = useState<DebateModelKey>('OPENAI')
  const [participants, setParticipants] = useState<DebateModelKey[]>(['DEEPSEEK', 'OPENAI'])
  const [maxTurnsPerSide, setMaxTurnsPerSide] = useState(5)
  const [creating, setCreating] = useState(false)

  const loadSessions = () => { setLoading(true); fetch('/api/debate/sessions', { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setSessions).finally(() => setLoading(false)) }
  useEffect(() => { loadSessions() }, [])

  const openSession = async (session: DebateSession) => {
    setSelected(session); setPane('detail'); setError('')
    const response = await fetch(`/api/debate/sessions/${session.id}`, { credentials: 'include' })
    if (response.ok) { const body = await response.json() as { session: DebateSession; turns: DebateTurn[] }; setSelected(body.session); setTurns(body.turns) }
  }

  const toggleParticipant = (key: DebateModelKey) => setParticipants(current => current.includes(key) ? current.filter(item => item !== key) : [...current, key])

  const createSession = async (event: FormEvent) => {
    event.preventDefault()
    if (!topic.trim()) { setError('토론 주제를 입력해 주세요.'); return }
    if (mode === 'FREE' && participants.length < 2) { setError('자유토론은 참가자를 2명 이상 선택해야 합니다.'); return }
    setCreating(true); setError('')
    const response = await fetch('/api/debate/sessions', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, topic: topic.trim(), proModel: mode === 'PRO_CON' ? proModel : null, conModel: mode === 'PRO_CON' ? conModel : null, participants: mode === 'FREE' ? participants : null, maxTurnsPerSide }) })
    setCreating(false)
    if (!response.ok) { setError('토론 세션을 만들지 못했습니다.'); return }
    const session = await response.json() as DebateSession
    setTopic(''); loadSessions(); openSession(session)
  }

  const advance = async () => {
    if (!selected) return
    setAdvancing(true); setError('')
    const response = await fetch(`/api/debate/sessions/${selected.id}/advance`, { method: 'POST', credentials: 'include' })
    setAdvancing(false)
    if (!response.ok) { setError('다음 발언 진행에 실패했습니다.'); return }
    const turn = await response.json() as DebateTurn
    setTurns(current => [...current, turn])
    setSelected(current => current ? { ...current, turnsCompleted: current.turnsCompleted + 1, status: current.turnsCompleted + 1 >= debateTotalTurns(current) ? 'COMPLETED' : current.status } : current)
    loadSessions()
  }

  return <PanelShell embedded={embedded} className="file-explorer">
    <div className="sheet-header">
      <div><p className="eyebrow">AI DEBATE</p><h2>AI 토론</h2></div>
      {onClose && <button className="sheet-close" onClick={onClose}><X size={18}/></button>}
    </div>
    <div className="explorer-toolbar">
      <button className="graph-open-button" onClick={() => { setPane('create'); setSelected(null); setError('') }}><Plus size={14}/> 새 토론</button>
    </div>
    <div className="explorer-body">
      <div className="explorer-sidebar">
        {loading && <p className="empty-state"><Loader2 size={13} className="spin"/> 불러오는 중…</p>}
        {!loading && sessions.length === 0 && <p className="empty-state">아직 토론이 없습니다. 새 토론을 시작해 보세요.</p>}
        <div className="file-list">
          {sessions.map(session => <button key={session.id} className={selected?.id === session.id ? 'active' : ''} onClick={() => openSession(session)}>
            <span>
              <b>{session.topic}</b>
              <small>{session.mode === 'PRO_CON' ? `찬반 · ${DEBATE_MODEL_LABEL[session.proModel as DebateModelKey] ?? session.proModel} vs ${DEBATE_MODEL_LABEL[session.conModel as DebateModelKey] ?? session.conModel}` : `자유 · ${(session.participants ?? []).map(p => DEBATE_MODEL_LABEL[p as DebateModelKey] ?? p).join(', ')}`}</small>
              <small>{session.turnsCompleted}/{debateTotalTurns(session)}턴 · {session.status === 'COMPLETED' ? '완료' : '진행 중'}</small>
            </span>
          </button>)}
        </div>
      </div>
      <div className="explorer-preview">
        {pane === 'empty' && <div className="explorer-empty"><MessagesSquare size={30}/><p>왼쪽에서 토론을 선택하거나, 새 토론을 시작하세요.</p></div>}

        {pane === 'create' && <form className="source-form" onSubmit={createSession}>
          <label>토론 방식
            <div className="source-actions">
              <button type="button" className={mode === 'PRO_CON' ? 'source-add' : 'source-cancel'} onClick={() => setMode('PRO_CON')}>찬반토론</button>
              <button type="button" className={mode === 'FREE' ? 'source-add' : 'source-cancel'} onClick={() => setMode('FREE')}>자유토론</button>
            </div>
          </label>
          <label>측당 최대 턴수<input type="number" min={1} max={10} value={maxTurnsPerSide} onChange={e => setMaxTurnsPerSide(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}/></label>
          <label>토론 주제<textarea rows={3} value={topic} onChange={e => setTopic(e.target.value)} placeholder="예: AI가 사람의 일자리를 대체하는 것이 사회에 이로운가?"/></label>
          {mode === 'PRO_CON' ? <>
            <label>찬성 모델<select value={proModel} onChange={e => setProModel(e.target.value as DebateModelKey)}>{Object.entries(DEBATE_MODEL_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label>반대 모델<select value={conModel} onChange={e => setConModel(e.target.value as DebateModelKey)}>{Object.entries(DEBATE_MODEL_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          </> : <label>참가자 (2명 이상)
            <div className="source-actions">
              {(Object.keys(DEBATE_MODEL_LABEL) as DebateModelKey[]).map(key => <button type="button" key={key} className={participants.includes(key) ? 'source-add' : 'source-cancel'} onClick={() => toggleParticipant(key)}>{DEBATE_MODEL_LABEL[key]}</button>)}
            </div>
          </label>}
          <p className="source-intro small">Gemini는 토론자로 참여하지 않고, 매 라운드가 끝날 때마다 그 라운드 발언을 웹 검색으로 검증하는 리서치 역할을 맡습니다.</p>
          {error && <p className="form-error">{error}</p>}
          <button className="source-add" type="submit" disabled={creating}>{creating ? <Loader2 size={14} className="spin"/> : <MessagesSquare size={14}/>} 토론 시작</button>
        </form>}

        {pane === 'detail' && selected && <>
          <div className="explorer-preview-header"><b>{selected.topic}</b><small>{selected.turnsCompleted}/{debateTotalTurns(selected)}턴 · {selected.status === 'COMPLETED' ? '완료' : '진행 중'}</small></div>
          <div className="explorer-preview-body">
            <div className="debate-turn-list">
              {turns.map(turn => <article key={turn.id} className="debate-turn">
                <div className="debate-turn-head"><span className={`debate-role-badge ${debateRoleClass(turn.role)}`}>{DEBATE_ROLE_LABEL(turn.role)}</span><small>{DEBATE_MODEL_LABEL[turn.speakerModel as DebateModelKey] ?? turn.speakerModel}</small></div>
                <div className="debate-turn-body"><Suspense fallback={<p>{turn.content}</p>}><MarkdownBody>{turn.content}</MarkdownBody></Suspense></div>
              </article>)}
              {turns.length === 0 && <p className="empty-state">아직 발언이 없습니다. 진행 버튼을 눌러 토론을 시작하세요.</p>}
            </div>
            {error && <p className="form-error">{error}</p>}
            {selected.status !== 'COMPLETED' && <button className="source-add" onClick={advance} disabled={advancing}>{advancing ? <Loader2 size={14} className="spin"/> : <ChevronRight size={14}/>} 다음 발언 진행</button>}
            {selected.status === 'COMPLETED' && <p className="empty-state">토론이 종료되었습니다.</p>}
          </div>
        </>}
      </div>
    </div>
  </PanelShell>
}
