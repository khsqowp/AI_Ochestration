// Pure logic pulled out of ArchiveDetailPage.tsx's TranscriptSections component so it can be
// unit-tested without rendering (this repo's vitest config runs in plain `node`, no jsdom).
export type TranscriptCard = 'cleaned' | 'corrected' | 'raw'

// Order mirrors how the cards are displayed: most-processed (context-cleaned) first, then the
// typo-corrected STT output, then the raw/unprocessed transcript.
export function visibleTranscriptCards(transcript?: string, cleaned?: string, sttCorrected?: string): TranscriptCard[] {
  const cards: TranscriptCard[] = []
  if (cleaned?.trim()) cards.push('cleaned')
  if (sttCorrected?.trim()) cards.push('corrected')
  if (transcript?.trim()) cards.push('raw')
  return cards
}
