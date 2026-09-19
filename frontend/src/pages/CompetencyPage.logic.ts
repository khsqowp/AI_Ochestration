// Medium #11 -- extracted from CompetencyPage's send() so this is testable without rendering anything.
// The completion modal must keep showing the session that just closed even after a background reload()
// sets `active` back to null (a lookup that only ever returns the ACTIVE session legitimately finds
// nothing once this one closes) -- so the modal has to read from a separate captured snapshot, not `active`.
export interface ClosableSession {
  status: 'ACTIVE' | 'CLOSED'
}

export function captureClosedSession<T extends ClosableSession>(next: T, previouslyCaptured: T | null): T | null {
  return next.status === 'CLOSED' ? next : previouslyCaptured
}
