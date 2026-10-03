import { Suspense, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { Bot, Home, FileText, LayoutGrid, X } from 'lucide-react'
import { MarkdownBody } from '../../components/shared'
import { OMAKASE_TOPICS, type OmakaseFile, type OmakaseTopic } from '../../omakase-data'

type Tab = { fileId: string; title: string }

export function OmakasePage() {
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null)
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [content, setContent] = useState<Record<string, string>>({})
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const topic = OMAKASE_TOPICS.find(t => t.id === activeTopicId) ?? null
  const activeFile = topic?.files.find(f => f.id === activeTabId) ?? null

  function openTopic(next: OmakaseTopic) {
    setActiveTopicId(next.id)
    setTabs([])
    setActiveTabId(null)
    setLoadError(null)
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

      <div className="omakase-content">
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
