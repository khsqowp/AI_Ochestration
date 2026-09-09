import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { SecurityCalendarEntry, SecurityCalendarTimelineEntry } from '../lib/types'
import { CALENDAR_CATEGORY_LABEL } from '../lib/util'
import { PanelShell } from '../components/shared'

export function SecurityCalendarModal({ onClose, embedded }: { onClose?: () => void; embedded?: boolean }) {
  const [cursor, setCursor] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1) })
  const [entries, setEntries] = useState<SecurityCalendarEntry[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [timeline, setTimeline] = useState<SecurityCalendarTimelineEntry[]>([])
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const monthKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
  useEffect(() => {
    setSelectedDate(null)
    fetch(`/api/security-calendar?month=${monthKey}`, { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setEntries)
  }, [monthKey])
  useEffect(() => { fetch('/api/security-calendar/timeline', { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setTimeline) }, [])
  const toggleExpanded = (id: string) => setExpandedIds(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const byDate = entries.reduce<Record<string, SecurityCalendarEntry[]>>((acc, entry) => { (acc[entry.eventDate] ??= []).push(entry); return acc }, {})
  const firstWeekday = new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay()
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  const dayKey = (day: number) => `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const selectedEntries = selectedDate ? byDate[selectedDate] ?? [] : entries
  return <PanelShell embedded={embedded} className="side-modal calendar-modal">
    <div className="sheet-header"><div><p className="eyebrow">SECURITY OPS</p><h2>보안 캘린더</h2></div>{onClose && <button className="sheet-close" onClick={onClose}><X size={18}/></button>}</div>
    <p className="source-intro">수집된 사이트 원문에서 AI가 날짜가 명시된 행사·세미나·피해사고만 자동으로 골라 기록합니다.</p>
    <div className="calendar-legend"><span><i className="calendar-dot event"/> 행사</span><span><i className="calendar-dot seminar"/> 세미나</span><span><i className="calendar-dot incident"/> 피해사고</span></div>
    <div className="calendar-nav">
      <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft size={16}/></button>
      <b>{cursor.getFullYear()}년 {cursor.getMonth() + 1}월</b>
      <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight size={16}/></button>
    </div>
    <div className="calendar-grid">
      {['일', '월', '화', '수', '목', '금', '토'].map(label => <span className="calendar-weekday" key={label}>{label}</span>)}
      {cells.map((day, index) => {
        if (day === null) return <span className="calendar-cell empty" key={index}/>
        const key = dayKey(day)
        const dayEntries = byDate[key] ?? []
        return <button key={index} className={`calendar-cell ${selectedDate === key ? 'active' : ''}`} onClick={() => setSelectedDate(selectedDate === key ? null : key)}>
          <span>{day}</span>
          <span className="calendar-dots">{dayEntries.slice(0, 3).map(entry => <i key={entry.id} className={`calendar-dot ${entry.category.toLowerCase()}`}/>)}</span>
        </button>
      })}
    </div>
    <div className="usage-table calendar-entries">
      <b>{selectedDate ? `${selectedDate} 일정 (${selectedEntries.length})` : `이번 달 전체 (${entries.length})`}</b>
      {selectedEntries.length === 0 ? <p className="empty-state">기록된 일정이 없습니다.</p> : selectedEntries.map(entry => <article key={entry.id}>
        <span className={`calendar-badge ${entry.category.toLowerCase()}`}>{CALENDAR_CATEGORY_LABEL[entry.category]}</span>
        <b>{entry.title}</b>
        <span>{entry.eventDate}{entry.sourceName ? ` · ${entry.sourceName}` : ''}</span>
        <small>{entry.summary}</small>
      </article>)}
    </div>
    <div className="calendar-timeline">
      <b>최근 업데이트순 타임라인</b>
      <p className="source-intro small">후속 소식이 들어오면 원래 자리 대신 맨 위로 다시 올라옵니다.</p>
      {timeline.length === 0 ? <p className="empty-state">아직 기록된 사고·행사·세미나가 없습니다.</p> : timeline.map(item => {
        const expanded = expandedIds.has(item.event.id)
        const latest = item.updates.at(-1)
        return <article key={item.event.id} className="timeline-card">
          <div className="timeline-card-head">
            <span className={`calendar-badge ${item.event.category.toLowerCase()}`}>{CALENDAR_CATEGORY_LABEL[item.event.category]}</span>
            <b>{item.event.title}</b>
            <span className="timeline-updated">최근 업데이트 {item.event.lastUpdatedDate}</span>
          </div>
          <small>{latest ? latest.summary : item.event.summary}</small>
          {item.updates.length > 0 && <button className="timeline-toggle" onClick={() => toggleExpanded(item.event.id)}>{expanded ? '이전 내용 접기' : `이전 업데이트 ${item.updates.length}건 보기`}</button>}
          {expanded && <div className="timeline-history">
            <p><span className="timeline-history-date">{item.event.eventDate}</span> {item.event.summary}</p>
            {item.updates.map((update, index) => <p key={index}><span className="timeline-history-date">{update.updateDate}</span> {update.summary}</p>)}
          </div>}
        </article>
      })}
    </div>
  </PanelShell>
}
