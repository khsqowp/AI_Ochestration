import { X } from 'lucide-react'
import type { Task, TaskEvent } from '../lib/types'
import { archiveTaskLabel } from '../lib/util'
import { PanelShell } from '../components/shared'

export function ProcessBoard({ tasks, tracks, onClose, embedded }: { tasks: Task[]; tracks: Record<string, TaskEvent[]>; onClose?: () => void; embedded?: boolean }) {
  const stages = ['COLLECT', 'REVIEW_A', 'REVIEW_B', 'TEAM_LEAD', 'PM', 'ARCHIVE']
  const visible = tasks.filter(task => task.status === 'RUNNING' || task.status === 'QUEUED')
  return <PanelShell embedded={embedded} className="process-board"><div className="sheet-header"><div><p className="eyebrow">ALL PROCESSES</p><h2>전체 진행표</h2></div>{onClose && <button className="sheet-close" onClick={onClose}><X size={18}/></button>}</div>{visible.length ? <div className="process-list">{visible.map(task => { const events = tracks[task.id] ?? []; const current = events.at(-1)?.stage; const currentIndex = stages.indexOf(current ?? ''); return <article key={task.id}><header><b>{archiveTaskLabel(task.title)}</b><span className={task.status.toLowerCase()}>{task.status === 'QUEUED' ? '대기열' : '진행 중'}</span></header><p>{events.at(-1)?.message ?? 'PM이 작업을 접수했습니다.'}</p><div>{stages.map((stage, index) => <i className={index < currentIndex ? 'done' : stage === current && task.status === 'RUNNING' ? 'current' : ''} key={stage} title={stage}/>)}</div></article> })}</div> : <p className="empty-state">진행 중이거나 대기 중인 작업이 없습니다.</p>}</PanelShell>
}
