import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

type Job = {
  id: string; source: string; url: string; text: string; media_name: string; media_type: string
  status: string; created_at: string; title: string; category: string; summary: string
  cleaned_content: string; transcript: string; ocr_text: string; source_title: string
  extracted_caption: string; location_name: string; location_address: string
  analysis_error: string; tags: string[]
}
type KnowledgeItem = { id: string; title: string; category: string; summary: string; content: string; language: string; created_at: string; source_count: number }
type Place = { id: string; name: string; address: string; category: string; latitude: number | null; longitude: number | null; naver_map_url: string; created_at: string; source_count: number }
type ArchiveItem = { kind: 'job'; item: Job } | { kind: 'knowledge'; item: KnowledgeItem } | { kind: 'place'; item: Place }
type DetailState = { loading: boolean; error: string; item: ArchiveItem | null }
const tunnelError = 'LinkCollect 연결 실패 — SSH 터널 상태를 확인하세요.'

async function loadItems<T>(path: string): Promise<T[]> {
  const response = await fetch(path, { credentials: 'include' })
  if (response.status === 503) throw new Error(tunnelError)
  if (!response.ok) throw new Error(`요청 실패 (${response.status})`)
  const payload = await response.json() as Record<string, T[]>
  return Object.values(payload)[0] ?? []
}

function formatDate(value: string) { return value ? new Date(value).toLocaleString() : '날짜 정보 없음' }

export function ArchiveDetailPage() {
  const { archiveId } = useParams<{ archiveId: string }>()
  const [state, setState] = useState<DetailState>({ loading: true, error: '', item: null })

  useEffect(() => {
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
  }, [archiveId])

  const item = state.item
  return <main className="archive-page">
    <header className="archive-page-header"><div><p className="eyebrow">LINKCOLLECT</p><h1>아카이브 상세</h1></div><Link className="archive-back" to="/dashboard/archive">아카이브 목록으로</Link></header>
    {state.loading ? <p className="empty-state">불러오는 중…</p>
      : state.error ? <p className="archive-error">{state.error}</p>
        : !item ? <p className="empty-state">항목을 찾을 수 없습니다.</p>
          : item.kind === 'job' ? <section className="archive-detail">
            <h2>{item.item.title || item.item.url || '제목 없음'}</h2>
            <div className="archive-detail-meta"><span>{item.item.status}</span><time>{formatDate(item.item.created_at)}</time></div>
            {!!item.item.tags?.length && <div className="archive-tags">{item.item.tags.map((tag, index) => <span className="archive-tag" key={`${tag}-${index}`}>{tag}</span>)}</div>}
            {item.item.url && <a className="archive-link" href={item.item.url} target="_blank" rel="noreferrer">{item.item.url}</a>}
            {item.item.media_name && <p className="archive-detail-field"><strong>미디어</strong>{item.item.media_name}</p>}
            {([['요약', item.item.summary], ['정리된 내용', item.item.cleaned_content], ['텍스트', item.item.text], ['음성 기록', item.item.transcript], ['OCR 텍스트', item.item.ocr_text], ['출처 제목', item.item.source_title], ['추출 캡션', item.item.extracted_caption]] as [string, string][]).map(([label, value]) => value && <div className="archive-detail-field" key={label}><h3>{label}</h3><p className="archive-content">{value}</p></div>)}
            {item.item.analysis_error && <div className="archive-detail-note"><strong>분석 오류 기록</strong><p>{item.item.analysis_error}</p></div>}
          </section> : item.kind === 'knowledge' ? <section className="archive-detail">
            <h2>{item.item.title}</h2>
            {!!item.item.category && <div className="archive-tags"><span className="archive-tag">{item.item.category}</span></div>}
            <div className="archive-detail-meta"><time>{formatDate(item.item.created_at)}</time><span>출처 {item.item.source_count}개</span></div>
            {item.item.content && <div className="archive-detail-field"><h3>내용</h3><p className="archive-content">{item.item.content}</p></div>}
            {item.item.summary && <div className="archive-detail-field"><h3>요약</h3><p className="archive-content">{item.item.summary}</p></div>}
            {item.item.language && <p className="archive-detail-field"><strong>언어</strong>{item.item.language}</p>}
          </section> : <section className="archive-detail">
            <h2>{item.item.name}</h2>
            {!!item.item.category && <div className="archive-tags"><span className="archive-tag">{item.item.category}</span></div>}
            <div className="archive-detail-meta"><time>{formatDate(item.item.created_at)}</time><span>출처 {item.item.source_count}개</span></div>
            {item.item.address && <p className="archive-detail-field"><strong>주소</strong>{item.item.address}</p>}
            {item.item.latitude != null && item.item.longitude != null && <p className="archive-detail-field"><strong>좌표</strong>{item.item.latitude}, {item.item.longitude}</p>}
            {item.item.naver_map_url && <a className="archive-link" href={item.item.naver_map_url} target="_blank" rel="noreferrer">네이버 지도에서 보기</a>}
          </section>}
  </main>
}
