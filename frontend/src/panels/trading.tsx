import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Globe2, Landmark, TrendingUp, X } from 'lucide-react'
import type {
  ChartPoint, MomentumRotationPosition, MomentumRotationState, PaperTradingTab,
  RealTradingTab, StockRotationState, TradingPeriod, TradingState,
} from '../lib/types'
import {
  ROTATION_MARKETS, TRADING_PERIOD_DAYS, TRADING_PERIOD_LABEL, TRADING_PERIOD_ORDER,
  clampChartDomain, filterChartPoints, historySpanDays, periodPnlFromSeries,
} from '../lib/util'
import { BotStatusPill, ErrorBoundary, type BotTone } from '../components/shared'

/** TradingView 식 확대/이동 차트. 휠로 커서 위치 기준 확대·축소, 드래그로 좌우 이동, 호버 시 값 툴팁 표시. */
function EquityLineChart({ points, formatValue, resetKey }: { points: ChartPoint[]; formatValue: (value: number) => string; resetKey?: string | number }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<{ x: number; domain: [number, number] } | null>(null)
  const [domain, setDomain] = useState<[number, number]>([0, Math.max(points.length - 1, 1)])
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null)

  useEffect(() => { setDomain([0, Math.max(points.length - 1, 1)]) }, [resetKey])

  useEffect(() => {
    const el = svgRef.current
    if (!el || points.length < 2) return
    const handler = (event: WheelEvent) => {
      const isZoomGesture = event.ctrlKey || event.metaKey
      const isPanGesture = Math.abs(event.deltaX) > Math.abs(event.deltaY)
      if (!isZoomGesture && !isPanGesture) return
      event.preventDefault()
      const rect = el.getBoundingClientRect()
      if (isPanGesture) {
        setDomain(([s, e]) => {
          const span = Math.max(e - s, 1)
          const deltaIndex = (event.deltaX / rect.width) * span
          return clampChartDomain(s + deltaIndex, e + deltaIndex, points.length)
        })
        return
      }
      setDomain(([s, e]) => {
        const span = Math.max(e - s, 1)
        const ratio = (event.clientX - rect.left) / rect.width
        const cursorIndex = s + ratio * span
        const factor = event.deltaY > 0 ? 1.15 : 1 / 1.15
        const minSpan = Math.min(4, points.length - 1)
        const newSpan = Math.max(minSpan, Math.min(points.length - 1, span * factor))
        const ratioAtCursor = (cursorIndex - s) / span
        const newStart = cursorIndex - ratioAtCursor * newSpan
        return clampChartDomain(newStart, newStart + newSpan, points.length)
      })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [points.length])

  if (points.length < 2) return <p className="empty-state">아직 표시할 데이터가 부족합니다.</p>

  const width = 640
  const height = 89
  const padLeft = 8
  const padRight = 56
  const padTop = 8
  const padBottom = 18
  const plotLeft = padLeft
  const plotRight = width - padRight
  const plotTop = padTop
  const plotBottom = height - padBottom
  const [startIndex, endIndex] = clampChartDomain(domain[0], domain[1], points.length)
  const span = Math.max(endIndex - startIndex, 1)
  const visible = points.slice(startIndex, endIndex + 1)
  const values = visible.map(point => point.value)
  const min = Math.min(...values, 0)
  const max = Math.max(...values, 0)
  const range = max - min || 1
  const toX = (index: number) => plotLeft + ((index - startIndex) / span) * (plotRight - plotLeft)
  const toY = (value: number) => plotBottom - ((value - min) / range) * (plotBottom - plotTop)
  const path = visible.map((point, i) => `${i === 0 ? 'M' : 'L'} ${toX(startIndex + i).toFixed(2)} ${toY(point.value).toFixed(2)}`).join(' ')
  const zeroY = toY(0)
  const last = visible[visible.length - 1].value
  const yTicks = [0, 1, 2, 3].map(i => min + (range * i) / 3)
  const formatAxisDate = (ts: string) => { const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()}` }
  const xTicks = [0, 1 / 3, 2 / 3, 1].map(f => ({
    x: plotLeft + f * (plotRight - plotLeft),
    anchor: (f === 0 ? 'start' : f === 1 ? 'end' : 'middle') as 'start' | 'end' | 'middle',
    label: formatAxisDate(points[Math.round(startIndex + f * span)].ts),
  }))

  const onMouseDown = (event: React.MouseEvent<SVGSVGElement>) => {
    dragRef.current = { x: event.clientX, domain: [startIndex, endIndex] }
  }
  const onMouseMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    if (dragRef.current) {
      const dragSpan = Math.max(dragRef.current.domain[1] - dragRef.current.domain[0], 1)
      const deltaIndex = ((dragRef.current.x - event.clientX) / rect.width) * dragSpan
      setDomain(clampChartDomain(dragRef.current.domain[0] + deltaIndex, dragRef.current.domain[1] + deltaIndex, points.length))
      return
    }
    const ratio = (event.clientX - rect.left) / rect.width
    const index = Math.min(endIndex, Math.max(startIndex, Math.round(startIndex + ratio * span)))
    const point = points[index]
    if (point) setHover({ index, x: toX(index), y: toY(point.value) })
  }
  const endDrag = () => { dragRef.current = null }
  const onMouseLeave = () => { dragRef.current = null; setHover(null) }
  const resetZoom = () => setDomain([0, points.length - 1])
  const hoveredPoint = hover ? points[hover.index] : null
  const zoomed = span < points.length - 1

  return <div className="chart-wrap">
    {zoomed && <button type="button" className="chart-reset-zoom" onClick={resetZoom}>축소</button>}
    <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} width="100%" height={height} className="line-chart"
      onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={endDrag} onMouseLeave={onMouseLeave}>
      {yTicks.map((value, i) => <g key={i}>
        <line x1={plotLeft} y1={toY(value)} x2={plotRight} y2={toY(value)} className="chart-grid-line"/>
        <text x={plotRight + 6} y={toY(value)} dy="3.5" className="chart-axis-label">{formatValue(value)}</text>
      </g>)}
      {min < 0 && max > 0 && <line x1={plotLeft} y1={zeroY} x2={plotRight} y2={zeroY} className="chart-zero-line"/>}
      <path d={path} className={`chart-line ${last >= 0 ? 'positive' : 'negative'}`} fill="none"/>
      {xTicks.map((tick, i) => <text key={i} x={tick.x} y={height - 6} textAnchor={tick.anchor} className="chart-axis-label">{tick.label}</text>)}
      {hover && hoveredPoint && <g>
        <line x1={hover.x} y1={plotTop} x2={hover.x} y2={plotBottom} className="chart-hover-line"/>
        <circle cx={hover.x} cy={hover.y} r={3.5} className={`chart-hover-dot ${hoveredPoint.value >= 0 ? 'positive' : 'negative'}`}/>
      </g>}
    </svg>
    {hover && hoveredPoint && <div className="chart-tooltip" style={{ left: `${Math.min(92, Math.max(8, (hover.x / width) * 100))}%` }}>
      <b className={hoveredPoint.value >= 0 ? 'positive' : 'negative'}>{formatValue(hoveredPoint.value)}</b>
      <span>{new Date(hoveredPoint.ts).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
    </div>}
    <p className="chart-hint">Ctrl(⌘)+휠로 확대·축소 · 드래그로 좌우 이동</p>
  </div>
}

/** 다음 리밸런스까지 남은 시간 — 일:시:분:초:1/100초 로 라이브 카운트다운. */
function RebalanceCountdown({ target }: { target: string | null | undefined }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!target) return
    let raf = 0
    const tick = () => { setNow(Date.now()); raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])
  if (!target) return <b>—</b>
  const ms = new Date(target).getTime() - now
  if (Number.isNaN(ms)) return <b>—</b>
  if (ms <= 0) return <b className="positive countdown">리밸런스 대기</b>
  const p2 = (n: number) => String(n).padStart(2, '0')
  const d = Math.floor(ms / 86400000)
  const h = Math.floor((ms % 86400000) / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  const cs = Math.floor((ms % 1000) / 10)
  return <b className="countdown">{d}:{p2(h)}:{p2(m)}:{p2(s)}:{p2(cs)}</b>
}

/** 즉시 매도 / 즉시 진입 — 로테이션 봇 수동 제어. flat 이면 진입 버튼, 아니면 청산 버튼(2단계 확인). */
function BotControlPanel({ bot, live, manualFlat, manualFlatPending, manualFlatTs, nextRebalanceTs, onDone }: {
  bot: 'momentum-rotation' | 'kr-rotation' | 'us-rotation'
  live?: boolean
  manualFlat?: boolean
  manualFlatPending?: boolean
  manualFlatTs?: string | null
  nextRebalanceTs?: string | null
  onDone: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const send = async (cmd: 'flatten' | 'enter') => {
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/trading/${bot}/${cmd}`, { method: 'POST', credentials: 'include' })
      if (!res.ok) { setError(cmd === 'flatten' ? '청산 명령 전송 실패' : '진입 명령 전송 실패'); return }
      setConfirming(false)
      window.setTimeout(onDone, 1500)
    } catch {
      setError('네트워크 오류')
    } finally {
      setBusy(false)
    }
  }

  const fmt = (v: string) => new Date(v).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  if (manualFlat) {
    return <div className="bot-control bot-control-flat">
      <div>
        <b>수동 정지됨 (전량 청산)</b>
        <small>
          {manualFlatPending ? '장 마감 중 — 다음 개장 시 매도 체결. ' : ''}
          {manualFlatTs ? `${fmt(manualFlatTs)} 청산. ` : ''}
          진입 버튼을 누르거나{nextRebalanceTs ? ' 다음 정기 리밸런스 시각' : ' 다음 리밸런스'}에 자동 재진입합니다.
        </small>
      </div>
      <button className="source-add" disabled={busy} onClick={() => send('enter')}>{busy ? '전송 중…' : '지금 진입'}</button>
      {error && <p className="form-error">{error}</p>}
    </div>
  }

  return <div className="bot-control">
    {confirming ? <>
      <div>
        <b>{live ? '실계좌 전량 청산 — 되돌릴 수 없습니다.' : '전량 청산하시겠습니까?'}</b>
        <small>모든 롱/숏 포지션을 시장가로 청산하고 자동 재진입을 정지합니다. {live ? `봇이 다음 폴링(5초 내)에 실행합니다.` : '개장 중이면 이번 사이클, 장외면 개장 시 체결됩니다.'}</small>
      </div>
      <div className="bot-control-actions">
        <button className="source-cancel" disabled={busy} onClick={() => setConfirming(false)}>취소</button>
        <button className="source-add danger" disabled={busy} onClick={() => send('flatten')}>{busy ? '전송 중…' : '청산 확인'}</button>
      </div>
    </> : <>
      <div><small>고점이라 판단되면 즉시 전량 청산하고 정지할 수 있습니다. 재진입은 진입 버튼 또는 다음 정기 리밸런스.</small></div>
      <button className="source-cancel" onClick={() => setConfirming(true)}>즉시 매도</button>
    </>}
    {error && <p className="form-error">{error}</p>}
  </div>
}

function PeriodTabs({ period, onChange, historyDays }: { period: TradingPeriod; onChange: (value: TradingPeriod) => void; historyDays?: number }) {
  return <div className="period-tabs">{TRADING_PERIOD_ORDER.map(value => {
    const days = TRADING_PERIOD_DAYS[value]
    const short = historyDays != null && days != null && historyDays < days
    return <button key={value} className={`${period === value ? 'active' : ''}${short ? ' short' : ''}`}
      title={short ? `보유 데이터 약 ${Math.floor(historyDays!)}일 — 이 기간은 전체와 동일하게 표시됩니다` : undefined}
      onClick={() => onChange(value)}>{TRADING_PERIOD_LABEL[value]}{short ? ' ·' : ''}</button>
  })}</div>
}

function PositionHistorySection({ symbolSeries, formatValue, nameFor }: { symbolSeries: Record<string, ChartPoint[]>; formatValue: (value: number) => string; nameFor?: (symbol: string) => string }) {
  const symbols = Object.keys(symbolSeries)
  const [selected, setSelected] = useState<string | null>(symbols[0] ?? null)
  useEffect(() => { if (selected === null || !symbols.includes(selected)) setSelected(symbols[0] ?? null) }, [symbols.join(',')])
  if (symbols.length === 0) return <p className="empty-state">아직 종목별 기록이 없습니다.</p>
  return <div className="position-history-section">
    <div className="source-actions">{symbols.map(symbol => <button key={symbol} className={selected === symbol ? 'source-add' : 'source-cancel'} onClick={() => setSelected(symbol)}>{nameFor ? nameFor(symbol) : symbol}</button>)}</div>
    {selected && <EquityLineChart points={symbolSeries[selected]} formatValue={formatValue} resetKey={selected}/>}
  </div>
}

function PositionTable({ title, head, rows, empty }: { title: string; head: string[]; rows: { key: string; cells: React.ReactNode[] }[]; empty: string }) {
  return <div className="position-table-section">
    <b>{title} ({rows.length})</b>
    <div className="position-table-wrap">
      <table className="position-table">
        <thead><tr>{head.map(label => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0
            ? <tr><td colSpan={head.length} className="empty-state">{empty}</td></tr>
            : rows.map(row => <tr key={row.key}>{row.cells.map((cell, index) => <td key={index}>{cell}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  </div>
}

// 거래소 포지션 탭 스타일 — 롱/숏 한 표에 방향 배지·ROE·미실현손익, ROE 내림차순 정렬.
function PositionBook({ positions }: { positions: [string, MomentumRotationPosition][] }) {
  if (positions.length === 0) return <div className="posbook"><p className="empty-state">보유 중인 포지션이 없습니다.</p></div>
  const price = (v: number) => v >= 1000 ? v.toFixed(1) : v >= 1 ? v.toFixed(4) : v.toPrecision(3)
  const rows = positions
    .map(([symbol, p]) => ({
      symbol,
      side: p.side,
      notional: Math.abs(p.notionalUsdt),
      entry: p.entryPrice,
      pnl: p.unrealizedPnlUsdt,
      roe: p.notionalUsdt ? (p.unrealizedPnlUsdt / Math.abs(p.notionalUsdt)) * 100 : 0,
    }))
    .sort((a, b) => b.roe - a.roe)
  const longN = rows.filter(r => r.side === 'long').length
  const shortN = rows.filter(r => r.side === 'short').length
  const totalPnl = rows.reduce((sum, r) => sum + r.pnl, 0)
  const gross = rows.reduce((sum, r) => sum + r.notional, 0)
  return <div className="posbook">
    <div className="posbook-head">
      <div className="posbook-title">
        포지션
        <span className="posbook-tag long">롱 {longN}</span>
        <span className="posbook-tag short">숏 {shortN}</span>
        <span className="posbook-gross">명목 ${gross.toFixed(2)}</span>
      </div>
      <div className={`posbook-total ${totalPnl >= 0 ? 'up' : 'down'}`}>
        미실현 {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
      </div>
    </div>
    <div className="posbook-grid">
      <div className="posbook-row posbook-hd">
        <span>종목</span><span>방향</span><span className="ta-r">명목가치</span>
        <span className="ta-r">진입가</span><span className="ta-r">ROE</span><span className="ta-r">미실현 PnL</span>
      </div>
      {rows.map(r => (
        <div key={r.symbol} className={`posbook-row side-${r.side}`}>
          <span className="posbook-sym">{r.symbol}<i>/USDT</i></span>
          <span><em className={`posbook-dir ${r.side}`}>{r.side === 'long' ? 'LONG' : 'SHORT'}</em></span>
          <span className="ta-r mono">${r.notional.toFixed(2)}</span>
          <span className="ta-r mono">{price(r.entry)}</span>
          <span className={`ta-r mono ${r.roe >= 0 ? 'up' : 'down'}`}>{r.roe >= 0 ? '+' : ''}{r.roe.toFixed(2)}%</span>
          <span className={`ta-r mono ${r.pnl >= 0 ? 'up' : 'down'}`}>{r.pnl >= 0 ? '+' : ''}${r.pnl.toFixed(2)}</span>
        </div>
      ))}
    </div>
  </div>
}

function Wrap({ embedded, onClose, eyebrow, title, children }: { embedded?: boolean; onClose?: () => void; eyebrow: string; title: string; children: React.ReactNode }) {
  if (embedded) return <div className="trading-dashboard-embedded">{children}</div>
  return <aside className="side-modal trading-dashboard" role="dialog" aria-modal="true">
    <div className="sheet-header"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>{onClose && <button className="sheet-close" onClick={onClose}><X size={18}/></button>}</div>
    {children}
  </aside>
}

export function TradingDashboard({ onClose, embedded }: { onClose?: () => void; embedded?: boolean }) {
  const [data, setData] = useState<TradingState | null>(null)
  const [period, setPeriod] = useState<TradingPeriod>('week')
  useEffect(() => {
    const load = () => { if (!document.hidden) fetch('/api/trading/state', { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(setData) }
    load()
    const timer = window.setInterval(load, 30000)
    return () => window.clearInterval(timer)
  }, [])
  const fmt = (value: string) => new Date(value).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  const fmtDate = (value: string) => new Date(value).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
  const positions = data ? Object.entries(data.positions) : []
  const openNotional = positions.reduce((sum, [, p]) => sum + p.notionalUsdt, 0)
  const pnlSeries: ChartPoint[] = data ? data.equityHistory.map(point => ({ ts: point.ts, value: point.totalPnlUsdt })) : []
  const { pnl: periodPnl, shortHistory: periodShort } = data
    ? periodPnlFromSeries(pnlSeries, data.totalPnlUsdt, period)
    : { pnl: 0, shortHistory: false }
  const periodReturnPct = data && data.totalCapitalUsdt > 0 ? (periodPnl / data.totalCapitalUsdt) * 100 : 0
  const startingCapital = data ? data.totalCapitalUsdt - data.totalPnlUsdt : 0
  const overallReturnPct = startingCapital > 0 && data ? (data.totalPnlUsdt / startingCapital) * 100 : 0
  const chartPoints: ChartPoint[] = filterChartPoints(pnlSeries, period)
  const symbolSeries: Record<string, ChartPoint[]> = data ? Object.fromEntries(Object.entries(data.positionHistory).map(([symbol, points]) => [symbol, points.map(point => ({ ts: point.ts, value: point.unrealizedPnlUsdt }))])) : {}
  return <Wrap embedded={embedded} onClose={onClose} eyebrow="TRADER Q" title="트레이딩 대시보드">
    <p className="source-intro">바이낸스 실계좌 실거래 현황입니다. 실제 자금이 투입되며, 총 자본은 매 사이클 실제 잔고를 조회해 동적으로 산정됩니다 — 펀딩비·현물/선물 체결가는 실거래소 실측치이며, 두 다리의 가격 괴리(베이시스)·슬리피지에서 나는 손익도 총 손익에 반영됩니다.</p>
    <div className="trading-status-card">
      <BotStatusPill tone={data?.tradingHalted ? 'deprecated' : 'paused'} label={data?.tradingHalted ? '⚠ 손실 한도로 중지됨' : '신규 진입 중단 · 자금 이관 중'}/>
      <p>전략: 펀딩비 차익거래(현물 롱 + 무기한선물 숏, ETH·XRP·DOGE) · 총 자본 ${data?.totalCapitalUsdt?.toFixed(2) ?? '-'}</p>
      <p>시작일: {data?.inceptionTs ? fmtDate(data.inceptionTs) : '아직 시작 전'}</p>
    </div>
    {data?.tradingHalted && <p className="trading-halt-banner">누적 손실이 총 자본의 8%를 넘어 전 포지션을 자동 청산하고 신규 진입을 중지했습니다. 재개하려면 서버의 상태 파일을 수동으로 초기화해야 합니다.</p>}
    {data ? <>
      <PeriodTabs period={period} onChange={setPeriod} historyDays={historySpanDays(pnlSeries)}/>
      <div className="trading-metrics">
        <div><b>${startingCapital.toFixed(2)}</b><span>시작 자본</span></div>
        <div><b>${data.totalCapitalUsdt.toFixed(2)}</b><span>현재 자본</span></div>
        <div><b className={overallReturnPct >= 0 ? 'positive' : 'negative'}>{overallReturnPct >= 0 ? '+' : ''}{overallReturnPct.toFixed(2)}%</b><span>전체 수익률</span></div>
        <div><b className={periodReturnPct >= 0 ? 'positive' : 'negative'}>{periodReturnPct >= 0 ? '+' : ''}{periodReturnPct.toFixed(2)}%</b><span>{TRADING_PERIOD_LABEL[period]} 수익률{periodShort ? ' *' : ''}</span></div>
        <div><b className={periodPnl >= 0 ? 'positive' : 'negative'}>{periodPnl >= 0 ? '+' : ''}${periodPnl.toFixed(2)}</b><span>{TRADING_PERIOD_LABEL[period]} 손익{periodShort ? ' *' : ''}</span></div>
        <div><b>{positions.length}</b><span>보유 종목</span></div>
        <div><b>${openNotional.toFixed(2)}</b><span>매수 금액(진입시점 기준)</span></div>
      </div>
      {periodShort && <p className="usage-note">* 보유 equity 히스토리가 선택 기간보다 짧아, 기록이 시작된 시점부터의 값으로 표시됩니다(전체와 동일).</p>}
      <EquityLineChart points={chartPoints} formatValue={value => `$${value.toFixed(2)}`} resetKey={period}/>
      <p className="usage-note">매수 금액은 각 포지션이 진입한 시점의 노셔널로 고정됩니다 — 청산 전까지 재조정하지 않으므로(왕복수수료 절감), 총 자본이 늘어도 이미 보유중인 포지션의 금액은 그대로입니다. 신규 진입/재진입 시에만 그 시점의 총 자본 기준으로 다시 계산됩니다.</p>
      <PositionTable title="보유 포지션" empty="현재 보유 중인 포지션이 없습니다." head={['종목', '진입가(현물/선물)', '수량', '누적 펀딩수취', '미실현 가격손익', '진입수수료', '순손익', '수익률']}
        rows={positions.map(([symbol, p]) => {
          const netPnl = p.accruedFundingUsdt + p.unrealizedPricePnlUsdt - p.entryFeeUsdt
          const returnPct = p.notionalUsdt > 0 ? (netPnl / p.notionalUsdt) * 100 : 0
          return { key: symbol, cells: [
            <b>{symbol}</b>,
            `${p.entrySpotPrice || p.entryPrice} / ${p.entryPerpPrice || p.entryPrice}`,
            p.amount.toFixed(4),
            `$${p.accruedFundingUsdt.toFixed(2)}`,
            `$${p.unrealizedPricePnlUsdt.toFixed(2)}`,
            `$${p.entryFeeUsdt.toFixed(2)}`,
            <span className={netPnl >= 0 ? 'positive' : 'negative'}>{netPnl >= 0 ? '+' : ''}${netPnl.toFixed(2)}</span>,
            <span className={returnPct >= 0 ? 'positive' : 'negative'}>{returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}%</span>,
          ] }
        })}/>
      <b className="chart-section-title">종목별 미실현손익 추이</b>
      <PositionHistorySection symbolSeries={symbolSeries} formatValue={value => `$${value.toFixed(2)}`}/>
      <div className="usage-table">
        <b>최근 로그</b>
        {data.tradeLog.length === 0 ? <p className="empty-state">아직 기록이 없습니다.</p> : data.tradeLog.slice(-15).reverse().map((entry, index) => <article key={index}><span>{fmt(entry.ts)}</span><small>{entry.message}</small></article>)}
      </div>
      <p className="usage-note">누적 펀딩수취 ${data.cumulativeFundingUsdt.toFixed(2)} · 누적 가격손익(베이시스/슬리피지) ${data.cumulativePricePnlUsdt.toFixed(2)} · 미실현 가격손익 ${data.unrealizedPricePnlUsdt.toFixed(2)} · 누적 수수료 ${data.cumulativeFeeUsdt.toFixed(2)} · 전체 누적 순손익 ${data.totalPnlUsdt.toFixed(2)} · 30초마다 자동 새로고침됩니다.</p>
    </> : <p className="empty-state">상태를 불러오는 중…</p>}
  </Wrap>
}

function StockRotationDashboard({ market, onClose, embedded }: { market: 'kr' | 'us'; onClose?: () => void; embedded?: boolean }) {
  const cfg = ROTATION_MARKETS[market]
  const [data, setData] = useState<StockRotationState | null>(null)
  const [period, setPeriod] = useState<TradingPeriod>('week')
  const load = useCallback(() => {
    if (!document.hidden) fetch(cfg.endpoint, { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(setData)
  }, [cfg.endpoint])
  useEffect(() => {
    load()
    const timer = window.setInterval(load, 30000)
    return () => window.clearInterval(timer)
  }, [load])
  const fmt = (value: string) => new Date(value).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  const name = (symbol: string) => { const n = data?.symbolNames?.[symbol]; return n && market === 'kr' ? `${n} (${symbol})` : symbol }
  const brokerPositions = Object.entries(data?.broker?.positions ?? {})
  const pendingSells = data?.pendingSells ?? []
  const pendingBuys = data?.pendingBuys ?? []
  const targetBasket = data?.targetBasket ?? []
  const heldSymbols = data?.heldSymbols ?? []
  const realized = data?.realizedPnl ?? 0
  const unrealized = data?.broker?.positionsUnrealizedPnl ?? data?.unrealizedPnl ?? 0
  const totalPnl = realized + unrealized
  const budget = data?.budget || cfg.budget
  const equity = data?.equity ?? budget
  const entryValue = data?.broker?.positionsEntry ?? data?.entryValue ?? 0
  const currentValue = data?.broker?.positionsEval ?? data?.deployedValue ?? 0
  const returnPct = data?.returnPct ?? (budget > 0 ? (totalPnl / budget) * 100 : 0)
  const pnlSeries: ChartPoint[] = (data?.equityHistory ?? []).map(p => ({ ts: p.ts, value: p.totalPnl }))
  const { pnl: periodPnl, shortHistory: periodShort } = periodPnlFromSeries(pnlSeries, totalPnl, period)
  const periodReturnPct = budget > 0 ? (periodPnl / budget) * 100 : 0
  const chartPoints: ChartPoint[] = filterChartPoints(pnlSeries, period)
  const symbolSeries: Record<string, ChartPoint[]> = Object.fromEntries(Object.entries(data?.positionHistory ?? {}).map(([s, pts]) => [s, (pts ?? []).map(p => ({ ts: p.ts, value: p.unrealizedPnl }))]))
  const queued = [...pendingSells, ...pendingBuys]
  return <Wrap embedded={embedded} onClose={onClose} eyebrow="TRADER Q" title={cfg.title}>
    <p className="source-intro">{cfg.intro}</p>
    <div className="trading-status-card">
      <BotStatusPill tone="live" label={data?.regimeCash ? '가동 중 · 레짐필터(전액 현금)' : '가동 중 · 모의투자'}/>
      <p>잔고(KIS API 조회) {data ? <b className={totalPnl >= 0 ? 'positive' : 'negative'}>{cfg.money(equity)}</b> : '-'} · 손익 {data ? <b className={totalPnl >= 0 ? 'positive' : 'negative'}>{totalPnl >= 0 ? '+' : ''}{cfg.money(totalPnl)}</b> : '-'} (실현 {cfg.money(realized)} + 미실현 {cfg.money(unrealized)})</p>
      <p>마지막 리밸런스일: {data?.lastRebalanceDate ?? '아직 없음'} · 최근 계획일: {data?.lastPlanDate ?? '없음'}{data?.broker?.queriedTs ? ` · 잔고조회 ${fmt(data.broker.queriedTs)}` : ''}</p>
      {data?.broker && market === 'us' && <p className="usage-note">계좌 KRW 예수금(국장·미장 공용) {Math.round(data.broker.accountCashKrw).toLocaleString()}원 · 계좌 총평가 {Math.round(data.broker.accountTotalKrw).toLocaleString()}원</p>}
    </div>
    {data && <BotControlPanel bot={market === 'kr' ? 'kr-rotation' : 'us-rotation'}
      manualFlat={data.broker?.manualFlat} manualFlatPending={data.broker?.manualFlatPending}
      manualFlatTs={data.broker?.manualFlatTs} onDone={load}/>}
    {data ? <>
      <PeriodTabs period={period} onChange={setPeriod} historyDays={historySpanDays(pnlSeries)}/>
      <div className="trading-metrics">
        <div><b>{cfg.money(budget)}</b><span>배정 예산</span></div>
        <div><b>{cfg.money(entryValue)}</b><span>진입금액(매입원가)</span></div>
        <div><b>{cfg.money(currentValue)}</b><span>현재금액(평가금액)</span></div>
        <div><b>{cfg.money(equity)}</b><span>현재 잔고(API)</span></div>
        <div><b className={returnPct >= 0 ? 'positive' : 'negative'}>{returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}%</b><span>전체 수익률</span></div>
        <div><b className={periodReturnPct >= 0 ? 'positive' : 'negative'}>{periodReturnPct >= 0 ? '+' : ''}{periodReturnPct.toFixed(2)}%</b><span>{TRADING_PERIOD_LABEL[period]} 수익률{periodShort ? ' *' : ''}</span></div>
        <div><b className={periodPnl >= 0 ? 'positive' : 'negative'}>{periodPnl >= 0 ? '+' : ''}{cfg.money(periodPnl)}</b><span>{TRADING_PERIOD_LABEL[period]} 손익{periodShort ? ' *' : ''}</span></div>
        <div><b>{brokerPositions.length}</b><span>보유 종목</span></div>
        <div><b>{pendingBuys.length}</b><span>매수 대기</span></div>
        <div><b>{pendingSells.length}</b><span>매도 대기</span></div>
      </div>
      {periodShort && <p className="usage-note">* 보유 equity 히스토리가 선택 기간보다 짧아, 기록이 시작된 시점부터의 값으로 표시됩니다(전체와 동일).</p>}
      <EquityLineChart points={chartPoints} formatValue={cfg.money} resetKey={period}/>
      <PositionTable title="보유 포지션 (KIS 잔고 API)" empty="현재 보유 중인 포지션이 없습니다." head={['종목', '수량', '현재가', '평가금액', '평가손익']}
        rows={brokerPositions.map(([symbol, p]) => ({ key: symbol, cells: [
          <b>{name(symbol)}</b>,
          `${p.qty}`,
          cfg.money(p.price),
          cfg.money(p.evalAmt),
          <span className={p.pnl >= 0 ? 'positive' : 'negative'}>{p.pnl >= 0 ? '+' : ''}{cfg.money(p.pnl)} ({p.pnlPct >= 0 ? '+' : ''}{p.pnlPct.toFixed(2)}%)</span>,
        ] }))}/>
      {targetBasket.length > 0 && <PositionTable title="목표 바스켓 (최근 리밸런스)" empty="없음" head={['종목', '상태']}
        rows={targetBasket.map(symbol => ({ key: `t-${symbol}`, cells: [<b>{name(symbol)}</b>, heldSymbols.includes(symbol) ? '보유 중' : (pendingBuys.includes(symbol) ? '매수 대기' : '미체결')] }))}/>}
      {queued.length > 0 && <PositionTable title="매매 대기열 (다음 장중 체결)" empty="없음" head={['종목', '방향']}
        rows={[
          ...pendingSells.map(s => ({ key: `s-${s}`, cells: [<b>{name(s)}</b>, '매도'] })),
          ...pendingBuys.map(s => ({ key: `b-${s}`, cells: [<b>{name(s)}</b>, '매수'] })),
        ]}/>}
      <b className="chart-section-title">종목별 평가손익 추이</b>
      <PositionHistorySection symbolSeries={symbolSeries} formatValue={cfg.money} nameFor={name}/>
      <div className="usage-table">
        <b>최근 로그</b>
        {(data.tradeLog ?? []).length === 0 ? <p className="empty-state">아직 기록이 없습니다.</p> : (data.tradeLog ?? []).slice(-15).reverse().map((entry, index) => <article key={index}><span>{fmt(entry.ts)}</span><small>{entry.message}</small></article>)}
      </div>
      <p className="usage-note">30초마다 자동 새로고침 · 잔고·평가·손익은 KIS 잔고조회 API 값을 그대로 표시합니다(자체 계산 아님).</p>
    </> : <p className="empty-state">상태를 불러오는 중…</p>}
  </Wrap>
}

export function KrTradingDashboard(props: { onClose?: () => void; embedded?: boolean }) {
  return <StockRotationDashboard market="kr" {...props}/>
}

export function UsTradingDashboard(props: { onClose?: () => void; embedded?: boolean }) {
  return <StockRotationDashboard market="us" {...props}/>
}

export function MomentumRotationDashboard({ onClose, embedded }: { onClose?: () => void; embedded?: boolean }) {
  const [data, setData] = useState<MomentumRotationState | null>(null)
  const [period, setPeriod] = useState<TradingPeriod>('week')
  const load = useCallback(() => {
    if (!document.hidden) fetch('/api/trading/momentum-rotation/state', { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(setData)
  }, [])
  useEffect(() => {
    load()
    const timer = window.setInterval(load, 30000)
    return () => window.clearInterval(timer)
  }, [load])
  const fmt = (value: string) => new Date(value).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  const live = data?.mode === 'live'
  const positions = Object.entries(data?.broker?.positions ?? data?.positions ?? {})
  const longs = positions.filter(([, p]) => p.side === 'long')
  const shorts = positions.filter(([, p]) => p.side === 'short')
  const equity = data?.broker?.equityUsdt ?? data?.equityUsdt ?? 0
  const unrealized = data?.broker?.unrealizedPnlUsdt ?? data?.unrealizedPnlUsdt ?? 0
  const inceptionEquity = data?.inceptionEquityUsdt || 0
  const totalPnl = inceptionEquity > 0 ? equity - inceptionEquity : ((data?.cumulativeRealizedPnlUsdt ?? 0) + (data?.unrealizedPnlUsdt ?? 0) - (data?.cumulativeFeeUsdt ?? 0))
  const startingCapital = inceptionEquity > 0 ? inceptionEquity : ((data?.equityUsdt ?? 0) - totalPnl)
  const overallReturnPct = startingCapital > 0 ? (totalPnl / startingCapital) * 100 : 0
  const drawdown = data?.broker?.drawdown ?? data?.drawdown ?? 0
  const hwm = data?.broker?.hwmUsdt ?? data?.hwmUsdt ?? 0
  const leverage = data?.broker?.leverage ?? 0
  const grossNotional = data?.broker?.grossNotionalUsdt ?? 0
  const pnlSeries: ChartPoint[] = (data?.equityHistory ?? []).map(point => ({ ts: point.ts, value: point.totalPnlUsdt }))
  const { pnl: periodPnl, shortHistory: periodShort } = periodPnlFromSeries(pnlSeries, totalPnl, period)
  const periodReturnPct = startingCapital > 0 ? (periodPnl / startingCapital) * 100 : 0
  const chartPoints: ChartPoint[] = filterChartPoints(pnlSeries, period)
  const symbolSeries: Record<string, ChartPoint[]> = Object.fromEntries(Object.entries(data?.positionHistory ?? {}).map(([symbol, points]) => [symbol, (points ?? []).map(point => ({ ts: point.ts, value: point.unrealizedPnlUsdt }))]))
  const statusTone: BotTone = data?.halted ? 'deprecated' : 'live'
  const statusLabel = data?.halted ? '⚠ 킬 스위치 발동 · 정지됨' : (live ? `가동 중 · mainnet ${leverage}x` : '가동 중 · 백테스트(페이퍼)')
  return <Wrap embedded={embedded} onClose={onClose} eyebrow="TRADER Q" title="모멘텀 로테이션 대시보드">
    <p className="source-intro">{live
      ? '바이낸스 실계좌(mainnet) 코인 선물 상대모멘텀 롱숏 로테이션입니다. 자본 145 USDT 중 70 배치 · 2배 · 47종목 중 14일 모멘텀 상위 8 롱 / 하위 8 숏 · 2일마다 리밸런스. 포트폴리오 손절: 고점대비 -20% 디레버(2배→1배), -35% 킬 스위치(전량 청산 후 정지).'
      : '코인 선물 상대모멘텀 롱숏 로테이션 백테스트(페이퍼) 현황입니다. 실주문 없음 — 가상자본 시뮬레이션.'}</p>
    <div className="trading-status-card">
      <BotStatusPill tone={statusTone} label={statusLabel}/>
      <p>잔고(바이낸스 API) {data ? <b className={totalPnl >= 0 ? 'positive' : 'negative'}>${equity.toFixed(2)}</b> : '-'} · 손익 {data ? <b className={totalPnl >= 0 ? 'positive' : 'negative'}>{totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}</b> : '-'} (미실현 {data ? unrealized.toFixed(2) : '-'})</p>
      <p>마지막 리밸런스: {data?.lastRebalanceTs ? fmt(data.lastRebalanceTs) : '아직 없음'}{data?.broker?.queriedTs ? ` · 잔고조회 ${fmt(data.broker.queriedTs)}` : ''}</p>
      {live && <p className="usage-note">고점(HWM) ${hwm.toFixed(2)} · 현재 낙폭 {(drawdown * 100).toFixed(1)}% (디레버 20% / 킬 35%)</p>}
    </div>
    {data && !data.halted && <BotControlPanel bot="momentum-rotation" live={live}
      manualFlat={data.broker?.manualFlat} manualFlatTs={data.broker?.manualFlatTs}
      nextRebalanceTs={data.nextRebalanceTs} onDone={load}/>}
    {data ? <>
      <PeriodTabs period={period} onChange={setPeriod} historyDays={historySpanDays(pnlSeries)}/>
      <div className="trading-metrics">
        <div><b>${startingCapital.toFixed(2)}</b><span>진입금액(시작 자본)</span></div>
        <div><b>${equity.toFixed(2)}</b><span>현재금액(API 잔고)</span></div>
        <div><b>${grossNotional.toFixed(2)}</b><span>명목 노출(롱+숏)</span></div>
        <div><b className={overallReturnPct >= 0 ? 'positive' : 'negative'}>{overallReturnPct >= 0 ? '+' : ''}{overallReturnPct.toFixed(2)}%</b><span>전체 수익률</span></div>
        <div><b className={periodReturnPct >= 0 ? 'positive' : 'negative'}>{periodReturnPct >= 0 ? '+' : ''}{periodReturnPct.toFixed(2)}%</b><span>{TRADING_PERIOD_LABEL[period]} 수익률{periodShort ? ' *' : ''}</span></div>
        <div><b className={periodPnl >= 0 ? 'positive' : 'negative'}>{periodPnl >= 0 ? '+' : ''}${periodPnl.toFixed(2)}</b><span>{TRADING_PERIOD_LABEL[period]} 손익{periodShort ? ' *' : ''}</span></div>
        <div><b className={drawdown > 0.15 ? 'negative' : ''}>{(drawdown * 100).toFixed(1)}%</b><span>현재 낙폭</span></div>
        <div><b>{longs.length}</b><span>롱 포지션</span></div>
        <div><b>{shorts.length}</b><span>숏 포지션</span></div>
        <div><RebalanceCountdown target={data.nextRebalanceTs}/><span>다음 리밸런스까지{data.rebalanceEveryDays ? ` (${data.rebalanceEveryDays}일 주기)` : ''}</span></div>
      </div>
      {periodShort && <p className="usage-note">* 보유 equity 히스토리가 선택 기간보다 짧아, 기록이 시작된 시점부터의 값으로 표시됩니다(전체와 동일).</p>}
      <EquityLineChart points={chartPoints} formatValue={value => `$${value.toFixed(2)}`} resetKey={period}/>
      <PositionBook positions={positions}/>
      <b className="chart-section-title">종목별 미실현손익 추이</b>
      <PositionHistorySection symbolSeries={symbolSeries} formatValue={value => `$${value.toFixed(2)}`}/>
      <div className="usage-table">
        <b>최근 로그</b>
        {(data.tradeLog ?? []).length === 0 ? <p className="empty-state">아직 기록이 없습니다.</p> : (data.tradeLog ?? []).slice(-15).reverse().map((entry, index) => <article key={index}><span>{fmt(entry.ts)}</span><small>{entry.message}</small></article>)}
      </div>
      <p className="usage-note">30초마다 자동 새로고침 · 잔고/포지션/낙폭은 바이낸스 API(totalMarginBalance, fetch_positions) 조회값입니다.</p>
    </> : <p className="empty-state">상태를 불러오는 중…</p>}
  </Wrap>
}

export function RealTradingHub({ onClose, initialTab, embedded }: { onClose?: () => void; initialTab: RealTradingTab; embedded?: boolean }) {
  const [tab, setTab] = useState<RealTradingTab>(initialTab)
  useEffect(() => setTab(initialTab), [initialTab])
  const body = <>
    <div className="explorer-body">
      <nav className="explorer-sidebar">
        <div className="file-list">
          <button className={tab === 'momentum-rotation-trading' ? 'active' : ''} onClick={() => setTab('momentum-rotation-trading')}><TrendingUp size={16}/><span><b>모멘텀 로테이션</b><small>바이낸스 실계좌 · 2x</small></span></button>
          <button className={tab === 'trading' ? 'active' : ''} onClick={() => setTab('trading')}><TrendingUp size={16}/><span><b>펀딩비 차익거래</b><small>바이낸스 실계좌</small></span></button>
        </div>
      </nav>
      <div className="explorer-preview">
        <ErrorBoundary label="실물투자">
          {tab === 'momentum-rotation-trading' && <MomentumRotationDashboard embedded/>}
          {tab === 'trading' && <TradingDashboard embedded/>}
        </ErrorBoundary>
      </div>
    </div>
  </>
  if (embedded) return <div className="panel-embedded file-explorer trading-hub">{body}</div>
  return <aside className="file-explorer trading-hub" role="dialog" aria-modal="true">
    <div className="sheet-header"><div><p className="eyebrow">TRADER Q</p><h2>실물투자</h2></div>{onClose && <button className="sheet-close" onClick={onClose}><X size={18}/></button>}</div>
    {body}
  </aside>
}

export function PaperTradingHub({ onClose, initialTab, embedded }: { onClose?: () => void; initialTab: PaperTradingTab; embedded?: boolean }) {
  const [tab, setTab] = useState<PaperTradingTab>(initialTab)
  useEffect(() => setTab(initialTab), [initialTab])
  const body = <>
    <div className="explorer-body">
      <nav className="explorer-sidebar">
        <div className="file-list">
          <button className={tab === 'kr-trading' ? 'active' : ''} onClick={() => setTab('kr-trading')}><Landmark size={16}/><span><b>국장 로테이션</b><small>한투 모의투자 · top8</small></span></button>
          <button className={tab === 'us-trading' ? 'active' : ''} onClick={() => setTab('us-trading')}><Globe2 size={16}/><span><b>미장 로테이션</b><small>한투 모의투자 · top8</small></span></button>
        </div>
      </nav>
      <div className="explorer-preview">
        <ErrorBoundary label="모의투자">
          {tab === 'kr-trading' && <KrTradingDashboard embedded/>}
          {tab === 'us-trading' && <UsTradingDashboard embedded/>}
        </ErrorBoundary>
      </div>
    </div>
  </>
  if (embedded) return <div className="panel-embedded file-explorer trading-hub">{body}</div>
  return <aside className="file-explorer trading-hub" role="dialog" aria-modal="true">
    <div className="sheet-header"><div><p className="eyebrow">TRADER Q</p><h2>모의투자</h2></div>{onClose && <button className="sheet-close" onClick={onClose}><X size={18}/></button>}</div>
    {body}
  </aside>
}
