import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { MessageSquarePlus, Send } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { useAppState } from '../context/AppState'

type FeedbackStatus = 'OPEN' | 'RESOLVED'
type FeedbackReport = {
  id: string
  authorEmail: string
  authorDisplayName: string
  title: string
  body: string
  status: FeedbackStatus
  createdAt: string
}
type FeedbackComment = {
  id: string
  authorId: string
  authorEmail: string
  authorDisplayName: string
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
  const [searchParams, setSearchParams] = useSearchParams()
  const [reports, setReports] = useState<FeedbackReport[]>([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [selectedReportId, setSelectedReportId] = useState<string | null>(() => searchParams.get('report'))
  const [comments, setComments] = useState<FeedbackComment[]>([])
  const [commentDraft, setCommentDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [busyComment, setBusyComment] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingComments, setLoadingComments] = useState(false)
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

  const loadComments = useCallback(async (reportId: string) => {
    setLoadingComments(true)
    try {
      setComments(await responseJson<FeedbackComment[]>(await fetch(`/api/feedback/${encodeURIComponent(reportId)}/comments`, { credentials: 'include' })))
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '댓글을 불러오지 못했습니다.')
    } finally { setLoadingComments(false) }
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (selectedReportId) void loadComments(selectedReportId)
    else setComments([])
  }, [selectedReportId, loadComments])

  useEffect(() => {
    const requested = searchParams.get('report')
    if (requested && reports.some(report => report.id === requested) && selectedReportId !== requested) {
      setSelectedReportId(requested)
    }
  }, [reports, searchParams, selectedReportId])

  const selectReport = (reportId: string | null) => {
    setSelectedReportId(reportId)
    setCommentDraft('')
    if (reportId) setSearchParams({ report: reportId }, { replace: true })
    else setSearchParams({}, { replace: true })
  }

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

  const submitComment = async (reportId: string, resolve = false) => {
    if (!commentDraft.trim() || busyComment) return
    setBusyComment(true); setError(''); setNotice('')
    try {
      await responseJson<FeedbackReport | FeedbackComment>(await fetch(`/api/feedback/${encodeURIComponent(reportId)}/${resolve ? 'resolve' : 'comments'}`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: commentDraft.trim() }),
      }))
      setCommentDraft('')
      setNotice(resolve ? '조치 완료 댓글을 등록했습니다.' : '댓글을 등록했습니다.')
      await Promise.all([loadComments(reportId), load()])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '댓글을 등록하지 못했습니다.')
    } finally { setBusyComment(false) }
  }

  return <div className="page feedback-page">
    <header className="feedback-header">
      <div><p className="eyebrow">FEEDBACK BOX</p><h1>개선 제보함</h1><p>{canViewAll ? '모든 사용자의 제보와 댓글을 확인할 수 있습니다.' : '작성한 제보와 댓글은 본인만 확인할 수 있습니다.'}</p></div>
      <span className="feedback-count">{reports.length}건</span>
    </header>

    <form className="feedback-form" onSubmit={submit}>
      <div className="feedback-form-title"><MessageSquarePlus size={18}/><h2>새 제보</h2></div>
      <label>제목<input value={title} onChange={event => setTitle(event.target.value)} maxLength={160} required placeholder="불편 사항이나 개선 아이디어"/></label>
      <label>내용<textarea value={body} onChange={event => setBody(event.target.value)} maxLength={10000} required rows={5} placeholder="어떤 화면에서 무엇을 하다가 문제가 있었는지 적어주세요."/></label>
      <div className="feedback-form-footer"><small>{body.length}/10000자</small><button className="source-add" type="submit" disabled={busy || !title.trim() || !body.trim()}><Send size={15}/>{busy ? '등록 중…' : '제보 등록'}</button></div>
    </form>

    {notice && <p className="form-notice" role="status">{notice}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <section className="feedback-list-section"><div className="feedback-list-heading"><h2>{canViewAll ? '전체 제보' : '내 제보'}</h2><button className="source-cancel" onClick={() => void load()} disabled={loading}>새로고침</button></div>
      {loading ? <p className="empty-state">불러오는 중…</p> : reports.length === 0 ? <p className="empty-state">등록된 제보가 없습니다.</p> : <div className="feedback-list">{reports.map(report => <article className={`feedback-card${selectedReportId === report.id ? ' selected' : ''}`} key={report.id}>
        <header className="feedback-card-header"><div><h3>{report.title}</h3><small>{canViewAll ? `${report.authorDisplayName} · ${report.authorEmail} · ` : ''}{new Date(report.createdAt).toLocaleString('ko-KR')}</small></div><span className={`feedback-status ${report.status.toLowerCase()}`}>{report.status === 'RESOLVED' ? '조치 완료' : '확인 중'}</span></header>
        <p>{report.body}</p>
        <button type="button" className="feedback-thread-toggle" aria-expanded={selectedReportId === report.id} onClick={() => selectReport(selectedReportId === report.id ? null : report.id)}>
          {selectedReportId === report.id ? '댓글 접기' : '댓글 보기'}{selectedReportId === report.id ? ` · ${comments.length}개` : ''}
        </button>
        {selectedReportId === report.id && <section className="feedback-thread" aria-label={`${report.title} 댓글`}>
          {loadingComments ? <p className="empty-state">댓글 불러오는 중…</p> : comments.length === 0 ? <p className="feedback-thread-empty">아직 댓글이 없습니다.</p> : <div className="feedback-comments">{comments.map(comment => <article className={`feedback-comment${comment.authorEmail === session?.user?.email ? ' mine' : ''}`} key={comment.id}>
            <header><b>{comment.authorDisplayName}</b><time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString('ko-KR')}</time></header>
            <p>{comment.body}</p>
          </article>)}</div>}
          <form className="feedback-comment-form" onSubmit={event => { event.preventDefault(); void submitComment(report.id) }}>
            <label htmlFor={`feedback-comment-${report.id}`}>댓글</label>
            <textarea id={`feedback-comment-${report.id}`} value={commentDraft} onChange={event => setCommentDraft(event.target.value)} maxLength={5000} rows={3} placeholder="추가 의견이나 답변을 입력하세요." required/>
            <div className="feedback-form-footer"><small>{commentDraft.length}/5000자</small><div className="feedback-comment-actions">
              {canViewAll && report.status !== 'RESOLVED' && <button className="secondary-button" type="button" disabled={busyComment || !commentDraft.trim()} onClick={() => void submitComment(report.id, true)}>조치 완료 + 댓글</button>}
              <button className="source-add" type="submit" disabled={busyComment || !commentDraft.trim()}><Send size={14}/>{busyComment ? '등록 중…' : '댓글 등록'}</button>
            </div></div>
          </form>
        </section>}
      </article>)}</div>}
    </section>
  </div>
}
