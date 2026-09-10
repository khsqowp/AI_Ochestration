import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { SettingsPanel } from '../panels/SettingsPanel'
import { UserManagementModal } from '../panels/UserManagementModal'
import { UsageModal } from '../panels/UsageModal'
import { DigestModal } from '../panels/DigestModal'
import { AccessLogPanel } from '../panels/AccessLogPanel'

const BASE = '/dashboard/admin'
const TABS = [
  { to: `${BASE}/settings`, label: '설정' },
  { to: `${BASE}/users`, label: '사용자' },
  { to: `${BASE}/usage`, label: '사용량·비용' },
  { to: `${BASE}/digest`, label: '다이제스트' },
  { to: `${BASE}/access`, label: '접근기록' },
]

export function AdminPage() {
  const navigate = useNavigate()
  return <div className="page admin-page">
    <div className="notes-header">
      <h2>관리</h2>
      <nav className="invest-tabs">
        {TABS.map(tab => <NavLink key={tab.to} to={tab.to} className={({ isActive }) => isActive ? 'active' : ''}>{tab.label}</NavLink>)}
      </nav>
    </div>
    <Routes>
      <Route index element={<Navigate to={`${BASE}/settings`} replace/>}/>
      <Route path="settings" element={<SettingsPanel embedded onOpenDigest={() => navigate(`${BASE}/digest`)}/>}/>
      <Route path="users" element={<UserManagementModal embedded/>}/>
      <Route path="usage" element={<UsageModal embedded/>}/>
      <Route path="digest" element={<DigestModal embedded/>}/>
      <Route path="access" element={<AccessLogPanel embedded/>}/>
      <Route path="*" element={<Navigate to={`${BASE}/settings`} replace/>}/>
    </Routes>
  </div>
}
