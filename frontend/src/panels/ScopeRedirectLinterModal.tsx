import { useState, type ChangeEvent } from 'react'
import { ShieldAlert, Upload, X } from 'lucide-react'
import { PanelShell } from '../components/shared'
import { useModalA11y } from '../hooks/useModalA11y'
import { analyzeHarScope, parseScopeRules, type HarFinding } from '../diag-local-tools'

type Props = { onClose?: () => void; embedded?: boolean }

export function ScopeRedirectLinterModal({ onClose, embedded }: Props) {
  const modalRef = useModalA11y(!embedded, onClose ?? (() => {}))
  const [scopeText, setScopeText] = useState('')
  const [filename, setFilename] = useState('')
  const [harText, setHarText] = useState('')
  const [findings, setFindings] = useState<HarFinding[]>([])
  const [ignored, setIgnored] = useState(0)
  const [errors, setErrors] = useState<string[]>([])
  const [message, setMessage] = useState('')

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    setFindings([]); setErrors([]); setMessage('')
    if (!file) return
    if (file.size > 25 * 1024 * 1024) { setMessage('25MB 이하 HAR 파일만 처리할 수 있습니다.'); event.target.value = ''; return }
    try { setHarText(await file.text()); setFilename(file.name) }
    catch { setHarText(''); setFilename(''); setMessage('파일을 읽지 못했습니다.') }
    event.target.value = ''
  }

  const analyze = () => {
    const parsed = parseScopeRules(scopeText)
    const nextErrors = [...parsed.errors]
    if (!parsed.rules.length) nextErrors.push('허용 범위를 하나 이상 입력하세요.')
    if (!harText) nextErrors.push('HAR 파일을 선택하세요.')
    if (nextErrors.length) { setErrors(nextErrors); setFindings([]); setMessage(''); return }
    const result = analyzeHarScope(harText, parsed.rules)
    if (result.error) { setErrors([result.error]); setFindings([]); setMessage(''); return }
    setErrors([]); setFindings(result.findings); setIgnored(result.ignored)
    setMessage(`범위 밖 후보 ${result.findings.length}건을 확인했습니다. 분석에서 제외한 항목 ${result.ignored}개.`)
  }

  return <PanelShell embedded={embedded} className="file-explorer tool-modal diag-modal diag-local-tool" modalRef={modalRef}>
    <div className="sheet-header"><div><p className="eyebrow">진단 · 범위 확인</p><h2><ShieldAlert size={18} style={{ verticalAlign: '-3px', marginRight: 6 }}/>범위·리다이렉트 사전 점검</h2></div>{onClose && <button className="sheet-close" onClick={onClose}><X size={18}/></button>}</div>
    <p className="diag-warning">HAR 파일을 브라우저에서만 파싱합니다. 대상에 요청을 보내지 않습니다. 허용 Origin은 와일드카드 없이 한 줄에 하나씩 입력하세요. 실제 점검은 승인된 범위에서만 수행해야 합니다.</p>
    <div className="explorer-preview tool-modal-body"><div className="explorer-preview-body cheatsheet-options-body diag-local-body">
      <label className="diag-local-label">허용 범위 <small>정확한 Origin 또는 Origin + 경로 접두사</small><textarea rows={4} value={scopeText} onChange={event => setScopeText(event.target.value)} placeholder={'https://app.example.com\nhttps://api.example.com/v1'}/></label>
      <label className="diag-har-upload"><Upload size={16}/><span>{filename || 'HAR 파일 선택 (최대 25MB)'}</span><input type="file" accept=".har,application/json,.json" onChange={onFile}/></label>
      {filename && <p className="diag-local-help">선택됨: {filename} · 파일은 서버로 전송하지 않습니다.</p>}
      {message && <p className="diag-local-message" role="status">{message}</p>}
      {errors.length > 0 && <ul className="diag-local-errors" role="alert">{errors.map((error, index) => <li key={index}>{error}</li>)}</ul>}
      <button className="btn btn-primary" type="button" onClick={analyze} disabled={!harText}>HAR 범위 분석</button>
      {message && <section className="diag-local-results" aria-live="polite"><h3>범위 밖 후보 {findings.length}건 <small>(제외 {ignored}건)</small></h3>{findings.length === 0 ? <p>기록된 요청·리다이렉트에서 허용 범위 밖 후보를 찾지 못했습니다. HAR에 기록되지 않은 이동까지 안전하다는 의미는 아닙니다.</p> : findings.map((finding, index) => <article className="diag-local-result" key={`${finding.kind}-${index}`}>
        <div><strong>{finding.kind === 'redirect' ? '범위 밖 리다이렉트' : '범위 밖 요청'}</strong><span>HTTP {finding.status || '상태 미기록'}</span></div>
        <p>{finding.reason}</p><code>{finding.requestUrl}</code>{finding.kind === 'redirect' && <><b className="diag-redirect-arrow">→</b><code>{finding.destination}</code></>}
      </article>)}</section>}
    </div></div>
  </PanelShell>
}
