import { describe, expect, test } from 'vitest'
import { gameRandom, pickMapIndex } from './rng'

/** rng.ts는 물리 시뮬레이션 자체를 굴리진 않으므로, 여기선 시드→같은 난수 시퀀스 재현만
 * 검증한다(실제 경주 재현성은 MarbleRace를 통해 브라우저에서만 확인 가능 -- vitest는 jsdom이라
 * box2d-wasm/캔버스를 못 돌린다). */
describe('gameRandom', () => {
  test('same seed produces the same sequence', () => {
    gameRandom.seed('2026-09-23|2026-09-23T12:00:00Z|김밥,냉면,순대국')
    const a = [gameRandom.next(), gameRandom.next(), gameRandom.next()]

    gameRandom.seed('2026-09-23|2026-09-23T12:00:00Z|김밥,냉면,순대국')
    const b = [gameRandom.next(), gameRandom.next(), gameRandom.next()]

    expect(a).toEqual(b)
  })

  test('different seeds usually diverge', () => {
    gameRandom.seed('room-a')
    const a = gameRandom.next()
    gameRandom.seed('room-b')
    const b = gameRandom.next()

    expect(a).not.toBe(b)
  })

  test('draws stay within [0, 1)', () => {
    gameRandom.seed('range-check')
    for (let i = 0; i < 200; i++) {
      const v = gameRandom.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('pickMapIndex', () => {
  test('is deterministic for the same seed', () => {
    gameRandom.seed('same-room-key')
    const a = pickMapIndex(4)
    gameRandom.seed('same-room-key')
    const b = pickMapIndex(4)

    expect(a).toBe(b)
  })

  test('single map always picked', () => {
    gameRandom.seed('only-one-map')
    expect(pickMapIndex(1)).toBe(0)
  })

  test('always within range', () => {
    for (let i = 0; i < 50; i++) {
      gameRandom.seed(`room-${i}`)
      const index = pickMapIndex(4)
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThan(4)
    }
  })
})
