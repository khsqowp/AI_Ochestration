import { Suspense, useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Loader2, RotateCcw, Search, Send, Square } from 'lucide-react'
import type { RagAnswer, RagDomainFilter, RagOriginFilter, Task, TaskDomain, TaskEvent } from '../lib/types'
import { archiveTaskLabel, autoGrowTextarea, ragProgressLabel, taskStatusLabel } from '../lib/util'
import { MarkdownBody } from '../components/shared'

/** 대시보드 좌측에 세로로 붙는 대화 패널 — PM 대화와 RAG 아카이브 질문을 탭으로 오가며 쓴다. PM 대화 쪽 상태는
 * 앱 전역 상태(AppState)를 그대로 공유해서, 페이지를 오갈 때 대화가 끊기지 않는다. */
export function DashboardSidebarChat({ isAdmin, recentTasks, taskTracks, chatInput, setChatInput, taskDomain, setTaskDomain, chatError, onSubmitTask, onOpenFile }: {
  isAdmin: boolean; recentTasks: Task[]; taskTracks: Record<string, TaskEvent[]>; chatInput: string; setChatInput: (value: string) => void
  taskDomain: TaskDomain; setTaskDomain: (value: TaskDomain) => void
  chatError: string; onSubmitTask: (event: FormEvent) => void; onOpenFile: (path: string) => void
}) {
  // PM 대화는 ADMIN 전용(백엔드 POST /api/tasks 도 ADMIN-only) — 일반 계정은 RAG 대화만 노출.
  const [tab, setTab] = useState<'pm' | 'rag'>(isAdmin ? 'pm' : 'rag')
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [answer, setAnswer] = useState<RagAnswer | null>(null)
  const [ragError, setRagError] = useState('')
  const [domainFilter, setDomainFilter] = useState<RagDomainFilter>('')
  const [originFilter, setOriginFilter] = useState<RagOriginFilter>('')
  const [ragElapsed, setRagElapsed] = useState(0)
  const ragAbortRef = useRef<AbortController | null>(null)
  const pmFormRef = useRef<HTMLFormElement>(null)
  const pmTextareaRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { if (chatInput === '' && pmTextareaRef.current) pmTextareaRef.current.style.height = 'auto' }, [chatInput])
  const onChatKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); pmFormRef.current?.requestSubmit() }
  }
  const ask = async (event: FormEvent) => {
    event.preventDefault()
    if (!question.trim() || asking) return
    setAsking(true); setRagError(''); setAnswer(null); setRagElapsed(0)
    const asked = question.trim()
    const controller = new AbortController(); ragAbortRef.current = controller
    const started = Date.now()
    const progressTimer = window.setInterval(() => setRagElapsed(Date.now() - started), 300)
    try {
      const response = await fetch('/api/archive/ask', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: asked, domain: domainFilter || null, origin: originFilter || null }), signal: controller.signal })
      if (!response.ok) { setRagError('답변을 가져오지 못했습니다. API 키 설정을 확인해 주세요.'); return }
      setAnswer(await response.json() as RagAnswer); setQuestion('')
    } catch (exception) {
      if ((exception as Error).name !== 'AbortError') setRagError('답변을 가져오지 못했습니다. API 키 설정을 확인해 주세요.')
    } finally {
      window.clearInterval(progressTimer); setAsking(false); ragAbortRef.current = null
    }
  }
  const stopAsking = () => { ragAbortRef.current?.abort() }
  return <aside className="dashboard-chat">
    {isAdmin && <div className="dashboard-chat-tabs">
      <button className={tab === 'pm' ? 'active' : ''} onClick={() => setTab('pm')}>PM 대화</button>
      <button className="dashboard-chat-flip" onClick={() => setTab(current => current === 'pm' ? 'rag' : 'pm')} title="대화 전환"><RotateCcw size={13}/></button>
      <button className={tab === 'rag' ? 'active' : ''} onClick={() => setTab('rag')}>RAG 대화</button>
    </div>}
    {tab === 'pm' ? <div className="dashboard-chat-body">
      <p className="chat-bubble">수집 사이트를 등록하거나 작업을 지시해 주세요. PM이 팀과 검토 단계를 계획하겠습니다.</p>
      {recentTasks.filter(task => task.status === 'RUNNING' || task.status === 'QUEUED').map(task => (
        <div className="pm-task-block" key={task.id}>
          <p className={`task-state ${task.status.toLowerCase()}`}>{archiveTaskLabel(task.title)} · {taskStatusLabel(task.status)}</p>
          {(taskTracks[task.id] ?? []).map(item => <p className="event-bubble" key={item.id}><b>{item.stage}</b> {item.message}</p>)}
        </div>
      ))}
      {recentTasks.filter(task => task.status !== 'RUNNING' && task.status !== 'QUEUED' && task.status !== 'AWAITING_BATCH').slice(0, 4).map(task => (
        <div className="pm-task-block" key={task.id}>
          <p className={`task-state ${task.status.toLowerCase()}`}>{archiveTaskLabel(task.title)} · {taskStatusLabel(task.status)}</p>
          {task.finalReport && <p className="report-bubble">{task.finalReport}</p>}
          {task.archivePath && <p className="archive-bubble">보관: obsidian/{task.archivePath}</p>}
          {task.failureReason && <p className="form-error">{task.failureReason}</p>}
        </div>
      ))}
    </div> : <div className="dashboard-chat-body">
      <p className="chat-bubble">아카이브에 쌓인 노트를 근거로 답합니다. 노트에 없는 내용은 답하지 않습니다.</p>
      <div className="rag-filter-row">
        <select value={domainFilter} onChange={e => setDomainFilter(e.target.value as RagDomainFilter)} title="분야로 범위 좁히기">
          <option value="">전체 분야</option>
          <option value="economy">경제</option>
          <option value="security">보안</option>
          <option value="ideas">아이디어</option>
        </select>
        <select value={originFilter} onChange={e => setOriginFilter(e.target.value as RagOriginFilter)} title="출처로 범위 좁히기">
          <option value="">전체 출처</option>
          <option value="collection">수집</option>
          <option value="manual">질문·직접작성</option>
          <option value="upload">업로드</option>
        </select>
      </div>
      {asking && <p className="empty-state"><Loader2 size={13} className="spin"/> {ragProgressLabel(ragElapsed)}</p>}
      {ragError && <p className="form-error">{ragError}</p>}
      {answer && <div className="rag-answer"><Suspense fallback={null}><MarkdownBody>{answer.answer}</MarkdownBody></Suspense>
        {answer.citations.length > 0 && <div className="rag-citations"><b>참고 노트</b>{answer.citations.map(citation => <button key={citation.path} onClick={() => onOpenFile(citation.path)}>{citation.path} <small>({(citation.score * 100).toFixed(0)}%)</small></button>)}</div>}
      </div>}
    </div>}
    {tab === 'pm'
      ? <form className="chat-input" ref={pmFormRef} onSubmit={onSubmitTask}><select value={taskDomain} onChange={e => setTaskDomain(e.target.value as TaskDomain)}><option value="SECURITY">보안</option><option value="ECONOMY">경제</option><option value="GENERAL">일반</option></select><textarea ref={pmTextareaRef} rows={1} value={chatInput} onChange={e => { setChatInput(e.target.value); autoGrowTextarea(pmTextareaRef.current, 130) }} onKeyDown={onChatKeyDown} placeholder="PM에게 작업을 지시하세요 (Shift+Enter로 줄바꿈)"/><button type="submit"><Send size={16}/></button></form>
      : <form className="chat-input ask-form" onSubmit={ask}><input value={question} onChange={e => setQuestion(e.target.value)} placeholder="아카이브에 질문하기" disabled={asking}/>{asking ? <button type="button" className="ask-stop" onClick={stopAsking}><Square size={15}/></button> : <button type="submit"><Search size={15}/></button>}</form>}
    {tab === 'pm' && chatError && <p className="chat-error">{chatError}</p>}
  </aside>
}
