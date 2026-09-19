import { useState } from 'react'
import { Archive, RotateCcw, X } from 'lucide-react'
import type { Task } from '../lib/types'
import { archiveTaskLabel } from '../lib/util'
import { PanelShell } from '../components/shared'

export function ArchivePanel({ tasks, onClose, onOpenExplorer, onRetried, embedded }: { tasks: Task[]; onClose?: () => void; onOpenExplorer: () => void; onRetried: () => void; embedded?: boolean }) {
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [retryingAll, setRetryingAll] = useState(false)
  const retry = async (taskId: string) => { setRetryingId(taskId); await fetch(`/api/tasks/${taskId}/retry`, { method: 'POST', credentials: 'include' }); setRetryingId(null); onRetried() }
  const failed = tasks.filter(task => task.status === 'FAILED')
  // 순차 실행 + 간격 — 실패 건이 한꺼번에 몰려 있을 때(예: 야간 배치 전량 실패) 동시에 다 쏘면 Gemini
  // API 레이트리밋(429)에 걸리기 쉬워서 하나씩, 살짝 텀을 두고 돌린다.
  const retryAll = async () => {
    setRetryingAll(true)
    for (const task of failed) {
      setRetryingId(task.id)
      await fetch(`/api/tasks/${task.id}/retry`, { method: 'POST', credentials: 'include' })
      await new Promise(resolve => setTimeout(resolve, 800))
    }
    setRetryingId(null)
    setRetryingAll(false)
    onRetried()
  }
  return <PanelShell embedded={embedded} className="side-modal"><div className="sheet-header"><div><p className="eyebrow">KNOWLEDGE ARCHIVE</p><h2>작업 · 보관 기록</h2></div>{onClose && <button className="sheet-close" onClick={onClose}><X size={18}/></button>}</div><div className="archive-toolbar"><button className="source-add archive-explorer-button" onClick={onOpenExplorer}><Archive size={16}/> Markdown 파일 탐색기</button>{failed.length > 1 && <button className="secondary-button retry-button" onClick={retryAll} disabled={retryingAll}><RotateCcw size={14}/>{retryingAll ? `재시도 중… (${failed.findIndex(t => t.id === retryingId) + 1}/${failed.length})` : `전체 재시도 (${failed.length})`}</button>}</div><div className="archive-list">{tasks.length ? tasks.map(task => <article key={task.id}><b>{archiveTaskLabel(task.title)}</b><span className={`task-state ${task.status.toLowerCase()}`}>{task.status}</span><small>{task.archivePath ? `obsidian/${task.archivePath}` : task.failureReason ?? '아카이브 대기 또는 실패'}</small>{task.status === 'FAILED' && <button className="secondary-button retry-button" onClick={() => retry(task.id)} disabled={retryingId === task.id || retryingAll}><RotateCcw size={14}/>{retryingId === task.id ? '재시도 중…' : '재시도'}</button>}</article>) : <p className="empty-state">아직 작업 기록이 없습니다.</p>}</div></PanelShell>
}
