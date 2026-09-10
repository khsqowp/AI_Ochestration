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
  return <div className="page dashboard-page">
    <section className="zone zone-office">
      <OfficeDashboard
        recentTasks={recentTasks} taskTracks={taskTracks} archivedCount={archivedCount}
        pendingCandidates={pendingCandidates} budgetExceeded={budgetExceeded} isAdmin={isAdmin}
        chatInput={chatInput} setChatInput={setChatInput} taskDomain={taskDomain} setTaskDomain={setTaskDomain}
        chatError={chatError} onSubmitTask={submitTask} onCancelTask={cancelTask} onOpenFile={openFileInExplorer}
        todos={{ items: todos.items, onAdd: todos.add, onToggle: todos.toggle }}
      />
    </section>
    <div className="zone-row">
      <section className="zone zone-panel zone-scroll"><ProgressSection/></section>
      <section id="dash-sources" className="zone zone-panel zone-scroll">
        <SourceRegistry embedded readOnly={!isAdmin} onTaskStarted={task => {
          setActiveTask(task); setTaskEvents([]); loadTasks()
          fetch(`/api/tasks/${task.id}/events`, { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setTaskEvents)
        }}/>
      </section>
      {isAdmin && <section className="zone zone-panel zone-scroll"><DigestModal embedded/></section>}
    </div>
  </div>
}
