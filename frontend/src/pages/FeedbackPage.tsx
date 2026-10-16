import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { MessageSquarePlus, Send } from 'lucide-react'
import { useAppState } from '../context/AppState'

type FeedbackReport = {
  id: string
  authorEmail: string
  authorDisplayName: string
  title: string
  body: string
  createdAt: string
}

const OWNER_EMAIL = 'kknd03255@gmail.com'

async function responseJson<T>(response: Response): Promise<T> {
  const raw = await response.text()
  let body: unknown = null
  if (raw.trim()) {
    try { body = JSON.parse(raw) } catch { throw new Error('서버 응답을 읽지 못했습니다.') }
  }
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null && 'message' in body ? String(body.message ?? '') : ''
    throw new Error(message || `요청 실패 (${response.status})`)
  }
  return body as T
}

export function FeedbackPage() {
  const { session, isAdmin } = useAppState()
  const canViewAll = isAdmin || session?.user?.email.toLowerCase() === OWNER_EMAIL
  const [reports, setReports] = useState<FeedbackReport[]>([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setReports(await responseJson<FeedbackReport[]>(await fetch('/api/feedback', { credentials: 'include' })))
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '제보를 불러오지 못했습니다.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim() || !body.trim() || busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      await responseJson<FeedbackReport>(await fetch('/api/feedback', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), body: body.trim() }),
      }))
      setTitle(''); setBody(''); setNotice('제보를 등록했습니다.')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '제보를 등록하지 못했습니다.')
    } finally { setBusy(false) }
  }

  return <div className="page feedback-page">
    <header className="feedback-header">
      <div><p className="eyebrow">FEEDBACK BOX</p><h1>개선 제보함</h1><p>{canViewAll ? '모든 사용자의 제보를 확인할 수 있습니다.' : '작성한 제보와 답변 상태를 본인만 확인할 수 있습니다.'}</p></div>
      <span className="feedback-count">{reports.length}건</span>
    </header>

    <form className="feedback-form" onSubmit={submit}>
      <div className="feedback-form-title"><MessageSquarePlus size={18}/><h2>새 제보</h2></div>
      <label>제목<input value={title} onChange={event => setTitle(event.target.value)} maxLength={160} required placeholder="불편 사항이나 개선 아이디어"/></label>
      <label>내용<textarea value={body} onChange={event => setBody(event.target.value)} maxLength={10000} required rows={5} placeholder="어떤 화면에서 무엇을 하다가 문제가 있었는지 적어주세요."/></label>
      <div className="feedback-form-footer"><small>{body.length}/10000자</small><button className="source-add" type="submit" disabled={busy || !title.trim() || !body.trim()}><Send size={15}/>{busy ? '등록 중…' : '제보 등록'}</button></div>
    </form>

    {notice && <p className="form-notice">{notice}</p>}
    {error && <p className="form-error">{error}</p>}
    <section className="feedback-list-section"><div className="feedback-list-heading"><h2>{canViewAll ? '전체 제보' : '내 제보'}</h2><button className="source-cancel" onClick={() => void load()} disabled={loading}>새로고침</button></div>
      {loading ? <p className="empty-state">불러오는 중…</p> : reports.length === 0 ? <p className="empty-state">등록된 제보가 없습니다.</p> : <div className="feedback-list">{reports.map(report => <article className="feedback-card" key={report.id}>
        <header><div><h3>{report.title}</h3><small>{canViewAll ? `${report.authorDisplayName} · ${report.authorEmail} · ` : ''}{new Date(report.createdAt).toLocaleString('ko-KR')}</small></div></header>
        <p>{report.body}</p>
      </article>)}</div>}
    </section>
  </div>
}
