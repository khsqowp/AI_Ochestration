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
    <OfficeDashboard
      recentTasks={recentTasks} taskTracks={taskTracks} archivedCount={archivedCount}
      pendingCandidates={pendingCandidates} budgetExceeded={budgetExceeded} isAdmin={isAdmin}
      chatInput={chatInput} setChatInput={setChatInput} taskDomain={taskDomain} setTaskDomain={setTaskDomain}
      chatError={chatError} onSubmitTask={submitTask} onCancelTask={cancelTask} onOpenFile={openFileInExplorer}
      todos={{ items: todos.items, onAdd: todos.add, onToggle: todos.toggle }}
    />
    <ProgressSection/>
    <section id="dash-sources" className="dashboard-panel-section">
      <SourceRegistry embedded readOnly={!isAdmin} onTaskStarted={task => {
        setActiveTask(task); setTaskEvents([]); loadTasks()
        fetch(`/api/tasks/${task.id}/events`, { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setTaskEvents)
      }}/>
    </section>
    {isAdmin && <section className="dashboard-panel-section"><DigestModal embedded/></section>}
  </div>
}
