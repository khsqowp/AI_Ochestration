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

// 25개 스킬을 레이더 하나에 다 넣으면 축이 겹쳐 안 읽힌다. 도메인별 소그룹(6~8축)으로 쪼갠다 -- 이
// 매핑 자체가 "무슨 스킬이 서로 관련 있는지"를 인코딩하므로 라벨 사전과 분리된 순수 함수로 테스트한다.
export const SKILL_DOMAINS: { key: string; label: string; skillCodes: string[] }[] = [
  { key: 'auth', label: '인증·인가·세션', skillCodes: ['AUTHENTICATION', 'AUTHORIZATION', 'SESSION_COOKIE', 'CLIENT_STATE_TRUST', 'CSRF', 'BUSINESS_LOGIC'] },
  { key: 'input', label: '입력·API 취약점', skillCodes: ['API_SECURITY', 'XSS_CONTEXT', 'SQLI_QUERY', 'SSRF', 'INPUT_INTEGRITY', 'URL_REDIRECT', 'FILE_UPLOAD', 'FILE_DOWNLOAD'] },
  { key: 'infra', label: '인프라·네트워크', skillCodes: ['ERROR_HANDLING', 'WEB_HARDENING', 'NETWORK_TLS', 'SECRETS_MANAGEMENT', 'LINUX_HARDENING', 'NETWORK_ACCESS_CONTROL', 'NETWORK_DEFENSE'] },
  { key: 'cloud', label: '클라우드·모니터링', skillCodes: ['CLOUD_IAM', 'CLOUD_NETWORK', 'CLOUD_DATA_SECURITY', 'CONTAINER_SECURITY', 'SECURITY_MONITORING'] },
]

export function domainForSkill(skillCode: string): string | null {
  return SKILL_DOMAINS.find(domain => domain.skillCodes.includes(skillCode))?.key ?? null
}

export interface ScorePoint {
  skillCode: string
  score: number
  closedAt: string
}

export interface WeeklyTrendPoint {
  weekStart: string
  avg: number
  count: number
}

// 일별로 찍으면 세션이 드문드문이라 거의 항상 점 하나짜리 구간만 남는다 -- ISO 주(월요일 시작) 단위로
// 묶어야 "이번 주 vs 지난 주" 비교가 의미 있는 표본 크기를 갖는다.
function isoWeekStart(dateIso: string): string {
  const date = new Date(dateIso)
  const day = (date.getUTCDay() + 6) % 7 // 0=월요일
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day))
  return monday.toISOString().slice(0, 10)
}

export function buildWeeklyTrend(points: ScorePoint[]): WeeklyTrendPoint[] {
  const buckets = new Map<string, { sum: number; count: number }>()
  for (const point of points) {
    const week = isoWeekStart(point.closedAt)
    const bucket = buckets.get(week) ?? { sum: 0, count: 0 }
    bucket.sum += point.score
    bucket.count += 1
    buckets.set(week, bucket)
  }
  return [...buckets.entries()]
    .map(([weekStart, { sum, count }]) => ({ weekStart, avg: sum / count, count }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
}
