import { Link, NavLink, Outlet } from 'react-router-dom'
import { Bot, LogOut } from 'lucide-react'
import { useAppState } from '../context/AppState'
import { NotificationStack } from '../components/shared'
import { TodoFloating } from '../components/Todo'
import { FeedbackNotificationBell } from '../components/FeedbackNotificationBell'
import { CurlCommandModeProvider } from '../context/CurlCommandMode'

const NAV: { to: string; label: string; end?: boolean; adminOnly?: boolean; external?: boolean }[] = [
  { to: '/dashboard', label: '대시보드', end: true },
  { to: '/dashboard/notes', label: '노트 생성' },
  { to: '/dashboard/order', label: '주문', adminOnly: true },
  { to: '/dashboard/invest', label: '투자', adminOnly: true },
  { to: '/dashboard/calendar', label: '캘린더' },
  { to: '/dashboard/diag', label: '진단' },
  { to: '/dashboard/notebook', label: '진단 기록판' },
  { to: '/dashboard/archive', label: '아카이브', adminOnly: true },
  { to: 'https://artex.khsqowp1.my', label: 'ARTEX', adminOnly: true, external: true },
  { to: '/dashboard/debate', label: '토론', adminOnly: true },
  { to: '/dashboard/역량강화', label: '역량 강화', adminOnly: true },
  { to: '/dashboard/admin', label: '관리', adminOnly: true },
  { to: '/dashboard/feedback', label: '개선함' },
]

export function AppShell() {
  const { session, isAdmin, logout, notices, dismissNotice, todos, budgetExceeded, updateAvailable } = useAppState()
  return <div className="app-shell">
    <header className="app-topbar">
      <Link to="/dashboard" className="topbar-logo"><Bot size={19}/> <span>Orchestration Lab</span></Link>
      <nav className="topbar-nav">
        {NAV.filter(item => !item.adminOnly || isAdmin).map(item => (
          item.external
            ? <a key={item.to} href={item.to} target="_blank" rel="noopener noreferrer">{item.label}</a>
            : <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => isActive ? 'active' : ''}>{item.label}</NavLink>
        ))}
      </nav>
      <div className="topbar-right">
        {updateAvailable && <button className="update-banner" onClick={() => window.location.reload()}>새 버전 있음 · 새로고침</button>}
        <FeedbackNotificationBell/>
        <span className={`topbar-account ${budgetExceeded ? 'budget-exceeded' : ''}`}>
          <span className="online-dot"/>{session?.user?.displayName ?? '연결 중'}
          <small>{isAdmin ? (budgetExceeded ? '⚠ 예산 초과' : '관리자') : '사용자'}</small>
        </span>
        <button className="icon-button" onClick={logout} title="로그아웃"><LogOut size={17}/></button>
      </div>
    </header>
    <main className="app-main"><CurlCommandModeProvider><Outlet/></CurlCommandModeProvider></main>
    <NotificationStack notices={notices} onDismiss={dismissNotice}/>
    <TodoFloating items={todos.items} onAdd={todos.add} onToggle={todos.toggle}/>
  </div>
}
