import { describe, expect, test } from 'vitest'
import { buildWeeklyTrend, captureClosedSession, domainForSkill, SKILL_DOMAINS, type ClosableSession } from './CompetencyPage.logic'

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

describe('domainForSkill', () => {
  test('every skill in SKILL_DOMAINS resolves back to its own bucket', () => {
    for (const domain of SKILL_DOMAINS) {
      for (const skillCode of domain.skillCodes) {
        expect(domainForSkill(skillCode)).toBe(domain.key)
      }
    }
  })

  test('returns null for an unknown skill code', () => {
    expect(domainForSkill('NOT_A_REAL_SKILL')).toBeNull()
  })

  test('no skill code appears in more than one domain bucket', () => {
    const seen = new Set<string>()
    const duplicates: string[] = []
    for (const domain of SKILL_DOMAINS) {
      for (const skillCode of domain.skillCodes) {
        if (seen.has(skillCode)) duplicates.push(skillCode)
        seen.add(skillCode)
      }
    }
    expect(duplicates).toEqual([])
  })
})

describe('buildWeeklyTrend', () => {
  test('averages same-week scores into a single point', () => {
    const points = [
      { skillCode: 'XSS_CONTEXT', score: 60, closedAt: '2026-09-01T10:00:00Z' }, // 화요일
      { skillCode: 'SQLI_QUERY', score: 80, closedAt: '2026-09-02T10:00:00Z' }, // 수요일, 같은 ISO 주
    ]

    const trend = buildWeeklyTrend(points)

    expect(trend).toHaveLength(1)
    expect(trend[0].avg).toBe(70)
    expect(trend[0].count).toBe(2)
    expect(trend[0].weekStart).toBe('2026-08-31') // 그 주의 월요일
  })

  test('splits points from different weeks and sorts ascending', () => {
    const points = [
      { skillCode: 'XSS_CONTEXT', score: 90, closedAt: '2026-09-10T10:00:00Z' },
      { skillCode: 'SQLI_QUERY', score: 50, closedAt: '2026-09-01T10:00:00Z' },
    ]

    const trend = buildWeeklyTrend(points)

    expect(trend.map(item => item.weekStart)).toEqual(['2026-08-31', '2026-09-07'])
  })

  test('returns an empty list for no points', () => {
    expect(buildWeeklyTrend([])).toEqual([])
  })
})
