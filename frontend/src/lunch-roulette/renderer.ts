import { CHANNEL_HALF_WIDTH, FINISH_Y, MARBLE_RADIUS, PEG_RADIUS, PEGS, START_Y, WALL_THICKNESS } from './map'
import type { RaceSnapshot } from './simulation'

const WORLD_HEIGHT = START_Y - FINISH_Y + 10
const WORLD_WIDTH = CHANNEL_HALF_WIDTH * 2 + 4

/** 월드 좌표(위 +Y, box2d 그대로) -> 캔버스 좌표(위가 0, Y 아래로 증가) 변환해 그린다.
 * 순수 canvas 2D -- 이 정도 도형 수엔 라이브러리 필요 없음. */
export function drawRace(ctx: CanvasRenderingContext2D, width: number, height: number, snapshot: RaceSnapshot): void {
  const scale = Math.min(width / WORLD_WIDTH, height / WORLD_HEIGHT)
  const originX = width / 2
  const originY = (START_Y + 5) * scale
  const toCanvas = (x: number, y: number) => ({ cx: originX + x * scale, cy: originY - y * scale })

  ctx.clearRect(0, 0, width, height)

  // 통로 벽
  ctx.fillStyle = '#2b2740'
  for (const side of [-1, 1]) {
    const { cx, cy } = toCanvas(side * CHANNEL_HALF_WIDTH - side * WALL_THICKNESS, START_Y + 5)
    ctx.fillRect(cx - WALL_THICKNESS * scale, cy, WALL_THICKNESS * 2 * scale, WORLD_HEIGHT * scale)
  }

  // 페그
  ctx.fillStyle = '#7060d2'
  for (const peg of PEGS) {
    const { cx, cy } = toCanvas(peg.x, peg.y)
    ctx.beginPath()
    ctx.arc(cx, cy, PEG_RADIUS * scale, 0, Math.PI * 2)
    ctx.fill()
  }

  // 결승선
  const finishLine = toCanvas(0, FINISH_Y)
  ctx.strokeStyle = '#e5c07b'
  ctx.setLineDash([6, 6])
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(originX - (CHANNEL_HALF_WIDTH - WALL_THICKNESS) * scale, finishLine.cy)
  ctx.lineTo(originX + (CHANNEL_HALF_WIDTH - WALL_THICKNESS) * scale, finishLine.cy)
  ctx.stroke()
  ctx.setLineDash([])

  // 마블
  for (const marble of snapshot.marbles) {
    const { cx, cy } = toCanvas(marble.x, marble.y)
    const isWinner = snapshot.winner === marble.name
    ctx.fillStyle = marble.color
    ctx.beginPath()
    ctx.arc(cx, cy, MARBLE_RADIUS * scale * (isWinner ? 1.4 : 1), 0, Math.PI * 2)
    ctx.fill()
    if (isWinner) {
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.stroke()
    }
    ctx.fillStyle = '#fff'
    ctx.font = `${Math.max(9, scale * 0.9)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(marble.name, cx, cy - MARBLE_RADIUS * scale - 4)
  }
}
