import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { Bot, CircleHelp, LogOut, X } from 'lucide-react'
import { useAppState } from '../context/AppState'
import { NotificationStack, NotePromptBuilder } from '../components/shared'
import { TodoFloating } from '../components/Todo'

const NAV: { to: string; label: string; end?: boolean; adminOnly?: boolean }[] = [
  { to: '/dashboard', label: '대시보드', end: true },
  { to: '/dashboard/notes', label: '노트 생성' },
  { to: '/dashboard/order', label: '주문', adminOnly: true },
  { to: '/dashboard/invest', label: '투자', adminOnly: true },
  { to: '/dashboard/calendar', label: '캘린더' },
  { to: '/dashboard/diag', label: '진단' },
  { to: '/dashboard/llm', label: '로컬 LLM' },
  { to: '/dashboard/debate', label: '토론', adminOnly: true },
  { to: '/dashboard/역량강화', label: '역량 강화', adminOnly: true },
  { to: '/dashboard/admin', label: '관리', adminOnly: true },
]

export function AppShell() {
  const { session, isAdmin, logout, notices, dismissNotice, todos, budgetExceeded, updateAvailable } = useAppState()
  const [helpOpen, setHelpOpen] = useState(false)
  return <div className="app-shell">
    <header className="app-topbar">
      <Link to="/dashboard" className="topbar-logo"><Bot size={19}/> <span>Orchestration Lab</span></Link>
      <nav className="topbar-nav">
        {NAV.filter(item => !item.adminOnly || isAdmin).map(item => (
          <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => isActive ? 'active' : ''}>{item.label}</NavLink>
        ))}
      </nav>
      <div className="topbar-right">
        {updateAvailable && <button className="update-banner" onClick={() => window.location.reload()}>새 버전 있음 · 새로고침</button>}
        <button className="icon-button" title="도움말" onClick={() => setHelpOpen(true)}><CircleHelp size={17}/></button>
        <span className={`topbar-account ${budgetExceeded ? 'budget-exceeded' : ''}`}>
          <span className="online-dot"/>{session?.user?.displayName ?? '연결 중'}
          <small>{isAdmin ? (budgetExceeded ? '⚠ 예산 초과' : '관리자') : '사용자'}</small>
        </span>
        <button className="icon-button" onClick={logout} title="로그아웃"><LogOut size={17}/></button>
      </div>
    </header>
    <main className="app-main"><Outlet/></main>
    <NotificationStack notices={notices} onDismiss={dismissNotice}/>
    <TodoFloating items={todos.items} onAdd={todos.add} onToggle={todos.toggle}/>
    {helpOpen && <aside className="side-modal" role="dialog" aria-modal="true">
      <div className="sheet-header"><div><p className="eyebrow">QUICK HELP</p><h2>사용 방법</h2></div><button className="sheet-close" onClick={() => setHelpOpen(false)}><X size={18}/></button></div>
      {isAdmin ? <>
        <p className="source-intro">PM 대화에서 지시를 보내면 수집 → 상호 검토 → 팀장 → PM → 아카이브 순서로 진행됩니다. 상단바에서 카테고리를 골라 이동하세요.</p>
        <p className="source-intro">아래에 주제를 입력하면 이 오케스트레이션에 맞는 노트 생성 프롬프트가 완성됩니다 — 복사해서 PM 대화창에 붙여넣으세요.</p>
        <NotePromptBuilder/>
      </> : <p className="source-intro">RAG 대화 탭에서 아카이브에 쌓인 노트에 질문할 수 있습니다. 상단바에서 카테고리를 골라 이동하세요.</p>}
    </aside>}
  </div>
}
