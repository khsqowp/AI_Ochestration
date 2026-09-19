import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { Notice, Role, Session, Task, TaskDomain, TaskEvent } from '../lib/types'
import { archiveTaskLabel } from '../lib/util'
import { useTodos } from '../components/Todo'
import { shouldDeferReload } from './AppState.logic'

type AppStateValue = {
  session: Session | null
  sessionChecked: boolean
  role: Role | null
  isAdmin: boolean
  loginError: string
  loggingIn: boolean
  login: (id: string, password: string) => Promise<void>
  logout: () => Promise<void>
  notices: Notice[]
  notify: (kind: Notice['kind'], message: string) => void
  dismissNotice: (id: string) => void
  todos: ReturnType<typeof useTodos>
  recentTasks: Task[]
  taskTracks: Record<string, TaskEvent[]>
  activeTask: Task | null
  setActiveTask: (task: Task | null) => void
  taskEvents: TaskEvent[]
  setTaskEvents: React.Dispatch<React.SetStateAction<TaskEvent[]>>
  chatInput: string
  setChatInput: (value: string) => void
  taskDomain: TaskDomain
  setTaskDomain: (value: TaskDomain) => void
  chatError: string
  uploading: boolean
  archivedCount: number
  pendingCandidates: number
  budgetExceeded: boolean
  updateAvailable: boolean
  submitTask: (event: FormEvent) => Promise<void>
  cancelTask: (id: string) => Promise<void>
  upload: (fileList?: FileList | null) => Promise<void>
  loadTasks: () => Promise<void | undefined>
  loadArchivedCount: () => Promise<void | undefined>
  openFileInExplorer: (path: string) => void
}

const AppStateContext = createContext<AppStateValue | null>(null)

export function useAppState(): AppStateValue {
  const value = useContext(AppStateContext)
  if (!value) throw new Error('useAppState must be used within <AppStateProvider>')
  return value
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [session, setSession] = useState<Session | null>(null)
  const [sessionChecked, setSessionChecked] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)
  const [notices, setNotices] = useState<Notice[]>([])
  const [recentTasks, setRecentTasks] = useState<Task[]>([])
  const [taskTracks, setTaskTracks] = useState<Record<string, TaskEvent[]>>({})
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [taskEvents, setTaskEvents] = useState<TaskEvent[]>([])
  const [chatInput, setChatInput] = useState('')
  const [taskDomain, setTaskDomain] = useState<TaskDomain>('SECURITY')
  const [chatError, setChatError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [archivedCount, setArchivedCount] = useState(0)
  const [budgetExceeded, setBudgetExceeded] = useState(false)
  const [pendingCandidates, setPendingCandidates] = useState(0)
  const [updateAvailable, setUpdateAvailable] = useState(false)

  const todos = useTodos(session?.user != null)

  const notify = (kind: Notice['kind'], message: string) => {
    const id = crypto.randomUUID()
    setNotices(previous => [...previous, { id, kind, message }].slice(-5))
    window.setTimeout(() => setNotices(previous => previous.filter(notice => notice.id !== id)), 7000)
  }
  const dismissNotice = (id: string) => setNotices(previous => previous.filter(notice => notice.id !== id))

  const taskStatusRef = useRef<Record<string, Task['status']>>({})
  const activeTaskIdRef = useRef<string | null>(null)
  useEffect(() => { activeTaskIdRef.current = activeTask?.id ?? null }, [activeTask?.id])
  const candidateCountRef = useRef<number | null>(null)
  const pathnameRef = useRef(location.pathname)
  pathnameRef.current = location.pathname
  // 공개 랜딩/로그인 화면에서 /api/** 를 폴링해 401 을 쏟지 않도록, 인증된 뒤에만 로더가 돈다.
  const authedRef = useRef(false)
  authedRef.current = session?.user != null

  const loadArchivedCount = () => fetch('/api/archive/files', { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(items => setArchivedCount(items.length)).catch(() => undefined)
  const loadBudgetStatus = () => fetch('/api/usage/summary?days=30', { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(data => { if (data) setBudgetExceeded(data.budgetExceeded) }).catch(() => undefined)
  const loadTasks = () => fetch('/api/tasks', { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setRecentTasks).catch(() => undefined)
  const loadCandidateCount = () => fetch('/api/source-candidates', { credentials: 'include' }).then(r => r.ok ? r.json() : []).then((items: unknown[]) => {
    if (candidateCountRef.current !== null && items.length > candidateCountRef.current) notify('info', `AI가 새 출처 후보 ${items.length - candidateCountRef.current}건을 찾았습니다.`)
    candidateCountRef.current = items.length
    setPendingCandidates(items.length)
  }).catch(() => undefined)

  useEffect(() => {
    fetch('/api/auth/session', { credentials: 'include' }).then(r => r.json()).then(setSession).catch(() => setSession({ authenticationEnabled: false, user: { displayName: 'Developer', email: 'local', role: 'ADMIN' } })).finally(() => setSessionChecked(true))
  }, [])

  // 인증되면(로그인 직후 포함) 한 번 로드하고, 후보 카운트는 30초 폴링.
  useEffect(() => {
    if (session?.user == null) return
    loadArchivedCount(); loadTasks(); loadBudgetStatus(); loadCandidateCount()
    const timer = window.setInterval(() => { if (!document.hidden) loadCandidateCount() }, 30000)
    return () => window.clearInterval(timer)
  }, [session?.user != null])

  const login = async (id: string, password: string) => {
    setLoggingIn(true); setLoginError('')
    const response = await fetch('/api/auth/login', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, password }) })
    setLoggingIn(false)
    if (!response.ok) { const body = await response.json().catch(() => null); setLoginError(body?.message ?? '로그인에 실패했습니다.'); return }
    setSession(await response.json())
  }
  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    window.location.href = '/'
  }
  const role: Role | null = session?.user?.role ?? null
  const isAdmin = role === 'ADMIN'

  // 새 빌드 감지 시 자동 새로고침 — 진행 중인 스트림·대화가 새로고침으로 끊기면 안 되는 페이지
  // (로컬 LLM, 역량강화 블랙박스 세션)만 배너로 미루고 나머지는 즉시 반영(shouldDeferReload).
  useEffect(() => {
    const check = async () => {
      if (document.hidden) return
      try {
        const data = await fetch(`/build-info.json?at=${Date.now()}`, { cache: 'no-store' }).then(response => response.json())
        const previous = sessionStorage.getItem('orchestration-build')
        if (previous === data.buildId) return
        sessionStorage.setItem('orchestration-build', data.buildId)
        if (!previous) return
        if (shouldDeferReload(pathnameRef.current)) setUpdateAvailable(true)
        else window.location.reload()
      } catch { /* 개발 중 임시 연결 실패는 무시 */ }
    }
    void check()
    const timer = window.setInterval(check, 5000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!activeTask || ['COMPLETED', 'FAILED', 'CANCELLED'].includes(activeTask.status)) return
    const polledId = activeTask.id
    const timer = window.setInterval(() => {
      if (document.hidden) return
      fetch(`/api/tasks/${polledId}`, { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(task => { if (task && activeTaskIdRef.current === polledId) { setActiveTask(task); loadTasks(); if (task.status === 'COMPLETED') loadArchivedCount() } })
      fetch(`/api/tasks/${polledId}/events`, { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(events => { if (activeTaskIdRef.current === polledId) setTaskEvents(events) })
    }, 1800)
    return () => window.clearInterval(timer)
  }, [activeTask?.id, activeTask?.status])

  useEffect(() => {
    const refreshTracks = async () => {
      if (document.hidden || !authedRef.current) return
      const tasks = await fetch('/api/tasks', { credentials: 'include' }).then(response => response.ok ? response.json() : []) as Task[]
      setRecentTasks(tasks)
      const previousStatuses = taskStatusRef.current
      for (const task of tasks) {
        const previous = previousStatuses[task.id]
        if (previous && previous !== task.status && (task.status === 'COMPLETED' || task.status === 'FAILED')) {
          notify(task.status === 'COMPLETED' ? 'success' : 'error', `${archiveTaskLabel(task.title)} — ${task.status === 'COMPLETED' ? '완료' : '실패'}`)
        }
      }
      taskStatusRef.current = Object.fromEntries(tasks.map(task => [task.id, task.status]))
      const active = tasks.filter(task => task.status === 'RUNNING' || task.status === 'QUEUED')
      const pairs = await Promise.all(active.map(async task => [task.id, await fetch(`/api/tasks/${task.id}/events`, { credentials: 'include' }).then(response => response.ok ? response.json() as Promise<TaskEvent[]> : null)] as const))
      setTaskTracks(prev => Object.fromEntries(pairs.map(([id, events]) => [id, events ?? prev[id] ?? []])))
    }
    void refreshTracks()
    const timer = window.setInterval(() => void refreshTracks(), 2000)
    return () => window.clearInterval(timer)
  }, [])

  const submitTask = async (event: FormEvent) => {
    event.preventDefault()
    const instruction = chatInput.trim()
    if (!instruction) return
    setChatError(''); setTaskEvents([])
    const response = await fetch('/api/tasks', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: instruction.slice(0, 80), instruction, domain: taskDomain }) })
    if (!response.ok) { setChatError('작업 접수에 실패했습니다. API 상태와 모델 설정을 확인해 주세요.'); return }
    const task = await response.json() as Task
    setActiveTask(task); setChatInput(''); loadTasks()
    fetch(`/api/tasks/${task.id}/events`, { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setTaskEvents)
  }

  const cancelTask = async (id: string) => {
    const response = await fetch(`/api/tasks/${id}/cancel`, { method: 'POST', credentials: 'include' })
    if (!response.ok) return
    setActiveTask(current => current && current.id === id ? { ...current, status: 'CANCELLED' } : current)
    loadTasks()
    fetch(`/api/tasks/${id}/events`, { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setTaskEvents)
  }

  const upload = async (fileList?: FileList | null) => {
    const files = fileList ? Array.from(fileList) : []
    if (files.length === 0) return
    setUploading(true); setChatError('')
    let failures = 0
    const taskIds: string[] = []
    for (const file of files) {
      const form = new FormData(); form.append('file', file)
      const response = await fetch('/api/files/upload', { method: 'POST', credentials: 'include', body: form })
      if (!response.ok) { failures++; continue }
      const uploaded = await response.json() as { analysisTaskId: string | null }
      if (uploaded.analysisTaskId) taskIds.push(uploaded.analysisTaskId)
    }
    setUploading(false); loadArchivedCount(); loadTasks()
    if (failures > 0) setChatError(`${files.length}개 중 ${failures}개 업로드에 실패했습니다. 50MB 이하 파일인지 확인해 주세요.`)
    navigate('/dashboard/notes')
    if (taskIds.length !== 1) return
    const taskResponse = await fetch(`/api/tasks/${taskIds[0]}`, { credentials: 'include' })
    if (!taskResponse.ok) return
    const task = await taskResponse.json() as Task
    setActiveTask(task); setTaskEvents([])
    fetch(`/api/tasks/${task.id}/events`, { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setTaskEvents)
  }

  const openFileInExplorer = (path: string) => navigate('/dashboard/notes', { state: { openFile: path } })

  const value: AppStateValue = {
    session, sessionChecked, role, isAdmin, loginError, loggingIn, login, logout,
    notices, notify, dismissNotice, todos,
    recentTasks, taskTracks, activeTask, setActiveTask, taskEvents, setTaskEvents,
    chatInput, setChatInput, taskDomain, setTaskDomain, chatError, uploading,
    archivedCount, pendingCandidates, budgetExceeded, updateAvailable,
    submitTask, cancelTask, upload, loadTasks, loadArchivedCount, openFileInExplorer,
  }
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}
