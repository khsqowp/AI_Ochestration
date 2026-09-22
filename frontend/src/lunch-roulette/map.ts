/** 맵 지오메트리를 순수 데이터로 분리 -- simulation.ts(box2d 바디 생성)와 renderer.ts(캔버스 그리기)
 * 둘 다 같은 좌표를 그대로 써서 "물리랑 그림이 따로 논다" 류의 어긋남이 구조적으로 안 생기게 한다.
 * Y는 위가 +, 아래가 - (중력이 -Y로 당김) -- 마블은 START_Y에서 시작해 FINISH_Y에 닿으면 결승. */
export const CHANNEL_HALF_WIDTH = 12
export const WALL_THICKNESS = 0.5
export const START_Y = 40
export const FINISH_Y = -40
export const MARBLE_RADIUS = 0.6
export const PEG_RADIUS = 1.0

export interface PegDef { x: number; y: number }

// 갈톤보드(플린코) 배열 -- 줄마다 페그 하나씩 번갈아 놓던 이전 버전은 마블이 좌우로 딱 두 번만
// 튕기고 끝나서 화면이 휑했다. 짝수 줄 6개/홀수 줄 5개를 절반칸씩 엇갈려 쌓으면 마블이 매 줄마다
// 좌우로 튕길 확률이 생겨 궤적이 실제로 갈라지고, 시각적으로도 "보드" 느낌이 난다.
// 페그 반지름(1.0) 감안하면 한 줄 안 페그 간 간격 4는 마블 지름(1.2)보다 훨씬 넓어 안 막힌다.
const ROW_SPACING = 4.4
const ROW_COUNT = 13
const FIRST_ROW_Y = 30
const EVEN_ROW_XS = [-10, -6, -2, 2, 6, 10]
const ODD_ROW_XS = [-8, -4, 0, 4, 8]

export const PEGS: PegDef[] = Array.from({ length: ROW_COUNT }, (_, row) => {
  const xs = row % 2 === 0 ? EVEN_ROW_XS : ODD_ROW_XS
  const y = FIRST_ROW_Y - row * ROW_SPACING
  return xs.map(x => ({ x, y }))
}).flat()

export const MARBLE_COLORS = [
  '#e06c75', '#61afef', '#98c379', '#e5c07b', '#c678dd', '#56b6c2', '#d19a66', '#be5046',
  '#528bff', '#c3946b', '#e06c9a', '#7ec4cf', '#f2a65a', '#9d8dff', '#4cbb87', '#f06595',
]

export function startPositions(count: number): number[] {
  if (count <= 1) return [0]
  const span = (CHANNEL_HALF_WIDTH - WALL_THICKNESS - MARBLE_RADIUS - 1) * 2
  return Array.from({ length: count }, (_, i) => -span / 2 + (span * i) / (count - 1))
}
