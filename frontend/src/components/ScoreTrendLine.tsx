/** 주 단위로 묶은 평균 점수 추이 -- 순수 SVG 라인차트, 점 1개뿐이면 선 없이 점만 찍는다. */
export function ScoreTrendLine({ points, width = 640, height = 160 }: { points: { label: string; value: number }[]; width?: number; height?: number }) {
  const padX = 28, padY = 18
  const innerW = width - padX * 2, innerH = height - padY * 2
  const x = (index: number) => points.length <= 1 ? padX + innerW / 2 : padX + (innerW * index) / (points.length - 1)
  const y = (value: number) => padY + innerH * (1 - Math.max(0, Math.min(100, value)) / 100)
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(point.value)}`).join(' ')
  const first = points[0], last = points[points.length - 1]
  const delta = first && last ? last.value - first.value : null
  return <div className="score-trend">
    <div className="score-trend-head">
      <span>주별 평균 점수 추이</span>
      {delta !== null && points.length > 1 && <b className={delta >= 0 ? 'trend-up' : 'trend-down'}>{delta >= 0 ? '+' : ''}{delta.toFixed(0)}점</b>}
    </div>
    {points.length === 0 ? <p className="empty-state">아직 종료된 사건이 없습니다.</p> : <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label="주별 평균 점수 추이">
      {[0, 25, 50, 75, 100].map(level => <line key={level} className="score-trend-grid" x1={padX} x2={width - padX} y1={y(level)} y2={y(level)}/>)}
      {points.length > 1 && <path className="score-trend-path" d={path} fill="none"/>}
      {points.map((point, index) => <circle key={point.label} className="score-trend-dot" cx={x(index)} cy={y(point.value)} r={3}><title>{point.label}: {point.value.toFixed(0)}점</title></circle>)}
    </svg>}
  </div>
}
