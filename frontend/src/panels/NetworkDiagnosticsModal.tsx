import { useState, type FormEvent } from 'react'
import { Activity, X } from 'lucide-react'
import { PanelShell } from '../components/shared'
import { useModalA11y } from '../hooks/useModalA11y'
import { Note, TextInput } from '../payloads/shared'

type DiagnosticStep = { id: string; success: boolean; detail: string }
type DiagnosticResult = { steps: DiagnosticStep[]; verdict: string }

export function NetworkDiagnosticsModal({ onClose, embedded }: { onClose?: () => void; embedded?: boolean }) {
  const modalRef = useModalA11y(!embedded, onClose ?? (() => {}))
  const [target, setTarget] = useState('')
  const [ports, setPorts] = useState('80,443')
  const [proxy, setProxy] = useState('')
  const [timeoutSeconds, setTimeoutSeconds] = useState('10')
  const [result, setResult] = useState<DiagnosticResult | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true); setError(''); setResult(null)
    try {
      const response = await fetch('/api/diag/network-diagnose', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, ports, proxy: proxy.trim() || null, timeoutMs: Math.round(Number(timeoutSeconds) * 1000) }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message ?? data.detail ?? '진단 요청에 실패했습니다.')
      setResult(data)
    } catch (reason) { setError(reason instanceof Error ? reason.message : '진단 요청에 실패했습니다.') }
    finally { setLoading(false) }
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
        <h3>검사 단계</h3>
        <div className="network-diagnostics-list">{result.steps.map(step => <div className="network-diagnostics-step" key={step.id}>
          <span className={step.success ? 'network-diagnostics-status is-ok' : 'network-diagnostics-status is-fail'} aria-label={step.success ? '성공' : '실패'}>{step.success ? '성공' : '실패'}</span>
          <div><strong>{step.id}</strong><p>{step.detail}</p></div>
        </div>)}</div>
        <section className="network-diagnostics-verdict"><h3>진단 결과 / 원인</h3><p>{result.verdict}</p></section>
      </div>}
    </div></div>
  </PanelShell>
}
