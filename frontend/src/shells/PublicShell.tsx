import { Link, Outlet } from 'react-router-dom'
import { Bot } from 'lucide-react'

export function PublicShell() {
  return <div className="public-shell">
    <header className="public-header">
      <Link to="/" className="public-logo"><Bot size={20}/> <span>Orchestration Lab</span></Link>
    </header>
    <Outlet/>
  </div>
}
