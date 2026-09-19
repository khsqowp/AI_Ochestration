import { describe, expect, test } from 'vitest'
import { captureClosedSession, type ClosableSession } from './CompetencyPage.logic'

type TestSession = ClosableSession & { id: string }

// Medium #11 -- the completion modal used to read straight off `active`, which a background reload()
// legitimately sets back to null once the session that just closed no longer shows up as ACTIVE. That made
// the modal vanish out from under the learner right after their closing message landed.
describe('captureClosedSession', () => {
  test('captures the session when it just closed', () => {
    const closed: TestSession = { status: 'CLOSED', id: 'a' }

    expect(captureClosedSession(closed, null)).toBe(closed)
  })

  test('keeps whatever was previously captured when the new session state is still active', () => {
    const stillActive: TestSession = { status: 'ACTIVE', id: 'a' }
    const previouslyClosed: TestSession = { status: 'CLOSED', id: 'b' }

    expect(captureClosedSession(stillActive, previouslyClosed)).toBe(previouslyClosed)
  })

  test('stays null when nothing has closed yet', () => {
    const stillActive: TestSession = { status: 'ACTIVE', id: 'a' }

    expect(captureClosedSession(stillActive, null)).toBeNull()
  })
})
