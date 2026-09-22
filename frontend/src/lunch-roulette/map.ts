/** 맵 지오메트리를 순수 데이터로 분리 -- simulation.ts(box2d 바디 생성)와 renderer.ts(캔버스 그리기)
 * 둘 다 같은 좌표를 그대로 써서 "물리랑 그림이 따로 논다" 류의 어긋남이 구조적으로 안 생기게 한다.
 * Y는 위가 +, 아래가 - (중력이 -Y로 당김) -- 마블은 START_Y에서 시작해 FINISH_Y에 닿으면 결승. */
export const CHANNEL_HALF_WIDTH = 12
export const WALL_THICKNESS = 0.5
export const START_Y = 40
export const FINISH_Y = -40
export const MARBLE_RADIUS = 0.6
export const PEG_RADIUS = 1.4

export interface PegDef { x: number; y: number }

// 한 줄에 페그 하나씩, 좌우 번갈아 -- 통로 폭 24 중 페그 지름 2.8을 빼도 한쪽에 10 넘게 남아
// 마블이 항상 지나갈 틈이 있다(막힐 일 없음). 10줄, 6칸 간격.
export const PEGS: PegDef[] = Array.from({ length: 10 }, (_, row) => ({
  x: row % 2 === 0 ? 6 : -6,
  y: START_Y - 10 - row * 6.5,
}))

export const MARBLE_COLORS = [
  '#e06c75', '#61afef', '#98c379', '#e5c07b', '#c678dd', '#56b6c2', '#d19a66', '#be5046',
  '#528bff', '#c3946b', '#e06c9a', '#7ec4cf', '#f2a65a', '#9d8dff', '#4cbb87', '#f06595',
]

export function startPositions(count: number): number[] {
  if (count <= 1) return [0]
  const span = (CHANNEL_HALF_WIDTH - WALL_THICKNESS - MARBLE_RADIUS - 1) * 2
  return Array.from({ length: count }, (_, i) => -span / 2 + (span * i) / (count - 1))
}
