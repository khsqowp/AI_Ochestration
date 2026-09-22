import { CHANNEL_HALF_WIDTH, FINISH_Y, MARBLE_RADIUS, PEG_RADIUS, PEGS, START_Y, WALL_THICKNESS } from './map'
import type { RaceSnapshot } from './simulation'

const WORLD_HEIGHT = START_Y - FINISH_Y + 10
const WORLD_WIDTH = CHANNEL_HALF_WIDTH * 2 + 4

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function shade(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex)
  const mix = (channel: number) => Math.round(amount >= 0 ? channel + (255 - channel) * amount : channel * (1 + amount))
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`
}

let boardPatternCache: { key: string; pattern: CanvasPattern | null } | null = null

// 배경에 대각선 줄무늬 패턴을 한 번만 만들어 캐싱 -- 매 프레임 새로 그리면 rAF 루프에서 낭비.
function boardPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  const key = 'v1'
  if (boardPatternCache?.key === key) return boardPatternCache.pattern
  const tile = document.createElement('canvas')
  tile.width = 28
  tile.height = 28
  const tctx = tile.getContext('2d')
  if (tctx) {
    tctx.fillStyle = '#f4f1fb'
    tctx.fillRect(0, 0, 28, 28)
    tctx.strokeStyle = 'rgba(112,96,210,0.06)'
    tctx.lineWidth = 10
    tctx.beginPath()
    tctx.moveTo(-4, 32)
    tctx.lineTo(32, -4)
    tctx.stroke()
  }
  const pattern = ctx.createPattern(tile, 'repeat')
  boardPatternCache = { key, pattern }
  return pattern
}

/** 월드 좌표(위 +Y, box2d 그대로) -> 캔버스 좌표(위가 0, Y 아래로 증가) 변환해 그린다.
 * 순수 canvas 2D -- 이 정도 도형 수엔 라이브러리 필요 없음. */
export function drawRace(ctx: CanvasRenderingContext2D, width: number, height: number, snapshot: RaceSnapshot): void {
  const scale = Math.min(width / WORLD_WIDTH, height / WORLD_HEIGHT)
  const originX = width / 2
  const originY = (START_Y + 5) * scale
  const toCanvas = (x: number, y: number) => ({ cx: originX + x * scale, cy: originY - y * scale })

  ctx.clearRect(0, 0, width, height)

  // 보드 배경(줄무늬 패턴)
  const pattern = boardPattern(ctx)
  ctx.fillStyle = pattern ?? '#f4f1fb'
  ctx.fillRect(0, 0, width, height)

  // 통로 벽 -- 안쪽에 밝은 하이라이트 선을 한 줄 더 그려 입체감을 준다.
  for (const side of [-1, 1]) {
    const wallCenterX = toCanvas(side * CHANNEL_HALF_WIDTH, 0).cx
    ctx.fillStyle = '#2b2740'
    ctx.fillRect(wallCenterX - WALL_THICKNESS * scale, 0, WALL_THICKNESS * 2 * scale, height)
    ctx.fillStyle = 'rgba(255,255,255,0.1)'
    const highlightX = wallCenterX - side * WALL_THICKNESS * 0.6 * scale
    ctx.fillRect(highlightX - 1, 0, 2, height)
  }

  // 페그 -- 방사형 그라데이션 + 살짝 아래로 그림자를 둬 금속 구슬처럼 보이게.
  for (const peg of PEGS) {
    const { cx, cy } = toCanvas(peg.x, peg.y)
    const r = PEG_RADIUS * scale
    ctx.beginPath()
    ctx.fillStyle = 'rgba(30,20,50,0.18)'
    ctx.ellipse(cx + r * 0.15, cy + r * 0.25, r * 0.9, r * 0.5, 0, 0, Math.PI * 2)
    ctx.fill()
    const gradient = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r)
    gradient.addColorStop(0, '#a99bf0')
    gradient.addColorStop(1, '#6a58c9')
    ctx.beginPath()
    ctx.fillStyle = gradient
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // 결승선 -- 체커보드 깃발 느낌
  const finishLine = toCanvas(0, FINISH_Y)
  const left = originX - (CHANNEL_HALF_WIDTH - WALL_THICKNESS) * scale
  const right = originX + (CHANNEL_HALF_WIDTH - WALL_THICKNESS) * scale
  const bandHeight = Math.max(6, scale * 1.1)
  const squareSize = Math.max(6, scale * 1.1)
  for (let x = left, i = 0; x < right; x += squareSize, i++) {
    ctx.fillStyle = i % 2 === 0 ? '#2b2740' : '#f4f1fb'
    ctx.fillRect(x, finishLine.cy - bandHeight / 2, Math.min(squareSize, right - x), bandHeight)
  }
  ctx.strokeStyle = '#e5c07b'
  ctx.lineWidth = 1.5
  ctx.strokeRect(left, finishLine.cy - bandHeight / 2, right - left, bandHeight)

  // 마블 -- 하이라이트 있는 방사형 그라데이션 + 그림자로 입체감, 승자는 후광 링 표시.
  for (const marble of snapshot.marbles) {
    const { cx, cy } = toCanvas(marble.x, marble.y)
    const isWinner = snapshot.winner === marble.name
    const r = MARBLE_RADIUS * scale * (isWinner ? 1.5 : 1)

    if (isWinner) {
      const glow = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 3)
      glow.addColorStop(0, 'rgba(229,192,123,0.55)')
      glow.addColorStop(1, 'rgba(229,192,123,0)')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(cx, cy, r * 3, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.beginPath()
    ctx.fillStyle = 'rgba(30,20,50,0.2)'
    ctx.ellipse(cx + r * 0.2, cy + r * 0.3, r * 0.9, r * 0.45, 0, 0, Math.PI * 2)
    ctx.fill()

    const gradient = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.4, r * 0.1, cx, cy, r)
    gradient.addColorStop(0, shade(marble.color, 0.55))
    gradient.addColorStop(0.6, marble.color)
    gradient.addColorStop(1, shade(marble.color, -0.35))
    ctx.beginPath()
    ctx.fillStyle = gradient
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
    if (isWinner) {
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.stroke()
    }

    ctx.fillStyle = '#fff'
    ctx.strokeStyle = 'rgba(43,39,64,0.65)'
    ctx.lineWidth = 3
    ctx.font = `700 ${Math.max(9, scale * 0.9)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.strokeText(marble.name, cx, cy - r - 4)
    ctx.fillText(marble.name, cx, cy - r - 4)
  }
}
