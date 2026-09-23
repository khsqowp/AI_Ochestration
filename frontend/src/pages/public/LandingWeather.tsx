import { useEffect, useState } from 'react'
import {
  Sun, CloudSun, Cloud, CloudFog, CloudDrizzle, CloudRain, CloudSnow, CloudLightning,
  type LucideIcon,
} from 'lucide-react'

/* 서울 실시간 날씨 — 서버가 Open-Meteo를 대신 불러 캐싱해둔 걸 받아온다. 10분마다 갱신.
   우측 하단: 시간별 한 줄 + 일자별 한 줄. 실패 시 조용히 숨김. */

const API = '/api/public/weather'

function wx(code: number): { label: string; Icon: LucideIcon } {
  if (code === 0) return { label: '맑음', Icon: Sun }
  if (code <= 2) return { label: '구름 조금', Icon: CloudSun }
  if (code === 3) return { label: '흐림', Icon: Cloud }
  if (code <= 48) return { label: '안개', Icon: CloudFog }
  if (code <= 57) return { label: '이슬비', Icon: CloudDrizzle }
  if (code <= 67) return { label: '비', Icon: CloudRain }
  if (code <= 77) return { label: '눈', Icon: CloudSnow }
  if (code <= 82) return { label: '소나기', Icon: CloudRain }
  if (code <= 86) return { label: '소나기눈', Icon: CloudSnow }
  return { label: '뇌우', Icon: CloudLightning }
}

const round = (n: number) => Math.round(n)
const DOW = ['일', '월', '화', '수', '목', '금', '토']

type Hour = { key: string; hour: number; temp: number; code: number }
type Day = { key: string; label: string; max: number; min: number; code: number }
type Data = { nowTemp: number; nowCode: number; hours: Hour[]; days: Day[] }

interface Raw {
  current: { temperature_2m: number; weather_code: number }
  hourly: { time: string[]; temperature_2m: number[]; weather_code: number[] }
  daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[] }
}

function shape(raw: Raw): Data {
  const nowMs = Date.now()
  let start = raw.hourly.time.findIndex(t => new Date(t).getTime() >= nowMs)
  if (start < 0) start = 0
  const hours: Hour[] = []
  for (let i = start; i < start + 5 && i < raw.hourly.time.length; i++) {
    hours.push({
      key: raw.hourly.time[i],
      hour: new Date(raw.hourly.time[i]).getHours(),
      temp: round(raw.hourly.temperature_2m[i]),
      code: raw.hourly.weather_code[i],
    })
  }
  const days: Day[] = raw.daily.time.slice(0, 4).map((t, i) => ({
    key: t,
    label: i === 0 ? '오늘' : DOW[new Date(t).getDay()],
    max: round(raw.daily.temperature_2m_max[i]),
    min: round(raw.daily.temperature_2m_min[i]),
    code: raw.daily.weather_code[i],
  }))
  return { nowTemp: round(raw.current.temperature_2m), nowCode: raw.current.weather_code, hours, days }
}

export function LandingWeather() {
  const [data, setData] = useState<Data | null>(null)

  useEffect(() => {
    let alive = true
    const pull = async () => {
      try {
        const res = await fetch(API)
        if (!res.ok) throw new Error(`weather ${res.status}`)
        const raw = (await res.json()) as Raw
        if (alive) setData(shape(raw))
      } catch (err) {
        console.warn('날씨 조회 실패', err)
      }
    }
    pull()
    const timer = window.setInterval(pull, 600_000)
    return () => { alive = false; window.clearInterval(timer) }
  }, [])

  if (!data) return null
  const Now = wx(data.nowCode).Icon

  return <div className="landing-weather">
    <div className="lw-head">
      <Now size={15}/>
      <span className="lw-city">서울</span>
      <span className="lw-now">{data.nowTemp}°</span>
      <span className="lw-cond">{wx(data.nowCode).label}</span>
    </div>
    <div className="lw-row">
      {data.hours.map(h => {
        const I = wx(h.code).Icon
        return <span key={h.key} className="lw-cell">
          <b>{h.hour}시</b><I size={13}/><em>{h.temp}°</em>
        </span>
      })}
    </div>
    <div className="lw-row lw-days">
      {data.days.map(d => {
        const I = wx(d.code).Icon
        return <span key={d.key} className="lw-cell">
          <b>{d.label}</b><I size={13}/><em>{d.max}°</em><i>{d.min}°</i>
        </span>
      })}
    </div>
  </div>
}
