import { describe, expect, it } from 'vitest'
import { visibleTranscriptCards } from './ArchiveDetailPage.logic'

describe('visibleTranscriptCards', () => {
  it('returns no cards when every field is empty', () => {
    expect(visibleTranscriptCards('', '', '')).toEqual([])
    expect(visibleTranscriptCards(undefined, undefined, undefined)).toEqual([])
  })

  it('shows only the raw card when just the transcript is present', () => {
    expect(visibleTranscriptCards('raw text', '', '')).toEqual(['raw'])
  })

  it('shows the corrected card when stt_corrected_text is non-empty, even if other fields are blank', () => {
    // This is the in-progress-backend-fix scenario: summary/transcript/cleaned are still empty,
    // but the typo-corrected STT output has already landed.
    expect(visibleTranscriptCards('', '', '오타가 수정된 STT 출력본입니다.')).toEqual(['corrected'])
  })

  it('does not show the corrected card for whitespace-only stt_corrected_text', () => {
    expect(visibleTranscriptCards('raw', 'cleaned', '   ')).toEqual(['cleaned', 'raw'])
  })

  it('orders cards as cleaned, corrected, raw when all three are present', () => {
    expect(visibleTranscriptCards('raw text', 'cleaned text', 'corrected text')).toEqual(['cleaned', 'corrected', 'raw'])
  })
})
