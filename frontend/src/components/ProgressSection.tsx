import { useAppState } from '../context/AppState'
import { ProcessBoard } from '../panels/ProcessBoard'
import { TimelineModal } from '../panels/TimelineModal'

/** 작업 진행표(현재 집중 작업 단계) + 전체 진행표(RUNNING/QUEUED 전부). 대시보드·노트 생성 양쪽에 노출. */
export function ProgressSection() {
  const { recentTasks, taskTracks, activeTask, taskEvents } = useAppState()
  const hasActive = activeTask && !['COMPLETED', 'FAILED', 'CANCELLED'].includes(activeTask.status)
  return <section id="dash-progress" className="progress-section">
    {hasActive && <TimelineModal task={activeTask} events={taskEvents} embedded/>}
    <ProcessBoard tasks={recentTasks} tracks={taskTracks} embedded/>
  </section>
}
