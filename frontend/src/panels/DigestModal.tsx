import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { DigestResult } from '../lib/types'
import { archiveTaskLabel } from '../lib/util'
import { PanelShell } from '../components/shared'

export function DigestModal({ onClose, embedded }: { onClose?: () => void; embedded?: boolean }) {
  const [period, setPeriod] = useState<'DAILY' | 'WEEKLY'>('DAILY')
  const [data, setData] = useState<DigestResult | null>(null)
  const [dispatching, setDispatching] = useState(false)
  const [notice, setNotice] = useState('')
  useEffect(() => { setData(null); setNotice(''); fetch(`/api/digest?period=${period}`, { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(setData) }, [period])
  const dispatch = async () => { setDispatching(true); setNotice(''); const response = await fetch(`/api/digest/dispatch?period=${period}`, { method: 'POST', credentials: 'include' }); setDispatching(false); setNotice(response.ok ? 'n8n으로 전달했습니다. 실제 발송 여부는 n8n 워크플로 설정에 달려 있습니다.' : '전달에 실패했습니다.') }
  const fmt = (value: string) => new Date(value).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  return <PanelShell embedded={embedded} className="side-modal"><div className="sheet-header"><div><p className="eyebrow">OWNER INSIGHTS</p><h2>작업 다이제스트</h2></div>{onClose && <button className="sheet-close" onClick={onClose}><X size={18}/></button>}</div>
    <div className="period-tabs">{(['DAILY', 'WEEKLY'] as const).map(value => <button className={period === value ? 'active' : ''} key={value} onClick={() => setPeriod(value)}>{value === 'DAILY' ? '일간' : '주간'}</button>)}</div>{data ? <>
    <div className="usage-total"><b>{data.total}건 처리</b><span>완료 {data.completed} · 실패 {data.failed}</span><small>{fmt(data.from)} ~ {fmt(data.to)}</small></div>
    <p className="usage-note">도메인별: {Object.entries(data.byDomain).map(([domain, count]) => `${domain} ${count}`).join(' · ') || '없음'}</p>
    {data.noContentSources.length > 0 && <p className="budget-alert">비활성화 고려: {data.noContentSources.map(source => `${source.name} (${source.consecutiveNoContentCycles}회 연속)`).join(' · ')}</p>}
    <button className="source-add" onClick={dispatch} disabled={dispatching}>{dispatching ? '전달 중…' : 'n8n으로 지금 보내기'}</button>
    {notice && <p className={notice.includes('실패') ? 'form-error' : 'form-notice'}>{notice}</p>}
    <div className="usage-table">
      <b>완료된 작업 ({data.completedTasks.length})</b>
      {data.completedTasks.length === 0 ? <p className="empty-state">이 기간에 완료된 작업이 없습니다.</p> : data.completedTasks.map(entry => <article key={entry.taskId}><b>{archiveTaskLabel(entry.title)}</b><span>{entry.domain}</span><small>{entry.detail ? `obsidian/${entry.detail}` : '보관 경로 없음'}</small></article>)}
    </div>
    <div className="usage-table">
      <b>실패한 작업 ({data.failedTasks.length})</b>
      {data.failedTasks.length === 0 ? <p className="empty-state">이 기간에 실패한 작업이 없습니다.</p> : data.failedTasks.map(entry => <article key={entry.taskId}><b>{archiveTaskLabel(entry.title)}</b><span>{entry.domain}</span><small>{entry.detail ?? '사유 미상'}</small></article>)}
    </div>
  </> : <p className="empty-state">다이제스트를 불러오는 중…</p>}</PanelShell>
}
