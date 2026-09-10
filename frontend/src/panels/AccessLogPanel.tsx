import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { AccessLogSummary } from '../lib/types'
import { PanelShell } from '../components/shared'
import { GeoHeatMap } from '../components/GeoHeatMap'

const fmtTime = (iso: string) => new Date(iso).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })

export function AccessLogPanel({ onClose, embedded }: { onClose?: () => void; embedded?: boolean }) {
  const [data, setData] = useState<AccessLogSummary | null>(null)
  const [err, setErr] = useState(false)

  const load = () => {
    fetch('/api/admin/access-log', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: AccessLogSummary) => { setData(d); setErr(false) })
      .catch(() => setErr(true))
  }
  useEffect(() => { load(); const t = window.setInterval(load, 30_000); return () => window.clearInterval(t) }, [])

  const korea = data ? data.points.filter(p => p.countryCode === 'KR') : []

  return <PanelShell embedded={embedded} className="side-modal">
    <div className="sheet-header">
      <div><p className="eyebrow">SECURITY</p><h2>접근기록</h2></div>
      {onClose && <button className="sheet-close" onClick={onClose}><X size={18}/></button>}
    </div>

    {err && <p className="budget-alert">접근기록을 불러오지 못했습니다.</p>}
    {!data && !err && <p className="empty-state">불러오는 중…</p>}

    {data && <>
      <div className="access-stats">
        <div><b>{data.stats.totalHits.toLocaleString()}</b><span>총 시도</span></div>
        <div><b>{data.stats.uniqueIps.toLocaleString()}</b><span>고유 IP</span></div>
        <div><b>{data.stats.countries}</b><span>국가</span></div>
        <div><b>{data.stats.mappedIps}</b><span>지도 표시</span></div>
        <div><b>{data.stats.last24h.toLocaleString()}</b><span>최근 24시간</span></div>
      </div>

      <div className="access-maps">
        <section>
          <h3>전세계 <small>{data.points.length} IP</small></h3>
          <GeoHeatMap view="world" points={data.points}/>
        </section>
        <section>
          <h3>국내 <small>{korea.length} IP</small></h3>
          <GeoHeatMap view="korea" points={korea}/>
        </section>
      </div>

      <h3 className="access-recent-title">최근 시도</h3>
      <div className="access-recent-wrap">
        <table className="access-recent">
          <thead><tr>
            <th>시각</th><th>IP</th><th>위치</th><th>ISP</th><th>경로</th><th>응답</th><th>세션</th>
          </tr></thead>
          <tbody>
            {data.recent.map((r, i) => <tr key={i} className={r.hadSession ? 'has-session' : ''}>
              <td className="ar-ts">{fmtTime(r.ts)}</td>
              <td className="ar-ip">{r.ip}</td>
              <td>{[r.city, r.country].filter(Boolean).join(', ') || '—'}</td>
              <td className="ar-isp">{r.isp || '—'}</td>
              <td className="ar-path">{r.method} {r.path}</td>
              <td className="ar-status">{r.status < 0 ? '·' : r.status}</td>
              <td className="ar-session">{r.hadSession ? '●' : ''}</td>
            </tr>)}
          </tbody>
        </table>
      </div>

      <p className="usage-note">
        위치는 Cloudflare 방문자 위치 헤더(정밀)를 우선 쓰고, 없으면 ip-api.com 으로 추정합니다.
        정확도를 높이려면 Cloudflare → Rules → Transform Rules → Managed Transforms →
        "Add visitor location headers" 를 켜세요.
      </p>
    </>}
  </PanelShell>
}
