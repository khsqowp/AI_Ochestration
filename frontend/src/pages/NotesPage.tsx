import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from 'react-resizable-panels'
import { FileUp, Minus, Plus, X } from 'lucide-react'
import { useAppState } from '../context/AppState'
import { agents } from '../lib/util'
import type { Agent, Task } from '../lib/types'
import { PixelAgent, NotePromptBuilder } from '../components/shared'
import { ArchivePanel } from '../panels/ArchivePanel'
import { FileExplorer } from '../panels/FileExplorer'
import { GraphView } from '../panels/GraphView'
import { AskArchiveModal } from '../panels/AskArchiveModal'
import { ProgressSection } from '../components/ProgressSection'

function AgentRoster() {
  const [selected, setSelected] = useState<Agent | null>(null)
  return <section className="notes-agent-roster">
    <h3>에이전트 로스터</h3>
    <div className="agent-roster">{agents.map(agent => <button key={agent.id} onClick={() => setSelected(agent)}>
      <span style={{ background: `color-mix(in srgb, ${agent.color} 22%, white)` }}><PixelAgent id={agent.id} color={agent.color} size={20}/></span>
      <div><b>{agent.name}</b><small>{agent.role}</small></div>
    </button>)}</div>
    {selected && <aside className="agent-sheet">
      <button className="sheet-close" onClick={() => setSelected(null)}><X size={18}/></button>
      <span className="agent-avatar large" style={{ '--agent-color': selected.color } as CSSProperties}><PixelAgent id={selected.id} color={selected.color} size={38}/></span>
      <p className="eyebrow">{selected.role}</p><h2>{selected.name}</h2>
      <span className="status-pill">{selected.status}</span>
      <p className="sheet-message">“{selected.message}”</p>
      <div className="sheet-section"><b>지식베이스</b><p>업무와 관련된 근거 패킷과 노트를 우선 참고합니다.</p></div>
    </aside>}
  </section>
}

/** 세로 레일의 패널마다 -/+ 버튼을 얹어 접고 펼 수 있게 하는 래퍼. "아카이브에 질문하기"처럼 좁게
 * 받은 패널에 잠깐 여유를 몰아주고 싶을 때, 다른 패널을 완전히 닫는 대신 이 얇은 헤더 줄만 남기고
 * 접어서 그 공간을 형제 패널들에게 넘겨준다(react-resizable-panels가 자동으로 재분배). */
function RailSection({ title, id, order, defaultSize, minSize, className, children }: {
  title: string; id: string; order: number; defaultSize: number; minSize: number; className: string; children: ReactNode
}) {
  const ref = useRef<ImperativePanelHandle>(null)
  const [collapsed, setCollapsed] = useState(false)
  const toggle = () => { if (ref.current?.isCollapsed()) ref.current.expand(); else ref.current?.collapse() }
  return <Panel ref={ref} id={id} order={order} defaultSize={defaultSize} minSize={minSize} collapsible collapsedSize={7}
      onCollapse={() => setCollapsed(true)} onExpand={() => setCollapsed(false)}
      className={`${className} rail-section ${collapsed ? 'is-collapsed' : ''}`}>
    <div className="rail-section-head">
      <span>{title}</span>
      <button type="button" className="rail-section-toggle" onClick={toggle} title={collapsed ? '펼치기' : '접기'}>
        {collapsed ? <Plus size={13}/> : <Minus size={13}/>}
      </button>
    </div>
    <div className="rail-section-body">{children}</div>
  </Panel>
}

export function NotesPage() {
  const { isAdmin, uploading, upload, openFileInExplorer, setActiveTask, setTaskEvents, loadTasks, recentTasks } = useAppState()
  const location = useLocation() as { state?: { openFile?: string } }
  const [view, setView] = useState<'files' | 'graph'>('files')
  const [initialPath, setInitialPath] = useState<string | undefined>(location.state?.openFile)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const onTaskStarted = (task: Task) => {
    setActiveTask(task); setTaskEvents([]); loadTasks()
    fetch(`/api/tasks/${task.id}/events`, { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setTaskEvents)
  }

  return <div className="page notes-page">
    <div className="notes-header">
      <h2>노트 생성</h2>
      <div className="notes-actions">
        <input ref={fileInputRef} type="file" multiple hidden accept=".txt,.md,.pdf,.docx,.xlsx,.pptx,.hwp,image/png,image/jpeg,image/gif,image/webp,image/bmp" onChange={e => { upload(e.target.files); e.target.value = '' }}/>
        <button className="source-add" onClick={() => fileInputRef.current?.click()} disabled={uploading}><FileUp size={16}/>{uploading ? '업로드 중…' : '파일 추가'}</button>
        <button className={view === 'files' ? 'source-add' : 'source-cancel'} onClick={() => setView('files')}>파일 탐색기</button>
        <button className={view === 'graph' ? 'source-add' : 'source-cancel'} onClick={() => setView('graph')}>연결 그래프</button>
      </div>
    </div>

    <PanelGroup direction="horizontal" autoSaveId="notes:main" className="zone-split notes-split">
      <Panel id="explorer" order={1} defaultSize={62} minSize={30} className="zone zone-explorer">
        {view === 'files'
          ? <FileExplorer embedded onTaskStarted={onTaskStarted} onOpenGraph={() => setView('graph')} initialPath={initialPath} onInitialPathHandled={() => setInitialPath(undefined)}/>
          : <GraphView embedded onOpenFile={openFileInExplorer}/>}
      </Panel>
      <PanelResizeHandle className="rz-bar"><span className="rz-grip"/></PanelResizeHandle>
      <Panel id="rail" order={2} minSize={22}>
        <PanelGroup direction="vertical" autoSaveId="notes:rail" className="zone-split">
          <RailSection id="archive" order={1} defaultSize={30} minSize={12} title="작업 · 보관 기록" className="zone zone-panel zone-scroll">
            <ArchivePanel embedded tasks={recentTasks} onOpenExplorer={() => setView('files')} onRetried={loadTasks}/>
          </RailSection>
          {isAdmin && <>
            <PanelResizeHandle className="rz-bar"><span className="rz-grip"/></PanelResizeHandle>
            <RailSection id="ask" order={2} defaultSize={22} minSize={12} title="아카이브에 질문하기" className="zone zone-panel zone-scroll">
              <AskArchiveModal embedded/>
            </RailSection>
          </>}
          <PanelResizeHandle className="rz-bar"><span className="rz-grip"/></PanelResizeHandle>
          <RailSection id="progress" order={3} defaultSize={26} minSize={12} title="전체 진행표" className="zone zone-panel zone-scroll">
            <ProgressSection/>
          </RailSection>
          <PanelResizeHandle className="rz-bar"><span className="rz-grip"/></PanelResizeHandle>
          <RailSection id="misc" order={4} defaultSize={22} minSize={12} title="에이전트 · 프롬프트 빌더" className="zone zone-scroll">
            <AgentRoster/>
            <section className="zone-panel notes-prompt-zone">
              <h3>노트 프롬프트 빌더</h3>
              <NotePromptBuilder/>
            </section>
          </RailSection>
        </PanelGroup>
      </Panel>
    </PanelGroup>
  </div>
}
