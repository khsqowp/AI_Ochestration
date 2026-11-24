import { useEffect, useState } from 'react'
import { ChevronDown, Download } from 'lucide-react'
import { SCANNER_TOOLS } from '../scanner-tools-data'

const STORAGE_KEY = 'diag-scanner-sessions-v1'
interface ToolRecord { run: boolean; timestamp: string | null; note: string; output: string }
interface Session { target: string; tools: Record<string, ToolRecord> }
interface Store { sessions: Session[]; selected: string }
const emptyRecord = (): ToolRecord => ({ run: false, timestamp: null, note: '', output: '' })
const emptyStore = (): Store => ({ sessions: [], selected: '' })

function loadStore(): { store: Store; unavailable: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Store
      if (Array.isArray(parsed.sessions) && typeof parsed.selected === 'string') return { store: parsed, unavailable: false }
    }
  } catch { /* 저장소를 쓸 수 없으면 현재 화면에서만 기록한다 */ return { store: emptyStore(), unavailable: true } }
  return { store: emptyStore(), unavailable: false }
}

function downloadFile(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function safeFilename(value: string) {
  return value.trim().replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '') || 'target'
}

function markdown(session: Session, exportedAt: string) {
  const rows = SCANNER_TOOLS.filter(tool => session.tools[tool.id]?.run).map(tool => {
    const record = session.tools[tool.id]
    return `## ${tool.name}\n\n- 실행 시각: ${record.timestamp ? new Date(record.timestamp).toLocaleString('ko-KR') : '기록 없음'}\n- 메모: ${record.note || '없음'}\n\n\`\`\`\n${record.output}\n\`\`\``
  })
  return `# 진단 세션: ${session.target}\n\n- 내보낸 시각: ${new Date(exportedAt).toLocaleString('ko-KR')}\n\n${rows.join('\n\n')}`
}

export function ScannerSessionTracker() {
  const [initial] = useState(loadStore)
  const [store, setStore] = useState<Store>(initial.store)
  const [targetInput, setTargetInput] = useState('')
  const [expanded, setExpanded] = useState(true)
  const [openTools, setOpenTools] = useState<Record<string, boolean>>({})
  const [storageUnavailable, setStorageUnavailable] = useState(initial.unavailable)
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)) }
    catch { setStorageUnavailable(true) }
  }, [store])

  const current = store.sessions.find(session => session.target === store.selected)
  const addTarget = () => {
    const target = targetInput.trim()
    if (!target || store.sessions.some(session => session.target === target)) return
    setStore(s => ({ sessions: [...s.sessions, { target, tools: {} }], selected: target }))
    setTargetInput('')
  }
  const updateTool = (id: string, update: Partial<ToolRecord>) => setStore(s => ({
    ...s,
    sessions: s.sessions.map(session => session.target !== s.selected ? session : {
      ...session, tools: { ...session.tools, [id]: { ...emptyRecord(), ...session.tools[id], ...update } },
    }),
  }))
  const toggleRun = (id: string, run: boolean) => {
    const currentRecord = current?.tools[id] ?? emptyRecord()
    updateTool(id, { run, timestamp: run ? (currentRecord.timestamp ?? new Date().toISOString()) : currentRecord.timestamp })
  }
  const deleteTarget = () => {
    if (!current || !window.confirm(`'${current.target}' 진단 세션을 삭제합니다. 계속할까요?`)) return
    setStore(s => {
      const sessions = s.sessions.filter(session => session.target !== s.selected)
      return { sessions, selected: sessions[0]?.target ?? '' }
    })
  }
  const exportSession = (format: 'md' | 'json') => {
    if (!current) return
    const exportedAt = new Date().toISOString()
    if (format === 'md') downloadFile(`${safeFilename(current.target)}-diag-session.md`, markdown(current, exportedAt), 'text/markdown;charset=utf-8')
    else {
      const tools = Object.fromEntries(SCANNER_TOOLS.map(tool => [tool.id, current.tools[tool.id] ?? emptyRecord()]))
      downloadFile(`${safeFilename(current.target)}-diag-session.json`, JSON.stringify({ target: current.target, exportedAt, tools }, null, 2), 'application/json;charset=utf-8')
    }
  }

  return <section className="diag-block diag-session-card">
    <button className="diag-scanner-head" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
      <div><strong>진단 세션</strong><small>대상별 실행 기록과 메모를 이 브라우저에 저장한다</small></div>
      <ChevronDown size={16} className={expanded ? 'diag-scanner-chevron open' : 'diag-scanner-chevron'}/>
    </button>
    {expanded && <div className="diag-session-body">
      {storageUnavailable && <p className="diag-session-notice" role="status">이 브라우저에서는 세션 기록이 저장되지 않는다. 현재 화면을 닫으면 기록이 사라질 수 있다.</p>}
      <form className="diag-session-target-add" onSubmit={event => { event.preventDefault(); addTarget() }}>
        <label htmlFor="diag-session-new-target">새 대상</label>
        <input id="diag-session-new-target" value={targetInput} onChange={event => setTargetInput(event.target.value)} placeholder="예: client-target.com" />
        <button type="submit" className="diag-guided-primary">대상 추가</button>
      </form>
      {store.sessions.length > 0 && <div className="diag-session-target-row">
        <label htmlFor="diag-session-target">기록 대상</label>
        <select id="diag-session-target" value={store.selected} onChange={event => setStore(s => ({ ...s, selected: event.target.value }))}>
          {store.sessions.map(session => <option key={session.target} value={session.target}>{session.target}</option>)}
        </select>
        <button className="diag-guided-reset" onClick={deleteTarget}>현재 대상 삭제</button>
      </div>}
      {!current ? <p className="diag-session-empty">기록할 대상을 추가한다.</p> : <>
        <div className="diag-session-export">
          <button className="diag-guided-reset" onClick={() => exportSession('md')}><Download size={13}/> 세션 내보내기 (MD)</button>
          <button className="diag-guided-reset" onClick={() => exportSession('json')}><Download size={13}/> 세션 내보내기 (JSON)</button>
        </div>
        <div className="diag-session-tools">
          {SCANNER_TOOLS.map(tool => {
            const record = current.tools[tool.id] ?? emptyRecord()
            const isOpen = !!openTools[tool.id]
            return <article className="diag-session-tool" key={tool.id}>
              <div className="diag-session-tool-head">
                <label className="diag-session-run"><input type="checkbox" checked={record.run} onChange={event => toggleRun(tool.id, event.target.checked)} /> <strong>{tool.name}</strong></label>
                <span className="diag-session-time">{record.timestamp ? new Date(record.timestamp).toLocaleString('ko-KR') : '실행 시각 없음'}</span>
                <button className="diag-session-time-action" onClick={() => updateTool(tool.id, { timestamp: new Date().toISOString() })}>지금으로 재설정</button>
                {record.timestamp && <button className="diag-session-time-action" onClick={() => updateTool(tool.id, { timestamp: null })}>시각 지우기</button>}
                <button className="diag-session-output-toggle" aria-expanded={isOpen} onClick={() => setOpenTools(s => ({ ...s, [tool.id]: !s[tool.id] }))}>{isOpen ? '출력 접기' : '출력 열기'}</button>
              </div>
              <label className="diag-session-field">메모<input aria-label={`${tool.name} 메모`} value={record.note} onChange={event => updateTool(tool.id, { note: event.target.value })} placeholder="짧은 결과 요약" /></label>
              {isOpen && <label className="diag-session-field">붙여넣은 출력<textarea aria-label={`${tool.name} 붙여넣은 출력`} value={record.output} onChange={event => updateTool(tool.id, { output: event.target.value })} rows={5} placeholder="도구 출력이나 관련 발췌를 붙여넣는다" /></label>}
            </article>
          })}
        </div>
      </>}
    </div>}
  </section>
}
