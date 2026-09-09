import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Bot, ChevronRight, LockKeyhole } from 'lucide-react'
import { useAppState } from '../../context/AppState'

export function LoginPage() {
  const { session, sessionChecked, login, loginError, loggingIn } = useAppState()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [id, setId] = useState('')
  const [password, setPassword] = useState('')
  const next = params.get('next') || '/dashboard'

  // 이미 세션이 있거나(로그인 성공 포함) 인증이 꺼진 로컬 모드면 곧장 목적지로.
  if (sessionChecked && (session?.user || (session && !session.authenticationEnabled))) {
    return <Navigate to={next} replace/>
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    await login(id, password)
  }

  return <main className="login-page"><section className="login-card">
    <div className="login-mark"><Bot size={28}/></div>
    <p className="eyebrow">ORCHESTRATION LAB</p>
    {!sessionChecked ? <h1>연결 중…</h1> : <>
      <h1>개인 연구실에<br/>입장합니다.</h1>
      <p className="muted">계정으로 로그인하세요.</p>
      <form className="login-form" onSubmit={submit}>
        <input value={id} onChange={e => setId(e.target.value)} placeholder="아이디" autoComplete="username" required/>
        <input value={password} onChange={e => setPassword(e.target.value)} placeholder="비밀번호" type="password" autoComplete="current-password" required/>
        {loginError && <p className="form-error">{loginError}</p>}
        <button className="primary-button" type="submit" disabled={loggingIn}>{loggingIn ? '로그인 중…' : '로그인'} <ChevronRight size={18}/></button>
      </form>
      <p className="login-note"><LockKeyhole size={14}/> <button type="button" className="linklike" onClick={() => navigate('/')}>랜딩으로 돌아가기</button></p>
    </>}
  </section></main>
}
