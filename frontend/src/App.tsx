import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppStateProvider } from './context/AppState'
import { PublicShell } from './shells/PublicShell'
import { AppShell } from './shells/AppShell'
import { RequireAuth } from './routes/RequireAuth'
import { RequireAdmin } from './routes/RequireAdmin'
import { LandingPage } from './pages/public/LandingPage'
import { LoginPage } from './pages/public/LoginPage'
import { OrderPage } from './pages/public/OrderPage'
import { DashboardPage } from './pages/DashboardPage'
import { NotesPage } from './pages/NotesPage'
import { CalendarPage } from './pages/CalendarPage'
import { DebatePage } from './pages/DebatePage'

const DiagnosticsPage = lazy(() => import('./pages/DiagnosticsPage').then(m => ({ default: m.DiagnosticsPage })))
const LocalLlmPage = lazy(() => import('./pages/LocalLlmPage').then(m => ({ default: m.LocalLlmPage })))
const InvestPage = lazy(() => import('./pages/InvestPage').then(m => ({ default: m.InvestPage })))
const AdminPage = lazy(() => import('./pages/AdminPage').then(m => ({ default: m.AdminPage })))
const OrderBoardPage = lazy(() => import('./pages/OrderBoardPage').then(m => ({ default: m.OrderBoardPage })))
const CompetencyPage = lazy(() => import('./pages/CompetencyPage').then(m => ({ default: m.CompetencyPage })))
const LunchRoulettePage = lazy(() => import('./pages/public/LunchRoulettePage').then(m => ({ default: m.LunchRoulettePage })))

export function App() {
  return <BrowserRouter>
    <AppStateProvider>
      <Suspense fallback={<div className="app-loading"/>}>
        <Routes>
          <Route element={<PublicShell/>}>
            <Route path="/" element={<LandingPage/>}/>
            <Route path="/login" element={<LoginPage/>}/>
            <Route path="/order" element={<OrderPage/>}/>
            <Route path="/lunch" element={<LunchRoulettePage/>}/>
          </Route>
          <Route path="/dashboard" element={<RequireAuth/>}>
            <Route element={<AppShell/>}>
              <Route index element={<DashboardPage/>}/>
              <Route path="notes" element={<NotesPage/>}/>
              <Route path="calendar" element={<CalendarPage/>}/>
              <Route path="diag" element={<DiagnosticsPage/>}/>
              <Route path="llm" element={<LocalLlmPage/>}/>
              <Route element={<RequireAdmin/>}>
                <Route path="order" element={<OrderBoardPage/>}/>
                <Route path="invest/*" element={<InvestPage/>}/>
                <Route path="admin/*" element={<AdminPage/>}/>
                <Route path="debate" element={<DebatePage/>}/>
                <Route path="역량강화/*" element={<CompetencyPage/>}/>
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace/>}/>
        </Routes>
      </Suspense>
    </AppStateProvider>
  </BrowserRouter>
}
