import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Clipboard, RefreshCw, Trash2, Webhook } from 'lucide-react'

interface Bin { token: string; createdAt: string; expiresAt: string }
interface CapturedRequest {
  id: string; receivedAt: string; method: string; path: string; queryString: string | null
  remoteIp: string | null; contentType: string | null; contentLength: number | null
  headers: Record<string, string>; body: string | null; bodyTruncated: boolean
}

const POLL_MS = 2000

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/webhook${path}`, { headers: { 'Content-Type': 'application/json' }, ...init })
  if (response.status === 404) throw new Error('NOT_FOUND')
  if (!response.ok) throw new Error(`서버 응답 ${response.status}`)
  return response.json() as Promise<T>
}

/** webhook.site류 요청 캐처 -- 로그인 없이 발급받은 URL로 들어오는 모든 HTTP 요청(메서드·헤더·
 * 바디)을 그대로 기록해 보여준다. SSRF/블라인드 XSS/OOB 콜백 확인용. 토큰(URL 자체)이 유일한
 * 접근 통제라 링크를 아는 사람은 누구나 그 캡처 내용을 볼 수 있다 -- 실제 비밀은 절대 이 URL로
 * 보내지 않는다. */
export function WebhookPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [bin, setBin] = useState<Bin | null>(null)
  const [requests, setRequests] = useState<CapturedRequest[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<boolean | 'error'>(false)

  const createBin = async () => {
    setBusy(true); setError('')
    try {
      const created = await api<Bin>('/bins', { method: 'POST' })
      navigate(`/webhook/${created.token}`)
    } catch {
      setError('웹훅 생성 실패. 잠시 후 다시 시도하세요.')
    } finally {
      setBusy(false)
    }
  }

  const load = useCallback(async () => {
    if (!token) return
    try {
      const [binData, reqData] = await Promise.all([
        api<Bin>(`/bins/${token}`),
        api<CapturedRequest[]>(`/bins/${token}/requests`),
      ])
      setBin(binData); setRequests(reqData); setError('')
    } catch (e) {
      setError(e instanceof Error && e.message === 'NOT_FOUND' ? '존재하지 않거나 만료된 웹훅입니다.' : '불러오기 실패')
    }
  }, [token])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!token) return
    const timer = window.setInterval(() => void load(), POLL_MS)
    return () => window.clearInterval(timer)
  }, [token, load])

  const deleteOne = async (id: string) => {
    setRequests(rs => rs.filter(r => r.id !== id)) // optimistic — 폴링이 곧 서버 상태로 다시 맞춘다
    try { await fetch(`/api/webhook/bins/${token}/requests/${id}`, { method: 'DELETE' }) } catch { void load() }
  }

  const deleteAll = async () => {
    if (!token || requests.length === 0) return
    if (!window.confirm(`캡처된 요청 ${requests.length}건을 전부 삭제할까요?`)) return
    setRequests([])
    try { await fetch(`/api/webhook/bins/${token}/requests`, { method: 'DELETE' }) } catch { void load() }
  }

  if (!token) {
    return <div className="page webhook-page">
      <div className="webhook-head"><Webhook size={22}/><h1>웹훅 캐처</h1></div>
      <p className="webhook-intro">발급받은 URL로 들어오는 모든 HTTP 요청(메서드·헤더·쿼리·바디)을 그대로 기록해서 보여준다. SSRF·블라인드 XSS·OOB 콜백 확인용 — 사전에 허가된 진단 범위에서만 사용하고, 실제 비밀·개인정보는 이 URL로 보내지 않는다.</p>
      <button className="webhook-create-btn" onClick={createBin} disabled={busy}>{busy ? '생성 중…' : '새 웹훅 만들기'}</button>
      {error && <p className="webhook-error">{error}</p>}
    </div>
  }

  const captureUrl = `${window.location.origin}/api/webhook/capture/${token}`
  const copyUrl = async () => {
    try { await navigator.clipboard.writeText(captureUrl); setCopied(true) } catch { setCopied('error') }
    window.setTimeout(() => setCopied(false), 1500)
  }

  if (error === '존재하지 않거나 만료된 웹훅입니다.') {
    return <div className="page webhook-page">
      <div className="webhook-head"><Webhook size={22}/><h1>웹훅 캐처</h1></div>
      <p className="webhook-error">{error}</p>
      <button className="webhook-create-btn" onClick={createBin} disabled={busy}>새 웹훅 만들기</button>
    </div>
  }

  return <div className="page webhook-page">
    <div className="webhook-head"><Webhook size={22}/><h1>웹훅 캐처</h1></div>
    <div className="webhook-url-bar">
      <code>{captureUrl}</code>
      <button onClick={() => void copyUrl()}><Clipboard size={14}/>{copied === 'error' ? '복사 실패' : copied ? '복사됨' : '복사'}</button>
    </div>
    <p className="webhook-meta">{bin && `만료: ${new Date(bin.expiresAt).toLocaleString('ko-KR')} · 최대 200건 보관`} · 2초마다 자동 새로고침</p>

    <div className="webhook-list-head">
      <span>캡처된 요청 ({requests.length})</span>
      <div className="webhook-list-actions">
        {requests.length > 0 && <button className="webhook-clear-all" onClick={() => void deleteAll()}><Trash2 size={13}/>전체 삭제</button>}
        <button className="webhook-refresh" onClick={() => void load()}><RefreshCw size={14}/></button>
      </div>
    </div>

    {requests.length === 0 && <p className="webhook-empty">아직 들어온 요청이 없다. 위 URL로 요청을 보내보면 여기 나타난다.</p>}

    <div className="webhook-request-list">
      {requests.map(r => {
        const expanded = expandedId === r.id
        return <article className="webhook-request-card" key={r.id}>
          <div className="webhook-request-row">
            <button className="webhook-request-head" onClick={() => setExpandedId(expanded ? null : r.id)}>
              <span className={`webhook-method webhook-method-${r.method.toLowerCase()}`}>{r.method}</span>
              <span className="webhook-path">{r.path}{r.queryString ? `?${r.queryString}` : ''}</span>
              <span className="webhook-time">{new Date(r.receivedAt).toLocaleTimeString('ko-KR')}</span>
            </button>
            <button className="webhook-request-delete" title="이 요청 삭제" onClick={() => void deleteOne(r.id)}><Trash2 size={13}/></button>
          </div>
          {expanded && <div className="webhook-request-body">
            <dl>
              <dt>시간</dt><dd>{new Date(r.receivedAt).toLocaleString('ko-KR')}</dd>
              <dt>보낸 IP</dt><dd>{r.remoteIp ?? '-'}</dd>
              <dt>Content-Type</dt><dd>{r.contentType ?? '-'}</dd>
              <dt>Content-Length</dt><dd>{r.contentLength ?? '-'}</dd>
            </dl>
            <b>헤더</b>
            <pre className="webhook-pre">{Object.entries(r.headers).map(([k, v]) => `${k}: ${v}`).join('\n') || '(없음)'}</pre>
            <b>바디{r.bodyTruncated && ' (16KB 초과 — 잘림)'}</b>
            <pre className="webhook-pre">{r.body || '(비어있음)'}</pre>
          </div>}
        </article>
      })}
    </div>
  </div>
}
