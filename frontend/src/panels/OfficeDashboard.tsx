import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Archive, CalendarDays, Globe2, Landmark, LayoutDashboard, ScrollText, Square, TrendingUp } from 'lucide-react'
import type {
  ArchiveFile, MomentumRotationState, SecurityCalendarTimelineEntry, StockRotationState,
  Task, TaskDomain, TaskEvent, TodoListProps, UsageSummary,
} from '../lib/types'
import { CALENDAR_CATEGORY_LABEL, DASHBOARD_STAGES, archiveTaskLabel, displayTitle, domainLabel } from '../lib/util'
import { TodoDashboardCard } from '../components/Todo'
import { DashboardSidebarChat } from './DashboardSidebarChat'

/** 사무실에서 화면을 켜놓고 지켜보는 용도의 정적 현황판 — 숫자·바로가기 위주로 훑어볼 수 있게 구성한다. */
export function OfficeDashboard({ recentTasks, taskTracks, archivedCount, pendingCandidates, budgetExceeded, isAdmin, chatInput, setChatInput, taskDomain, setTaskDomain, chatError, onSubmitTask, onCancelTask, onOpenFile, todos }: {
  recentTasks: Task[]; taskTracks: Record<string, TaskEvent[]>; archivedCount: number; pendingCandidates: number; budgetExceeded: boolean; isAdmin: boolean
  chatInput: string; setChatInput: (value: string) => void
  taskDomain: TaskDomain; setTaskDomain: (value: TaskDomain) => void
  chatError: string; onSubmitTask: (event: FormEvent) => void; onCancelTask: (id: string) => void; onOpenFile: (path: string) => void
  todos: TodoListProps
}) {
  const navigate = useNavigate()
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [krTrading, setKrTrading] = useState<StockRotationState | null>(null)
  const [usTrading, setUsTrading] = useState<StockRotationState | null>(null)
  const [momentumTrading, setMomentumTrading] = useState<MomentumRotationState | null>(null)
  const [calendarCount, setCalendarCount] = useState<number | null>(null)
  const [archiveFiles, setArchiveFiles] = useState<ArchiveFile[]>([])
  const [calendarTimeline, setCalendarTimeline] = useState<SecurityCalendarTimelineEntry[]>([])
  useEffect(() => {
    const load = () => {
      if (document.hidden) return
      if (isAdmin) {
        fetch('/api/usage/summary?days=30', { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(setUsage).catch(() => undefined)
        fetch('/api/trading/rotation/kr/state', { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(setKrTrading).catch(() => undefined)
        fetch('/api/trading/rotation/us/state', { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(setUsTrading).catch(() => undefined)
        fetch('/api/trading/momentum-rotation/state', { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(setMomentumTrading).catch(() => undefined)
      }
      const now = new Date(); const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      fetch(`/api/security-calendar?month=${monthKey}`, { credentials: 'include' }).then(r => r.ok ? r.json() : []).then((items: unknown[]) => setCalendarCount(items.length)).catch(() => undefined)
      fetch('/api/archive/files', { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setArchiveFiles).catch(() => undefined)
      fetch('/api/security-calendar/timeline?limit=40', { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setCalendarTimeline).catch(() => undefined)
    }
    load()
    const timer = window.setInterval(load, 60000)
    return () => window.clearInterval(timer)
  }, [isAdmin])
  const running = recentTasks.filter(task => task.status === 'RUNNING' || task.status === 'QUEUED').length
  const recentFiles = archiveFiles.slice().sort((a, b) => {
    const dateCompare = (b.date ?? '').localeCompare(a.date ?? '')
    return dateCompare !== 0 ? dateCompare : b.modifiedAt.localeCompare(a.modifiedAt)
  }).slice(0, 12)
  const todayKey = new Date().toISOString().slice(0, 10)
  const recentIncidents = calendarTimeline.filter(item => item.event.category === 'INCIDENT').slice(0, 6)
  const upcomingEvents = calendarTimeline
    .filter(item => item.event.category !== 'INCIDENT' && item.event.eventDate >= todayKey)
    .sort((a, b) => a.event.eventDate.localeCompare(b.event.eventDate))
    .slice(0, 6)
  const activeTasksList = recentTasks.filter(task => task.status === 'RUNNING' || task.status === 'QUEUED')
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return <div className="office-dashboard">
    <DashboardSidebarChat recentTasks={recentTasks} taskTracks={taskTracks} chatInput={chatInput} setChatInput={setChatInput} taskDomain={taskDomain} setTaskDomain={setTaskDomain} chatError={chatError} onSubmitTask={onSubmitTask} onOpenFile={onOpenFile}/>
    <div className="dashboard-main">
      <div className="dashboard-grid">
        <button className="dashboard-tile" onClick={() => scrollTo('dash-progress')}><span className="dashboard-tile-icon"><LayoutDashboard size={19}/></span><b>{running}</b><span>진행 중인 작업</span></button>
        <button className="dashboard-tile" onClick={() => navigate('/dashboard/notes')}><span className="dashboard-tile-icon"><Archive size={19}/></span><b>{archivedCount}</b><span>파일 아카이브</span></button>
        <button className="dashboard-tile" onClick={() => scrollTo('dash-sources')}><span className="dashboard-tile-icon"><Globe2 size={19}/></span><b>{pendingCandidates}</b><span>수집 후보 대기</span></button>
        {isAdmin && <button className={`dashboard-tile ${budgetExceeded ? 'alert' : ''}`} onClick={() => navigate('/dashboard/admin/usage')}><span className="dashboard-tile-icon"><ScrollText size={19}/></span><b>${usage ? usage.monthToDateCostUsd.toFixed(2) : '-'}</b><span>{budgetExceeded ? '⚠ 이번 달 예산 초과' : '이번 달 사용 비용'}</span></button>}
        {isAdmin && (() => { const r = momentumTrading?.broker?.returnPct ?? 0; return <button className={`dashboard-tile ${momentumTrading?.halted ? 'tone-deprecated' : 'tone-live'}`} onClick={() => navigate('/dashboard/invest/coin')}><span className="dashboard-tile-icon"><TrendingUp size={19}/></span><b className={momentumTrading ? (r >= 0 ? 'dashboard-positive' : 'dashboard-negative') : ''}>{momentumTrading ? `${r >= 0 ? '+' : ''}${r.toFixed(2)}%` : '-'}</b><span>{momentumTrading?.halted ? '⚠ 코인 정지됨' : '코인 (실거래·2x)'}</span></button> })()}
        {isAdmin && (() => { const r = krTrading?.returnPct ?? 0; return <button className="dashboard-tile tone-live" onClick={() => navigate('/dashboard/invest/kr')}><span className="dashboard-tile-icon"><Landmark size={19}/></span><b className={krTrading ? (r >= 0 ? 'dashboard-positive' : 'dashboard-negative') : ''}>{krTrading ? `${r >= 0 ? '+' : ''}${r.toFixed(2)}%` : '-'}</b><span>국장 (모의)</span></button> })()}
        {isAdmin && (() => { const r = usTrading?.returnPct ?? 0; return <button className="dashboard-tile tone-live" onClick={() => navigate('/dashboard/invest/us')}><span className="dashboard-tile-icon"><Globe2 size={19}/></span><b className={usTrading ? (r >= 0 ? 'dashboard-positive' : 'dashboard-negative') : ''}>{usTrading ? `${r >= 0 ? '+' : ''}${r.toFixed(2)}%` : '-'}</b><span>미장 (모의)</span></button> })()}
        <button className="dashboard-tile" onClick={() => navigate('/dashboard/calendar')}><span className="dashboard-tile-icon"><CalendarDays size={19}/></span><b>{calendarCount ?? '-'}</b><span>이번 달 보안 일정</span></button>
      </div>
      {activeTasksList.length > 0 && <div className="dashboard-progress">
        {activeTasksList.map(task => {
          const stage = taskTracks[task.id]?.at(-1)?.stage
          const stageIndex = DASHBOARD_STAGES.findIndex(s => s.id === stage)
          return <div className="dashboard-progress-block" key={task.id}>
            <div className="dashboard-progress-head"><b>{archiveTaskLabel(task.title)}</b><button className="dashboard-progress-stop" onClick={() => onCancelTask(task.id)}><Square size={11}/> 중지</button></div>
            <div className="dashboard-progress-bar">
              {DASHBOARD_STAGES.map((s, index) => <div key={s.id} className={`dashboard-progress-seg ${index < stageIndex ? 'done' : ''} ${index === stageIndex ? 'current' : ''}`}><span/><small>{s.label}</small></div>)}
            </div>
          </div>
        })}
      </div>}
      <div className="dashboard-recent-split">
        <TodoDashboardCard {...todos}/>
        <div className="dashboard-calendar-widget">
          <div className="dashboard-calendar-half">
            <b>최근 피해사고</b>
            {recentIncidents.length === 0 ? <p className="empty-state">기록된 피해사고가 없습니다.</p> : <ul className="dashboard-calendar-list">
              {recentIncidents.map(item => <li key={item.event.id}><button onClick={() => navigate('/dashboard/calendar')}>
                <span className="dashboard-calendar-title">{item.event.title}</span>
                <span className="dashboard-calendar-meta">{item.event.lastUpdatedDate}{item.updates.length > 0 ? ` · 업데이트 ${item.updates.length}건` : ''}</span>
              </button></li>)}
            </ul>}
          </div>
          <div className="dashboard-calendar-half">
            <b>다가오는 행사·세미나</b>
            {upcomingEvents.length === 0 ? <p className="empty-state">예정된 행사·세미나가 없습니다.</p> : <ul className="dashboard-calendar-list">
              {upcomingEvents.map(item => <li key={item.event.id}><button onClick={() => navigate('/dashboard/calendar')}>
                <span className="dashboard-calendar-title">{item.event.title}</span>
                <span className="dashboard-calendar-meta">{item.event.eventDate} · {CALENDAR_CATEGORY_LABEL[item.event.category]}</span>
              </button></li>)}
            </ul>}
          </div>
        </div>
        <div className="dashboard-files">
          <b>최근 파일</b>
          {recentFiles.length === 0 ? <p className="empty-state">아직 파일이 없습니다.</p> : <ul className="dashboard-files-list">
            {recentFiles.map(file => <li key={file.path}><button onClick={() => onOpenFile(file.path)}>
              <span className="dashboard-file-title">{displayTitle(file)}</span>
              <span className="dashboard-file-meta">{domainLabel(file.domain)} · {file.date ?? '-'}</span>
            </button></li>)}
          </ul>}
        </div>
      </div>
    </div>
  </div>
}
