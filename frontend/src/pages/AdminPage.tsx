import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { SettingsPanel } from '../panels/SettingsPanel'
import { UserManagementModal } from '../panels/UserManagementModal'
import { UsageModal } from '../panels/UsageModal'
import { DigestModal } from '../panels/DigestModal'

const TABS = [
  { to: 'settings', label: '설정' },
  { to: 'users', label: '사용자' },
  { to: 'usage', label: '사용량·비용' },
  { to: 'digest', label: '다이제스트' },
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
      <Route index element={<Navigate to="settings" replace/>}/>
      <Route path="settings" element={<SettingsPanel embedded onOpenDigest={() => navigate('../digest')}/>}/>
      <Route path="users" element={<UserManagementModal embedded/>}/>
      <Route path="usage" element={<UsageModal embedded/>}/>
      <Route path="digest" element={<DigestModal embedded/>}/>
      <Route path="*" element={<Navigate to="settings" replace/>}/>
    </Routes>
  </div>
}
