import { Bot, Download, Plus, Send, Trash2, X } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'

// react-markdown + remark-gfm + rehype-sanitize — 코드스플릿. App.tsx 의 MarkdownBody 와 같은 청크를 공유하므로
// 번들 추가 비용 없음. LLM 출력은 raw HTML 을 신뢰하지 않으므로 rehype-raw 는 빼고 sanitize 만 건다.
const Markdown = lazy(() =>
  Promise.all([import('react-markdown'), import('remark-gfm'), import('rehype-sanitize')]).then(
    ([rm, gfm, sanitize]) => ({
      default: ({ children }: { children: string }) => {
        const ReactMarkdown = rm.default
        return <ReactMarkdown remarkPlugins={[gfm.default]} rehypePlugins={[sanitize.default]}>{children}</ReactMarkdown>
      },
    }),
  ),
)

type DolphinSession = { id: string; title: string; mode: string; model: string; created_at: string }
type DolphinMsg = { role: 'user' | 'assistant'; content: string }
type DolphinMode = 'general' | 'ctf' | 'rag'

// dolphin-chat 이 실제로 인식하는 SYSTEM_PROMPTS 키만 노출한다. 다른 값은 서버에서 조용히 general 로 폴백됨.
const MODES: { id: DolphinMode; label: string }[] = [
  { id: 'general', label: '일반' },
  { id: 'ctf', label: 'CTF/모의해킹' },
  { id: 'rag', label: 'Vault RAG' },
]

export function DolphinChatModal({ onClose }: { onClose: () => void }) {
  const [sessions, setSessions] = useState<DolphinSession[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<DolphinMsg[]>([])
  const [mode, setMode] = useState<DolphinMode>('general')
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [model, setModel] = useState<string>('')
  const bodyRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    loadSessions()
    fetch('/api/dolphin/models', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.models) setModels(d.models) })
  }, [])

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [messages])

  async function loadSessions() {
    const r = await fetch('/api/dolphin/sessions', { credentials: 'include' })
    if (r.ok) {
      const d = await r.json()
      setSessions(d.sessions ?? [])
    }
  }

  async function openSession(s: DolphinSession) {
    setSessionId(s.id)
    setMode(MODES.some(m => m.id === s.mode) ? (s.mode as DolphinMode) : 'general')
    const r = await fetch(`/api/dolphin/sessions/${s.id}`, { credentials: 'include' })
    if (r.ok) {
      const d = await r.json()
      setMessages(d.messages ?? [])
    }
  }

  async function newSession() {
    const r = await fetch('/api/dolphin/sessions', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    })
    if (r.ok) {
      const s = await r.json()
      setSessions(prev => [s, ...prev])
      setSessionId(s.id)
      setMessages([])
    }
  }

  async function deleteSession(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    await fetch(`/api/dolphin/sessions/${id}`, { method: 'DELETE', credentials: 'include' })
    setSessions(prev => prev.filter(s => s.id !== id))
    if (sessionId === id) { setSessionId(null); setMessages([]) }
  }

  async function exportSession() {
    if (!sessionId) return
    const r = await fetch(`/api/dolphin/sessions/${sessionId}/export`, {
      method: 'POST',
      credentials: 'include',
    })
    if (r.ok) {
      const d = await r.json()
      alert(`Obsidian 저장 완료: ${d.file ?? d.path}`)
    }
  }

  async function send() {
    if (!input.trim() || streaming) return
    const userMsg: DolphinMsg = { role: 'user', content: input.trim() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setStreaming(true)

    const assistantMsg: DolphinMsg = { role: 'assistant', content: '' }
    setMessages([...newMessages, assistantMsg])

    abortRef.current = new AbortController()
    try {
      const body: Record<string, unknown> = {
        messages: newMessages,
        mode,
        temperature: 0.7,
        num_ctx: 4096,
      }
      if (model) body.model = model

      // 세션 없이 보내면 dolphin 이 저장하지 않고 응답 청크에도 session_id 가 없다 —
      // 먼저 세션을 만들어 이 대화부터 보관되게 한다.
      let activeId = sessionId
      if (!activeId) {
        const sr = await fetch('/api/dolphin/sessions', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode }),
        })
        if (sr.ok) {
          const s = await sr.json()
          activeId = s.id
          setSessionId(s.id)
          setSessions(prev => [s, ...prev])
        }
      }
      if (activeId) body.session_id = activeId

      const r = await fetch('/api/dolphin/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: abortRef.current.signal,
      })

      if (!r.ok || !r.body) { setStreaming(false); return }

      const reader = r.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue
          try {
            const chunk = JSON.parse(data)
            const token = chunk.content ?? chunk.choices?.[0]?.delta?.content ?? chunk.token ?? ''
            if (token) {
              setMessages(prev => {
                const updated = [...prev]
                const last = updated[updated.length - 1]
                if (last?.role === 'assistant') {
                  updated[updated.length - 1] = { ...last, content: last.content + token }
                }
                return updated
              })
            }
          } catch { /* non-JSON line */ }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setMessages(prev => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last?.role === 'assistant' && !last.content) {
            updated[updated.length - 1] = { ...last, content: '오류가 발생했습니다.' }
          }
          return updated
        })
      }
    } finally {
      setStreaming(false)
      loadSessions()
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  return (
    <aside className="dolphin-modal" role="dialog" aria-modal="true">
      <div className="dolphin-sidebar">
        <div className="dolphin-sidebar-header">
          <Bot size={16}/> 로컬 LLM
          <button className="dolphin-new-btn" onClick={newSession} title="새 대화"><Plus size={14}/></button>
        </div>
        <div className="dolphin-session-list">
          {sessions.length === 0 && <p className="dolphin-empty">대화 없음</p>}
          {sessions.map(s => (
            <button
              key={s.id}
              className={`dolphin-session-item${s.id === sessionId ? ' active' : ''}`}
              onClick={() => openSession(s)}
            >
              <span className="dolphin-session-title">{s.title || '새 대화'}</span>
              <span className="dolphin-session-mode">{s.mode}</span>
              <button className="dolphin-delete-btn" onClick={e => deleteSession(s.id, e)} title="삭제">
                <Trash2 size={11}/>
              </button>
            </button>
          ))}
        </div>
      </div>

      <div className="dolphin-chat">
        <div className="dolphin-header">
          <div className="dolphin-mode-tabs">
            {MODES.map(m => (
              <button
                key={m.id}
                className={`dolphin-mode-tab${mode === m.id ? ' active' : ''}`}
                onClick={() => setMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="dolphin-header-actions">
            {models.length > 0 && (
              <select
                className="dolphin-model-select"
                value={model}
                onChange={e => setModel(e.target.value)}
              >
                <option value="">기본 모델</option>
                {models.map(m => <option key={m} value={m}>{m.split('/').pop()}</option>)}
              </select>
            )}
            {sessionId && (
              <button className="dolphin-export-btn" onClick={exportSession} title="Obsidian 저장">
                <Download size={14}/>
              </button>
            )}
            <button className="sheet-close" onClick={onClose}><X size={18}/></button>
          </div>
        </div>

        <div className="dolphin-body" ref={bodyRef}>
          {messages.length === 0 && (
            <div className="dolphin-welcome">
              <Bot size={32}/>
              <p>로컬 LLM에게 무엇이든 질문하세요.</p>
              <small>Qwen2.5-Coder-14B · 완전 오프라인 · 검열 없음</small>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`dolphin-msg dolphin-msg-${msg.role}`}>
              {msg.role === 'assistant'
                ? (msg.content
                    ? <div className="dolphin-msg-content dolphin-md">
                        <Suspense fallback={<pre className="dolphin-md-raw">{msg.content}</pre>}>
                          <Markdown>{msg.content}</Markdown>
                        </Suspense>
                      </div>
                    : <pre className="dolphin-msg-content">{streaming && i === messages.length - 1 ? '▍' : ''}</pre>)
                : <pre className="dolphin-msg-content">{msg.content}</pre>}
            </div>
          ))}
        </div>

        <form className="dolphin-input-row" onSubmit={e => { e.preventDefault(); send() }}>
          <textarea
            ref={textareaRef}
            className="dolphin-input"
            rows={2}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="메시지 입력 (Shift+Enter 줄바꿈)"
            disabled={streaming}
          />
          <button type="submit" className="dolphin-send-btn" disabled={streaming || !input.trim()}>
            <Send size={16}/>
          </button>
        </form>
      </div>
    </aside>
  )
}
