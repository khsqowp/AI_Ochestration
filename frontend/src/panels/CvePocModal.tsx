import { useState, type FormEvent } from 'react'
import { Activity, ExternalLink, X } from 'lucide-react'
import { PanelShell } from '../components/shared'
import { useAppState } from '../context/AppState'
import { useModalA11y } from '../hooks/useModalA11y'
import { Note, TextInput } from '../payloads/shared'

type CvePocResult = {
  cveId: string | null
  exists: boolean
  cvssScore: number | null
  cvssVector: string | null
  pocReferenceUrls: string[]
  aiSummary: string | null
  error: string | null
}

export function CvePocModal({ onClose, embedded }: { onClose?: () => void; embedded?: boolean }) {
  const modalRef = useModalA11y(!embedded, onClose ?? (() => {}))
  const { isAdmin } = useAppState()
  const [query, setQuery] = useState('')
  const [includeAiSummary, setIncludeAiSummary] = useState(false)
  const [result, setResult] = useState<CvePocResult | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true); setError(''); setResult(null)
    try {
      const response = await fetch('/api/diag/cve-poc', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cveId: query, includeAiSummary: isAdmin && includeAiSummary }),
      })
      const data = await response.json() as CvePocResult
      if (!response.ok) throw new Error(data.error ?? 'CVE 조회에 실패했습니다.')
      setResult(data)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'CVE 조회에 실패했습니다.') }
    finally { setLoading(false) }
  }

  return <PanelShell embedded={embedded} className="file-explorer tool-modal diag-modal" modalRef={modalRef}>
    <div className="sheet-header"><div><p className="eyebrow">진단 · 취약점</p><h2><Activity size={18} style={{ verticalAlign: '-3px', marginRight: 6 }}/>CVE / PoC 조회</h2></div>{onClose && <button className="sheet-close" onClick={onClose}><X size={18}/></button>}</div>
    <div className="explorer-preview tool-modal-body"><div className="explorer-preview-body cheatsheet-options-body">
      <Note>NVD에서 CVE 존재 여부와 CVSS를 조회하고 공개 Exploit 참조를 표시합니다. PoC가 확인되지 않으면 찾지 못했다고 표시합니다.</Note>
      <form className="network-diagnostics-form" onSubmit={submit}>
        <TextInput label="CVE ID 또는 검색어" value={query} onChange={setQuery} placeholder="CVE-2021-44228"/>
        {isAdmin && <label className="diag-checkbox"><input type="checkbox" checked={includeAiSummary} onChange={event => setIncludeAiSummary(event.target.checked)}/> 참조 내용 기반 AI 요약 (ADMIN 전용, API 비용 발생)</label>}
        <button className="btn btn-primary" type="submit" disabled={loading || !query.trim()}>{loading ? '조회 중…' : 'CVE 조회'}</button>
      </form>
      {error && <p role="alert" className="network-diagnostics-error">{error}</p>}
      {loading && <p className="diag-result-empty">NVD와 공개 PoC 참조를 확인하고 있습니다.</p>}
      {result && <div className="network-diagnostics-results" aria-live="polite">
        <h3>{result.cveId ?? '조회 결과'}</h3>
        {result.error && <p role="status" className="network-diagnostics-error">{result.error}</p>}
        {result.exists && <>
          <p><strong>존재 여부:</strong> NVD에 등록됨</p>
          <p><strong>CVSS:</strong> {result.cvssScore == null ? '점수 없음' : result.cvssScore} {result.cvssVector && <code>{result.cvssVector}</code>}</p>
          <section className="network-diagnostics-verdict"><h3>공개 PoC / Exploit 참조</h3>
            {result.pocReferenceUrls.length ? <ul>{result.pocReferenceUrls.map(url => <li key={url}><a href={url} target="_blank" rel="noreferrer">{url} <ExternalLink size={13}/></a></li>)}</ul> : <p>확인된 공개 PoC 참조가 없습니다.</p>}
          </section>
          {result.aiSummary && <section className="network-diagnostics-verdict"><h3>AI 요약</h3><p>{result.aiSummary}</p></section>}
        </>}
        {!result.exists && !result.error && <p>유효한 CVE 레코드를 찾지 못했습니다.</p>}
      </div>}
    </div></div>
  </PanelShell>
}
