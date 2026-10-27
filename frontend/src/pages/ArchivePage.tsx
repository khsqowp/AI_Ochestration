import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

type Job = {
  id: string; source: string; url: string; text: string; media_name: string; media_type: string
  status: string; created_at: string; title: string; category: string; summary: string
  cleaned_content: string; transcript: string; ocr_text: string; source_title: string
  extracted_caption: string; location_name: string; location_address: string
  analysis_error: string; tags: string[]
}
type ArchiveSource = { job_id: string; url: string; source: string; title: string; caption: string; summary: string; created_at: string }
type KnowledgeItem = { id: string; title: string; category: string; summary: string; content: string; language: string; created_at: string; source_count: number; thumbnail_job_id: string; tags: string[]; sources: ArchiveSource[]; cleaned_content: string; transcript: string; ocr_text: string; source_title: string; extracted_caption: string }
type Place = {
  id: string; name: string; address: string; category: string; latitude: number | null
  longitude: number | null; naver_map_url: string; created_at: string; source_count: number
  thumbnail_job_id: string; tags: string[]; geocode_status: string
  sources: { job_id: string; url: string; title: string; caption: string; summary: string }[]
}
type SectionState<T> = { items: T[]; loading: boolean; error: string }
type ArchiveKind = 'all' | 'recent' | 'information' | 'place'
const tunnelError = 'LinkCollect 연결 실패 — SSH 터널 상태를 확인하세요.'

const statusLabels: Record<string, string> = {
  received: '접수됨', processing: '분석 중', waiting_ai: '분석 대기', analyzed: '완료',
  download_failed: '다운로드 실패', analysis_failed: '분석 실패', media_failed: '미디어 처리 실패',
}
const categories = ['security', 'development', 'investment', 'fashion_beauty']
const categoryLabels: Record<string, string> = {
  security: '보안', development: '개발', investment: '투자', fashion_beauty: '패션·뷰티',
}
const searchable = (values: unknown[]) => values.filter((value): value is string => typeof value === 'string').join(' ').toLocaleLowerCase()
const formatDate = (value: string) => value ? new Date(value).toLocaleString() : '날짜 정보 없음'
const safeJobUrl = (value: string) => { try { const parsed = new URL(value); return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '' } catch { return '' } }

async function loadItems<T>(path: string): Promise<T[]> {
  const response = await fetch(path, { credentials: 'include' })
  if (response.status === 503) throw new Error(tunnelError)
  if (!response.ok) throw new Error(`요청 실패 (${response.status})`)
  const payload = await response.json() as Record<string, T[]>
  return Object.values(payload)[0] ?? []
}

export function ArchivePage() {
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<ArchiveKind>('all')
  const [category, setCategory] = useState('all')
  const [tagFilter, setTagFilter] = useState('all')
  const [status, setStatus] = useState('all')
  const [jobs, setJobs] = useState<SectionState<Job>>({ items: [], loading: true, error: '' })
  const [knowledge, setKnowledge] = useState<SectionState<KnowledgeItem>>({ items: [], loading: true, error: '' })
  const [places, setPlaces] = useState<SectionState<Place>>({ items: [], loading: true, error: '' })
  const [jobsExpanded, setJobsExpanded] = useState(false)

  const refresh = useCallback(() => {
    const request = <T,>(path: string, update: (state: SectionState<T> | ((current: SectionState<T>) => SectionState<T>)) => void) => {
      update(current => ({ ...current, loading: true, error: '' }))
      void loadItems<T>(path).then(items => update({ items, loading: false, error: '' }))
        .catch(error => update(current => ({ ...current, loading: false, error: error instanceof Error ? error.message : '불러오지 못했습니다.' })))
    }
    request('/api/linkcollect/jobs', setJobs)
    request('/api/linkcollect/knowledge', setKnowledge)
    request('/api/linkcollect/places', setPlaces)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const matchesTag = (tags: string[] = []) => tagFilter === 'all' || tags.includes(tagFilter)
  const selectedStatus = kind === 'recent' ? status : 'all'
  const filteredJobs = { ...jobs, items: jobs.items.filter(job =>
    (selectedStatus === 'all' || job.status === selectedStatus) && matchesTag(job.tags) && (!normalizedQuery || searchable([
      job.title, job.url, job.source_title, job.text, job.extracted_caption, job.summary,
      job.cleaned_content, job.transcript, job.ocr_text, job.location_name, job.location_address, ...(job.tags ?? []),
    ]).includes(normalizedQuery))) }
  const selectedCategory = kind === 'information' ? category : 'all'
  const filteredKnowledgeItems = knowledge.items.filter(item =>
    (selectedCategory === 'all' || categories.includes(selectedCategory) && item.category === selectedCategory) && matchesTag(item.tags) && (!normalizedQuery || searchable([
      item.title, item.category, item.summary, item.content, item.cleaned_content, item.transcript,
      item.ocr_text, item.source_title, item.extracted_caption, ...(item.tags ?? []),
    ]).includes(normalizedQuery)))
  const filteredPlaces = { ...places, items: places.items.filter(place =>
    (kind !== 'place' || selectedCategory === 'all' || selectedCategory === 'places') && matchesTag(place.tags) && (!normalizedQuery || searchable([
      place.name, place.category, place.address, ...(place.tags ?? []), ...(place.sources ?? []).flatMap(source => [source.title, source.caption, source.url]),
    ]).includes(normalizedQuery))) }
  const tagSource = kind === 'recent' ? jobs.items : kind === 'information' ? knowledge.items : kind === 'place' ? places.items : [...jobs.items, ...knowledge.items, ...places.items]
  const allTags = [...new Set(tagSource.flatMap(item => item.tags ?? []))].sort((a, b) => a.localeCompare(b, 'ko'))
  const matchCount = (kind === 'all' || kind === 'recent' ? filteredJobs.items.length : 0)
    + (kind === 'all' || kind === 'information' ? filteredKnowledgeItems.length : 0)
    + (kind === 'all' || kind === 'place' ? filteredPlaces.items.length : 0)
  const isLoading = jobs.loading || knowledge.loading || places.loading
  const hasError = Boolean(jobs.error || knowledge.error || places.error)
  const storedCount = jobs.items.length + knowledge.items.length + places.items.length
  const section = <T,>(title: string, state: SectionState<T>, render: (item: T) => ReactNode, keyOf: (item: T) => string, headerAction?: ReactNode) => {
    if (state.loading && state.items.length === 0) return null
    if (!state.loading && !state.error && state.items.length === 0) return null
    return <section className="archive-section">
      <div className="archive-heading"><div className="archive-heading-title"><h2>{title}</h2><span>{state.items.length}건</span>{headerAction}</div></div>
      {state.error && <div className="archive-error"><p>{state.error}</p><button type="button" onClick={refresh}>다시 시도</button></div>}
      {state.loading && state.items.length === 0 ? <p className="empty-state">불러오는 중…</p>
        : <div className="archive-grid">{state.items.map(item => <Link className="archive-card" key={keyOf(item)} to={`/dashboard/archive/${encodeURIComponent(keyOf(item))}`}>{render(item)}</Link>)}</div>}
    </section>
  }

  const renderJobItem = (job: Job) => {
    const combinedSummary = [job.summary, job.cleaned_content].filter(Boolean).join('\n\n')
    const safeUrl = job.url ? safeJobUrl(job.url) : ''
    return <>
      <div className="archive-job-row">
        <h3 className="archive-card-title-clamp archive-job-title">{job.title || '제목 없음'}</h3>
      </div>
      {jobsExpanded && <div className="archive-job-expanded">
        <div className="archive-detail-meta"><span>{statusLabels[job.status] ?? job.status}</span>{job.created_at && <time>{formatDate(job.created_at)}</time>}</div>
        {!!job.tags?.length && <div className="archive-tags" aria-label="태그">{job.tags.map((tag, index) => <span className="archive-tag" key={`${tag}-${index}`}>#{tag}</span>)}</div>}
        {safeUrl && <a className="archive-link" href={safeUrl} target="_blank" rel="noopener noreferrer" onClick={event => event.stopPropagation()}>원문 열기 ↗</a>}
        {job.media_name && <p className="archive-detail-meta archive-media-name">미디어 파일 · {job.media_name}</p>}
        {combinedSummary && <section className="archive-detail-section archive-content-section"><h4>요약 및 정리된 내용</h4><p className="archive-content">{combinedSummary}</p></section>}
        {job.transcript && <section className="archive-detail-section archive-transcript-section"><h4>음성 전사</h4><p className="archive-content">{job.transcript}</p></section>}
        {job.ocr_text && <section className="archive-detail-section archive-content-section"><h4>영상 OCR 텍스트</h4><p className="archive-content">{job.ocr_text}</p></section>}
        {job.extracted_caption && <section className="archive-detail-section archive-content-section"><h4>원문 캡션</h4><p className="archive-content">{job.extracted_caption}</p></section>}
        {job.source_title && <p className="archive-detail-meta archive-source-title">출처 제목 · {job.source_title}</p>}
        {(job.location_name || job.location_address) && <p className="archive-detail-field"><strong>위치 정보</strong>{[job.location_name, job.location_address].filter(Boolean).join(' · ')}</p>}
        {job.analysis_error && <div className="archive-detail-note"><strong>분석 오류 기록</strong><p>{job.analysis_error}</p></div>}
      </div>}
    </>
  }

  const knowledgeSection = (sectionCategory: string) => ({ ...knowledge, items: filteredKnowledgeItems.filter(item => item.category === sectionCategory) })
  const renderKnowledgeItem = (item: KnowledgeItem) => <>
    <h3 className="archive-card-title-clamp">{item.title}</h3>
    {!!item.category || item.tags?.length ? <div className="archive-tags" aria-label="분류와 태그">
      {!!item.category && <span className="archive-tag">#{categoryLabels[item.category] ?? item.category}</span>}
      {item.tags?.map((tag, index) => <span className="archive-tag" key={`${tag}-${index}`}>#{tag}</span>)}
    </div> : null}
  </>

  return <main className="archive-page">
    <header className="archive-page-header"><div><p className="eyebrow">LINKCOLLECT</p><h1>아카이브</h1><p>정보와 장소 자료를 유형별로 찾아봅니다.</p></div><button type="button" onClick={refresh}>새로고침</button></header>
    <section className="archive-toolbar" aria-label="아카이브 검색 및 필터">
      <label className="archive-search"><span>검색</span><input type="search" placeholder="제목, 본문, 주소, 출처 검색" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <label><span>유형</span><select value={kind} onChange={event => { const value = event.target.value as ArchiveKind; setKind(value); setTagFilter('all'); if (value !== 'recent') setStatus('all'); if (value !== 'information' && value !== 'place' || value === 'information' && category === 'places' || value === 'place' && categories.includes(category)) setCategory('all') }}><option value="all">전체</option><option value="recent">최근 접수</option><option value="information">정보 아카이브</option><option value="place">장소 아카이브</option></select></label>
      {(kind === 'information' || kind === 'place') && <label><span>분류</span><select value={category} onChange={event => setCategory(event.target.value)}><option value="all">전체 분류</option>{kind === 'information' ? categories.map(value => <option value={value} key={value}>{categoryLabels[value]}</option>) : <option value="places">장소</option>}</select></label>}
      <label><span>태그</span><select value={tagFilter} onChange={event => setTagFilter(event.target.value)}><option value="all">전체 태그</option>{allTags.map(tag => <option key={tag} value={tag}>#{tag}</option>)}</select></label>
      {kind === 'recent' && <label><span>접수 상태</span><select value={status} onChange={event => setStatus(event.target.value)}><option value="all">전체 상태</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
      {(query || kind !== 'all' || category !== 'all' || tagFilter !== 'all' || status !== 'all') && <button className="archive-clear-filters" type="button" onClick={() => { setQuery(''); setKind('all'); setCategory('all'); setTagFilter('all'); setStatus('all') }}>필터 초기화</button>}
    </section>
    <p className="archive-result-count" role="status" aria-live="polite">{isLoading ? `자료를 불러오는 중${matchCount ? ` · 현재 ${matchCount}건 표시` : '…'}` : hasError ? `일부 자료만 표시 중 · 확인된 ${matchCount}건` : `검색 결과 ${matchCount}건`}</p>
    {matchCount === 0 && !isLoading && !hasError && <div className="archive-no-results"><p>{storedCount === 0 ? '아직 저장된 자료가 없습니다. Telegram 봇이나 입력 화면에서 링크를 보내세요.' : '조건에 맞는 자료가 없습니다.'}</p><button type="button" onClick={storedCount === 0 ? refresh : () => { setQuery(''); setKind('all'); setCategory('all'); setTagFilter('all'); setStatus('all') }}>{storedCount === 0 ? '새로고침' : '검색 조건 지우기'}</button></div>}
    {(kind === 'all' || kind === 'recent') && section('최근 접수', filteredJobs, renderJobItem, job => job.id, <button
      type="button"
      className={`archive-caret-button${jobsExpanded ? ' archive-caret-button--open' : ''}`}
      aria-expanded={jobsExpanded}
      aria-label={jobsExpanded ? '세부 내용 접기' : '세부 내용 펼치기'}
      onClick={() => setJobsExpanded(expanded => !expanded)}
    ><span aria-hidden="true" className="archive-caret-icon">▾</span></button>)}
    {(kind === 'all' || kind === 'information') && section('보안', knowledgeSection('security'), renderKnowledgeItem, item => item.id)}
    {(kind === 'all' || kind === 'information') && section('개발', knowledgeSection('development'), renderKnowledgeItem, item => item.id)}
    {(kind === 'all' || kind === 'information') && section('투자', knowledgeSection('investment'), renderKnowledgeItem, item => item.id)}
    {(kind === 'all' || kind === 'information') && section('패션·뷰티', knowledgeSection('fashion_beauty'), renderKnowledgeItem, item => item.id)}
    {(kind === 'all' || kind === 'place') && section('장소 아카이브', filteredPlaces, place => <>
      <h3 className="archive-card-title-clamp">{place.name}</h3>
      <div className="archive-tags" aria-label="장소 태그">{[place.category, ...(place.tags ?? [])].filter(Boolean).map((tag, index) => <span className="archive-tag" key={`${tag}-${index}`}>#{tag}</span>)}</div>
    </>, place => place.id)}
    {/* Keep unknown categories visible instead of silently losing their data. */}
    {(kind === 'all' || kind === 'information') && section('기타', { ...knowledge, items: filteredKnowledgeItems.filter(item => !categories.includes(item.category)) }, renderKnowledgeItem, item => item.id)}
  </main>
}
