import { Suspense, useRef, useState, type FormEvent } from 'react'
import { History, Loader2, Search, Square, X } from 'lucide-react'
import type { MarkdownDoc, RagAnswer, RagDomainFilter, RagHistoryEntry, RagOriginFilter } from '../lib/types'
import { ragProgressLabel } from '../lib/util'
import { DocumentCard, MarkdownBody, PanelShell } from '../components/shared'

export function AskArchiveModal({ onClose, embedded }: { onClose?: () => void; embedded?: boolean }) {
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [answer, setAnswer] = useState<RagAnswer | null>(null)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<MarkdownDoc | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<RagHistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [domainFilter, setDomainFilter] = useState<RagDomainFilter>('')
  const [originFilter, setOriginFilter] = useState<RagOriginFilter>('')
  const [elapsed, setElapsed] = useState(0)
  const abortRef = useRef<AbortController | null>(null)
  const loadHistory = async () => {
    setHistoryLoading(true)
    const response = await fetch('/api/archive/ask/history', { credentials: 'include' })
    setHistoryLoading(false)
    if (response.ok) setHistory(await response.json())
  }
  const toggleHistory = () => { setShowHistory(current => { const next = !current; if (next) loadHistory(); return next }) }
  const ask = async (event: FormEvent) => {
    event.preventDefault()
    if (!question.trim() || asking) return
    setAsking(true); setError(''); setAnswer(null); setPreview(null); setElapsed(0)
    const controller = new AbortController(); abortRef.current = controller
    const started = Date.now()
    const progressTimer = window.setInterval(() => setElapsed(Date.now() - started), 300)
    try {
      const response = await fetch('/api/archive/ask', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: question.trim(), domain: domainFilter || null, origin: originFilter || null }), signal: controller.signal })
      if (!response.ok) { setError('답변을 가져오지 못했습니다. API 키 설정을 확인해 주세요.'); return }
      setAnswer(await response.json() as RagAnswer); setQuestion('')
      if (showHistory) loadHistory()
    } catch (exception) {
      // 사용자가 직접 중지를 눌러 fetch를 취소한 경우(AbortError)는 오류가 아니므로 에러 메시지를 띄우지 않는다 --
      // 서버는 이미 던져진 요청을 계속 처리할 수 있지만, 그 결과는 여기서 조용히 버려진다.
      if ((exception as Error).name !== 'AbortError') setError('답변을 가져오지 못했습니다. API 키 설정을 확인해 주세요.')
    } finally {
      window.clearInterval(progressTimer); setAsking(false); abortRef.current = null
    }
  }
  const stopAsking = () => { abortRef.current?.abort() }
  const openCitation = async (path: string) => { const response = await fetch(`/api/archive/content?path=${encodeURIComponent(path)}`, { credentials: 'include' }); if (response.ok) setPreview(await response.json()) }
  return <PanelShell embedded={embedded} className="side-modal"><div className="sheet-header"><div><p className="eyebrow">KNOWLEDGE ARCHIVE</p><h2>아카이브에 질문하기</h2></div>{onClose && <button className="sheet-close" onClick={onClose}><X size={18}/></button>}</div>
    <p className="source-intro">아카이브에 쌓인 노트를 근거로 답합니다. 노트에 없는 내용은 답하지 않습니다.</p>
    <div className="rag-filter-row">
      <select value={domainFilter} onChange={e => setDomainFilter(e.target.value as RagDomainFilter)} title="분야로 범위 좁히기">
        <option value="">전체 분야</option>
        <option value="economy">경제</option>
        <option value="security">보안</option>
        <option value="ideas">아이디어</option>
      </select>
      <select value={originFilter} onChange={e => setOriginFilter(e.target.value as RagOriginFilter)} title="출처로 범위 좁히기">
        <option value="">전체 출처</option>
        <option value="collection">수집</option>
        <option value="manual">질문·직접작성</option>
        <option value="upload">업로드</option>
      </select>
    </div>
    <button className="graph-open-button rag-history-toggle" onClick={toggleHistory}><History size={14}/>{showHistory ? '대화 기록 닫기' : '대화 기록 보기'}</button>
    {showHistory && <div className="rag-history">
      {historyLoading && <p className="empty-state"><Loader2 size={13} className="spin"/> 기록을 불러오는 중…</p>}
      {!historyLoading && history.length === 0 && <p className="empty-state">아직 저장된 질문 기록이 없습니다.</p>}
      {history.map(item => <article key={item.id}><b>{item.question}</b><p>{item.answer}</p><small>{new Date(item.createdAt).toLocaleString('ko-KR')}</small></article>)}
    </div>}
    <form className="chat-input ask-form" onSubmit={ask}><input value={question} onChange={e => setQuestion(e.target.value)} placeholder="예: 이번 달 보안 동향 중 랜섬웨어 관련 이슈는?" disabled={asking}/>{asking ? <button type="button" className="ask-stop" onClick={stopAsking}><Square size={16}/></button> : <button type="submit"><Search size={16}/></button>}</form>
    {asking && <p className="empty-state"><Loader2 size={13} className="spin"/> {ragProgressLabel(elapsed)}</p>}
    {error && <p className="form-error">{error}</p>}
    {preview && <div className="rag-preview"><div className="sheet-header"><b>{preview.path}</b><button className="sheet-close" onClick={() => setPreview(null)}><X size={14}/></button></div><DocumentCard doc={preview}/></div>}
    {answer && !preview && <div className="rag-answer"><Suspense fallback={null}><MarkdownBody>{answer.answer}</MarkdownBody></Suspense>{answer.citations.length > 0 && <div className="rag-citations"><b>참고 노트</b>{answer.citations.map(citation => <button key={citation.path} onClick={() => openCitation(citation.path)}>{citation.path} <small>({(citation.score * 100).toFixed(0)}%)</small></button>)}</div>}</div>}
  </PanelShell>
}
