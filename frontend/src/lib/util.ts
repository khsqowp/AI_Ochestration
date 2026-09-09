import type { CheatSheetTool } from '../cheatsheet-data'
import type {
  Agent, ArchiveFile, CalendarCategory, ChartPoint, DebateModelKey, DebateSession,
  FileCategory, MarkdownDoc, SortDirection, SortField, Task, TradingPeriod,
} from './types'

export function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}
export function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax`
}

export const CALENDAR_CATEGORY_LABEL: Record<CalendarCategory, string> = { EVENT: '행사', SEMINAR: '세미나', INCIDENT: '피해사고' }

export const archiveTaskLabel = (title: string) => title.replace(/\s*(수집 자료 검토|원본\s*\d+개\s*검토)$/, ' 파일 아카이브')
export const domainLabel = (domain: string | null) => { const key = (domain ?? '').toUpperCase(); return key === 'SECURITY' ? '보안' : key === 'ECONOMY' ? '경제' : key === 'GENERAL' ? '일반' : key === 'IDEAS' ? '아이디어' : domain ?? '기타' }
export const displayTitle = (file: Pick<ArchiveFile, 'title' | 'name'>) => file.title?.trim() ? file.title : file.name.replace(/\.md$/i, '')
export const documentTitle = (doc: MarkdownDoc) => doc.frontMatter.title ?? doc.path.split('/').at(-1)?.replace(/\.md$/i, '') ?? doc.path

export const fileMatchesCategory = (file: ArchiveFile, category: FileCategory) => {
  const domain = (file.domain ?? '').toLowerCase()
  if (category === 'economy') return file.origin === 'collection' && domain === 'economy'
  if (category === 'security') return file.origin === 'collection' && domain === 'security'
  if (category === 'manual') return file.origin === 'manual'
  if (category === 'upload') return file.origin === 'upload'
  return true
}

export const agents: Agent[] = [
  { id: 'pm', name: 'PM', role: '최종 계획 · 결정 · 검증', color: '#7667dc', left: '50%', top: '29%', status: 'DeepSeek V4-Pro', message: '팀 보고서와 근거 패킷을 검토해 최종 결론을 만듭니다.' },
  { id: 'security-lead', name: 'Sentinel Lead', role: '보안 팀장', color: '#df805a', left: '23%', top: '42%', status: 'DeepSeek V4-Pro Thinking', message: '출처의 신뢰도와 상충되는 보안 정보를 분석합니다.' },
  { id: 'economy-lead', name: 'Atlas Lead', role: '경제 팀장', color: '#4e94c7', left: '76%', top: '42%', status: 'DeepSeek V4-Pro Thinking', message: '한국·미국 시장 자료를 종합해 팀 결론을 작성합니다.' },
  { id: 'security-scout', name: 'Scout S', role: '보안 수집 담당', color: '#e5a05b', left: '16%', top: '62%', status: 'Gemini 2.5 Flash', message: '등록된 보안 출처와 검색 결과에서 근거를 수집합니다.' },
  { id: 'economy-scout', name: 'Scout E', role: '경제 수집 담당', color: '#64a9d5', left: '83%', top: '62%', status: 'Gemini 2.5 Flash', message: '등록된 경제 출처와 검색 결과에서 근거를 수집합니다.' },
  { id: 'general-scout', name: 'Scout G', role: '일반 리서치 수집 담당', color: '#9b77d5', left: '50%', top: '47%', status: 'Gemini 2.5 Flash', message: '일반 질문에 필요한 공개 웹 근거와 자료를 수집합니다.' },
  { id: 'general-lead', name: 'Synthesis G', role: '일반 분석 · 종합 담당', color: '#8060bb', left: '50%', top: '67%', status: 'DeepSeek V4-Pro Thinking', message: '일반 주제의 근거를 종합하고 실행 가능한 답변으로 정리합니다.' },
  { id: 'review-a', name: 'Review A', role: '1차 정리 · 재검토', color: '#69aa8b', left: '39%', top: '60%', status: 'GPT-4o mini', message: '자료를 구조화하고 출처·날짜·중복 여부를 점검합니다.' },
  { id: 'review-b', name: 'Review B', role: '독립 반대 검토', color: '#5c9182', left: '61%', top: '60%', status: 'GPT-4o mini', message: '다른 관점에서 근거 누락과 과장을 찾아냅니다.' },
  { id: 'archivist', name: 'Archive', role: '유기적 폴더 · 링크 관리', color: '#bd9255', left: '50%', top: '80%', status: 'Obsidian 보관 대기', message: '원본은 보존하고, 가공 노트·링크·폴더 구조를 관리합니다.' },
  { id: 'trader', name: 'Trader Q', role: '크립토 자동매매 (설계 중)', color: '#3aa675', left: '83%', top: '80%', status: '설계 단계 · 아직 미가동', message: '경제팀 분석과 Bybit 시세를 종합해 현물 자동매매를 준비 중입니다.' },
]

export const DEBATE_MODEL_LABEL: Record<DebateModelKey, string> = { DEEPSEEK: 'DeepSeek', OPENAI: 'GPT-4o mini', BEDROCK: 'Claude (Bedrock)' }
export const DEBATE_ROLE_LABEL = (role: string) => role === 'PRO' ? '찬성' : role === 'CON' ? '반대' : role === 'RESEARCH' ? '리서치(Gemini)' : role.startsWith('PARTICIPANT_') ? `참가자 ${role.replace('PARTICIPANT_', '')}` : role
export const debateRoleClass = (role: string) => role === 'PRO' ? 'pro' : role === 'CON' ? 'con' : role === 'RESEARCH' ? 'research' : 'participant'
export const debateTurnsPerRound = (session: DebateSession) => session.mode === 'PRO_CON' ? 3 : (session.participants?.length ?? 0) + 1
export const debateTotalTurns = (session: DebateSession) => session.maxTurnsPerSide * debateTurnsPerRound(session)

export const sortIndicator = (field: SortField, sortField: SortField, sortDirection: SortDirection) => field !== sortField ? '' : sortDirection === 'asc' ? ' ▲' : ' ▼'

export function cheatSheetCommand(tool: CheatSheetTool, selected: Set<string>, values: Record<string, string>, target: string): string {
  const parts: string[] = []
  if (tool.base) parts.push(tool.base)
  for (const option of tool.options) {
    if (!selected.has(option.id)) continue
    if (option.needsValue) {
      const value = (values[option.id] ?? '').trim()
      if (!value) continue
      if (!option.flag) parts.push(value)
      else parts.push(option.flag.endsWith('=') ? `${option.flag}${value}` : `${option.flag} ${value}`)
    } else if (option.flag) {
      parts.push(option.flag)
    }
  }
  if (tool.targetPlaceholder && target.trim()) parts.push(target.trim())
  return parts.join(tool.joiner ?? ' ')
}

export const NOTE_PROMPT_TEMPLATE = (topic: string) => `"${topic || '{주제}'}"에 대한 심층 리서치 노트를 작성해줘. 아래 구조로 정리해:
1. 개요 — 이 주제가 왜 중요한지, 핵심 요약 2~3문장
2. 핵심 개념 — 꼭 필요한 용어와 원리를 명확히 정의
3. 상세 분석 — 실제 사례·기술적 원리·최신 동향을 근거와 함께 구체적으로 설명 (뭉뚱그린 설명 금지)
4. 실무 시사점 / 대응방안 — 이 내용을 어떻게 활용하거나 방어할 수 있는지
5. 참고 근거 — 사용한 출처나 판단 근거를 명시

분량보다 밀도가 중요해. 근거 없는 내용으로 억지로 늘리지 말고, 각 섹션이 실제로 새로운 정보를 담도록 작성해줘.`

export const DASHBOARD_STAGES = [{ id: 'COLLECT', label: '자료 수집' }, { id: 'REVIEW_A', label: '1차 정리' }, { id: 'REVIEW_B', label: '독립 재검토' }, { id: 'TEAM_LEAD', label: '팀장 종합' }, { id: 'PM', label: 'PM 판정' }, { id: 'ARCHIVE', label: '아카이브' }]

export function autoGrowTextarea(node: HTMLTextAreaElement | null, maxPx: number) {
  if (!node) return
  node.style.height = 'auto'
  node.style.height = `${Math.min(node.scrollHeight, maxPx)}px`
}

// 백엔드 /api/archive/ask는 검색+답변 생성을 한 번의 blocking 요청으로 처리해서 실제 단계별 이벤트가 없다 --
// 경과 시간 기준으로 대략의 진행 단계만 흉내내는 용도이며, PM 작업 진행표처럼 실제 서버 단계 신호는 아니다.
export function ragProgressLabel(elapsedMs: number): string {
  if (elapsedMs < 1200) return '질문을 분석하는 중…'
  if (elapsedMs < 3500) return '관련 노트를 검색하는 중…'
  return '답변을 작성하는 중…'
}

export function taskStatusLabel(status: Task['status']): string {
  switch (status) {
    case 'COMPLETED': return '보고 완료'
    case 'FAILED': return '작업 중단'
    case 'CANCELLED': return '사용자가 중지함'
    case 'AWAITING_BATCH': return '야간 배치 대기'
    default: return '작업 진행 중'
  }
}

export const TRADING_PERIOD_DAYS: Record<TradingPeriod, number | null> = { all: null, month: 30, week: 7, day: 1 }
export const TRADING_PERIOD_LABEL: Record<TradingPeriod, string> = { all: '전체', month: '월간', week: '주간', day: '일간' }
export const TRADING_PERIOD_ORDER: TradingPeriod[] = ['day', 'week', 'month', 'all']

/** 기간별 손익: 정규화된 누적손익 시계열(value = 그 시점까지의 누적 총손익)과 현재 총손익으로
 * "이 기간 동안 늘어난 손익"을 낸다. 기간 시작 이전 포인트가 없으면(히스토리가 기간보다 짧으면)
 * 가장 오래된 포인트를 기준으로 잡고 shortHistory=true 로 표시한다 — 예전에는 0을 기준으로 삼아
 * 주간/월간/전체가 전부 같은 값으로 붕괴했다. */
export function periodPnlFromSeries(points: ChartPoint[], currentTotalPnl: number, period: TradingPeriod): { pnl: number; shortHistory: boolean } {
  const days = TRADING_PERIOD_DAYS[period]
  if (days === null || points.length === 0) return { pnl: currentTotalPnl, shortHistory: false }
  const cutoff = Date.now() - days * 86400000
  const sorted = [...points].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())
  const baseline = [...sorted].reverse().find(point => new Date(point.ts).getTime() <= cutoff)
  if (baseline) return { pnl: currentTotalPnl - baseline.value, shortHistory: false }
  return { pnl: currentTotalPnl - sorted[0].value, shortHistory: true }
}

/** equity 히스토리가 실제로 며칠치인지 — PeriodTabs 에서 "이 기간은 전체와 동일" 뱃지 판단에 쓴다. */
export function historySpanDays(points: { ts: string }[]): number | undefined {
  if (points.length === 0) return undefined
  const oldest = points.reduce((min, p) => Math.min(min, new Date(p.ts).getTime()), Infinity)
  return (Date.now() - oldest) / 86400000
}

/** 여러 봇의 equity_history 필드명이 제각각(totalPnlUsdt/Krw/Usd)이라, 각 봇 쪽에서 {ts, value}로
 * 정규화한 뒤 이 두 헬퍼(기간 필터링, 라인차트 렌더링)를 공유해서 쓴다. */
export function filterChartPoints(points: ChartPoint[], period: TradingPeriod): ChartPoint[] {
  const days = TRADING_PERIOD_DAYS[period]
  if (days === null) return points
  const cutoff = Date.now() - days * 86400000
  return points.filter(point => new Date(point.ts).getTime() >= cutoff)
}

export function clampChartDomain(start: number, end: number, length: number): [number, number] {
  const size = Math.max(end - start, 0)
  let s = Math.max(0, Math.min(start, length - 1 - size))
  let e = s + size
  if (e > length - 1) { e = length - 1; s = Math.max(0, e - size) }
  return [Math.round(s), Math.round(e)]
}

export const ROTATION_MARKETS = {
  kr: {
    title: '국장 로테이션 대시보드', endpoint: '/api/trading/rotation/kr/state',
    budget: 4_000_000, lookback: 20, rebal: 10,
    money: (v: number) => `${Math.round(v).toLocaleString()}원`,
    intro: '한국투자증권 모의투자(국내주식) top-N 상대모멘텀 로테이션입니다. 최근 20일 수익률 상위 8종목 등가중 보유, 10일마다 리밸런스, 등가중지수 200일선 아래면 전액 현금. 백테스트(2018~2026): EW 매수·보유 대비 알파 +15~30%p.',
  },
  us: {
    title: '미장 로테이션 대시보드', endpoint: '/api/trading/rotation/us/state',
    budget: 2_800, lookback: 120, rebal: 20,
    money: (v: number) => `$${v.toFixed(2)}`,
    intro: '한국투자증권 모의투자(미국주식) top-N 상대모멘텀 로테이션입니다. 최근 120일 수익률 상위 8종목 등가중 보유, 20일마다 리밸런스, 레짐필터 on. 모의투자는 지정가만 가능해 마켓터블 리밋(±1%)으로 주문. 백테스트: EW 매수·보유 대비 알파 +22~44%p.',
  },
} as const

export const PIXEL_SKIN = '#f2c9a0'
export const PIXEL_INK = '#2b2b2b'
