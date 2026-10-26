import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

type Job = {
  id: string; source: string; url: string; text: string; media_name: string; media_type: string
  status: string; created_at: string; title: string; category: string; summary: string
  cleaned_content: string; transcript: string; ocr_text: string; source_title: string
  extracted_caption: string; location_name: string; location_address: string
  analysis_error: string; tags: string[]
}
type ArchiveSource = { job_id: string; url: string; source: string; title: string; caption: string; summary: string; created_at: string }
type KnowledgeItem = {
  id: string; title: string; category: string; summary: string; content: string; language: string
  created_at: string; source_count: number
  cleaned_content: string; transcript: string; ocr_text: string; source_title: string; extracted_caption: string
  tags: string[]; sources: ArchiveSource[]
}
type Place = { id: string; name: string; address: string; category: string; latitude: number | null; longitude: number | null; naver_map_url: string; created_at: string; source_count: number; tags: string[]; geocode_status: string; sources: ArchiveSource[] }
type ArchiveItem = { kind: 'job'; item: Job } | { kind: 'knowledge'; item: KnowledgeItem } | { kind: 'place'; item: Place }
type DetailState = { loading: boolean; error: string; item: ArchiveItem | null }
type ReclassifyState = { status: 'idle' | 'pending' | 'success' | 'error'; message: string }
type RegeocodeState = { status: 'idle' | 'pending' | 'success' | 'error'; message: string }
const tunnelError = 'LinkCollect 연결 실패 — SSH 터널 상태를 확인하세요.'
const categoryLabels: Record<string, string> = { security: '보안', development: '개발', investment: '투자', fashion_beauty: '패션·뷰티' }

async function reclassify(kind: 'knowledge' | 'place', id: string, target: 'place' | 'information') {
  const response = await fetch('/api/linkcollect/archive/reclassify', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, id, target }),
  })
  if (!response.ok) throw new Error(`재분류 요청 실패 (${response.status})`)
}

async function loadItems<T>(path: string): Promise<T[]> {
  const response = await fetch(path, { credentials: 'include' })
  if (response.status === 503) throw new Error(tunnelError)
  if (!response.ok) throw new Error(`요청 실패 (${response.status})`)
  const payload = await response.json() as Record<string, T[]>
  return Object.values(payload)[0] ?? []
}

function formatDate(value: string) { return value ? new Date(value).toLocaleString() : '날짜 정보 없음' }
function mergeContent(...values: (string | null | undefined)[]) {
  return [...new Set(values.map(value => value?.trim()).filter((value): value is string => Boolean(value)))]
    .join('\n\n')
}
function safeExternalUrl(value: string) {
  try { const parsed = new URL(value); return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '' }
  catch { return '' }
}
function ArchiveSources({ sources }: { sources?: ArchiveSource[] }) {
  if (!sources?.length) return <p className="archive-detail-note">연결된 원본 출처 정보가 없습니다.</p>
  return <div className="archive-source-list">{sources.map((source, index) => <article className="archive-source" key={source.job_id || `${source.url}-${index}`}>
    <div className="archive-detail-meta"><span>{source.source}</span>{source.created_at && <time>{formatDate(source.created_at)}</time>}</div>
    <h3>{source.title || '원본 자료'}</h3>
    {mergeContent(source.caption, source.summary) && <p className="archive-content">{mergeContent(source.caption, source.summary)}</p>}
    {safeExternalUrl(source.url) && <a className="archive-link" href={safeExternalUrl(source.url)} target="_blank" rel="noopener noreferrer">원문 열기 ↗</a>}
  </article>)}</div>
}

export function ArchiveDetailPage() {
  const { archiveId } = useParams<{ archiveId: string }>()
  const [state, setState] = useState<DetailState>({ loading: true, error: '', item: null })
  const [reclassifyState, setReclassifyState] = useState<ReclassifyState>({ status: 'idle', message: '' })
  const [regeocodeState, setRegeocodeState] = useState<RegeocodeState>({ status: 'idle', message: '' })
  const [addressDraft, setAddressDraft] = useState<string | null>(null)
  const [reloadVersion, setReloadVersion] = useState(0)
  const regeocodeRequest = useRef(0)
  const regeocodeLocked = useRef(false)
  const currentArchiveId = useRef(archiveId)
  currentArchiveId.current = archiveId

  const submitReclassification = async (kind: 'knowledge' | 'place', id: string, target: 'place' | 'information') => {
    setReclassifyState({ status: 'pending', message: '' })
    try {
      await reclassify(kind, id, target)
      setReclassifyState({ status: 'success', message: '재분류 요청됨. 최근 접수에서 다시 처리됩니다.' })
    } catch (error) {
      setReclassifyState({ status: 'error', message: error instanceof Error ? error.message : '재분류 요청 실패' })
    }
  }

  useEffect(() => {
    setAddressDraft(null)
    regeocodeRequest.current += 1
    regeocodeLocked.current = false
    setRegeocodeState({ status: 'idle', message: '' })
    let active = true
    setState({ loading: true, error: '', item: null })
    Promise.allSettled([
      loadItems<Job>('/api/linkcollect/jobs'),
      loadItems<KnowledgeItem>('/api/linkcollect/knowledge'),
      loadItems<Place>('/api/linkcollect/places'),
    ]).then(results => {
      if (!active) return
      const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      if (failures.length) {
        const reason = failures.find(result => result.reason instanceof Error && result.reason.message === tunnelError)?.reason ?? failures[0].reason
        setState({ loading: false, error: reason instanceof Error ? reason.message : '불러오지 못했습니다.', item: null })
        return
      }
      const [jobs, knowledge, places] = results.map(result => result.status === 'fulfilled' ? result.value : []) as [Job[], KnowledgeItem[], Place[]]
      const job = jobs.find(item => item.id === archiveId)
      const knowledgeItem = knowledge.find(item => item.id === archiveId)
      const place = places.find(item => item.id === archiveId)
      const item: ArchiveItem | null = job ? { kind: 'job', item: job } : knowledgeItem ? { kind: 'knowledge', item: knowledgeItem } : place ? { kind: 'place', item: place } : null
      setState({ loading: false, error: '', item })
    })
    return () => { active = false }
  }, [archiveId, reloadVersion])

  const submitRegeocode = async (place: Place) => {
    const address = (addressDraft ?? place.address).trim()
    if (!address) { setRegeocodeState({ status: 'error', message: '주소를 입력하세요.' }); return }
    if (regeocodeLocked.current || regeocodeState.status === 'pending' || regeocodeState.status === 'success') return
    regeocodeLocked.current = true
    const requestId = ++regeocodeRequest.current
    setRegeocodeState({ status: 'pending', message: '' })
    try {
      const response = await fetch(`/api/linkcollect/places/${encodeURIComponent(place.id)}/regeocode`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address }),
      })
      const payload = await response.json().catch(() => ({})) as { error?: string }
      if (response.status === 409) throw new Error('같은 이름과 주소의 장소가 이미 있습니다. 중복 항목을 확인하세요.')
      if (!response.ok) throw new Error(payload.error ?? `좌표 재검색 요청 실패 (${response.status})`)
      if (requestId !== regeocodeRequest.current || currentArchiveId.current !== archiveId) return
      setRegeocodeState({ status: 'success', message: '주소를 저장하고 좌표 재검색을 요청했습니다. 잠시 후 상태를 새로고침하세요.' })
      setState(current => current.item?.kind === 'place' && current.item.item.id === place.id ? { ...current, item: { kind: 'place', item: { ...current.item.item, address, latitude: null, longitude: null, geocode_status: 'pending' } } } : current)
    } catch (error) {
      if (requestId !== regeocodeRequest.current || currentArchiveId.current !== archiveId) return
      regeocodeLocked.current = false
      setRegeocodeState({ status: 'error', message: error instanceof Error ? error.message : '좌표 재검색 요청 실패' })
    }
  }

  const item = state.item
  return <main className="archive-page">
    <header className="archive-page-header"><div><p className="eyebrow">LINKCOLLECT</p><h1>아카이브 상세</h1></div><Link className="archive-back" to="/dashboard/archive">아카이브 목록으로</Link></header>
    {state.loading ? <p className="empty-state" role="status">불러오는 중…</p>
      : state.error ? <p className="archive-error" role="alert">{state.error}</p>
        : !item ? <p className="empty-state">항목을 찾을 수 없습니다.</p>
          : item.kind === 'job' ? <section className="archive-detail">
            <h2>{item.item.title || '제목 없음'}</h2>
            <div className="archive-detail-meta"><span>{item.item.status}</span><time>{formatDate(item.item.created_at)}</time></div>
            {!!item.item.tags?.length && <div className="archive-tags">{item.item.tags.map((tag, index) => <span className="archive-tag" key={`${tag}-${index}`}>{tag}</span>)}</div>}
            {safeExternalUrl(item.item.url) && <a className="archive-link" href={safeExternalUrl(item.item.url)} target="_blank" rel="noopener noreferrer">원문 열기 ↗</a>}
            {item.item.media_name && <p className="archive-detail-field"><strong>미디어</strong>{item.item.media_name}</p>}
            {mergeContent(item.item.summary, item.item.cleaned_content) && <div className="archive-detail-field"><h3>요약 및 정리</h3><p className="archive-content">{mergeContent(item.item.summary, item.item.cleaned_content)}</p></div>}
            {item.item.transcript && <div className="archive-detail-field"><h3>STT</h3><p className="archive-content">{item.item.transcript}</p></div>}
            {([['출처 제목', item.item.source_title], ['추출 캡션', item.item.extracted_caption]] as [string, string][]).map(([label, value]) => value && <div className="archive-detail-field" key={label}><h3>{label}</h3><p className="archive-content">{value}</p></div>)}
            {item.item.analysis_error && <div className="archive-detail-note"><strong>분석 오류 기록</strong><p>{item.item.analysis_error}</p></div>}
          </section> : item.kind === 'knowledge' ? <section className="archive-detail">
            <div className="archive-reclassify">
              <button type="button" disabled={reclassifyState.status === 'pending'} onClick={() => void submitReclassification('knowledge', item.item.id, 'place')}>위치류로 재분류</button>
              <button type="button" disabled={reclassifyState.status === 'pending'} onClick={() => void submitReclassification('knowledge', item.item.id, 'information')}>정보류로 재분류</button>
            </div>
            {reclassifyState.message && <p className={`archive-reclassify-status${reclassifyState.status === 'error' ? ' archive-error' : ''}`} role={reclassifyState.status === 'error' ? 'alert' : 'status'}>{reclassifyState.message}</p>}
            {reclassifyState.status === 'success' && <Link className="archive-back" to="/dashboard/archive">아카이브 목록으로</Link>}
            <h2>{item.item.title}</h2>
            {!!item.item.category || item.item.tags?.length ? <div className="archive-tags">{[categoryLabels[item.item.category] ?? item.item.category, ...(item.item.tags ?? [])].filter(Boolean).map((tag, index) => <span className="archive-tag" key={`${tag}-${index}`}>#{tag}</span>)}</div> : null}
            <div className="archive-detail-meta"><time>{formatDate(item.item.created_at)}</time><span>출처 {item.item.source_count}개</span></div>
            {mergeContent(item.item.summary, item.item.cleaned_content, item.item.content) && <div className="archive-detail-field"><h3>요약 및 정리</h3><p className="archive-content">{mergeContent(item.item.summary, item.item.cleaned_content, item.item.content)}</p></div>}
            {item.item.transcript && <div className="archive-detail-field"><h3>STT</h3><p className="archive-content">{item.item.transcript}</p></div>}
            {([['출처 제목', item.item.source_title], ['추출 캡션', item.item.extracted_caption]] as [string, string][]).map(([label, value]) => value && <div className="archive-detail-field" key={label}><h3>{label}</h3><p className="archive-content">{value}</p></div>)}
            {item.item.language && <p className="archive-detail-field"><strong>언어</strong>{item.item.language}</p>}
            <div className="archive-detail-field"><h3>원본 출처</h3><ArchiveSources sources={item.item.sources} /></div>
          </section> : <section className="archive-detail">
            <div className="archive-reclassify">
              <button type="button" disabled={reclassifyState.status === 'pending'} onClick={() => void submitReclassification('place', item.item.id, 'place')}>위치류로 재분류</button>
              <button type="button" disabled={reclassifyState.status === 'pending'} onClick={() => void submitReclassification('place', item.item.id, 'information')}>정보류로 재분류</button>
            </div>
            {reclassifyState.message && <p className={`archive-reclassify-status${reclassifyState.status === 'error' ? ' archive-error' : ''}`} role={reclassifyState.status === 'error' ? 'alert' : 'status'}>{reclassifyState.message}</p>}
            {reclassifyState.status === 'success' && <Link className="archive-back" to="/dashboard/archive">아카이브 목록으로</Link>}
            <h2>{item.item.name}</h2>
            <div className="archive-tags">{[item.item.category, ...(item.item.tags ?? [])].filter(Boolean).map((tag, index) => <span className="archive-tag" key={`${tag}-${index}`}>#{tag}</span>)}</div>
            <div className="archive-detail-meta"><time>{formatDate(item.item.created_at)}</time><span>출처 {item.item.source_count}개</span></div>
            {item.item.address && <p className="archive-detail-field"><strong>주소</strong>{item.item.address}</p>}
            {item.item.latitude != null && item.item.longitude != null
              ? <div className="archive-map-location"><p className="archive-detail-field"><strong>좌표 확인됨</strong>{item.item.latitude}, {item.item.longitude}</p>
                {safeExternalUrl(item.item.naver_map_url) && <a className="archive-map-link" href={safeExternalUrl(item.item.naver_map_url)} target="_blank" rel="noopener noreferrer">네이버 지도에서 보기 ↗</a>}
              </div>
              : <div className="archive-location-pending" role="status"><strong>좌표 확인 필요</strong><span>{item.item.geocode_status === 'no_result' ? '검색된 지도 좌표가 없습니다. 주소를 확인한 뒤 다시 처리해야 합니다.' : '지도 좌표를 아직 확인하지 못했습니다.'}</span></div>}
            <form className="archive-regeocode" onSubmit={event => { event.preventDefault(); void submitRegeocode(item.item) }}>
              <label htmlFor="archive-place-address">주소 확인·수정</label>
              <p className="archive-regeocode-warning" id="archive-place-address-warning">{item.item.latitude != null && item.item.longitude != null ? '저장하면 현재 좌표를 지우고 새 주소로 다시 찾습니다.' : '저장하면 입력한 주소로 좌표를 다시 찾습니다.'}</p>
              <input id="archive-place-address" type="text" autoComplete="street-address" aria-describedby="archive-place-address-warning" maxLength={500} disabled={regeocodeState.status === 'pending' || regeocodeState.status === 'success'} value={addressDraft ?? item.item.address} onChange={event => setAddressDraft(event.target.value)} placeholder="도로명 주소 또는 매장 주소" />
              <button type="submit" disabled={regeocodeState.status === 'pending' || regeocodeState.status === 'success'}>{regeocodeState.status === 'pending' ? '요청 중…' : regeocodeState.status === 'success' ? '재검색 요청 완료' : '주소 저장 후 좌표 다시 찾기'}</button>
              {regeocodeState.message && <p className={`archive-regeocode-status${regeocodeState.status === 'error' ? ' archive-error' : ''}`} role={regeocodeState.status === 'error' ? 'alert' : 'status'}>{regeocodeState.message}</p>}
              {regeocodeState.status === 'success' && <button type="button" className="archive-refresh-place" onClick={() => { regeocodeLocked.current = false; setReloadVersion(value => value + 1) }}>좌표 상태 새로고침</button>}
            </form>
            <div className="archive-detail-field"><h3>원본 출처와 캡션</h3><ArchiveSources sources={item.item.sources} /></div>
          </section>}
  </main>
}
