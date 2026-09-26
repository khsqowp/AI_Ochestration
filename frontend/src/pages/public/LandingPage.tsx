import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bot } from 'lucide-react'
import { HolographicCard } from '../../components/HolographicCard'
import { LandingWeather } from './LandingWeather'

export function LandingPage() {
  const navigate = useNavigate()
  const clicks = useRef({ n: 0, t: 0 })
  const [now, setNow] = useState(() => new Date())

  // 연월일 3연타(각 600ms 이내) → 대시보드. 미인증이면 RequireAuth 가 /login?next= 로.
  const tapDate = () => {
    const ts = Date.now()
    const c = clicks.current
    c.n = ts - c.t < 600 ? c.n + 1 : 1
    c.t = ts
    if (c.n >= 3) { c.n = 0; navigate('/dashboard') }
  }
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const time = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  const date = now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })

  return <div className="landing landing-3d">
    <div className="landing-canvas-host"><HolographicCard/></div>
    <div className="landing-veil" aria-hidden="true"/>
    <div className="landing-ui">
      <div className="landing-mark">
        <Bot size={18}/> <span>Orchestration Lab</span>
        <Link to="/order" className="landing-order-link">ORDER</Link>
        <Link to="/lunch" className="landing-order-link">LUNCH</Link>
      </div>
      <div className="landing-foot">
        <div className="landing-clock">
          <time className="landing-time">{time}</time>
          <p className="landing-date" onClick={tapDate}>{date}</p>
        </div>
        <LandingWeather/>
      </div>
    </div>
  </div>
}
