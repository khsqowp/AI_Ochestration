import { Suspense, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { Bot, Home, FileText, LayoutGrid, X } from 'lucide-react'
import { MarkdownBody } from '../../components/shared'
import { useAppState } from '../../context/AppState'
import { OMAKASE_TOPICS, type OmakaseFile, type OmakaseTopic } from '../../omakase-data'

type Tab = { fileId: string; title: string }
type TopicProgress = { fileId: string; scrollFraction: number }

const SCROLL_SAVE_DEBOUNCE_MS = 800
// 만료 없음 — localStorage는 브라우저가 지우지 않는 한 그대로 남는다. 로그인 사용자는 서버(기기 간
// 동기화)가 기준이고, 비로그인은 이 브라우저 안에서만 유지되는 로컬 기록으로 대체한다.
const LOCAL_PROGRESS_KEY = 'omakase-progress-v1'

function readLocalProgress(): Record<string, TopicProgress> {
  try {
    const raw = window.localStorage.getItem(LOCAL_PROGRESS_KEY)
    return raw ? JSON.parse(raw) as Record<string, TopicProgress> : {}
  } catch { return {} }
}

function writeLocalProgress(map: Record<string, TopicProgress>) {
  try { window.localStorage.setItem(LOCAL_PROGRESS_KEY, JSON.stringify(map)) } catch { /* 저장 공간 없음 등 — 무시 */ }
}

export function OmakasePage() {
  const { session } = useAppState()
  const loggedIn = session?.user != null

  const [activeTopicId, setActiveTopicId] = useState<string | null>(null)
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [content, setContent] = useState<Record<string, string>>({})
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [progressByTopic, setProgressByTopic] = useState<Record<string, TopicProgress>>({})

  const contentRef = useRef<HTMLDivElement | null>(null)
  const pendingScrollFractionRef = useRef<number | null>(null)
  const restoringScrollRef = useRef(false)
  const saveTimerRef = useRef<number | undefined>(undefined)

  const topic = OMAKASE_TOPICS.find(t => t.id === activeTopicId) ?? null
  const activeFile = topic?.files.find(f => f.id === activeTabId) ?? null

  // 토픽별 마지막 조회 위치를 한 번 받아온다 — 토픽 카드를 누를 때 바로 써야 하므로 그때 가서
  // 조회하지 않고 미리 전부 가져와 둔다. 로그인 사용자는 서버(기기 간 동기화), 비로그인은 이
  // 브라우저의 localStorage(만료 없음, 기기 로컬)로 기록을 남긴다.
  useEffect(() => {
    if (!loggedIn) { setProgressByTopic(readLocalProgress()); return }
    fetch('/api/omakase/progress', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : []))
      .then((rows: { topicId: string; fileId: string; scrollFraction: number }[]) => {
        setProgressByTopic(Object.fromEntries(rows.map(r => [r.topicId, { fileId: r.fileId, scrollFraction: r.scrollFraction }])))
      })
      .catch(() => {})
  }, [loggedIn])

  function saveProgress(topicId: string, fileId: string, scrollFraction: number) {
    setProgressByTopic(prev => {
      const next = { ...prev, [topicId]: { fileId, scrollFraction } }
      if (!loggedIn) writeLocalProgress(next)
      return next
    })
    if (!loggedIn) return
    fetch(`/api/omakase/progress/${topicId}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId, scrollFraction }),
    }).catch(() => {})
  }

  function handleContentScroll() {
    if (!topic || !activeFile || restoringScrollRef.current) return
    const el = contentRef.current
    if (!el) return
    const max = el.scrollHeight - el.clientHeight
    const fraction = max > 0 ? el.scrollTop / max : 0
    window.clearTimeout(saveTimerRef.current)
    const topicId = topic.id
    const fileId = activeFile.id
    saveTimerRef.current = window.setTimeout(() => saveProgress(topicId, fileId, fraction), SCROLL_SAVE_DEBOUNCE_MS)
  }

  // 복원 대상 파일의 본문이 로드되고 나서야(비동기 fetch) 실제 스크롤 높이가 생기므로, 렌더 이후
  // 다음 프레임에 복원한다. restoringScrollRef로 감싸 이 강제 스크롤이 handleContentScroll으로
  // 다시 저장되는 걸 막는다.
  useEffect(() => {
    if (!activeFile) return
    const fraction = pendingScrollFractionRef.current
    if (fraction == null || content[activeFile.id] === undefined) return
    pendingScrollFractionRef.current = null
    requestAnimationFrame(() => {
      const el = contentRef.current
      if (!el) return
      restoringScrollRef.current = true
      el.scrollTop = fraction * Math.max(el.scrollHeight - el.clientHeight, 0)
      requestAnimationFrame(() => { restoringScrollRef.current = false })
    })
  }, [activeFile, content])

  function openTopic(next: OmakaseTopic) {
    setActiveTopicId(next.id)
    setTabs([])
    setActiveTabId(null)
    setLoadError(null)

    const saved = progressByTopic[next.id]
    const lastFile = saved ? next.files.find(f => f.id === saved.fileId) : undefined
    if (saved && lastFile) {
      pendingScrollFractionRef.current = saved.scrollFraction
      openFile(lastFile)
    }
  }

  function backToGrid() {
    setActiveTopicId(null)
    setTabs([])
    setActiveTabId(null)
    setLoadError(null)
  }

  function openFile(file: OmakaseFile) {
    setTabs(prev => (prev.some(t => t.fileId === file.id) ? prev : [...prev, { fileId: file.id, title: file.title }]))
    setActiveTabId(file.id)
    setLoadError(null)
    if (content[file.id] !== undefined || loadingId === file.id) return
    setLoadingId(file.id)
    fetch(file.path)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.text()
      })
      .then(text => setContent(prev => ({ ...prev, [file.id]: text })))
      .catch(e => setLoadError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoadingId(null))
  }

  function closeTab(fileId: string) {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.fileId === fileId)
      const next = prev.filter(t => t.fileId !== fileId)
      if (next.length === 0) {
        // 마지막 탭을 닫으면 처음 화면(주제 선택 바둑판)으로 돌아간다.
        setActiveTopicId(null)
        setActiveTabId(null)
      } else if (activeTabId === fileId) {
        setActiveTabId(next[Math.min(idx, next.length - 1)].fileId)
      }
      return next
    })
  }

  return <div className="omakase-page">
   <Link to="/" className="omakase-brand-mark" title="랜딩 페이지로"><Bot size={16}/> <span>Orchestration Lab</span></Link>
   <div className="omakase-corner-nav">
    <Link to="/" className="omakase-corner-btn" title="랜딩 페이지로"><Home size={18}/></Link>
    <button type="button" className="omakase-corner-btn" onClick={backToGrid} title="주제 선택으로"><LayoutGrid size={18}/></button>
   </div>
   <div className="omakase-body">
    <div className="omakase-activitybar"/>

    <div className="omakase-sidebar">
      <div className="omakase-sidebar-title">{topic ? '탐색기' : 'OMAKASE'}</div>
      {topic
        ? <div className="omakase-sidebar-body">
            <div className="omakase-sidebar-topic">{topic.title}</div>
            {topic.sections.map(section => <div key={section.title} className="omakase-section">
              <div className="omakase-section-title">{section.title}</div>
              {section.fileIds.map(fileId => {
                const file = topic.files.find(f => f.id === fileId)
                if (!file) return null
                const isOpen = activeTabId === file.id
                return <button
                  key={file.id}
                  type="button"
                  className={`omakase-file-row ${isOpen ? 'active' : ''}`}
                  onClick={() => openFile(file)}
                ><FileText size={14}/> <span>{file.title}</span></button>
              })}
            </div>)}
          </div>
        : <div className="omakase-sidebar-empty">주제를 선택하면<br/>문서 목록이 여기 표시됩니다.</div>}
    </div>

    <div className="omakase-main">
      {tabs.length > 0 && <div className="omakase-tabbar">
        {tabs.map(tab => <div
          key={tab.fileId}
          className={`omakase-tab ${activeTabId === tab.fileId ? 'active' : ''}`}
          onClick={() => setActiveTabId(tab.fileId)}
        >
          <FileText size={13}/>
          <span className="omakase-tab-title">{tab.title}</span>
          <button
            type="button"
            className="omakase-tab-close"
            onClick={e => { e.stopPropagation(); closeTab(tab.fileId) }}
            title="닫기"
          ><X size={13}/></button>
        </div>)}
      </div>}

      <div className="omakase-content" ref={contentRef} onScroll={handleContentScroll}>
        {!topic && <div className="omakase-grid">
          <h1 className="omakase-grid-heading">오마카세 — 오늘의 커리큘럼</h1>
          <p className="omakase-grid-sub">주제를 하나 고르면 왼쪽에 목차가 열립니다.</p>
          <div className="omakase-grid-cards">
            {OMAKASE_TOPICS.map(t => <button
              key={t.id}
              type="button"
              className="omakase-card"
              style={{ '--omakase-accent': t.accent } as CSSProperties}
              onClick={() => openTopic(t)}
            >
              <div className="omakase-card-title">{t.title}</div>
              <div className="omakase-card-subtitle">{t.subtitle}</div>
              <div className="omakase-card-meta">{t.files.length}개 문서 · {t.sections.length}개 섹션</div>
            </button>)}
          </div>
        </div>}

        {topic && !activeFile && <div className="omakase-welcome">
          <div className="omakase-welcome-title">{topic.title}</div>
          <p className="omakase-welcome-sub">{topic.subtitle}</p>
          <p className="omakase-welcome-hint">왼쪽 탐색기에서 문서를 선택하세요.</p>
        </div>}

        {topic && activeFile && <div className="omakase-reader">
          {loadingId === activeFile.id && <div className="omakase-loading">불러오는 중…</div>}
          {loadError && loadingId !== activeFile.id && content[activeFile.id] === undefined &&
            <div className="omakase-error">문서를 불러오지 못했습니다: {loadError}</div>}
          {content[activeFile.id] !== undefined && <div className="omakase-markdown">
            <Suspense fallback={<div className="omakase-loading">렌더링 중…</div>}>
              <MarkdownBody>{content[activeFile.id]}</MarkdownBody>
            </Suspense>
          </div>}
        </div>}
      </div>
    </div>
   </div>

    <div className="omakase-statusbar">
      <span>{topic ? topic.title : 'OMAKASE'}</span>
      {activeFile && <span>{tabs.length}개 탭 열림</span>}
    </div>
  </div>
}
