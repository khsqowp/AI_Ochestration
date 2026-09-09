import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { ErrorBoundary } from '../components/shared'
import {
  KrTradingDashboard, MomentumRotationDashboard, TradingDashboard, UsTradingDashboard,
} from '../panels/trading'

const BASE = '/dashboard/invest'
const TABS = [
  { to: `${BASE}/coin`, label: '코인 모멘텀', tag: 'live · 2x' },
  { to: `${BASE}/kr`, label: '국장 로테이션', tag: 'paper' },
  { to: `${BASE}/us`, label: '미장 로테이션', tag: 'paper' },
  { to: `${BASE}/funding-arb`, label: '펀딩 아비', tag: 'deprecated' },
]

export function InvestPage() {
  return <div className="page invest-page">
    <div className="notes-header">
      <h2>투자</h2>
      <nav className="invest-tabs">
        {TABS.map(tab => <NavLink key={tab.to} to={tab.to} className={({ isActive }) => isActive ? 'active' : ''}>
          {tab.label}<small>{tab.tag}</small>
        </NavLink>)}
      </nav>
    </div>
    <ErrorBoundary label="투자">
      <Routes>
        <Route index element={<Navigate to={`${BASE}/coin`} replace/>}/>
        <Route path="coin" element={<MomentumRotationDashboard embedded/>}/>
        <Route path="kr" element={<KrTradingDashboard embedded/>}/>
        <Route path="us" element={<UsTradingDashboard embedded/>}/>
        <Route path="funding-arb" element={<TradingDashboard embedded/>}/>
        <Route path="*" element={<Navigate to={`${BASE}/coin`} replace/>}/>
      </Routes>
    </ErrorBoundary>
  </div>
}
