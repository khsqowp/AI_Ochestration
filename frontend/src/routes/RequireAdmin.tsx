import { Navigate, Outlet } from 'react-router-dom'
import { useAppState } from '../context/AppState'

export function RequireAdmin() {
  const { isAdmin } = useAppState()
  if (!isAdmin) return <Navigate to="/dashboard" replace/>
  return <Outlet/>
}
