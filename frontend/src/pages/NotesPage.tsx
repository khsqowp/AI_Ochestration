import { useRef, useState, type CSSProperties } from 'react'
import { useLocation } from 'react-router-dom'
import { FileUp, X } from 'lucide-react'
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

    {view === 'files'
      ? <FileExplorer embedded onTaskStarted={onTaskStarted} onOpenGraph={() => setView('graph')} initialPath={initialPath} onInitialPathHandled={() => setInitialPath(undefined)}/>
      : <GraphView embedded onOpenFile={openFileInExplorer}/>}

    <section className="dashboard-panel-section"><ArchivePanel embedded tasks={recentTasks} onOpenExplorer={() => setView('files')} onRetried={loadTasks}/></section>

    {isAdmin && <section className="dashboard-panel-section"><AskArchiveModal embedded/></section>}

    <ProgressSection/>
    <AgentRoster/>

    <section className="dashboard-panel-section">
      <h3>노트 프롬프트 빌더</h3>
      <NotePromptBuilder/>
    </section>
  </div>
}
