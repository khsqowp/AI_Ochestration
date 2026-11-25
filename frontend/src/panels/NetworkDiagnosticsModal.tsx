import { useCallback, useState, type FormEvent } from 'react'
import { Activity, ChevronDown, ChevronUp, Trash2, X } from 'lucide-react'
import { PanelShell } from '../components/shared'
import { useModalA11y } from '../hooks/useModalA11y'
import { Note, TextInput } from '../payloads/shared'

type DiagnosticStep = { id: string; success: boolean; detail: string; elapsedMs: number }
type DiagnosticResult = { steps: DiagnosticStep[]; verdict: string }
type HistoryItem = { id: string; target: string; ports: string; verdictSnippet: string; createdAt: string }

const HISTORY_URL = '/api/diag/network-diagnose/history'

function errorMessage(data: unknown, fallback: string) {
  const record = (data ?? {}) as { message?: string; detail?: string }
  return record.message ?? record.detail ?? fallback
}

function formatTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function NetworkDiagnosticsModal({ onClose, embedded }: { onClose?: () => void; embedded?: boolean }) {
  const modalRef = useModalA11y(!embedded, onClose ?? (() => {}))
  const [target, setTarget] = useState('')
  const [ports, setPorts] = useState('80,443')
  const [proxy, setProxy] = useState('')
  const [timeoutSeconds, setTimeoutSeconds] = useState('10')
  const [result, setResult] = useState<DiagnosticResult | null>(null)
  const [resultLabel, setResultLabel] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [historyError, setHistoryError] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)

  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch(HISTORY_URL)
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorMessage(data, '기록을 불러오지 못했습니다.'))
      setHistory(Array.isArray(data) ? data : [])
      setHistoryError('')
      setHistoryLoaded(true)
    } catch (reason) { setHistoryError(reason instanceof Error ? reason.message : '기록을 불러오지 못했습니다.') }
  }, [])

  const toggleHistory = () => {
    const next = !historyOpen
    setHistoryOpen(next)
    if (next && !historyLoaded) void loadHistory()
  }

  const deleteHistory = async (item: HistoryItem) => {
    try {
      const response = await fetch(`${HISTORY_URL}/${item.id}`, { method: 'DELETE' })
      if (!response.ok) { const data = await response.json().catch(() => null); throw new Error(errorMessage(data, '기록 삭제에 실패했습니다.')) }
      setHistory(current => current.filter(entry => entry.id !== item.id))
    } catch (reason) { setHistoryError(reason instanceof Error ? reason.message : '기록 삭제에 실패했습니다.') }
  }

  /** Shared runner for fresh, history-detail and rerun requests: fetch → show results or error. */
  const run = async (request: () => Promise<Response>, label: string, refreshHistory: boolean) => {
    setLoading(true); setError(''); setResult(null)
    try {
      const response = await request()
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorMessage(data, '진단 요청에 실패했습니다.'))
      setResult({ steps: data.steps, verdict: data.verdict })
      setResultLabel(label)
      if (refreshHistory) { if (historyOpen) await loadHistory(); else setHistoryLoaded(false) }
    } catch (reason) { setError(reason instanceof Error ? reason.message : '진단 요청에 실패했습니다.') }
    finally { setLoading(false) }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void run(() => fetch('/api/diag/network-diagnose', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target, ports, proxy: proxy.trim() || null, timeoutMs: Math.round(Number(timeoutSeconds) * 1000) }),
    }), `${target.trim()} · ${ports || '80,443'}`, true)
  }

  const openHistory = (item: HistoryItem) => {
    void run(() => fetch(`${HISTORY_URL}/${item.id}`), `${item.target} · ${item.ports} · 저장된 결과`, false)
  }

  const rerun = (item: HistoryItem) => {
    void run(() => fetch(`${HISTORY_URL}/${item.id}/rerun`, { method: 'POST' }), `${item.target} · ${item.ports} · 재진단`, true)
  }

  return <PanelShell embedded={embedded} className="file-explorer tool-modal diag-modal" modalRef={modalRef}>
    <div className="sheet-header"><div><p className="eyebrow">진단 · 연결</p><h2><Activity size={18} style={{ verticalAlign: '-3px', marginRight: 6 }}/>네트워크 진단</h2></div>{onClose && <button className="sheet-close" onClick={onClose}><X size={18}/></button>}</div>
    <div className="explorer-preview tool-modal-body"><div className="explorer-preview-body cheatsheet-options-body">
      <Note>서버에서 DNS, 직접 TCP/HTTP, 선택한 명시 프록시 경유 HTTP 연결을 점검합니다. 사설·로컬 주소와 그 주소로 향하는 직접 요청 리다이렉트는 차단됩니다. 요청은 진단 대상 시스템에 도달합니다.</Note>
      <form className="network-diagnostics-form" onSubmit={submit}>
        <TextInput label="대상 호스트 또는 URL" value={target} onChange={setTarget} placeholder="example.com 또는 https://example.com"/>
        <TextInput label="포트" value={ports} onChange={setPorts} placeholder="80,443"/>
        <TextInput label="명시 프록시 (선택)" value={proxy} onChange={setProxy} placeholder="host:port"/>
        <TextInput label="시간 제한 (초)" value={timeoutSeconds} onChange={setTimeoutSeconds} placeholder="10"/>
        <button className="btn btn-primary" type="submit" disabled={loading || !target.trim()}>{loading ? '진단 중…' : '진단 시작'}</button>
      </form>

      {error && <p role="alert" className="network-diagnostics-error">{error}</p>}
      {loading && <p className="diag-result-empty">DNS, TCP, HTTP 연결을 순서대로 확인하고 있습니다.</p>}
      {result && <div className="network-diagnostics-results" aria-live="polite">
        <h3>검사 단계{resultLabel && <span className="network-diagnostics-result-label"> · {resultLabel}</span>}</h3>
        <div className="network-diagnostics-list">{result.steps.map(step => <div className="network-diagnostics-step" key={step.id}>
          <span className={step.success ? 'network-diagnostics-status is-ok' : 'network-diagnostics-status is-fail'} aria-label={step.success ? '성공' : '실패'}>{step.success ? '성공' : '실패'}</span>
          <div><strong>{step.id}</strong> <span className="network-diagnostics-elapsed">{step.elapsedMs} ms</span><p>{step.detail}</p></div>
        </div>)}</div>
        <section className="network-diagnostics-verdict"><h3>진단 결과 / 원인</h3><p>{result.verdict}</p></section>
      </div>}

      <section className="network-diagnostics-history" aria-label="진단 기록">
        <button type="button" className="network-diagnostics-history-toggle" onClick={toggleHistory} aria-expanded={historyOpen}>
          {historyOpen ? <ChevronUp size={16}/> : <ChevronDown size={16}/>} 기록
        </button>
        {historyOpen && <>
          {historyError && <p role="alert" className="network-diagnostics-error">{historyError}</p>}
          {!historyError && historyLoaded && history.length === 0 && <p className="diag-result-empty">저장된 진단 기록이 없습니다.</p>}
          {!historyError && !historyLoaded && <p className="diag-result-empty">기록을 불러오는 중…</p>}
          <ul className="network-diagnostics-history-list">{history.map(item => <li className="network-diagnostics-history-item" key={item.id}>
            <button className="network-diagnostics-history-open" type="button" onClick={() => openHistory(item)} disabled={loading}>
              <strong>{item.target}</strong>
              <span className="network-diagnostics-history-time">{formatTime(item.createdAt)} · 포트 {item.ports}</span>
              <span className="network-diagnostics-history-snippet">{item.verdictSnippet}</span>
            </button>
            <button className="btn" type="button" onClick={() => rerun(item)} disabled={loading}>다시 진단</button>
            <button className="diag-icon-button" type="button" aria-label="기록 삭제" onClick={() => void deleteHistory(item)} disabled={loading}><Trash2 size={14}/></button>
          </li>)}</ul>
        </>}
      </section>
    </div></div>
  </PanelShell>
}
