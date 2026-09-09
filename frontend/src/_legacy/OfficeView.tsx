/* 폐기된 "오피스(에이전트 사무실) 애니메이션 뷰" — 2026-09 재편에서 대시보드 타일 뷰로 일원화하며 라우트·토글에서 제거.
 * 어디서도 import 하지 않는다. 애니메이션 배치 로직(ParallelWorkflow / deliveryTarget / homePosition)만 보존한다.
 * 전체 사무실 바닥 JSX(<section className="office"> … 방/에이전트 배치)는 git 히스토리(App.tsx @ b4675bd) 참고. */
import type { CSSProperties } from 'react'
import type { Agent, Task, TaskEvent } from '../lib/types'
import { archiveTaskLabel } from '../lib/util'

export function ParallelWorkflow({ tasks, tracks }: { tasks: Task[]; tracks: Record<string, TaskEvent[]> }) {
  const visible = tasks.filter(task => task.status === 'RUNNING' || task.status === 'QUEUED').slice(0, 5)
  const color = (domain: Task['domain']) => domain === 'SECURITY' ? '#df805a' : domain === 'ECONOMY' ? '#4e94c7' : '#9b77d5'
  const route = (task: Task, stage: string) => {
    const scoutX = task.domain === 'SECURITY' ? 16 : task.domain === 'ECONOMY' ? 83 : 50
    const scoutY = task.domain === 'GENERAL' ? 47 : 62
    const leadX = task.domain === 'SECURITY' ? 23 : task.domain === 'ECONOMY' ? 76 : 50
    const leadY = task.domain === 'GENERAL' ? 67 : 42
    if (stage === 'COLLECT') return `M${scoutX} ${scoutY} L39 60`; if (stage === 'REVIEW_A') return 'M39 60 L61 60'; if (stage === 'REVIEW_B') return `M61 60 L${leadX} ${leadY}`; if (stage === 'TEAM_LEAD') return `M${leadX} ${leadY} L50 29`; if (stage === 'PM') return 'M50 29 L50 80'; return 'M50 80 L50 80'
  }
  const stagePosition = (task: Task, stage: string) => stage === 'COLLECT' ? { x: task.domain === 'SECURITY' ? 16 : task.domain === 'ECONOMY' ? 83 : 50, y: task.domain === 'GENERAL' ? 47 : 62 } : stage === 'REVIEW_A' ? { x: 39, y: 60 } : stage === 'REVIEW_B' ? { x: 61, y: 60 } : stage === 'TEAM_LEAD' ? { x: task.domain === 'SECURITY' ? 23 : task.domain === 'ECONOMY' ? 76 : 50, y: task.domain === 'GENERAL' ? 67 : 42 } : stage === 'PM' ? { x: 50, y: 29 } : { x: 50, y: 80 }
  return <div className="parallel-workflows">{visible.map((task, index) => { const stage = tracks[task.id]?.at(-1)?.stage ?? 'PM'; const position = stagePosition(task, stage); const hue = color(task.domain); return <div className={`parallel-track ${task.status.toLowerCase()}`} key={task.id} style={{ '--track-color': hue, '--track-offset': `${index * 5}px` } as CSSProperties}><svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d={route(task, stage)}/></svg><span className="track-dot" style={{ left: `${position.x}%`, top: `${position.y}%` }}/><p style={{ left: `${position.x}%`, top: `calc(${position.y}% + ${index * 23}px)` }}><b>{task.status === 'QUEUED' ? '대기열' : stage}</b>{archiveTaskLabel(task.title).slice(0, 24)}</p></div> })}</div>
}

export const homePosition = (agent: Agent) => ({ x: parseFloat(agent.left), y: parseFloat(agent.top) })

export const deliveryTarget = (agentId: string, domain: Task['domain']): { x: number; y: number } => {
  const lead = domain === 'ECONOMY' ? { x: 70, y: 48 } : domain === 'GENERAL' ? { x: 56, y: 73 } : { x: 29, y: 48 }
  switch (agentId) {
    case 'security-scout': case 'economy-scout': case 'general-scout': return { x: 33, y: 66 }
    case 'review-a': return { x: 67, y: 66 }
    case 'review-b': return lead
    case 'security-lead': case 'economy-lead': case 'general-lead': return { x: 50, y: 36 }
    case 'archivist': return { x: 50, y: 36 }
    default: return { x: 50, y: 36 }
  }
}
