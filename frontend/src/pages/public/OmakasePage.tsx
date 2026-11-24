import { Suspense, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Bot, Home, FileText, LayoutGrid, X } from 'lucide-react'
import { MarkdownBody } from '../../components/shared'
import { useAppState } from '../../context/AppState'
import { OMAKASE_TOPICS, type OmakaseFile } from '../../omakase-data'
import { useSeoMeta } from '../../lib/useSeoMeta'

type Tab = { fileId: string; title: string }
// 토픽 하나에 파일이 여러 개 있을 수 있어서, 파일별로 각자 스크롤 위치를 기억한다.
// updatedAt은 토픽을 다시 열었을 때 "가장 최근에 보던 파일"을 고르는 기준.
type FileProgress = { scrollFraction: number; updatedAt: number }
type TopicProgressMap = Record<string, FileProgress> // fileId -> 위치

const SCROLL_SAVE_DEBOUNCE_MS = 800
// 만료 없음 — localStorage는 브라우저가 지우지 않는 한 그대로 남는다. 로그인 사용자는 서버(기기 간
// 동기화)가 기준이고, 비로그인은 이 브라우저 안에서만 유지되는 로컬 기록으로 대체한다.
const LOCAL_PROGRESS_KEY = 'omakase-progress-v2'

function readLocalProgress(): Record<string, TopicProgressMap> {
  try {
    const raw = window.localStorage.getItem(LOCAL_PROGRESS_KEY)
    return raw ? JSON.parse(raw) as Record<string, TopicProgressMap> : {}
  } catch { return {} }
}

function writeLocalProgress(map: Record<string, TopicProgressMap>) {
  try { window.localStorage.setItem(LOCAL_PROGRESS_KEY, JSON.stringify(map)) } catch { /* 저장 공간 없음 등 — 무시 */ }
}

function lastActiveFileId(entries: TopicProgressMap | undefined): string | undefined {
  if (!entries) return undefined
  const sorted = Object.entries(entries).sort((a, b) => b[1].updatedAt - a[1].updatedAt)
  return sorted[0]?.[0]
}

export function OmakasePage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { session } = useAppState()
  const loggedIn = session?.user != null
  useSeoMeta({
    title: '오마카세 보안 학습 콘텐츠 | Orchestration Lab',
    description: '모의해킹과 보안 진단 실무를 주제별 문서로 학습하는 공개 콘텐츠 허브입니다.',
    canonical: `https://lab.khsqowp1.my${location.pathname}`,
  })

  const [activeTopicId, setActiveTopicId] = useState<string | null>(null)
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [content, setContent] = useState<Record<string, string>>({})
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [progressByTopic, setProgressByTopic] = useState<Record<string, TopicProgressMap>>({})

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
      .then((rows: { topicId: string; fileId: string; scrollFraction: number; updatedAt: string }[]) => {
        const map: Record<string, TopicProgressMap> = {}
        for (const r of rows) {
          (map[r.topicId] ??= {})[r.fileId] = { scrollFraction: r.scrollFraction, updatedAt: new Date(r.updatedAt).getTime() }
        }
        setProgressByTopic(map)
      })
      .catch(() => {})
  }, [loggedIn])

  function saveProgress(topicId: string, fileId: string, scrollFraction: number) {
    const updatedAt = Date.now()
    setProgressByTopic(prev => {
      const next = { ...prev, [topicId]: { ...prev[topicId], [fileId]: { scrollFraction, updatedAt } } }
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

  function backToGrid() {
    navigate('/omakase')
  }

  // 파일별로 각자 스크롤 위치를 기억하므로, 실제로 "다른 파일로 전환"할 때마다 그 파일의
  // 저장된 위치로 복원(없으면 맨 위 0으로)한다 -- 안 하면 이전 파일의 스크롤 위치가 새
  // 파일에도 그대로 남아있는 채 보임.
  function restoreOrResetScroll(topicId: string, fileId: string) {
    const saved = progressByTopic[topicId]?.[fileId]
    pendingScrollFractionRef.current = saved?.scrollFraction ?? 0
  }

  function switchTab(fileId: string) {
    if (!topic || activeTabId === fileId) return
    navigate(`/omakase/${topic.id}/${fileId}/`)
  }

  function openFile(topicId: string, file: OmakaseFile) {
    const switching = activeTabId !== file.id
    setTabs(prev => (prev.some(t => t.fileId === file.id) ? prev : [...prev, { fileId: file.id, title: file.title }]))
    setActiveTabId(file.id)
    setLoadError(null)
    if (switching) restoreOrResetScroll(topicId, file.id)
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
    const idx = tabs.findIndex(t => t.fileId === fileId)
    if (idx === -1) return
    const next = tabs.filter(t => t.fileId !== fileId)
    setTabs(next)
    if (next.length === 0) {
      // 마지막 탭을 닫으면 처음 화면(주제 선택 바둑판)으로 돌아간다.
      setActiveTopicId(null)
      setActiveTabId(null)
      setLoadError(null)
      navigate('/omakase')
      return
    }
    if (activeTabId !== fileId) return
    const nextFileId = next[Math.min(idx, next.length - 1)].fileId
    setActiveTabId(nextFileId)
    if (topic) {
      restoreOrResetScroll(topic.id, nextFileId)
      navigate(`/omakase/${topic.id}/${nextFileId}/`)
    }
  }

  // 주소창의 경로가 실제 화면 상태(선택된 토픽/파일)의 단일 진실 공급원이다. 토픽이 바뀌면 탭을
  // 비우고(이전 토픽에서 열어둔 탭이 새 토픽에 남아있으면 안 되므로), 같은 토픽 안에서 파일만
  // 바뀌는 경우에는 openFile이 기존 탭 목록에 "추가"하도록 그대로 둔다 — 그래야 사이드바에서 여러
  // 문서를 눌러도 탭이 누적되는 멀티탭 동작이 유지된다.
  useEffect(() => {
    const [, topicId, fileId] = location.pathname.split('/').filter(Boolean)
    if (!topicId) {
      setActiveTopicId(null)
      setTabs([])
      setActiveTabId(null)
      setLoadError(null)
      return
    }

    const nextTopic = OMAKASE_TOPICS.find(item => item.id === topicId)
    if (!nextTopic) { navigate('/omakase', { replace: true }); return }

    const topicChanged = activeTopicId !== nextTopic.id
    if (topicChanged) {
      setActiveTopicId(nextTopic.id)
      setTabs([])
      setActiveTabId(null)
      setLoadError(null)
    }

    if (!fileId) {
      // 토픽만 선택되고 파일이 없는 URL — 새로 들어온 토픽이면 마지막으로 보던 문서가 있는지
      // 찾아 그 문서의 실제 URL로 보낸다(이전 openTopic의 "이어보기" 동작).
      if (topicChanged) {
        const lastId = lastActiveFileId(progressByTopic[nextTopic.id])
        const lastFile = lastId ? nextTopic.files.find(f => f.id === lastId) : undefined
        if (lastFile) navigate(`/omakase/${nextTopic.id}/${lastFile.id}/`, { replace: true })
      }
      return
    }

    const nextFile = nextTopic.files.find(item => item.id === fileId)
    if (!nextFile) { navigate(`/omakase/${nextTopic.id}/`, { replace: true }); return }
    openFile(nextTopic.id, nextFile)
  }, [location.pathname])

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
                return <Link
                  key={file.id}
                  to={`/omakase/${topic.id}/${file.id}/`}
                  className={`omakase-file-row ${isOpen ? 'active' : ''}`}
                ><FileText size={14}/> <span>{file.title}</span></Link>
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
          onClick={() => switchTab(tab.fileId)}
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
            {OMAKASE_TOPICS.map(t => <Link
              key={t.id}
              to={`/omakase/${t.id}/`}
              className="omakase-card"
              style={{ '--omakase-accent': t.accent } as CSSProperties}
            >
              <div className="omakase-card-title">{t.title}</div>
              <div className="omakase-card-subtitle">{t.subtitle}</div>
              <div className="omakase-card-meta">{t.files.length}개 문서 · {t.sections.length}개 섹션</div>
            </Link>)}
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
