import { useEffect, useState } from 'react'
import { Archive, FileText, FileUp, Layers, LockKeyhole, MessageCircle, TrendingUp, X } from 'lucide-react'
import type { ArchiveFile, FileCategory, MarkdownDoc, SortDirection, SortField, Task } from '../lib/types'
import { displayTitle, documentTitle, domainLabel, fileMatchesCategory, sortIndicator } from '../lib/util'
import { DocumentCard, PanelShell } from '../components/shared'

export function FileExplorer({ onClose, onTaskStarted, onOpenGraph, initialPath, onInitialPathHandled, embedded }: { onClose?: () => void; onTaskStarted: (task: Task) => void; onOpenGraph: () => void; initialPath?: string; onInitialPathHandled?: () => void; embedded?: boolean }) {
  const [files, setFiles] = useState<ArchiveFile[]>([]); const [selected, setSelected] = useState<MarkdownDoc | null>(null); const [error, setError] = useState(''); const [processing, setProcessing] = useState(false); const [query, setQuery] = useState(''); const [results, setResults] = useState<{ path: string; name: string; excerpt: string }[]>([])
  const [readPaths, setReadPaths] = useState<Set<string>>(() => { try { return new Set(JSON.parse(localStorage.getItem('archive-read-files') ?? '[]')) } catch { return new Set() } })
  const [sortField, setSortField] = useState<SortField>('date'); const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [category, setCategory] = useState<FileCategory>('all')
  const toggleSort = (field: SortField) => { if (field === sortField) { setSortDirection(direction => direction === 'asc' ? 'desc' : 'asc') } else { setSortField(field); setSortDirection(field === 'date' ? 'desc' : 'asc') } }
  const sortedFiles = files.filter(file => fileMatchesCategory(file, category)).sort((a, b) => {
    const sign = sortDirection === 'asc' ? 1 : -1
    if (sortField === 'title') return sign * displayTitle(a).localeCompare(displayTitle(b))
    if (sortField === 'domain') return sign * domainLabel(a.domain).localeCompare(domainLabel(b.domain))
    // date: is day-granularity only, so files touched the same day previously fell back to the backend's
    // alphabetical-by-path order — tie-break with the real modifiedAt instant so same-day files still land
    // in actual chronological order.
    const dateCompare = (a.date ?? '').localeCompare(b.date ?? '')
    return sign * (dateCompare !== 0 ? dateCompare : a.modifiedAt.localeCompare(b.modifiedAt))
  })
  useEffect(() => {
    const load = () => fetch('/api/archive/files', { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setFiles).catch(() => setError('파일 목록을 불러오지 못했습니다.'))
    load()
    // Polls quietly while the explorer stays open so a file created by a task that finishes (or a
    // collection/archive sweep) mid-session shows up without the user having to close and reopen the panel.
    const timer = window.setInterval(load, 5000)
    return () => window.clearInterval(timer)
  }, [])
  const openFile = async (file: Pick<ArchiveFile, 'path'>) => {
    const response = await fetch(`/api/archive/content?path=${encodeURIComponent(file.path)}`, { credentials: 'include' })
    if (!response.ok) { setError('Markdown 미리보기를 열지 못했습니다.'); return }
    setSelected(await response.json())
    setReadPaths(previous => {
      if (previous.has(file.path)) return previous
      const next = new Set(previous); next.add(file.path)
      localStorage.setItem('archive-read-files', JSON.stringify([...next]))
      return next
    })
  }
  // 대시보드의 "최근 파일" 목록에서 특정 파일을 클릭했을 때, 목록만 보여주고 끝나지 않도록 곧바로 그 파일을 열어준다.
  useEffect(() => { if (!initialPath) return; openFile({ path: initialPath }); onInitialPathHandled?.() }, [initialPath])
  useEffect(() => { if (query.trim().length < 2) { setResults([]); return } const timer = window.setTimeout(() => { fetch(`/api/archive/search?query=${encodeURIComponent(query)}`, { credentials: 'include' }).then(response => response.ok ? response.json() : []).then(setResults) }, 250); return () => window.clearTimeout(timer) }, [query])
  const reprocess = async () => { if (!selected) return; setProcessing(true); const response = await fetch('/api/tasks', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: `[재가공] ${documentTitle(selected)}`.slice(0, 160), domain: 'GENERAL', instruction: `아래 기존 Markdown 노트를 제2의 뇌용으로 재가공하세요. 핵심 요약, 중요도, 관련 개념, 기존 노트와의 연결 후보, 중복·오래된 정보, 필요한 경우 보강 조사 항목을 자연스러운 한국어 Markdown으로 정리하세요. 원본을 덮어쓰지 말고 새 연관 노트로 보관하세요.\n\n원본 경로: obsidian/${selected.path}\n\n원본 내용:\n${selected.body.slice(0, 4500)}` }) }); setProcessing(false); if (!response.ok) { setError('재가공 작업을 만들지 못했습니다.'); return } onTaskStarted(await response.json() as Task); onClose?.() }
  // 원본 노트가 짧아서 아쉬울 때 — 같은 요약을 반복하는 대신, 원본이 다루지 않은 다음 단계·더 깊은
  // 세부사항·실전 예시를 새 후속 노트로 이어 쓴다. 원본은 건드리지 않는다(reprocess 와 동일 원칙).
  const writeNext = async () => { if (!selected) return; setProcessing(true); const response = await fetch('/api/tasks', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: `[심화] ${documentTitle(selected)}`.slice(0, 160), domain: 'GENERAL', instruction: `아래 기존 Markdown 노트는 내용이 짧아 더 알고 싶은 부분이 남아있습니다. 같은 내용을 요약·반복하지 말고, 이 노트가 다루지 않은 다음 단계·더 깊은 세부사항·실전 예시·주의할 점을 이어서 다루는 후속 노트를 새로 작성하세요. 원본에서 이미 설명한 기초 개념은 전제로 삼고 반복 설명 없이 넘어가세요. 원본을 덮어쓰지 말고 새 연관 노트로 보관하세요.\n\n원본 경로: obsidian/${selected.path}\n\n원본 내용:\n${selected.body.slice(0, 4500)}` }) }); setProcessing(false); if (!response.ok) { setError('다음 노트 작업을 만들지 못했습니다.'); return } onTaskStarted(await response.json() as Task); onClose?.() }
  return <PanelShell embedded={embedded} className="file-explorer">
    <div className="sheet-header">
      <div><p className="eyebrow">OBSIDIAN ARCHIVE</p><h2>가공 파일 탐색기</h2></div>
      <div className="explorer-header-actions">
        <div className="explorer-category-filter">
          <button className={category === 'all' ? 'active' : ''} onClick={() => setCategory('all')}><Layers size={13}/>전체보기</button>
          <button className={category === 'economy' ? 'active' : ''} onClick={() => setCategory('economy')}><TrendingUp size={13}/>경제</button>
          <button className={category === 'security' ? 'active' : ''} onClick={() => setCategory('security')}><LockKeyhole size={13}/>보안</button>
          <button className={category === 'manual' ? 'active' : ''} onClick={() => setCategory('manual')}><MessageCircle size={13}/>질문</button>
          <button className={category === 'upload' ? 'active' : ''} onClick={() => setCategory('upload')}><FileUp size={13}/>업로드 파일</button>
        </div>
        {onClose && <button className="sheet-close" onClick={onClose}><X size={18}/></button>}
      </div>
    </div>
    <div className="explorer-toolbar"><label className="archive-search"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="파일명·본문 검색 (2글자 이상)"/></label><button className="graph-open-button" onClick={onOpenGraph}>연결 그래프 보기</button></div>
    {results.length > 0 && <div className="search-results">{results.map(result => <button key={result.path} onClick={() => openFile(result)}><b>{result.name}</b><small>{result.path} · {result.excerpt}</small></button>)}</div>}
    {error && <p className="form-error">{error}</p>}
    <div className="explorer-body">
      <nav className="explorer-sidebar file-table">{sortedFiles.length ? <>
        <div className="file-table-head file-table-head-sortable">
          <button onClick={() => toggleSort('title')}>제목{sortIndicator('title', sortField, sortDirection)}</button>
          <button onClick={() => toggleSort('domain')}>분류{sortIndicator('domain', sortField, sortDirection)}</button>
          <button onClick={() => toggleSort('date')}>날짜{sortIndicator('date', sortField, sortDirection)}</button>
        </div>
        {sortedFiles.map(file => <button key={file.path} className={`file-table-row ${selected?.path === file.path ? 'active' : ''} ${readPaths.has(file.path) ? 'is-read' : ''}`} onClick={() => openFile(file)}>
          <span className="file-table-name"><Archive size={14}/>{displayTitle(file)}</span>
          <span className="file-table-domain">{domainLabel(file.domain)}{file.topic ? ` · ${file.topic}` : ''}</span>
          <span className="file-table-date">{file.date ?? '-'}</span>
        </button>)}
      </> : <p className="empty-state">{files.length ? '이 분류에 해당하는 파일이 없습니다.' : '아직 가공된 Markdown 파일이 없습니다.'}</p>}</nav>
      <div className="explorer-preview">{selected ? <><div className="explorer-preview-header"><b>{documentTitle(selected)}</b><span><button className="reprocess-button" onClick={writeNext} disabled={processing}>{processing ? '요청 중…' : '다음 노트 작성'}</button><button className="reprocess-button" onClick={reprocess} disabled={processing}>{processing ? '요청 중…' : 'AI 재가공'}</button><button onClick={() => setSelected(null)}><X size={17}/></button></span></div><div className="explorer-preview-body"><DocumentCard doc={selected}/></div></> : <div className="explorer-empty"><FileText size={34}/><p>왼쪽에서 파일을 선택하면 여기에서 바로 읽을 수 있습니다.</p></div>}</div>
    </div>
  </PanelShell>
}
