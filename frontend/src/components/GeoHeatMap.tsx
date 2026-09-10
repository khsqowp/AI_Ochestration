import { useMemo, useState } from 'react'
import { geoNaturalEarth1, geoMercator, geoPath, type GeoProjection } from 'd3-geo'
import { feature } from 'topojson-client'
import worldTopo from 'world-atlas/countries-110m.json'
import type { AccessPoint } from '../lib/types'

// world-atlas ships a TopoJSON Topology; type it loosely and convert once.
const LAND = feature(worldTopo as never, (worldTopo as never as { objects: { countries: never } }).objects.countries) as unknown as {
  features: { id?: string; properties?: { name?: string } }[]
}

const KOREA_BOUNDS = { type: 'MultiPoint' as const, coordinates: [[124.5, 33.0], [131.9, 38.7]] }

function project(view: 'world' | 'korea', w: number, h: number): GeoProjection {
  if (view === 'korea') return geoMercator().fitExtent([[10, 10], [w - 10, h - 10]], KOREA_BOUNDS)
  return geoNaturalEarth1().fitExtent([[4, 4], [w - 4, h - 4]], { type: 'Sphere' })
}

export function GeoHeatMap({ view, points }: { view: 'world' | 'korea'; points: AccessPoint[] }) {
  const W = view === 'korea' ? 460 : 960
  const H = view === 'korea' ? 460 : 480
  const [hover, setHover] = useState<{ p: AccessPoint; x: number; y: number } | null>(null)

  const { paths, dots } = useMemo(() => {
    const proj = project(view, W, H)
    const path = geoPath(proj)
    const paths = LAND.features.map((f, i) => ({ d: path(f as never) || '', key: i }))
    const maxHits = Math.max(1, ...points.map(p => p.hits))
    const dots = points.map(p => {
      const xy = proj([p.lon, p.lat])
      if (!xy) return null
      const r = 5 + 26 * Math.sqrt(p.hits / maxHits)
      return { p, x: xy[0], y: xy[1], r }
    }).filter((d): d is { p: AccessPoint; x: number; y: number; r: number } => d !== null)
    return { paths, dots }
  }, [view, W, H, points])

  return <div className="geo-map">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={view === 'korea' ? '국내 접근 지도' : '전세계 접근 지도'}>
      <defs>
        <filter id={`glow-${view}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <rect x="0" y="0" width={W} height={H} className="geo-ocean"/>
      <g className="geo-land">{paths.map(p => <path key={p.key} d={p.d}/>)}</g>
      <g className="geo-heat" filter={`url(#glow-${view})`}>
        {dots.map((d, i) => <circle key={`h${i}`} cx={d.x} cy={d.y} r={d.r} className="geo-heat-blob"/>)}
      </g>
      <g className="geo-dots">
        {dots.map((d, i) => <circle key={`d${i}`} cx={d.x} cy={d.y} r={2.6}
          className={d.p.sessionHits > 0 ? 'geo-dot session' : 'geo-dot'}
          onMouseEnter={e => setHover({ p: d.p, x: e.clientX, y: e.clientY })}
          onMouseMove={e => setHover({ p: d.p, x: e.clientX, y: e.clientY })}
          onMouseLeave={() => setHover(null)}/>)}
      </g>
    </svg>
    {dots.length === 0 && <p className="geo-empty">표시할 위치 없음</p>}
    {hover && <div className="geo-tip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
      <b>{hover.p.ip}</b>
      <span>{[hover.p.city, hover.p.region, hover.p.country].filter(Boolean).join(' · ') || '위치 미상'}</span>
      {hover.p.isp && <span className="geo-tip-isp">{hover.p.isp}</span>}
      <span>{hover.p.hits}회 시도{hover.p.sessionHits > 0 ? ` · 세션 ${hover.p.sessionHits}` : ''} · {hover.p.accuracy === 'cf' ? 'CF 정밀' : 'IP 추정'}</span>
    </div>}
  </div>
}
