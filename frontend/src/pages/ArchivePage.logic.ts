// Keep these values in sync with .archive-grid in frontend/src/styles.css.
export const ARCHIVE_CARD_MIN_WIDTH_PX = 280
export const ARCHIVE_GRID_GAP_PX = 12

export function tilesPerRow(containerWidthPx: number, cardMinWidthPx: number, gapPx: number): number {
  if (containerWidthPx <= 0 || cardMinWidthPx <= 0) return 1
  return Math.max(1, Math.floor((containerWidthPx + gapPx) / (cardMinWidthPx + gapPx)))
}

export function visibleCollapsedCount(containerWidthPx: number, cardMinWidthPx: number, gapPx: number, totalItems: number): number {
  return Math.min(tilesPerRow(containerWidthPx, cardMinWidthPx, gapPx), totalItems)
}
