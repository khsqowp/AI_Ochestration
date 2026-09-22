import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { useAppState } from '../context/AppState'
import { OfficeDashboard } from '../panels/OfficeDashboard'
import { SourceRegistry } from '../panels/SourceRegistry'
import { DigestModal } from '../panels/DigestModal'
import { ProgressSection } from '../components/ProgressSection'

export function DashboardPage() {
  const {
    recentTasks, taskTracks, archivedCount, pendingCandidates, budgetExceeded, isAdmin,
    chatInput, setChatInput, taskDomain, setTaskDomain, chatError, submitTask, cancelTask,
    openFileInExplorer, setActiveTask, setTaskEvents, loadTasks, todos,
  } = useAppState()

  const onSourceTask = (task: import('../lib/types').Task) => {
    setActiveTask(task); setTaskEvents([]); loadTasks()
    fetch(`/api/tasks/${task.id}/events`, { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setTaskEvents)
  }

  return <div className="page dashboard-page">
    <PanelGroup direction="vertical" autoSaveId="dash:rows" className="zone-split">
      <Panel id="office" order={1} defaultSize={52} minSize={22} className="zone zone-office">
        <OfficeDashboard
          recentTasks={recentTasks} taskTracks={taskTracks} archivedCount={archivedCount}
          pendingCandidates={pendingCandidates} budgetExceeded={budgetExceeded} isAdmin={isAdmin}
          chatInput={chatInput} setChatInput={setChatInput} taskDomain={taskDomain} setTaskDomain={setTaskDomain}
          chatError={chatError} onSubmitTask={submitTask} onCancelTask={cancelTask} onOpenFile={openFileInExplorer}
          todos={{ items: todos.items, onAdd: todos.add, onToggle: todos.toggle }}
        />
      </Panel>
      <PanelResizeHandle className="rz-bar"><span className="rz-grip"/></PanelResizeHandle>
      <Panel id="bottom" order={2} minSize={18}>
        <PanelGroup direction="horizontal" autoSaveId="dash:cols" className="zone-split">
          <Panel id="progress" order={1} defaultSize={isAdmin ? 38 : 100} minSize={16} className="zone zone-panel zone-scroll">
            <ProgressSection/>
          </Panel>
          {isAdmin && <>
            <PanelResizeHandle className="rz-bar"><span className="rz-grip"/></PanelResizeHandle>
            <Panel id="sources" order={2} defaultSize={33} minSize={16} className="zone zone-panel zone-scroll">
              <div id="dash-sources">
                <SourceRegistry embedded readOnly={false} onTaskStarted={onSourceTask}/>
              </div>
            </Panel>
            <PanelResizeHandle className="rz-bar"><span className="rz-grip"/></PanelResizeHandle>
            <Panel id="digest" order={3} defaultSize={29} minSize={16} className="zone zone-panel zone-scroll">
              <DigestModal embedded/>
            </Panel>
          </>}
        </PanelGroup>
      </Panel>
    </PanelGroup>
  </div>
}
