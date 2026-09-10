import { useEffect, useState } from 'react'
import { Bot } from 'lucide-react'
import { LandingShader } from './LandingShader'
import { LandingWeather } from './LandingWeather'

export function LandingPage() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const time = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  const date = now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })

  return <div className="landing landing-3d">
    <LandingShader/>
    <div className="landing-veil" aria-hidden="true"/>
    <div className="landing-ui">
      <div className="landing-mark"><Bot size={18}/> <span>Orchestration Lab</span></div>
      <div className="landing-foot">
        <div className="landing-clock">
          <time className="landing-time">{time}</time>
          <p className="landing-date">{date}</p>
        </div>
        <LandingWeather/>
      </div>
    </div>
  </div>
}
