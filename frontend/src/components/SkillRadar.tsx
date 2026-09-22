/** 도메인 하나(6~8개 스킬)의 점수를 폴리곤 하나로 보여주는 레이더 차트. 외부 차트 라이브러리 없이
 * 순수 SVG로 그린다 -- 축 6~8개짜리 단순 도형이라 라이브러리 붙일 정도의 복잡도가 아니다. */
export function SkillRadar({ label, points, size = 220 }: { label: string; points: { label: string; score: number }[]; size?: number }) {
  const center = size / 2
  const radius = size / 2 - 34
  const axisAngle = (index: number) => (Math.PI * 2 * index) / points.length - Math.PI / 2
  const axisPoint = (index: number, fraction: number) => {
    const angle = axisAngle(index)
    return { x: center + Math.cos(angle) * radius * fraction, y: center + Math.sin(angle) * radius * fraction }
  }
  const ringLevels = [0.25, 0.5, 0.75, 1]
  const scorePath = points.map((point, index) => axisPoint(index, Math.max(0, Math.min(100, point.score)) / 100)).map(p => `${p.x},${p.y}`).join(' ')
  return <figure className="skill-radar">
    <figcaption>{label}</figcaption>
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`${label} 레이더 차트`}>
      {ringLevels.map(level => <polygon key={level} className="skill-radar-ring" points={points.map((_, index) => { const p = axisPoint(index, level); return `${p.x},${p.y}` }).join(' ')}/>)}
      {points.map((_, index) => { const p = axisPoint(index, 1); return <line key={index} className="skill-radar-spoke" x1={center} y1={center} x2={p.x} y2={p.y}/> })}
      <polygon className="skill-radar-shape" points={scorePath}/>
      {points.map((point, index) => { const p = axisPoint(index, Math.max(0, Math.min(100, point.score)) / 100); return <circle key={index} className="skill-radar-dot" cx={p.x} cy={p.y} r={3}/> })}
      {points.map((point, index) => { const p = axisPoint(index, 1.18); return <text key={index} className="skill-radar-label" x={p.x} y={p.y} textAnchor={Math.abs(p.x - center) < 4 ? 'middle' : p.x > center ? 'start' : 'end'}>{point.label}</text> })}
    </svg>
  </figure>
}
