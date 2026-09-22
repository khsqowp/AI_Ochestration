import { describe, expect, test } from 'vitest'
import { CHANNEL_HALF_WIDTH, MARBLE_RADIUS, WALL_THICKNESS, startPositions } from './map'

describe('startPositions', () => {
  test('centers the single marble when there is only one candidate', () => {
    expect(startPositions(1)).toEqual([0])
  })

  test('spreads marbles symmetrically around the center', () => {
    const xs = startPositions(4)

    expect(xs).toHaveLength(4)
    const sum = xs.reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(0, 5)
  })

  test('never places a marble inside the channel walls', () => {
    const usableHalfWidth = CHANNEL_HALF_WIDTH - WALL_THICKNESS - MARBLE_RADIUS
    for (const count of [1, 2, 5, 16]) {
      for (const x of startPositions(count)) {
        expect(Math.abs(x)).toBeLessThanOrEqual(usableHalfWidth)
      }
    }
  })

  test('spaces marbles evenly (constant gap between neighbors)', () => {
    const xs = startPositions(5)
    const gaps = xs.slice(1).map((x, i) => x - xs[i])
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0], 5)
  })
})
