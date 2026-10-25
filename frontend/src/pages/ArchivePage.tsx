import { useCallback, useEffect, useState, type ReactNode } from 'react'

type Job = {
  id: string; url: string; title: string; summary: string; cleaned_content: string
  tags: string[]; status: string; created_at: string; media_name: string
}
type KnowledgeItem = { id: string; title: string; category: string; summary: string; source_count: number }
type Place = {
  id: string; name: string; address: string; category: string; latitude: number | null
  longitude: number | null; naver_map_url: string; source_count: number
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
          : <div className="archive-grid">{state.items.map(item => <article className="archive-card" key={keyOf(item)}>{render(item)}</article>)}</div>}
  </section>

  return <main className="archive-page">
    <header className="archive-page-header"><div><p className="eyebrow">LINKCOLLECT</p><h1>아카이브</h1><p>외부 LinkCollect에 저장된 자료를 읽기 전용으로 조회합니다.</p></div><button type="button" onClick={refresh}>새로고침</button></header>
    {section('최근 접수', jobs, job => <>
      <div className="archive-card-meta"><span>{job.status}</span><time>{job.created_at ? new Date(job.created_at).toLocaleString() : ''}</time></div>
      <h3>{job.title || job.url || '제목 없음'}</h3>
      {job.url && <a className="archive-link" href={job.url} target="_blank" rel="noreferrer">{job.url}</a>}
      {job.summary && <p>{job.summary}</p>}{job.cleaned_content && <p className="archive-content">{job.cleaned_content}</p>}
      {job.media_name && <small>미디어: {job.media_name}</small>}
      {!!job.tags?.length && <div className="archive-tags">{job.tags.map(tag => <span className="archive-tag" key={tag}>#{tag}</span>)}</div>}
    </>, job => job.id)}
    {section('정보성 아카이브', knowledge, item => <>
      <div className="archive-card-meta"><span>{item.category}</span><span>출처 {item.source_count}개</span></div>
      <h3>{item.title}</h3>{item.summary && <p>{item.summary}</p>}
    </>, item => item.id)}
    {section('장소 아카이브', places, place => <>
      <div className="archive-card-meta"><span>{place.category}</span><span>출처 {place.source_count}개</span></div>
      <h3>{place.name}</h3>{place.address && <p>{place.address}</p>}
      {place.latitude !== null && place.latitude !== undefined && place.longitude !== null && place.longitude !== undefined && <small>{place.latitude}, {place.longitude}</small>}
      {place.naver_map_url && <a className="archive-link" href={place.naver_map_url} target="_blank" rel="noreferrer">네이버 지도에서 보기</a>}
    </>, place => place.id)}
  </main>
}
