import { useEffect, useState } from 'react'

export function LandingPage() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const time = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  const date = now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
  return <div className="landing">
    <div className="landing-clock">
      <time className="landing-time">{time}</time>
      <p className="landing-date">{date}</p>
    </div>
  </div>
}
