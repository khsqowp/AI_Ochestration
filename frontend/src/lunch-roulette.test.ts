import { describe, expect, test } from 'vitest'
import { pickWinnerIndex } from './lunch-roulette'

describe('pickWinnerIndex', () => {
  test('is deterministic for the same room', () => {
    const a = pickWinnerIndex('2026-09-23', '2026-09-23T12:00:00Z', ['김밥', '냉면', '순대국'])
    const b = pickWinnerIndex('2026-09-23', '2026-09-23T12:00:00Z', ['김밥', '냉면', '순대국'])

    expect(a).toBe(b)
  })

  test('always returns an index within range', () => {
    const candidates = ['김밥', '냉면', '순대국', '떡볶이', '초밥']
    for (let i = 0; i < 50; i++) {
      const index = pickWinnerIndex('2026-09-23', `2026-09-23T12:00:0${i % 10}Z`, candidates)
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThan(candidates.length)
    }
  })

  test('single candidate always wins', () => {
    expect(pickWinnerIndex('2026-09-23', '2026-09-23T12:00:00Z', ['김밥'])).toBe(0)
  })

  test('different start times usually produce different winners', () => {
    const candidates = ['김밥', '냉면', '순대국', '떡볶이', '초밥', '피자', '치킨', '족발']
    const results = new Set(Array.from({ length: 20 }, (_, i) => pickWinnerIndex('2026-09-23', `2026-09-23T12:00:${String(i).padStart(2, '0')}Z`, candidates)))

    expect(results.size).toBeGreaterThan(1)
  })
})
