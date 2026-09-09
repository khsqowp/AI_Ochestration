import { useState } from 'react'
import { Archive, RotateCcw, X } from 'lucide-react'
import type { Task } from '../lib/types'
import { archiveTaskLabel } from '../lib/util'
import { PanelShell } from '../components/shared'

export function ArchivePanel({ tasks, onClose, onOpenExplorer, onRetried, embedded }: { tasks: Task[]; onClose?: () => void; onOpenExplorer: () => void; onRetried: () => void; embedded?: boolean }) {
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const retry = async (taskId: string) => { setRetryingId(taskId); await fetch(`/api/tasks/${taskId}/retry`, { method: 'POST', credentials: 'include' }); setRetryingId(null); onRetried() }
  return <PanelShell embedded={embedded} className="side-modal"><div className="sheet-header"><div><p className="eyebrow">KNOWLEDGE ARCHIVE</p><h2>작업 · 보관 기록</h2></div>{onClose && <button className="sheet-close" onClick={onClose}><X size={18}/></button>}</div><button className="source-add archive-explorer-button" onClick={onOpenExplorer}><Archive size={16}/> Markdown 파일 탐색기</button><div className="archive-list">{tasks.length ? tasks.map(task => <article key={task.id}><b>{archiveTaskLabel(task.title)}</b><span className={`task-state ${task.status.toLowerCase()}`}>{task.status}</span><small>{task.archivePath ? `obsidian/${task.archivePath}` : task.failureReason ?? '아카이브 대기 또는 실패'}</small>{task.status === 'FAILED' && <button className="secondary-button retry-button" onClick={() => retry(task.id)} disabled={retryingId === task.id}><RotateCcw size={14}/>{retryingId === task.id ? '재시도 중…' : '재시도'}</button>}</article>) : <p className="empty-state">아직 작업 기록이 없습니다.</p>}</div></PanelShell>
}
