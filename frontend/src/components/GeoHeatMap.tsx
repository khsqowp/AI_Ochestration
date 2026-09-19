import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react'
import { geoNaturalEarth1, geoMercator, geoPath, type GeoProjection } from 'd3-geo'
import { feature } from 'topojson-client'
import worldTopo from 'world-atlas/countries-110m.json'
import type { AccessPoint } from '../lib/types'

// world-atlas ships a TopoJSON Topology; type it loosely and convert once.
const LAND = feature(worldTopo as never, (worldTopo as never as { objects: { countries: never } }).objects.countries) as unknown as {
  features: { id?: string; properties?: { name?: string } }[]
}

const KOREA_BOUNDS = { type: 'MultiPoint' as const, coordinates: [[124.5, 33.0], [131.9, 38.7]] }
const MIN_ZOOM = 1
const MAX_ZOOM = 8
const ZOOM_STEP = 1.18

function project(view: 'world' | 'korea', w: number, h: number): GeoProjection {
  if (view === 'korea') return geoMercator().fitExtent([[10, 10], [w - 10, h - 10]], KOREA_BOUNDS)
  return geoNaturalEarth1().fitExtent([[4, 4], [w - 4, h - 4]], { type: 'Sphere' })
}

export function GeoHeatMap({ view, points }: { view: 'world' | 'korea'; points: AccessPoint[] }) {
  const W = view === 'korea' ? 460 : 960
  const H = view === 'korea' ? 460 : 480
  const [hover, setHover] = useState<{ p: AccessPoint; x: number; y: number } | null>(null)
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: MIN_ZOOM })
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ pointerId: number; clientX: number; clientY: number; x: number; y: number; zoom: number } | null>(null)

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

  const resetViewport = () => setViewport({ x: 0, y: 0, zoom: MIN_ZOOM })
  const zoomAt = (clientX: number, clientY: number, multiplier: number, target: SVGSVGElement) => {
    const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, viewport.zoom * multiplier))
    if (nextZoom === viewport.zoom) return
    const rect = target.getBoundingClientRect()
    const ratioX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const ratioY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
    const currentWidth = W / viewport.zoom
    const currentHeight = H / viewport.zoom
    const nextWidth = W / nextZoom
    const nextHeight = H / nextZoom
    const worldX = viewport.x + ratioX * currentWidth
    const worldY = viewport.y + ratioY * currentHeight
    setViewport({
      x: Math.max(0, Math.min(W - nextWidth, worldX - ratioX * nextWidth)),
      y: Math.max(0, Math.min(H - nextHeight, worldY - ratioY * nextHeight)),
      zoom: nextZoom,
    })
  }
  const handleWheel = (event: WheelEvent<SVGSVGElement>) => {
    event.preventDefault()
    zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, event.currentTarget)
  }
  const handleKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key === '0') { event.preventDefault(); resetViewport(); return }
    if (event.key !== '+' && event.key !== '=' && event.key !== '-') return
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, event.key === '-' ? 1 / ZOOM_STEP : ZOOM_STEP, event.currentTarget)
  }
  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return
    drag.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, ...viewport }
    event.currentTarget.setPointerCapture(event.pointerId)
    setHover(null)
    setDragging(true)
  }
  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const active = drag.current
    if (!active || active.pointerId !== event.pointerId) return
    const rect = event.currentTarget.getBoundingClientRect()
    const visibleWidth = W / active.zoom
    const visibleHeight = H / active.zoom
    const x = Math.max(0, Math.min(W - visibleWidth, active.x - (event.clientX - active.clientX) / rect.width * visibleWidth))
    const y = Math.max(0, Math.min(H - visibleHeight, active.y - (event.clientY - active.clientY) / rect.height * visibleHeight))
    setViewport({ x, y, zoom: active.zoom })
  }
  const endDrag = (event: PointerEvent<SVGSVGElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    drag.current = null
    setDragging(false)
  }
  const viewBox = `${viewport.x} ${viewport.y} ${W / viewport.zoom} ${H / viewport.zoom}`

  return <div className="geo-map">
    <svg viewBox={viewBox} role="img" tabIndex={0} onWheel={handleWheel} onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}
      className={dragging ? 'is-dragging' : undefined}
      aria-label={`${view === 'korea' ? '국내 접근 지도' : '전세계 접근 지도'}. 마우스 휠로 확대·축소하고, 왼쪽 버튼으로 드래그해 이동합니다. 0 키로 초기화합니다.`}>
      <defs>
        <filter id={`glow-${view}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <rect x="0" y="0" width={W} height={H} className="geo-ocean"/>
      <g className="geo-land">{paths.map(p => <path key={p.key} d={p.d}/>)}</g>
      <g className="geo-heat" filter={`url(#glow-${view})`}>
        {dots.map((d, i) => <circle key={`h${i}`} cx={d.x} cy={d.y} r={d.r / viewport.zoom} className="geo-heat-blob"/>)}
      </g>
      <g className="geo-dots">
        {dots.map((d, i) => <circle key={`d${i}`} cx={d.x} cy={d.y} r={2.6 / viewport.zoom}
          className={d.p.sessionHits > 0 ? 'geo-dot session' : 'geo-dot'}
          onMouseEnter={e => setHover({ p: d.p, x: e.clientX, y: e.clientY })}
          onMouseMove={e => setHover({ p: d.p, x: e.clientX, y: e.clientY })}
          onMouseLeave={() => setHover(null)}/>)}
      </g>
    </svg>
    <div className="geo-map-controls" aria-label="지도 확대·축소 안내">
      <span>휠 확대·축소 · 드래그 이동</span>
      {viewport.zoom > MIN_ZOOM && <button type="button" onClick={resetViewport}>초기화</button>}
    </div>
    {dots.length === 0 && <p className="geo-empty">표시할 위치 없음</p>}
    {hover && <div className="geo-tip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
      <b>{hover.p.ip}</b>
      <span>{[hover.p.city, hover.p.region, hover.p.country].filter(Boolean).join(' · ') || '위치 미상'}</span>
      {hover.p.isp && <span className="geo-tip-isp">{hover.p.isp}</span>}
      <span>{hover.p.hits}회 시도{hover.p.sessionHits > 0 ? ` · 세션 ${hover.p.sessionHits}` : ''} · {hover.p.accuracy === 'cf' ? 'CF 정밀' : 'IP 추정'}</span>
    </div>}
  </div>
}
