import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { Plus, SearchCheck, Trash2, X } from 'lucide-react'
import { PanelShell } from '../components/shared'
import { useModalA11y } from '../hooks/useModalA11y'
import { hasSoft404Evidence, newObservation, soft404Similarity, type HttpObservation } from '../diag-local-tools'

type Props = { onClose?: () => void; embedded?: boolean }

function ObservationEditor({ title, rows, onChange, onAdd, onRemove }: {
  title: string; rows: HttpObservation[]; onChange: (id: string, key: keyof HttpObservation, value: string) => void
  onAdd: () => void; onRemove: (id: string) => void
}) {
  return <section className="diag-local-section">
    <header><h3>{title}</h3><button className="btn btn-secondary" type="button" onClick={onAdd}><Plus size={14}/>응답 추가</button></header>
    {rows.map((row, index) => <fieldset className="diag-observation" key={row.id}>
      <legend>{title} {index + 1}</legend>
      <button className="diag-icon-button" type="button" aria-label={`${title} ${index + 1} 제거`} onClick={() => onRemove(row.id)} disabled={rows.length === 1}><Trash2 size={14}/></button>
      <label>요청 URL<input value={row.url} onChange={event => onChange(row.id, 'url', event.target.value)} placeholder="https://target.example/not-found-abc"/></label>
      <div className="diag-local-inline-fields">
        <label>상태 코드<input inputMode="numeric" value={row.status} onChange={event => onChange(row.id, 'status', event.target.value)} placeholder="404"/></label>
        <label>Location 헤더 (없으면 비움)<input value={row.location} onChange={event => onChange(row.id, 'location', event.target.value)} placeholder="/login"/></label>
      </div>
      <label>응답 본문<textarea value={row.body} onChange={event => onChange(row.id, 'body', event.target.value)} rows={4} placeholder="응답 본문 일부를 붙여넣으세요. 민감정보는 먼저 제거하세요."/></label>
    </fieldset>)}
  </section>
}

export function Soft404AnalyzerModal({ onClose, embedded }: Props) {
  const modalRef = useModalA11y(!embedded, onClose ?? (() => {}))
  const [baseline, setBaseline] = useState<HttpObservation[]>([newObservation()])
  const [candidates, setCandidates] = useState<HttpObservation[]>([newObservation()])
  const [ran, setRan] = useState(false)
  const update = (setter: Dispatch<SetStateAction<HttpObservation[]>>) => (id: string, key: keyof HttpObservation, value: string) => setter(rows => rows.map(row => row.id === id ? { ...row, [key]: value } : row))
  const results = useMemo(() => candidates.map(candidate => {
    const closest = baseline.map(sample => ({ sample, score: soft404Similarity(sample, candidate) })).sort((a, b) => b.score - a.score)[0]
    return { candidate, closest, enoughEvidence: hasSoft404Evidence(closest.sample, candidate), likelySoft404: closest.score >= 0.78 && hasSoft404Evidence(closest.sample, candidate) }
  }), [baseline, candidates])

  return <PanelShell embedded={embedded} className="file-explorer tool-modal diag-modal diag-local-tool" modalRef={modalRef}>
    <div className="sheet-header"><div><p className="eyebrow">진단 · 응답 해석</p><h2><SearchCheck size={18} style={{ verticalAlign: '-3px', marginRight: 6 }}/>Soft-404 기준 응답 분석</h2></div>{onClose && <button className="sheet-close" onClick={onClose}><X size={18}/></button>}</div>
    <p className="diag-warning">HTTP 요청을 보내지 않습니다. 직접 수집한 응답을 브라우저 안에서 비교합니다. Soft-404 표시는 후보 신호이며 취약점 판정이 아닙니다. 붙여넣기 전에 쿠키·토큰·개인정보를 제거하세요.</p>
    <div className="explorer-preview tool-modal-body"><div className="explorer-preview-body cheatsheet-options-body diag-local-body">
      <p className="diag-local-help">존재하지 않는 경로의 응답을 기준으로 등록한 뒤, 확인하려는 후보 경로 응답을 비교하세요. 본문은 HTML 태그·공백과 일부 동적 UUID·날짜·긴 숫자를 정규화해 유사도를 계산합니다.</p>
      <ObservationEditor title="없는 경로 기준 응답" rows={baseline} onChange={update(setBaseline)} onAdd={() => setBaseline(rows => [...rows, newObservation()])} onRemove={id => setBaseline(rows => rows.filter(row => row.id !== id))}/>
      <ObservationEditor title="확인할 후보 응답" rows={candidates} onChange={update(setCandidates)} onAdd={() => setCandidates(rows => [...rows, newObservation()])} onRemove={id => setCandidates(rows => rows.filter(row => row.id !== id))}/>
      <button className="btn btn-primary" type="button" onClick={() => setRan(true)}>기준 응답과 비교</button>
      {ran && <section className="diag-local-results" aria-live="polite"><h3>비교 결과</h3>{results.map(({ candidate, closest, enoughEvidence, likelySoft404 }) => <article className="diag-local-result" key={candidate.id}>
        <div><strong>{!enoughEvidence ? '비교 근거 부족' : likelySoft404 ? 'Soft-404 유사 신호' : '기준 응답과 다른 응답'}</strong><span>{enoughEvidence ? `${Math.round(closest.score * 100)}% 유사` : '응답 본문·제목·Location을 추가하세요'} · 기준: {closest.sample.url || 'URL 미입력'}</span></div>
        <p>후보: {candidate.url || 'URL 미입력'} · 상태 코드 {candidate.status || '미입력'}</p>
        <small>응답 유사도만으로 경로의 존재 여부를 확정할 수 없습니다. 화면·기능과 계정별 접근 결과를 별도로 확인하세요.</small>
      </article>)}</section>}
    </div></div>
  </PanelShell>
}
