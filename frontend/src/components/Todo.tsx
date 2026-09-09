import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Check, ListChecks, X } from 'lucide-react'
import type { TodoItem, TodoListProps } from '../lib/types'

/** Powers both the always-on floating widget and the dashboard card. Each caller mounts its own copy of
 * this hook and polls independently — todos are personal (per-account), so brief staleness between two
 * simultaneously-open copies is harmless and not worth a shared store for. */
export function useTodos(enabled = true) {
  const [items, setItems] = useState<TodoItem[]>([])
  useEffect(() => {
    if (!enabled) return
    const load = () => {
      if (document.hidden) return
      fetch('/api/todos', { credentials: 'include' }).then(r => r.ok ? r.json() as Promise<TodoItem[]> : null).then(data => { if (data) setItems(data) }).catch(() => undefined)
    }
    load()
    const timer = window.setInterval(load, 8000)
    return () => window.clearInterval(timer)
  }, [enabled])
  const add = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    fetch('/api/todos', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: trimmed }) })
      .then(r => r.ok ? r.json() as Promise<TodoItem> : null).then(item => { if (item) setItems(previous => [...previous, item]) }).catch(() => undefined)
  }
  const toggle = (id: string, completed: boolean) => {
    fetch(`/api/todos/${id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed }) })
      .then(r => r.ok ? r.json() as Promise<TodoItem> : null).then(updated => { if (updated) setItems(previous => previous.map(item => item.id === updated.id ? updated : item)) }).catch(() => undefined)
  }
  return { items, add, toggle }
}

function TodoRow({ item, checking, onToggle }: { item: TodoItem; checking: boolean; onToggle: () => void }) {
  const done = item.completed || checking
  return <div className={`todo-item ${checking ? 'todo-item-checking' : ''}`}>
    <button className={`todo-checkbox ${done ? 'checked' : ''}`} onClick={onToggle} aria-label={item.completed ? '완료 취소' : '완료 처리'}>
      {done && <Check size={12} strokeWidth={3}/>}
    </button>
    <span className={`todo-item-text ${done ? 'done' : ''}`}>{item.text}</span>
  </div>
}

/** Checking an item strikes its text immediately, then — after a short delay so the strike is visible —
 * collapses the row, which is what makes the rows below it visibly slide up rather than just snapping into
 * place once the item disappears from the unchecked list. */
export function TodoPanelBody({ items, onAdd, onToggle }: TodoListProps) {
  const [text, setText] = useState('')
  const [showCompleted, setShowCompleted] = useState(false)
  const [checkingIds, setCheckingIds] = useState<Set<string>>(new Set())
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const unchecked = items.filter(item => !item.completed)
  const completed = items.filter(item => item.completed).sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))

  const handleCheck = (id: string) => {
    setCheckingIds(previous => new Set(previous).add(id))
    window.setTimeout(() => {
      onToggle(id, true)
      setCheckingIds(previous => { const next = new Set(previous); next.delete(id); return next })
    }, 420)
  }

  const submit = () => {
    if (!text.trim()) return
    onAdd(text)
    setText('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }
  const onChange = (value: string) => {
    setText(value)
    const node = textareaRef.current
    if (node) { node.style.height = 'auto'; node.style.height = `${Math.min(node.scrollHeight, 120)}px` }
  }
  const onKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit() }
  }

  return <div className="todo-panel-body">
    <div className="todo-list">
      {unchecked.length === 0 ? <p className="empty-state">할 일이 없습니다.</p> : unchecked.map(item => (
        <TodoRow key={item.id} item={item} checking={checkingIds.has(item.id)} onToggle={() => handleCheck(item.id)}/>
      ))}
    </div>
    <button className="todo-history-toggle" onClick={() => setShowCompleted(value => !value)}>
      {showCompleted ? '완료 항목 숨기기' : `완료 항목 보기${completed.length > 0 ? ` · ${completed.length}` : ''}`}
    </button>
    {showCompleted && <div className="todo-list todo-list-completed">
      {completed.length === 0 ? <p className="empty-state">완료한 항목이 없습니다.</p> : completed.map(item => (
        <TodoRow key={item.id} item={item} checking={false} onToggle={() => onToggle(item.id, false)}/>
      ))}
    </div>}
    <textarea ref={textareaRef} className="todo-input" rows={1} value={text} placeholder="할 일을 입력하고 Enter…"
      onChange={e => onChange(e.target.value)} onKeyDown={onKeyDown}/>
  </div>
}

export function TodoDashboardCard({ items, onAdd, onToggle }: TodoListProps) {
  return <div className="dashboard-recent todo-card">
    <b>할 일</b>
    <TodoPanelBody items={items} onAdd={onAdd} onToggle={onToggle}/>
  </div>
}

/** Always mounted at the top level of the app so it floats over every screen. Takes its data from the
 * single `useTodos()` call in the app-state context (passed down as props) rather than polling on its
 * own, so having both this and `TodoDashboardCard` on screen at once doesn't double the poll rate. */
export function TodoFloating({ items, onAdd, onToggle }: TodoListProps) {
  const [open, setOpen] = useState(false)
  const pendingCount = items.filter(item => !item.completed).length
  return <>
    <button className="todo-fab" onClick={() => setOpen(value => !value)} title="할 일">
      {open ? <X size={20}/> : <ListChecks size={20}/>}
      {!open && pendingCount > 0 && <span className="todo-fab-badge">{pendingCount}</span>}
    </button>
    {open && <div className="todo-float-panel" role="dialog" aria-label="할 일 목록">
      <div className="todo-float-header"><b>할 일</b><button className="sheet-close" onClick={() => setOpen(false)}><X size={15}/></button></div>
      <TodoPanelBody items={items} onAdd={onAdd} onToggle={onToggle}/>
    </div>}
  </>
}
