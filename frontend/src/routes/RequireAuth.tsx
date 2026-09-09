import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAppState } from '../context/AppState'

export function RequireAuth() {
  const { session, sessionChecked } = useAppState()
  const location = useLocation()
  if (!sessionChecked) return <div className="app-loading"/>
  const authed = session?.user != null
  if (!authed) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace/>
  }
  return <Outlet/>
}
