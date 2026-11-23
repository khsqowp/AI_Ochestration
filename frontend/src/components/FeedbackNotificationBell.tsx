import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, MessageSquareText } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAppState } from '../context/AppState'

type FeedbackNotification = {
  id: string
  reportId: string
  title: string
  preview: string
  createdAt: string
  readAt: string | null
}
type Feed = { items: FeedbackNotification[]; unreadCount: number }

async function json<T>(response: Response): Promise<T> {
  const text = await response.text()
  let body: unknown = null
  if (text.trim()) {
    try { body = JSON.parse(text) } catch { throw new Error('알림 응답을 읽지 못했습니다.') }
  }
  if (!response.ok) throw new Error(`알림 요청 실패 (${response.status})`)
  return body as T
}

export function FeedbackNotificationBell() {
  const { session, notify } = useAppState()
  const navigate = useNavigate()
  const [feed, setFeed] = useState<Feed>({ items: [], unreadCount: 0 })
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const notifyRef = useRef(notify)
  notifyRef.current = notify

  const refresh = useCallback(async () => {
    if (!session?.user) return
    try {
      const [next, toasts] = await Promise.all([
        fetch('/api/feedback/notifications', { credentials: 'include' }).then(json<Feed>),
        fetch('/api/feedback/notifications/toasts', { method: 'POST', credentials: 'include' }).then(json<FeedbackNotification[]>),
      ])
      setFeed(next)
      setError('')
      for (const item of toasts) notifyRef.current('info', `새 댓글: ${item.title} · ${item.preview}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '알림을 확인하지 못했습니다.')
    }
  }, [session?.user])

  useEffect(() => {
    if (!session?.user) return
    void refresh()
    const timer = window.setInterval(() => void refresh(), 20000)
    return () => window.clearInterval(timer)
  }, [session?.user, refresh])

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: MouseEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const openNotification = async (item: FeedbackNotification) => {
    try {
      await fetch(`/api/feedback/notifications/${encodeURIComponent(item.id)}/read`, {
        method: 'PATCH', credentials: 'include',
      }).then(async response => {
        if (!response.ok) throw new Error(`알림 확인 실패 (${response.status})`)
      })
      setFeed(current => ({
        ...current,
        unreadCount: Math.max(0, current.unreadCount - (item.readAt ? 0 : 1)),
        items: current.items.map(candidate => candidate.id === item.id ? { ...candidate, readAt: new Date().toISOString() } : candidate),
      }))
      setOpen(false)
      navigate(`/dashboard/feedback?report=${encodeURIComponent(item.reportId)}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '알림을 열지 못했습니다.')
    }
  }

  if (!session?.user) return null
  return <div className="feedback-notification-root" ref={rootRef}>
    <button
      type="button"
      className={`icon-button feedback-notification-button${open ? ' active' : ''}`}
      aria-label={feed.unreadCount ? `댓글 알림 ${feed.unreadCount}건` : '댓글 알림'}
      aria-expanded={open}
      aria-haspopup="dialog"
      title="댓글 알림"
      onClick={() => { setOpen(value => !value); setError(''); void refresh() }}
    >
      <Bell size={17}/>
      {feed.unreadCount > 0 && <span className="feedback-notification-badge">{feed.unreadCount > 99 ? '99+' : feed.unreadCount}</span>}
    </button>
    {open && <section className="feedback-notification-popover" role="dialog" aria-label="댓글 알림 목록">
      <header><div><MessageSquareText size={16}/><b>댓글 알림</b></div><span>{feed.unreadCount}개 미확인</span></header>
      {error && <p className="feedback-notification-error">{error}</p>}
      {feed.items.length === 0
        ? <p className="feedback-notification-empty">새 댓글 알림이 없습니다.</p>
        : <div className="feedback-notification-list">{feed.items.map(item => <button
            type="button"
            className={`feedback-notification-item${item.readAt ? '' : ' unread'}`}
            key={item.id}
            onClick={() => void openNotification(item)}
          >
            <span className="feedback-notification-item-title">{item.title}</span>
            <span className="feedback-notification-item-preview">{item.preview}</span>
            <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString('ko-KR')}</time>
          </button>)}</div>}
    </section>}
  </div>
}
