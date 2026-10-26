import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

type Job = {
  id: string; source: string; url: string; text: string; media_name: string; media_type: string
  status: string; created_at: string; title: string; category: string; summary: string
  cleaned_content: string; transcript: string; ocr_text: string; source_title: string
  extracted_caption: string; location_name: string; location_address: string
  analysis_error: string; tags: string[]
}
type KnowledgeItem = { id: string; title: string; category: string; summary: string; content: string; language: string; created_at: string; source_count: number; thumbnail_job_id: string }
type Place = {
  id: string; name: string; address: string; category: string; latitude: number | null
  longitude: number | null; naver_map_url: string; created_at: string; source_count: number
  thumbnail_job_id: string
}
type SectionState<T> = { items: T[]; loading: boolean; error: string }
const tunnelError = 'LinkCollect 연결 실패 — SSH 터널 상태를 확인하세요.'

async function loadItems<T>(path: string): Promise<T[]> {
  const response = await fetch(path, { credentials: 'include' })
  if (response.status === 503) throw new Error(tunnelError)
  if (!response.ok) throw new Error(`요청 실패 (${response.status})`)
  const payload = await response.json() as Record<string, T[]>
  return Object.values(payload)[0] ?? []
}

export function ArchivePage() {
  const [jobs, setJobs] = useState<SectionState<Job>>({ items: [], loading: true, error: '' })
  const [knowledge, setKnowledge] = useState<SectionState<KnowledgeItem>>({ items: [], loading: true, error: '' })
  const [places, setPlaces] = useState<SectionState<Place>>({ items: [], loading: true, error: '' })

  const refresh = useCallback(() => {
    const request = <T,>(path: string, update: (state: SectionState<T>) => void) => {
      update({ items: [], loading: true, error: '' })
      void loadItems<T>(path).then(items => update({ items, loading: false, error: '' }))
        .catch(error => update({ items: [], loading: false, error: error instanceof Error ? error.message : '불러오지 못했습니다.' }))
    }
    request('/api/linkcollect/jobs', setJobs)
    request('/api/linkcollect/knowledge', setKnowledge)
    request('/api/linkcollect/places', setPlaces)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const section = <T,>(title: string, state: SectionState<T>, render: (item: T) => ReactNode, keyOf: (item: T) => string) => <section className="archive-section">
    <div className="archive-heading"><h2>{title}</h2><span>{state.items.length}건</span></div>
    {state.loading ? <p className="empty-state">불러오는 중…</p>
      : state.error ? <p className="archive-error">{state.error}</p>
        : state.items.length === 0 ? <p className="empty-state">등록된 항목이 없습니다.</p>
          : <div className="archive-grid">{state.items.map(item => <Link className="archive-card" key={keyOf(item)} to={`/dashboard/archive/${encodeURIComponent(keyOf(item))}`}>{render(item)}</Link>)}</div>}
  </section>

  const knowledgeSection = (category: string) => ({ ...knowledge, items: knowledge.items.filter(item => item.category === category) })
  const renderKnowledgeItem = (item: KnowledgeItem) => <>
    {item.thumbnail_job_id && <img className="archive-thumb" src={`/api/linkcollect/jobs/${encodeURIComponent(item.thumbnail_job_id)}/thumbnail`} alt="" loading="lazy" onError={e => { e.currentTarget.style.display = 'none' }}/>}
    <h3 className="archive-card-title-clamp">{item.title}</h3>
    {!!item.category && <div className="archive-tags"><span className="archive-tag">{item.category}</span></div>}
  </>

  return <main className="archive-page">
    <header className="archive-page-header"><div><p className="eyebrow">LINKCOLLECT</p><h1>아카이브</h1><p>외부 LinkCollect에 저장된 자료를 읽기 전용으로 조회합니다.</p></div><button type="button" onClick={refresh}>새로고침</button></header>
    {section('최근 접수', jobs, job => <>
      {['received', 'processing', 'waiting_ai'].includes(job.status) && <span className="archive-status-badge">작업중</span>}
      <h3 className="archive-card-title-clamp">{job.title || job.url || '제목 없음'}</h3>
    </>, job => job.id)}
    {section('보안', knowledgeSection('security'), renderKnowledgeItem, item => item.id)}
    {section('개발', knowledgeSection('development'), renderKnowledgeItem, item => item.id)}
    {section('투자', knowledgeSection('investment'), renderKnowledgeItem, item => item.id)}
    {section('패션뷰티', knowledgeSection('fashion_beauty'), renderKnowledgeItem, item => item.id)}
    {section('맛집놀거리등', places, place => <>
      {place.thumbnail_job_id && <img className="archive-thumb" src={`/api/linkcollect/jobs/${encodeURIComponent(place.thumbnail_job_id)}/thumbnail`} alt="" loading="lazy" onError={e => { e.currentTarget.style.display = 'none' }}/>}
      <h3 className="archive-card-title-clamp">{place.name}</h3>
      {!!place.category && <div className="archive-tags"><span className="archive-tag">{place.category}</span></div>}
    </>, place => place.id)}
    {/* Keep unknown categories visible instead of silently losing their data. */}
    {section('기타', { ...knowledge, items: knowledge.items.filter(item => !['security', 'development', 'investment', 'fashion_beauty'].includes(item.category)) }, renderKnowledgeItem, item => item.id)}
  </main>
}
