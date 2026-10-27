import { describe, expect, it } from 'vitest'
import { tilesPerRow, visibleCollapsedCount } from './ArchivePage.logic'

describe('tilesPerRow', () => {
  it('counts five columns at the exact five-column width', () => {
    expect(tilesPerRow(5 * 280 + 4 * 12, 280, 12)).toBe(5)
  })

  it('fits one column at a narrow mobile width', () => {
    expect(tilesPerRow(320, 280, 12)).toBe(1)
  })

  it('handles the exact boundary for another column', () => {
    expect(tilesPerRow(2 * 280 + 12, 280, 12)).toBe(2)
    expect(tilesPerRow(2 * 280 + 11, 280, 12)).toBe(1)
  })
})

describe('visibleCollapsedCount', () => {
  it('does not exceed the available item count', () => {
    expect(visibleCollapsedCount(5 * 280 + 4 * 12, 280, 12, 3)).toBe(3)
  })
})
