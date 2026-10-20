import { useEffect, useRef, useState, type ClipboardEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAppState } from '../context/AppState'
import '../styles/notebook.css'

type Status = 'GOOD' | 'VULNERABLE' | 'REMEDIATION_REQUIRED'
type Entry = { id: string; ownerId: string; ownerDisplayName: string; title: string; status: Status; content: string; createdAt: string; updatedAt: string }
type Owner = { id: string; email: string; displayName: string }
type ImageResult = { id: string; url: string }
type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/notebook${path}`, { credentials: 'include', ...init })
  if (!response.ok) throw new Error(`요청 실패 (${response.status})`)
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}
const json = (method: string, body: object): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const timestamp = (value: string) => new Date(value).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
const statusLabels: Record<Status, string> = { GOOD: '양호', VULNERABLE: '취약', REMEDIATION_REQUIRED: '재조치요청' }
const draftKey = (entry: Entry) => `notebook-draft:${entry.ownerId}:${entry.id}`
const draftContent = (entry: Entry) => JSON.stringify({ title: entry.title, status: entry.status, content: entry.content })
const hasDraft = (entry: Entry) => { try { return sessionStorage.getItem(draftKey(entry)) !== null } catch { return false } }
const storeDraft = (entry: Entry) => { try { sessionStorage.setItem(draftKey(entry), draftContent(entry)) } catch { /* Storage may be disabled. */ } }
const clearSavedDraft = (entry: Entry) => {
  try { if (sessionStorage.getItem(draftKey(entry)) === draftContent(entry)) sessionStorage.removeItem(draftKey(entry)) } catch { /* Storage may be disabled. */ }
}
const restoreDraft = (entry: Entry): Entry => {
  try {
    const raw = sessionStorage.getItem(draftKey(entry))
    if (!raw) return entry
    const draft: unknown = JSON.parse(raw)
    if (typeof draft !== 'object' || draft === null) return entry
    const value = draft as Record<string, unknown>
    if (typeof value.title !== 'string' || typeof value.content !== 'string' || !Object.keys(statusLabels).includes(String(value.status))) return entry
    return { ...entry, title: value.title, status: value.status as Status, content: value.content }
  } catch { return entry }
}

export function NotebookPage() {
  const { isAdmin } = useAppState()
  const [otherMode, setOtherMode] = useState(false)
  const [owners, setOwners] = useState<Owner[]>([])
  const [ownerId, setOwnerId] = useState('')
  const [entries, setEntries] = useState<Entry[]>([])
  const [statusFilter, setStatusFilter] = useState<Status | 'ALL'>('ALL')
  const [active, setActive] = useState<Entry | null>(null)
  const [expanded, setExpanded] = useState<string[]>([])
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const activeRef = useRef<Entry | null>(null)
  const pendingRef = useRef<Entry | null>(null)
  const timerRef = useRef<number | null>(null)
  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve())
  const savingRef = useRef(0)
  const loadVersionRef = useRef(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const readOnly = isAdmin && otherMode && !!ownerId
  const selectedOwner = owners.find(owner => owner.id === ownerId)
  const statusCounts = (Object.keys(statusLabels) as Status[]).reduce((counts, status) => ({ ...counts, [status]: entries.filter(entry => entry.status === status).length }), {} as Record<Status, number>)
  const visibleEntries = statusFilter === 'ALL' ? entries : entries.filter(entry => entry.status === statusFilter)

  const flush = () => {
    if (timerRef.current !== null) { window.clearTimeout(timerRef.current); timerRef.current = null }
    const draft = pendingRef.current
    if (!draft) return saveQueueRef.current
    pendingRef.current = null
    setSaveState('saving')
    savingRef.current += 1
    const targetVersion = loadVersionRef.current
    const job = saveQueueRef.current.catch(() => undefined).then(() => api<Entry>(`/entries/${draft.id}`, json('PATCH', {
      title: draft.title, status: draft.status, content: draft.content,
    })))
    saveQueueRef.current = job
    void job.then(saved => {
      clearSavedDraft(saved)
      if (targetVersion === loadVersionRef.current) setEntries(previous => previous.map(item => item.id === saved.id ? saved : item).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
      if (!pendingRef.current && activeRef.current?.id === saved.id && activeRef.current.title === saved.title && activeRef.current.status === saved.status && activeRef.current.content === saved.content) setSaveState('saved')
    }).catch(() => { if (activeRef.current?.id === draft.id) { pendingRef.current = activeRef.current; setSaveState('error'); setError('기록을 저장하지 못했습니다.') } })
      .finally(() => { savingRef.current -= 1 })
    return job
  }
  const flushRef = useRef(flush)
  flushRef.current = flush
  useEffect(() => () => { void flushRef.current() }, [])
  useEffect(() => {
    const warnUnsaved = (event: BeforeUnloadEvent) => {
      if (!pendingRef.current && savingRef.current === 0) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnUnsaved)
    return () => window.removeEventListener('beforeunload', warnUnsaved)
  }, [])

  const edit = (changes: Partial<Entry>) => {
    if (readOnly || !activeRef.current) return
    const updated = { ...activeRef.current, ...changes }
    activeRef.current = updated
    pendingRef.current = updated
    storeDraft(updated)
    setActive(updated)
    setEntries(previous => previous.map(item => item.id === updated.id ? updated : item))
    setSaveState('pending')
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => { void flushRef.current() }, 1000)
  }

  useEffect(() => {
    if (!isAdmin) return
    void api<Owner[]>('/owners').then(setOwners).catch(() => setError('사용자 목록을 불러오지 못했습니다.'))
  }, [isAdmin])

  useEffect(() => {
    const version = ++loadVersionRef.current
    void flushRef.current()
    activeRef.current = null; pendingRef.current = null
    setActive(null); setEntries([]); setSaveState('idle'); setError(''); setLoading(true)
    if (otherMode && !ownerId) { setLoading(false); return }
    const path = readOnly ? `/entries?ownerId=${encodeURIComponent(ownerId)}` : '/entries'
    void api<Entry[]>(path).then(items => {
      if (version !== loadVersionRef.current) return
      const restored = items.map(restoreDraft)
      setEntries(restored)
      const first = restored.find((item, index) => item !== items[index]) ?? restored[0] ?? null
      activeRef.current = first; setActive(first)
      if (first && hasDraft(first)) {
        pendingRef.current = first
        setSaveState('pending')
        timerRef.current = window.setTimeout(() => { void flushRef.current() }, 1000)
      }
    }).catch(() => { if (version === loadVersionRef.current) setError('기록 목록을 불러오지 못했습니다.') })
      .finally(() => { if (version === loadVersionRef.current) setLoading(false) })
  }, [isAdmin, otherMode, ownerId, readOnly])

  const openEntry = async (entry: Entry) => {
    if (activeRef.current?.id === entry.id) return
    try { await flush() } catch { setError('기록을 저장하지 못했습니다. 다시 저장한 뒤 이동하세요.'); return }
    const current = entries.find(item => item.id === entry.id) ?? entry
    activeRef.current = current; setActive(current); setSaveState('idle'); setError('')
    if (hasDraft(current)) {
      pendingRef.current = current
      setSaveState('pending')
      timerRef.current = window.setTimeout(() => { void flushRef.current() }, 1000)
    }
  }
  const create = async () => {
    if (readOnly || otherMode) return
    const title = window.prompt('새 기록 제목을 입력하세요')?.trim()
    if (!title) return
    if (title.length > 200) { setError('제목은 200자 이하여야 합니다.'); return }
    try { await flush() } catch { setError('기록을 저장하지 못했습니다. 다시 저장한 뒤 새 기록을 만드세요.'); return }
    try {
      const created = await api<Entry>('/entries', json('POST', { title, status: 'GOOD' }))
      setEntries(previous => [created, ...previous]); activeRef.current = created; setActive(created); setSaveState('saved'); setError('')
    } catch { setError('기록을 만들지 못했습니다.') }
  }
  const remove = async (entry: Entry) => {
    if (readOnly || otherMode || !window.confirm(`“${entry.title}” 기록을 삭제할까요?`)) return
    if (activeRef.current?.id === entry.id) {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = null; pendingRef.current = null
    }
    try {
      await saveQueueRef.current.catch(() => undefined)
      await api<void>(`/entries/${entry.id}`, { method: 'DELETE' })
      try { sessionStorage.removeItem(draftKey(entry)) } catch { /* Storage may be disabled. */ }
      const remaining = entries.filter(item => item.id !== entry.id)
      setEntries(remaining)
      if (activeRef.current?.id === entry.id) { const next = remaining[0] ?? null; activeRef.current = next; setActive(next); setSaveState('idle') }
      setError('')
    } catch { setError('기록을 삭제하지 못했습니다.') }
  }
  const pasteImage = async (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (readOnly) return
    const item = Array.from(event.clipboardData.items).find(value => value.type.startsWith('image/'))
    if (!item) return
    event.preventDefault()
    const file = item.getAsFile()
    const current = activeRef.current
    if (!current || !file) { setError('이미지를 붙이려면 먼저 새 기록을 만드세요.'); return }
    const cursor = event.currentTarget.selectionStart
    const form = new FormData(); form.append('file', file, file.name || 'screenshot.png')
    try {
      const uploaded = await api<ImageResult>(`/entries/${current.id}/images`, { method: 'POST', body: form })
      if (activeRef.current?.id !== current.id) return
      const content = activeRef.current.content
      edit({ content: content.slice(0, cursor) + `![](${uploaded.url})\n` + content.slice(cursor) })
      setError('')
      textareaRef.current?.focus()
    } catch { setError('이미지를 업로드하지 못했습니다.') }
  }

  return <div className="page notebook-page">
    <header className="notebook-header"><div><p className="eyebrow">DIAGNOSIS NOTEBOOK</p><h1>진단 기록판</h1><p className="muted">마크다운으로 진단 결과를 기록하고 스크린샷을 붙여넣으세요.</p></div>
      {isAdmin && <label className="notebook-other"><input type="checkbox" checked={otherMode} onChange={event => { const checked = event.target.checked; void flush().then(() => { setOtherMode(checked); setOwnerId('') }).catch(() => setError('기록을 저장하지 못했습니다. 다시 저장한 뒤 이동하세요.')) }}/> 다른 사용자 기록 보기</label>}
    </header>
    {isAdmin && otherMode && <div className="notebook-owner"><label htmlFor="notebook-owner-select">사용자 선택</label><select id="notebook-owner-select" value={ownerId} onChange={event => { const nextOwnerId = event.target.value; void flush().then(() => setOwnerId(nextOwnerId)).catch(() => setError('기록을 저장하지 못했습니다. 다시 저장한 뒤 이동하세요.')) }}><option value="">사용자를 선택하세요</option>{owners.map(owner => <option key={owner.id} value={owner.id}>{owner.displayName} ({owner.email})</option>)}</select></div>}
    {readOnly && <div className="notebook-readonly">{selectedOwner?.displayName ?? '선택한 사용자'}님의 기록판을 읽기 전용으로 보는 중</div>}
    {error && <p className="form-error" role="alert">{error} {saveState === 'error' && <button onClick={() => void flush()}>다시 저장</button>}</p>}
    <div className="notebook-layout">
      <aside className="notebook-sidebar"><div className="notebook-sidebar-head"><strong>기록 목록 <span>{entries.length}</span></strong>{!readOnly && !otherMode && <button className="notebook-add" onClick={() => void create()}>+ 새 기록</button>}</div>
        {<div className="notebook-status-filters" role="group" aria-label="상태별 기록 필터"><button className={statusFilter === 'ALL' ? 'selected' : ''} aria-pressed={statusFilter === 'ALL'} onClick={() => setStatusFilter('ALL')}>전체 <b>{entries.length}</b></button>{(Object.keys(statusLabels) as Status[]).map(status => <button key={status} className={`${status.toLowerCase()} ${statusFilter === status ? 'selected' : ''}`} aria-pressed={statusFilter === status} onClick={() => setStatusFilter(status)}>{statusLabels[status]} <b>{statusCounts[status]}</b></button>)}</div>}{loading ? <p className="empty-state">불러오는 중…</p> : visibleEntries.length === 0 ? <p className="empty-state">{entries.length ? '해당 상태의 기록이 없습니다.' : '기록이 없습니다.'}</p> : visibleEntries.map(entry => <div className={`notebook-list-item ${active?.id === entry.id ? 'active' : ''}`} key={entry.id}>
          <div className="notebook-list-row"><button className="notebook-open" onClick={() => openEntry(entry)}><span className="notebook-open-title"><span className={`notebook-item-status ${entry.status.toLowerCase()}`} aria-label={`상태: ${statusLabels[entry.status]}`} title={statusLabels[entry.status]}>{statusLabels[entry.status]}</span><strong>{entry.title}</strong></span><small>{timestamp(entry.updatedAt)}</small></button><button className="notebook-expand" aria-label={`${entry.title} 미리보기 ${expanded.includes(entry.id) ? '접기' : '펼치기'}`} aria-expanded={expanded.includes(entry.id)} onClick={() => setExpanded(previous => previous.includes(entry.id) ? previous.filter(id => id !== entry.id) : [...previous, entry.id])}>{expanded.includes(entry.id) ? '▴' : '▾'}</button>{!readOnly && !otherMode && <button className="notebook-delete" aria-label={`${entry.title} 삭제`} onClick={() => void remove(entry)}>×</button>}</div>
          {expanded.includes(entry.id) && <p className="notebook-excerpt">{entry.content.trim().slice(0, 110) || '내용이 없습니다.'}</p>}</div>)}
      </aside>
      <main className="notebook-main">{active ? <><div className="notebook-editor-head"><input className="notebook-title" aria-label="기록 제목" value={active.title} maxLength={200} readOnly={readOnly} onChange={event => edit({ title: event.target.value })}/><span className="notebook-save">{readOnly ? '읽기 전용' : saveState === 'saving' ? '저장 중…' : saveState === 'saved' ? '방금 저장됨' : saveState === 'error' ? '저장 안 됨 - 재시도 필요' : saveState === 'pending' ? '저장 대기 중…' : ''}</span></div>
        <div className="notebook-status" role="group" aria-label="진단 상태">{(Object.keys(statusLabels) as Status[]).map(status => <button key={status} type="button" className={`${status.toLowerCase()} ${active.status === status ? 'selected' : ''}`} disabled={readOnly} aria-pressed={active.status === status} onClick={() => edit({ status })}>{statusLabels[status]}</button>)}</div>
        <div className="notebook-split"><section><h2>마크다운 편집</h2><textarea ref={textareaRef} value={active.content} readOnly={readOnly} onChange={event => edit({ content: event.target.value })} onPaste={event => void pasteImage(event)} placeholder="진단 내용을 작성하세요. 스크린샷은 이곳에 붙여넣으세요." spellCheck={false}/></section><section><h2>실시간 미리보기</h2><div className="notebook-preview"><ReactMarkdown remarkPlugins={[remarkGfm]}>{active.content}</ReactMarkdown></div></section></div>
      </> : <div className="notebook-empty">{otherMode && !ownerId ? '사용자를 선택하세요.' : '기록을 선택하거나 새 기록을 만드세요.'}</div>}</main>
    </div>
  </div>
}
