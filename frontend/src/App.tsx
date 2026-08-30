import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, type SimulationNodeDatum } from 'd3-force'
import { Archive, Bot, CalendarDays, Check, ChevronLeft, ChevronRight, CircleHelp, Clipboard, FileText, FileUp, Globe2, History, Landmark, LayoutDashboard, Layers, ListChecks, Loader2, LockKeyhole, LogOut, MessageCircle, MessagesSquare, PanelLeft, Plus, RotateCcw, ScrollText, Search, Send, Settings, Square, Terminal, Trash2, TrendingUp, Upload, UserPlus, Users, X } from 'lucide-react'
import { CHEATSHEET_CATEGORIES, type CheatSheetTool } from './cheatsheet-data'
import { XssPayloadBuilder } from './xss-builder'

// react-markdown + remark-gfm (~18KB gzipped) are only ever needed inside a handful of modals
// (document preview, RAG answers) — loading them eagerly at module scope put that weight in every
// user's initial bundle even if they never open one of those panels. Lazy-loading defers the fetch
// until the first render that actually needs it.
// 2초 주기 폴링(작업 진행표 등)이 이 뷰어를 포함한 상위 컴포넌트를 다시 마운트시킬 수 있는데, 그때마다
// mermaid.render()를 처음부터 다시 돌리면 빈 화면 -> SVG로 매번 깜빡인다. 같은 코드는 캐시에서 즉시 채워
// 넣어 깜빡임을 없애고, mermaid.initialize()도 전역에서 한 번만 실행해 동시 렌더링 시 상태 충돌을 막는다.
const mermaidSvgCache = new Map<string, string>()
let mermaidInitialized: Promise<typeof import('mermaid').default> | null = null
function loadMermaid() {
  if (!mermaidInitialized) {
    mermaidInitialized = import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'strict' })
      return mermaid
    })
  }
  return mermaidInitialized
}
let mermaidIdCounter = 0
function MermaidBlock({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const cached = mermaidSvgCache.get(code)
    if (cached) { if (ref.current) ref.current.innerHTML = cached; return }
    loadMermaid().then(async mermaid => {
      try {
        const { svg } = await mermaid.render(`mermaid-${mermaidIdCounter++}`, code)
        mermaidSvgCache.set(code, svg)
        if (!cancelled && ref.current) ref.current.innerHTML = svg
      } catch (renderError) {
        if (!cancelled) setError(renderError instanceof Error ? renderError.message : String(renderError))
      }
    })
    return () => { cancelled = true }
  }, [code])

  if (error) return <pre className="mermaid-error">다이어그램 렌더링 실패: {error}{'\n\n'}{code}</pre>
  return <div className="mermaid-diagram" ref={ref}/>
}

const MarkdownBody = lazy(() =>
  // rehype-raw makes react-markdown actually render embedded HTML tags (e.g. a bare <br> inside a table
  // cell) instead of showing them as literal text -- react-markdown ignores raw HTML by default. Some
  // archived notes are built from COLLECTION-origin scraped web content, so raw HTML can't just be trusted;
  // rehype-sanitize runs right after to strip anything dangerous (script tags, event handler attributes,
  // etc.) while keeping safe formatting tags like <br>/<table>.
  Promise.all([import('react-markdown'), import('remark-gfm'), import('rehype-raw'), import('rehype-sanitize')]).then(([reactMarkdown, remarkGfmModule, rehypeRawModule, rehypeSanitizeModule]) => ({
    default: ({ children }: { children: string }) => {
      const ReactMarkdown = reactMarkdown.default
      return <ReactMarkdown remarkPlugins={[remarkGfmModule.default]} rehypePlugins={[rehypeRawModule.default, rehypeSanitizeModule.default]} components={{
        code({ className, children: codeChildren }) {
          if (className === 'language-mermaid') return <MermaidBlock code={String(codeChildren).replace(/\n$/, '')}/>
          return <code className={className}>{codeChildren}</code>
        },
      }}>{children}</ReactMarkdown>
    },
  }))
)

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}
function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax`
}

type Role = 'ADMIN' | 'USER'
type User = { displayName: string; email: string; role: Role }
type Session = { authenticationEnabled: boolean; user: User | null }
type Agent = { id: string; name: string; role: string; color: string; left: string; top: string; status: string; message: string }
type ResearchSource = { id: string; name: string; url: string; domain: 'SECURITY' | 'ECONOMY'; intervalHours: number; crawlDepth: number; maxPages: number; note: string | null; lastCollectedAt: string | null; consecutiveNoContentCycles: number }
type SourceCandidateEntry = { id: string; name: string; url: string; domain: 'SECURITY' | 'ECONOMY'; justification: string; discoveredAt: string }
type Notice = { id: string; kind: 'success' | 'error' | 'info'; message: string }
type Task = { id: string; title: string; instruction: string; domain: 'SECURITY' | 'ECONOMY' | 'GENERAL'; status: 'QUEUED' | 'AWAITING_BATCH' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'; archivePath: string | null; finalReport: string | null; failureReason: string | null }
type TaskEvent = { id: string; stage: string; message: string; model: string | null; createdAt: string; inputTokens: number | null; outputTokens: number | null; totalTokens: number | null; elapsedMs: number | null; estimatedCostUsd: number | null }
type ModelUsage = { model: string; calls: number; inputTokens: number; outputTokens: number; tokens: number; elapsedMs: number; estimatedCostUsd: number }
type UsageSummary = { from: string; to: string; days: number; models: ModelUsage[]; total: ModelUsage; monthToDateCostUsd: number; budgetUsdPerMonth: number; budgetExceeded: boolean }
type DigestEntry = { taskId: string; title: string; domain: string; detail: string | null }
type NoContentSource = { name: string; domain: string; consecutiveNoContentCycles: number }
type DigestResult = { period: string; from: string; to: string; total: number; completed: number; failed: number; byDomain: Record<string, number>; completedTasks: DigestEntry[]; failedTasks: DigestEntry[]; noContentSources: NoContentSource[] }
type Panel = 'sources' | 'archive' | 'agents' | 'usage' | 'digest' | 'ask' | 'settings' | 'help' | 'timeline' | 'files' | 'graph' | 'processes' | 'trading' | 'kr-trading' | 'us-trading' | 'momentum-rotation-trading' | 'trx-trading' | 'calendar' | 'cheatsheet' | 'users' | 'debate' | null
type RagCitation = { path: string; score: number }
type RagAnswer = { answer: string; citations: RagCitation[] }
type RagHistoryEntry = { id: string; question: string; answer: string; citations: RagCitation[]; createdAt: string }
type ArchiveFile = { path: string; name: string; size: number; title: string | null; domain: string | null; topic: string | null; date: string | null; origin: string | null; modifiedAt: string }
type FileCategory = 'all' | 'economy' | 'security' | 'manual' | 'upload'
const fileMatchesCategory = (file: ArchiveFile, category: FileCategory) => {
  const domain = (file.domain ?? '').toLowerCase()
  if (category === 'economy') return file.origin === 'collection' && domain === 'economy'
  if (category === 'security') return file.origin === 'collection' && domain === 'security'
  if (category === 'manual') return file.origin === 'manual'
  if (category === 'upload') return file.origin === 'upload'
  return true
}
type ManagedUser = { id: string; loginId: string; displayName: string; role: Role; createdAt: string }
type FrontMatter = { title: string | null; domain: string | null; topic: string | null; date: string | null; tags: string[] }
type MarkdownDoc = { path: string; frontMatter: FrontMatter; body: string }
type GraphData = { nodes: { path: string; name: string; category: string }[]; edges: { from: string; to: string }[] }
type MaintenanceResult = { notesExamined: number; merged: number; mergedPairs: string[]; reclassified: number; reclassifiedNotes: string[]; bucketed: number; bucketedNotes: string[]; split: number; splitBuckets: string[]; weeklyDigested: number; weeklyDigestedNotes: string[]; linked: number; failed: number; failedNotes: string[] }
type TradingPosition = { notionalUsdt: number; entryPrice: number; entrySpotPrice: number; entryPerpPrice: number; amount: number; entryFeeUsdt: number; accruedFundingUsdt: number; unrealizedPricePnlUsdt: number }
type TradingLogEntry = { ts: string; message: string }
type TradingEquityPoint = { ts: string; totalPnlUsdt: number }
type TradingPositionPoint = { ts: string; price: number; unrealizedPnlUsdt: number; accruedFundingUsdt: number }
type TradingState = { positions: Record<string, TradingPosition>; tradeLog: TradingLogEntry[]; cumulativeFundingUsdt: number; cumulativeFeeUsdt: number; cumulativePricePnlUsdt: number; unrealizedPricePnlUsdt: number; realizedPnlUsdt: number; inceptionTs: string | null; totalCapitalUsdt: number; totalPnlUsdt: number; equityHistory: TradingEquityPoint[]; tradingHalted: boolean; positionHistory: Record<string, TradingPositionPoint[]> }
type TradingPeriod = 'all' | 'month' | 'week' | 'day'
type ChartPoint = { ts: string; value: number }
type KrEquityPoint = { ts: string; totalPnlKrw: number }
type KrPositionPoint = { ts: string; price: number; unrealizedPnlKrw: number }
type KrTradingState = { stopPrice: Record<string, number>; entryCost: Record<string, number>; realizedPnlKrw: number; pendingEntries: string[]; pendingExits: string[]; lastScanDate: string | null; tradeLog: TradingLogEntry[]; equityHistory: KrEquityPoint[]; positionHistory: Record<string, KrPositionPoint[]> }
type UsEquityPoint = { ts: string; totalPnlUsd: number }
type UsPositionPoint = { ts: string; price: number; unrealizedPnlUsd: number }
type UsTradingState = { stopPrice: Record<string, number>; entryCost: Record<string, number>; realizedPnlUsd: number; pendingEntries: string[]; pendingExits: string[]; lastScanDate: string | null; tradeLog: TradingLogEntry[]; equityHistory: UsEquityPoint[]; positionHistory: Record<string, UsPositionPoint[]> }
type UsdtPositionPoint = { ts: string; price: number; unrealizedPnlUsdt: number }
type MomentumRotationPosition = { side: 'long' | 'short'; entryPrice: number; notionalUsdt: number; unrealizedPnlUsdt: number }
type MomentumRotationState = { positions: Record<string, MomentumRotationPosition>; tradeLog: TradingLogEntry[]; equityUsdt: number; cumulativeRealizedPnlUsdt: number; cumulativeFeeUsdt: number; unrealizedPnlUsdt: number; inceptionTs: string | null; lastRebalanceTs: string | null; equityHistory: TradingEquityPoint[]; positionHistory: Record<string, UsdtPositionPoint[]> }
type TrxPosition = { entryPrice: number; qty: number; notionalUsdt: number; entryFeeUsdt: number }
type TrxTradingState = { position: TrxPosition | null; tradeLog: TradingLogEntry[]; cumulativeRealizedPnlUsdt: number; cumulativeFeeUsdt: number; inceptionTs: string | null; equityHistory: TradingEquityPoint[]; positionHistory: Record<string, UsdtPositionPoint[]> }
type CalendarCategory = 'EVENT' | 'SEMINAR' | 'INCIDENT'
type SecurityCalendarEntry = { id: string; eventDate: string; lastUpdatedDate: string; category: CalendarCategory; title: string; summary: string; sourceName: string | null; sourceUrl: string | null }
type CalendarUpdateEntry = { updateDate: string; summary: string; sourceName: string | null; sourceUrl: string | null }
type SecurityCalendarTimelineEntry = { event: SecurityCalendarEntry; updates: CalendarUpdateEntry[] }
type TodoItem = { id: string; text: string; completed: boolean; createdAt: string; completedAt: string | null }
const CALENDAR_CATEGORY_LABEL: Record<CalendarCategory, string> = { EVENT: '행사', SEMINAR: '세미나', INCIDENT: '피해사고' }

const archiveTaskLabel = (title: string) => title.replace(/\s*(수집 자료 검토|원본\s*\d+개\s*검토)$/, ' 파일 아카이브')
const domainLabel = (domain: string | null) => { const key = (domain ?? '').toUpperCase(); return key === 'SECURITY' ? '보안' : key === 'ECONOMY' ? '경제' : key === 'GENERAL' ? '일반' : key === 'IDEAS' ? '아이디어' : domain ?? '기타' }
const displayTitle = (file: Pick<ArchiveFile, 'title' | 'name'>) => file.title?.trim() ? file.title : file.name.replace(/\.md$/i, '')
const documentTitle = (doc: MarkdownDoc) => doc.frontMatter.title ?? doc.path.split('/').at(-1)?.replace(/\.md$/i, '') ?? doc.path

function DocumentCard({ doc }: { doc: MarkdownDoc }) {
  const fm = doc.frontMatter
  return <article className="markdown-document">
    <header className="doc-properties">
      <h1>{documentTitle(doc)}</h1>
      <div className="doc-pills">
        {fm.domain && <span className={`pill domain-pill domain-${fm.domain.toLowerCase()}`}>{domainLabel(fm.domain)}</span>}
        {fm.topic && <span className="pill topic-pill">{fm.topic}</span>}
        {fm.date && <span className="pill date-pill">{fm.date}</span>}
        {fm.tags.filter(tag => tag !== 'orchestration').map(tag => <span className="pill tag-pill" key={tag}>#{tag}</span>)}
      </div>
    </header>
    <Suspense fallback={null}><MarkdownBody>{doc.body}</MarkdownBody></Suspense>
  </article>
}

const PIXEL_SKIN = '#f2c9a0'
const PIXEL_INK = '#2b2b2b'

function PixelAgent({ id, color, size = 26 }: { id: string; color: string; size?: number }) {
  const accessory = (() => {
    switch (id) {
      case 'pm': return <>
        <polygon points="4.5,5 5.5,5 5,7.2" fill={PIXEL_INK}/>
        <rect x="7.8" y="7" width="1.8" height="1.8" fill="#5c4a2e"/>
      </>
      case 'security-lead': return <>
        <rect x="3" y="3" width="4" height="1" fill="#222"/>
        <polygon points="4,6 6,6 6,7.4 5,8.4 4,7.4" fill="#f4d35e"/>
      </>
      case 'economy-lead': return <>
        <polygon points="4,4.7 5,5 4,5.3" fill={PIXEL_INK}/>
        <polygon points="6,4.7 5,5 6,5.3" fill={PIXEL_INK}/>
        <circle cx="8.3" cy="7.8" r="0.7" fill="#f4d35e" stroke="#b8860b" strokeWidth="0.1"/>
      </>
      case 'security-scout': return <>
        <rect x="2.5" y="0.5" width="5" height="1" fill="#4a4a4a"/>
        <circle cx="4" cy="2.3" r="0.6" fill="#333"/>
        <circle cx="6" cy="2.3" r="0.6" fill="#333"/>
      </>
      case 'economy-scout': return <>
        <rect x="3" y="0.7" width="4" height="0.6" fill="#333"/>
        <rect x="7.3" y="7" width="1.8" height="1.8" fill="#5c4a2e"/>
      </>
      case 'general-scout': return <>
        <rect x="1" y="5.5" width="1.4" height="3" fill="#6b4f2a"/>
        <circle cx="8.3" cy="6" r="0.7" fill="#e8e8e8" stroke="#333" strokeWidth="0.1"/>
      </>
      case 'general-lead': return <>
        <rect x="3" y="1.8" width="4" height="0.6" fill="#fff"/>
        <polygon points="8.2,5.6 8.5,6.2 9.1,6.3 8.6,6.7 8.7,7.3 8.2,7 7.7,7.3 7.8,6.7 7.3,6.3 7.9,6.2" fill="#ffd23f"/>
      </>
      case 'review-a': return <>
        <rect x="3.7" y="2.7" width="1.2" height="1.2" fill="none" stroke={PIXEL_INK} strokeWidth="0.15"/>
        <rect x="5.1" y="2.7" width="1.2" height="1.2" fill="none" stroke={PIXEL_INK} strokeWidth="0.15"/>
        <line x1="4.9" y1="3.3" x2="5.1" y2="3.3" stroke={PIXEL_INK} strokeWidth="0.15"/>
      </>
      case 'review-b': return <>
        <circle cx="5.8" cy="3.3" r="0.75" fill="none" stroke={PIXEL_INK} strokeWidth="0.15"/>
        <line x1="6.3" y1="3.9" x2="7" y2="6" stroke={PIXEL_INK} strokeWidth="0.1"/>
      </>
      case 'archivist': return <>
        <rect x="3.5" y="6.5" width="1.6" height="1.4" fill="#8a5a44"/>
        <rect x="5" y="6.5" width="1.6" height="1.4" fill="#a8735a"/>
        <line x1="5" y1="6.5" x2="5" y2="7.9" stroke="#4a2f22" strokeWidth="0.1"/>
      </>
      default: return null
    }
  })()
  return <svg width={size} height={size * 1.2} viewBox="0 0 10 12" shapeRendering="crispEdges" aria-hidden="true">
    <rect x="1" y="5" width="1" height="2" fill={color}/>
    <rect x="8" y="5" width="1" height="2" fill={color}/>
    <rect x="2" y="5" width="6" height="4" fill={color}/>
    <rect x="3" y="9" width="2" height="3" fill={PIXEL_INK}/>
    <rect x="5" y="9" width="2" height="3" fill={PIXEL_INK}/>
    <rect x="3" y="1" width="4" height="4" fill={PIXEL_SKIN}/>
    <rect x="4" y="3" width="1" height="1" fill={PIXEL_INK}/>
    <rect x="5" y="3" width="1" height="1" fill={PIXEL_INK}/>
    {accessory}
  </svg>
}

const agents: Agent[] = [
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

function LoginGate({ session, loginError, loggingIn, onEnter, onLogin }: { session: Session | null; loginError: string; loggingIn: boolean; onEnter: () => void; onLogin: (id: string, password: string) => void }) {
  const [id, setId] = useState(''); const [password, setPassword] = useState('')
  const submit = (event: FormEvent) => { event.preventDefault(); onLogin(id, password) }
  if (!session) return <main className="login-page"><section className="login-card"><div className="login-mark"><Bot size={28}/></div><p className="eyebrow">ORCHESTRATION LAB</p><h1>연결 중…</h1></section></main>
  return <main className="login-page"><section className="login-card"><div className="login-mark"><Bot size={28}/></div><p className="eyebrow">ORCHESTRATION LAB</p><h1>개인 연구실에<br/>입장합니다.</h1>
    {session.authenticationEnabled ? <>
      <p className="muted">계정으로 로그인하세요.</p>
      <form className="login-form" onSubmit={submit}>
        <input value={id} onChange={e => setId(e.target.value)} placeholder="아이디" autoComplete="username" required/>
        <input value={password} onChange={e => setPassword(e.target.value)} placeholder="비밀번호" type="password" autoComplete="current-password" required/>
        {loginError && <p className="form-error">{loginError}</p>}
        <button className="primary-button" type="submit" disabled={loggingIn}>{loggingIn ? '로그인 중…' : '로그인'} <ChevronRight size={18}/></button>
      </form>
    </> : <>
      <p className="muted">로그인 기반은 준비되어 있습니다. 현재는 개발 단계라 관리자 세션으로 바로 입장합니다.</p>
      <button className="primary-button" onClick={onEnter}>개발용 워크스페이스 열기 <ChevronRight size={18}/></button>
      <p className="login-note"><LockKeyhole size={14}/> 정식 계정 로그인은 아직 비활성화됨</p>
    </>}
  </section></main>
}

function SourceRegistry({ onClose, onTaskStarted, readOnly }: { onClose: () => void; onTaskStarted: (task: Task) => void; readOnly?: boolean }) {
  const [sources, setSources] = useState<ResearchSource[]>([]); const [name, setName] = useState(''); const [url, setUrl] = useState(''); const [domain, setDomain] = useState<'SECURITY' | 'ECONOMY'>('SECURITY'); const [intervalHours, setIntervalHours] = useState(24); const [crawlDepth, setCrawlDepth] = useState(1); const [maxPages, setMaxPages] = useState(20); const [note, setNote] = useState(''); const [editingId, setEditingId] = useState<string | null>(null); const [collectingId, setCollectingId] = useState<string | null>(null); const [notice, setNotice] = useState('')
  const [candidates, setCandidates] = useState<SourceCandidateEntry[]>([]); const [decidingId, setDecidingId] = useState<string | null>(null); const [discovering, setDiscovering] = useState<'SECURITY' | 'ECONOMY' | null>(null)
  const load = () => fetch('/api/research-sources', { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setSources).catch(() => setNotice('등록 목록을 불러오지 못했습니다.'))
  const loadCandidates = () => fetch('/api/source-candidates', { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setCandidates).catch(() => undefined)
  useEffect(() => { load(); if (!readOnly) loadCandidates() }, [])
  const decide = async (candidate: SourceCandidateEntry, action: 'approve' | 'reject') => { setDecidingId(candidate.id); await fetch(`/api/source-candidates/${candidate.id}/${action}`, { method: 'POST', credentials: 'include' }); setDecidingId(null); loadCandidates(); if (action === 'approve') load() }
  const discoverNow = async (target: 'SECURITY' | 'ECONOMY') => { setDiscovering(target); setNotice(''); const response = await fetch(`/api/source-candidates/discover-now?domain=${target}`, { method: 'POST', credentials: 'include' }); const result = response.ok ? await response.json() as { proposed: number } : null; setDiscovering(null); setNotice(result ? `${target === 'SECURITY' ? '보안' : '경제'} 분야에서 ${result.proposed}개 후보를 새로 찾았습니다.` : '후보 탐색에 실패했습니다.'); loadCandidates() }
  const reset = () => { setName(''); setUrl(''); setIntervalHours(24); setCrawlDepth(1); setMaxPages(20); setNote(''); setEditingId(null) }
  const submit = async (event: FormEvent) => { event.preventDefault(); setNotice(''); const response = await fetch(editingId ? `/api/research-sources/${editingId}` : '/api/research-sources', { method: editingId ? 'PUT' : 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, domain, intervalHours, crawlDepth, maxPages, note, ...(editingId ? {} : { url }) }) }); if (!response.ok) { setNotice('이름과 http(s) 링크를 확인해 주세요.'); return } reset(); load() }
  const collectNow = async (source: ResearchSource) => { setCollectingId(source.id); setNotice(`${source.name} 수집을 시작했습니다…`); const response = await fetch(`/api/research-sources/${source.id}/collect-now`, { method: 'POST', credentials: 'include' }); const result = response.ok ? await response.json() : null; setCollectingId(null); if (!result) { setNotice('즉시 수집에 실패했습니다. URL 또는 접근 제한을 확인해 주세요.'); return } setNotice(result.changedPages > 0 ? `${source.name}: ${result.savedPages}개 저장, ${result.failedPages}개 실패 · 변경된 ${result.changedPages}개 페이지를 분석 에이전트에 전달했습니다.` : `${source.name}: ${result.savedPages}개 저장, ${result.failedPages}개 실패 · 이전과 내용이 동일해 분석을 건너뛰었습니다.`); load(); if (result.analysisTaskId) { const taskResponse = await fetch(`/api/tasks/${result.analysisTaskId}`, { credentials: 'include' }); if (taskResponse.ok) onTaskStarted(await taskResponse.json() as Task) } }
  return <aside className="source-sheet" role="dialog" aria-modal="true"><div className="sheet-header"><div><p className="eyebrow">SOURCE REGISTRY</p><h2>수집 사이트</h2></div><button className="sheet-close" onClick={onClose}><X size={18}/></button></div><p className="source-intro">공개 사이트를 등록하면 같은 도메인에서 지정 깊이만큼 링크를 따라 수집합니다. <b>즉시 수집</b>은 저장 결과를 바로 알려드립니다.</p>
    {!readOnly && <div className="candidate-section"><div className="source-list-head"><b>AI 추천 출처 후보</b><span>{candidates.length}건 대기</span></div><p className="source-intro small">등록된 출처와 비슷한 수준의 새 출처를 주기적으로 찾아 제안합니다. 바로 등록되지 않고, 승인해야만 실제 수집 대상이 됩니다.</p>
      <div className="discover-actions"><button type="button" onClick={() => discoverNow('SECURITY')} disabled={discovering !== null}>{discovering === 'SECURITY' ? '탐색 중…' : '보안 후보 지금 찾기'}</button><button type="button" onClick={() => discoverNow('ECONOMY')} disabled={discovering !== null}>{discovering === 'ECONOMY' ? '탐색 중…' : '경제 후보 지금 찾기'}</button></div>
      {candidates.length > 0 && <div className="candidate-list">{candidates.map(candidate => <article className="candidate-row" key={candidate.id}><span className={`domain-dot ${candidate.domain.toLowerCase()}`}/><div><b>{candidate.name}</b><a href={candidate.url} target="_blank" rel="noreferrer">{candidate.url}</a><small>{candidate.justification}</small><div className="source-actions"><button onClick={() => decide(candidate, 'approve')} disabled={decidingId === candidate.id}>승인</button><button onClick={() => decide(candidate, 'reject')} disabled={decidingId === candidate.id}>거절</button></div></div></article>)}</div>}
    </div>}
    {!readOnly && <form className="source-form" onSubmit={submit}><label>표시 이름<input value={name} onChange={e => setName(e.target.value)} required maxLength={120}/></label><label>링크<input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com" required type="url" disabled={Boolean(editingId)}/></label><label>담당 팀<select value={domain} onChange={e => setDomain(e.target.value as 'SECURITY' | 'ECONOMY')}><option value="SECURITY">보안</option><option value="ECONOMY">경제</option></select></label><label>수집 주기(시간)<input value={intervalHours} onChange={e => setIntervalHours(Number(e.target.value))} type="number" min="1" max="168" required/></label><label>링크 탐색 깊이<select value={crawlDepth} onChange={e => setCrawlDepth(Number(e.target.value))}><option value={0}>0단계 · 등록 주소만</option><option value={1}>1단계 · 링크 한 번</option><option value={2}>2단계 · 링크 두 번</option></select></label><label>최대 페이지<input value={maxPages} onChange={e => setMaxPages(Number(e.target.value))} type="number" min="1" max="100" required/></label><label>설명(선택)<textarea value={note} onChange={e => setNote(e.target.value)} maxLength={4000} rows={2} placeholder="이 출처를 등록한 이유나 특징을 적어두면 나중에 알아보기 쉽습니다."/></label>{notice && <p className={notice.includes('실패') ? 'form-error' : 'form-notice'}>{notice}</p>}<button className="source-add" type="submit"><Plus size={16}/>{editingId ? '설정 저장' : '사이트 등록'}</button>{editingId && <button className="source-cancel" type="button" onClick={reset}>편집 취소</button>}</form>}
    <div className="source-list"><div className="source-list-head"><b>등록됨</b><span>{sources.length}개</span></div>{sources.map(source => <article className="source-row" key={source.id}><span className={`domain-dot ${source.domain.toLowerCase()}`}/><div><b>{source.name}</b>{source.consecutiveNoContentCycles >= 3 && <span className="source-no-content-badge" title={`최근 ${source.consecutiveNoContentCycles}회 연속 수집에서 새 내용이 없었습니다.`}>비활성화 고려 · {source.consecutiveNoContentCycles}회 연속 무의미</span>}<a href={source.url} target="_blank" rel="noreferrer">{source.url}</a><small>{source.domain === 'SECURITY' ? '보안 팀' : '경제 팀'} · {source.intervalHours}시간 · 깊이 {source.crawlDepth} · 최대 {source.maxPages}페이지</small>{source.note && <small className="source-note">{source.note}</small>}{!readOnly && <div className="source-actions"><button onClick={() => collectNow(source)} disabled={collectingId === source.id}>{collectingId === source.id ? '수집 중…' : '즉시 수집'}</button><button onClick={() => { setEditingId(source.id); setName(source.name); setUrl(source.url); setDomain(source.domain); setIntervalHours(source.intervalHours); setCrawlDepth(source.crawlDepth); setMaxPages(source.maxPages); setNote(source.note ?? ''); setNotice('') }}>설정</button></div>}</div>{!readOnly && <button onClick={() => fetch(`/api/research-sources/${source.id}`, { method: 'DELETE', credentials: 'include' }).then(load)}><Trash2 size={15}/></button>}</article>)}</div></aside>
}

function UsageModal({ onClose }: { onClose: () => void }) {
  const [days, setDays] = useState(30); const [data, setData] = useState<UsageSummary | null>(null)
  useEffect(() => { fetch(`/api/usage/summary?days=${days}`, { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(setData) }, [days])
  const money = (value: number) => value > 0 ? `$${value.toFixed(4)}` : '단가 미설정'
  return <aside className="side-modal" role="dialog" aria-modal="true"><div className="sheet-header"><div><p className="eyebrow">OWNER INSIGHTS</p><h2>모델 사용량 · 비용</h2></div><button className="sheet-close" onClick={onClose}><X size={18}/></button></div>{data?.budgetExceeded && <p className="budget-alert">이번 달 예상 비용이 예산(${data.budgetUsdPerMonth.toFixed(2)})을 넘었습니다 — 현재 ${data.monthToDateCostUsd.toFixed(2)}</p>}<div className="period-tabs">{[7, 30, 90].map(value => <button className={days === value ? 'active' : ''} key={value} onClick={() => setDays(value)}>{value}일</button>)}</div>{data ? <><div className="usage-total"><b>{data.total.tokens.toLocaleString()} tokens</b><span>{data.total.calls}회 호출 · {money(data.total.estimatedCostUsd)}</span><small>{days}일 동안의 실제 응답 토큰 합계입니다.</small></div><p className="usage-note">이번 달 누적: {money(data.monthToDateCostUsd)} / 예산 {money(data.budgetUsdPerMonth)}</p><div className="usage-table">{data.models.length === 0 ? <p className="empty-state">이 기간에 완료된 모델 호출이 없습니다.</p> : data.models.map(row => <article key={row.model}><b>{row.model}</b><span>{row.calls}회 · {row.tokens.toLocaleString()} tokens</span><small>입력 {row.inputTokens.toLocaleString()} / 출력 {row.outputTokens.toLocaleString()} · {money(row.estimatedCostUsd)}</small></article>)}</div><p className="usage-note">표시 금액은 지금 설정된 단가로 과거 기록까지 다시 계산한 추정치입니다. Gemini Google Search grounding, 캐시·세금·프로모션·계약 할인은 포함하지 않으며, `.env` 값이 있으면 그 값이 우선합니다.</p></> : <p className="empty-state">사용량을 불러오는 중…</p>}</aside>
}

function DigestModal({ onClose }: { onClose: () => void }) {
  const [period, setPeriod] = useState<'DAILY' | 'WEEKLY'>('DAILY')
  const [data, setData] = useState<DigestResult | null>(null)
  const [dispatching, setDispatching] = useState(false)
  const [notice, setNotice] = useState('')
  useEffect(() => { setData(null); setNotice(''); fetch(`/api/digest?period=${period}`, { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(setData) }, [period])
  const dispatch = async () => { setDispatching(true); setNotice(''); const response = await fetch(`/api/digest/dispatch?period=${period}`, { method: 'POST', credentials: 'include' }); setDispatching(false); setNotice(response.ok ? 'n8n으로 전달했습니다. 실제 발송 여부는 n8n 워크플로 설정에 달려 있습니다.' : '전달에 실패했습니다.') }
  const fmt = (value: string) => new Date(value).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  return <aside className="side-modal" role="dialog" aria-modal="true"><div className="sheet-header"><div><p className="eyebrow">OWNER INSIGHTS</p><h2>작업 다이제스트</h2></div><button className="sheet-close" onClick={onClose}><X size={18}/></button></div>
    <div className="period-tabs">{(['DAILY', 'WEEKLY'] as const).map(value => <button className={period === value ? 'active' : ''} key={value} onClick={() => setPeriod(value)}>{value === 'DAILY' ? '일간' : '주간'}</button>)}</div>{data ? <>
    <div className="usage-total"><b>{data.total}건 처리</b><span>완료 {data.completed} · 실패 {data.failed}</span><small>{fmt(data.from)} ~ {fmt(data.to)}</small></div>
    <p className="usage-note">도메인별: {Object.entries(data.byDomain).map(([domain, count]) => `${domain} ${count}`).join(' · ') || '없음'}</p>
    {data.noContentSources.length > 0 && <p className="budget-alert">비활성화 고려: {data.noContentSources.map(source => `${source.name} (${source.consecutiveNoContentCycles}회 연속)`).join(' · ')}</p>}
    <button className="source-add" onClick={dispatch} disabled={dispatching}>{dispatching ? '전달 중…' : 'n8n으로 지금 보내기'}</button>
    {notice && <p className={notice.includes('실패') ? 'form-error' : 'form-notice'}>{notice}</p>}
    <div className="usage-table">
      <b>완료된 작업 ({data.completedTasks.length})</b>
      {data.completedTasks.length === 0 ? <p className="empty-state">이 기간에 완료된 작업이 없습니다.</p> : data.completedTasks.map(entry => <article key={entry.taskId}><b>{archiveTaskLabel(entry.title)}</b><span>{entry.domain}</span><small>{entry.detail ? `obsidian/${entry.detail}` : '보관 경로 없음'}</small></article>)}
    </div>
    <div className="usage-table">
      <b>실패한 작업 ({data.failedTasks.length})</b>
      {data.failedTasks.length === 0 ? <p className="empty-state">이 기간에 실패한 작업이 없습니다.</p> : data.failedTasks.map(entry => <article key={entry.taskId}><b>{archiveTaskLabel(entry.title)}</b><span>{entry.domain}</span><small>{entry.detail ?? '사유 미상'}</small></article>)}
    </div>
  </> : <p className="empty-state">다이제스트를 불러오는 중…</p>}</aside>
}

type RagDomainFilter = '' | 'economy' | 'security' | 'ideas'
type RagOriginFilter = '' | 'collection' | 'manual' | 'upload'

function AskArchiveModal({ onClose }: { onClose: () => void }) {
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [answer, setAnswer] = useState<RagAnswer | null>(null)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<MarkdownDoc | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<RagHistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [domainFilter, setDomainFilter] = useState<RagDomainFilter>('')
  const [originFilter, setOriginFilter] = useState<RagOriginFilter>('')
  const [elapsed, setElapsed] = useState(0)
  const abortRef = useRef<AbortController | null>(null)
  const loadHistory = async () => {
    setHistoryLoading(true)
    const response = await fetch('/api/archive/ask/history', { credentials: 'include' })
    setHistoryLoading(false)
    if (response.ok) setHistory(await response.json())
  }
  const toggleHistory = () => { setShowHistory(current => { const next = !current; if (next) loadHistory(); return next }) }
  const ask = async (event: FormEvent) => {
    event.preventDefault()
    if (!question.trim() || asking) return
    setAsking(true); setError(''); setAnswer(null); setPreview(null); setElapsed(0)
    const controller = new AbortController(); abortRef.current = controller
    const started = Date.now()
    const progressTimer = window.setInterval(() => setElapsed(Date.now() - started), 300)
    try {
      const response = await fetch('/api/archive/ask', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: question.trim(), domain: domainFilter || null, origin: originFilter || null }), signal: controller.signal })
      if (!response.ok) { setError('답변을 가져오지 못했습니다. API 키 설정을 확인해 주세요.'); return }
      setAnswer(await response.json() as RagAnswer); setQuestion('')
      if (showHistory) loadHistory()
    } catch (exception) {
      // 사용자가 직접 중지를 눌러 fetch를 취소한 경우(AbortError)는 오류가 아니므로 에러 메시지를 띄우지 않는다 --
      // 서버는 이미 던져진 요청을 계속 처리할 수 있지만, 그 결과는 여기서 조용히 버려진다.
      if ((exception as Error).name !== 'AbortError') setError('답변을 가져오지 못했습니다. API 키 설정을 확인해 주세요.')
    } finally {
      window.clearInterval(progressTimer); setAsking(false); abortRef.current = null
    }
  }
  const stopAsking = () => { abortRef.current?.abort() }
  const openCitation = async (path: string) => { const response = await fetch(`/api/archive/content?path=${encodeURIComponent(path)}`, { credentials: 'include' }); if (response.ok) setPreview(await response.json()) }
  return <aside className="side-modal" role="dialog" aria-modal="true"><div className="sheet-header"><div><p className="eyebrow">KNOWLEDGE ARCHIVE</p><h2>아카이브에 질문하기</h2></div><button className="sheet-close" onClick={onClose}><X size={18}/></button></div>
    <p className="source-intro">아카이브에 쌓인 노트를 근거로 답합니다. 노트에 없는 내용은 답하지 않습니다.</p>
    <div className="rag-filter-row">
      <select value={domainFilter} onChange={e => setDomainFilter(e.target.value as RagDomainFilter)} title="분야로 범위 좁히기">
        <option value="">전체 분야</option>
        <option value="economy">경제</option>
        <option value="security">보안</option>
        <option value="ideas">아이디어</option>
      </select>
      <select value={originFilter} onChange={e => setOriginFilter(e.target.value as RagOriginFilter)} title="출처로 범위 좁히기">
        <option value="">전체 출처</option>
        <option value="collection">수집</option>
        <option value="manual">질문·직접작성</option>
        <option value="upload">업로드</option>
      </select>
    </div>
    <button className="graph-open-button rag-history-toggle" onClick={toggleHistory}><History size={14}/>{showHistory ? '대화 기록 닫기' : '대화 기록 보기'}</button>
    {showHistory && <div className="rag-history">
      {historyLoading && <p className="empty-state"><Loader2 size={13} className="spin"/> 기록을 불러오는 중…</p>}
      {!historyLoading && history.length === 0 && <p className="empty-state">아직 저장된 질문 기록이 없습니다.</p>}
      {history.map(item => <article key={item.id}><b>{item.question}</b><p>{item.answer}</p><small>{new Date(item.createdAt).toLocaleString('ko-KR')}</small></article>)}
    </div>}
    <form className="chat-input ask-form" onSubmit={ask}><input value={question} onChange={e => setQuestion(e.target.value)} placeholder="예: 이번 달 보안 동향 중 랜섬웨어 관련 이슈는?" disabled={asking}/>{asking ? <button type="button" className="ask-stop" onClick={stopAsking}><Square size={16}/></button> : <button type="submit"><Search size={16}/></button>}</form>
    {asking && <p className="empty-state"><Loader2 size={13} className="spin"/> {ragProgressLabel(elapsed)}</p>}
    {error && <p className="form-error">{error}</p>}
    {preview && <div className="rag-preview"><div className="sheet-header"><b>{preview.path}</b><button className="sheet-close" onClick={() => setPreview(null)}><X size={14}/></button></div><DocumentCard doc={preview}/></div>}
    {answer && !preview && <div className="rag-answer"><Suspense fallback={null}><MarkdownBody>{answer.answer}</MarkdownBody></Suspense>{answer.citations.length > 0 && <div className="rag-citations"><b>참고 노트</b>{answer.citations.map(citation => <button key={citation.path} onClick={() => openCitation(citation.path)}>{citation.path} <small>({(citation.score * 100).toFixed(0)}%)</small></button>)}</div>}</div>}
  </aside>
}

type DebateMode = 'PRO_CON' | 'FREE'
type DebateStatus = 'IN_PROGRESS' | 'COMPLETED'
type DebateModelKey = 'DEEPSEEK' | 'OPENAI' | 'BEDROCK'
const DEBATE_MODEL_LABEL: Record<DebateModelKey, string> = { DEEPSEEK: 'DeepSeek', OPENAI: 'GPT-4o mini', BEDROCK: 'Claude (Bedrock)' }
interface DebateSession {
  id: string; mode: DebateMode; topic: string; proModel: string | null; conModel: string | null
  participants: string[] | null; maxTurnsPerSide: number; status: DebateStatus; turnsCompleted: number; createdAt: string
}
interface DebateTurn { id: string; turnIndex: number; role: string; speakerModel: string; content: string; createdAt: string }
const DEBATE_ROLE_LABEL = (role: string) => role === 'PRO' ? '찬성' : role === 'CON' ? '반대' : role === 'RESEARCH' ? '리서치(Gemini)' : role.startsWith('PARTICIPANT_') ? `참가자 ${role.replace('PARTICIPANT_', '')}` : role
const debateRoleClass = (role: string) => role === 'PRO' ? 'pro' : role === 'CON' ? 'con' : role === 'RESEARCH' ? 'research' : 'participant'
const debateTurnsPerRound = (session: DebateSession) => session.mode === 'PRO_CON' ? 3 : (session.participants?.length ?? 0) + 1
const debateTotalTurns = (session: DebateSession) => session.maxTurnsPerSide * debateTurnsPerRound(session)

function DebatePanel({ onClose }: { onClose: () => void }) {
  const [pane, setPane] = useState<'empty' | 'create' | 'detail'>('empty')
  const [sessions, setSessions] = useState<DebateSession[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<DebateSession | null>(null)
  const [turns, setTurns] = useState<DebateTurn[]>([])
  const [advancing, setAdvancing] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<DebateMode>('PRO_CON')
  const [topic, setTopic] = useState('')
  const [proModel, setProModel] = useState<DebateModelKey>('DEEPSEEK')
  const [conModel, setConModel] = useState<DebateModelKey>('OPENAI')
  const [participants, setParticipants] = useState<DebateModelKey[]>(['DEEPSEEK', 'OPENAI'])
  const [maxTurnsPerSide, setMaxTurnsPerSide] = useState(5)
  const [creating, setCreating] = useState(false)

  const loadSessions = () => { setLoading(true); fetch('/api/debate/sessions', { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setSessions).finally(() => setLoading(false)) }
  useEffect(() => { loadSessions() }, [])

  const openSession = async (session: DebateSession) => {
    setSelected(session); setPane('detail'); setError('')
    const response = await fetch(`/api/debate/sessions/${session.id}`, { credentials: 'include' })
    if (response.ok) { const body = await response.json() as { session: DebateSession; turns: DebateTurn[] }; setSelected(body.session); setTurns(body.turns) }
  }

  const toggleParticipant = (key: DebateModelKey) => setParticipants(current => current.includes(key) ? current.filter(item => item !== key) : [...current, key])

  const createSession = async (event: FormEvent) => {
    event.preventDefault()
    if (!topic.trim()) { setError('토론 주제를 입력해 주세요.'); return }
    if (mode === 'FREE' && participants.length < 2) { setError('자유토론은 참가자를 2명 이상 선택해야 합니다.'); return }
    setCreating(true); setError('')
    const response = await fetch('/api/debate/sessions', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, topic: topic.trim(), proModel: mode === 'PRO_CON' ? proModel : null, conModel: mode === 'PRO_CON' ? conModel : null, participants: mode === 'FREE' ? participants : null, maxTurnsPerSide }) })
    setCreating(false)
    if (!response.ok) { setError('토론 세션을 만들지 못했습니다.'); return }
    const session = await response.json() as DebateSession
    setTopic(''); loadSessions(); openSession(session)
  }

  const advance = async () => {
    if (!selected) return
    setAdvancing(true); setError('')
    const response = await fetch(`/api/debate/sessions/${selected.id}/advance`, { method: 'POST', credentials: 'include' })
    setAdvancing(false)
    if (!response.ok) { setError('다음 발언 진행에 실패했습니다.'); return }
    const turn = await response.json() as DebateTurn
    setTurns(current => [...current, turn])
    setSelected(current => current ? { ...current, turnsCompleted: current.turnsCompleted + 1, status: current.turnsCompleted + 1 >= debateTotalTurns(current) ? 'COMPLETED' : current.status } : current)
    loadSessions()
  }

  return <aside className="file-explorer" role="dialog" aria-modal="true">
    <div className="sheet-header">
      <div><p className="eyebrow">AI DEBATE</p><h2>AI 토론</h2></div>
      <button className="sheet-close" onClick={onClose}><X size={18}/></button>
    </div>
    <div className="explorer-toolbar">
      <button className="graph-open-button" onClick={() => { setPane('create'); setSelected(null); setError('') }}><Plus size={14}/> 새 토론</button>
    </div>
    <div className="explorer-body">
      <div className="explorer-sidebar">
        {loading && <p className="empty-state"><Loader2 size={13} className="spin"/> 불러오는 중…</p>}
        {!loading && sessions.length === 0 && <p className="empty-state">아직 토론이 없습니다. 새 토론을 시작해 보세요.</p>}
        <div className="file-list">
          {sessions.map(session => <button key={session.id} className={selected?.id === session.id ? 'active' : ''} onClick={() => openSession(session)}>
            <span>
              <b>{session.topic}</b>
              <small>{session.mode === 'PRO_CON' ? `찬반 · ${DEBATE_MODEL_LABEL[session.proModel as DebateModelKey] ?? session.proModel} vs ${DEBATE_MODEL_LABEL[session.conModel as DebateModelKey] ?? session.conModel}` : `자유 · ${(session.participants ?? []).map(p => DEBATE_MODEL_LABEL[p as DebateModelKey] ?? p).join(', ')}`}</small>
              <small>{session.turnsCompleted}/{debateTotalTurns(session)}턴 · {session.status === 'COMPLETED' ? '완료' : '진행 중'}</small>
            </span>
          </button>)}
        </div>
      </div>
      <div className="explorer-preview">
        {pane === 'empty' && <div className="explorer-empty"><MessagesSquare size={30}/><p>왼쪽에서 토론을 선택하거나, 새 토론을 시작하세요.</p></div>}

        {pane === 'create' && <form className="source-form" onSubmit={createSession}>
          <label>토론 방식
            <div className="source-actions">
              <button type="button" className={mode === 'PRO_CON' ? 'source-add' : 'source-cancel'} onClick={() => setMode('PRO_CON')}>찬반토론</button>
              <button type="button" className={mode === 'FREE' ? 'source-add' : 'source-cancel'} onClick={() => setMode('FREE')}>자유토론</button>
            </div>
          </label>
          <label>측당 최대 턴수<input type="number" min={1} max={10} value={maxTurnsPerSide} onChange={e => setMaxTurnsPerSide(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}/></label>
          <label>토론 주제<textarea rows={3} value={topic} onChange={e => setTopic(e.target.value)} placeholder="예: AI가 사람의 일자리를 대체하는 것이 사회에 이로운가?"/></label>
          {mode === 'PRO_CON' ? <>
            <label>찬성 모델<select value={proModel} onChange={e => setProModel(e.target.value as DebateModelKey)}>{Object.entries(DEBATE_MODEL_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label>반대 모델<select value={conModel} onChange={e => setConModel(e.target.value as DebateModelKey)}>{Object.entries(DEBATE_MODEL_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          </> : <label>참가자 (2명 이상)
            <div className="source-actions">
              {(Object.keys(DEBATE_MODEL_LABEL) as DebateModelKey[]).map(key => <button type="button" key={key} className={participants.includes(key) ? 'source-add' : 'source-cancel'} onClick={() => toggleParticipant(key)}>{DEBATE_MODEL_LABEL[key]}</button>)}
            </div>
          </label>}
          <p className="source-intro small">Gemini는 토론자로 참여하지 않고, 매 라운드가 끝날 때마다 그 라운드 발언을 웹 검색으로 검증하는 리서치 역할을 맡습니다.</p>
          {error && <p className="form-error">{error}</p>}
          <button className="source-add" type="submit" disabled={creating}>{creating ? <Loader2 size={14} className="spin"/> : <MessagesSquare size={14}/>} 토론 시작</button>
        </form>}

        {pane === 'detail' && selected && <>
          <div className="explorer-preview-header"><b>{selected.topic}</b><small>{selected.turnsCompleted}/{debateTotalTurns(selected)}턴 · {selected.status === 'COMPLETED' ? '완료' : '진행 중'}</small></div>
          <div className="explorer-preview-body">
            <div className="debate-turn-list">
              {turns.map(turn => <article key={turn.id} className="debate-turn">
                <div className="debate-turn-head"><span className={`debate-role-badge ${debateRoleClass(turn.role)}`}>{DEBATE_ROLE_LABEL(turn.role)}</span><small>{DEBATE_MODEL_LABEL[turn.speakerModel as DebateModelKey] ?? turn.speakerModel}</small></div>
                <div className="debate-turn-body"><Suspense fallback={<p>{turn.content}</p>}><MarkdownBody>{turn.content}</MarkdownBody></Suspense></div>
              </article>)}
              {turns.length === 0 && <p className="empty-state">아직 발언이 없습니다. 진행 버튼을 눌러 토론을 시작하세요.</p>}
            </div>
            {error && <p className="form-error">{error}</p>}
            {selected.status !== 'COMPLETED' && <button className="source-add" onClick={advance} disabled={advancing}>{advancing ? <Loader2 size={14} className="spin"/> : <ChevronRight size={14}/>} 다음 발언 진행</button>}
            {selected.status === 'COMPLETED' && <p className="empty-state">토론이 종료되었습니다.</p>}
          </div>
        </>}
      </div>
    </div>
  </aside>
}

function ArchivePanel({ tasks, onClose, onOpenExplorer, onRetried }: { tasks: Task[]; onClose: () => void; onOpenExplorer: () => void; onRetried: () => void }) {
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const retry = async (taskId: string) => { setRetryingId(taskId); await fetch(`/api/tasks/${taskId}/retry`, { method: 'POST', credentials: 'include' }); setRetryingId(null); onRetried() }
  return <aside className="side-modal" role="dialog" aria-modal="true"><div className="sheet-header"><div><p className="eyebrow">KNOWLEDGE ARCHIVE</p><h2>작업 · 보관 기록</h2></div><button className="sheet-close" onClick={onClose}><X size={18}/></button></div><button className="source-add archive-explorer-button" onClick={onOpenExplorer}><Archive size={16}/> Markdown 파일 탐색기</button><div className="archive-list">{tasks.length ? tasks.map(task => <article key={task.id}><b>{archiveTaskLabel(task.title)}</b><span className={`task-state ${task.status.toLowerCase()}`}>{task.status}</span><small>{task.archivePath ? `obsidian/${task.archivePath}` : task.failureReason ?? '아카이브 대기 또는 실패'}</small>{task.status === 'FAILED' && <button className="secondary-button retry-button" onClick={() => retry(task.id)} disabled={retryingId === task.id}><RotateCcw size={14}/>{retryingId === task.id ? '재시도 중…' : '재시도'}</button>}</article>) : <p className="empty-state">아직 작업 기록이 없습니다.</p>}</div></aside>
}

function TimelineModal({ task, events, onClose }: { task: Task | null; events: TaskEvent[]; onClose: () => void }) {
  const stages = [{ id: 'COLLECT', label: '자료 수집', owner: 'Gemini 수집 담당' }, { id: 'REVIEW_A', label: '1차 정리', owner: 'Review A' }, { id: 'REVIEW_B', label: '독립 재검토', owner: 'Review B' }, { id: 'TEAM_LEAD', label: '팀장 종합', owner: task?.domain === 'ECONOMY' ? 'Atlas Lead' : 'Sentinel Lead' }, { id: 'PM', label: 'PM 최종 판정', owner: 'PM' }, { id: 'ARCHIVE', label: '아카이브 보관', owner: 'Archive' }]
  const active = events.at(-1)?.stage
  return <aside className="side-modal timeline-modal" role="dialog" aria-modal="true"><div className="sheet-header"><div><p className="eyebrow">LIVE WORKFLOW</p><h2>작업 진행표</h2></div><button className="sheet-close" onClick={onClose}><X size={18}/></button></div>{task ? <><p className="timeline-title">{archiveTaskLabel(task.title)}</p><p className="source-intro">현재: {active ?? '작업 대기'} · {events.at(-1)?.message ?? 'PM이 작업을 준비 중입니다.'}</p><div className="gantt-list">{stages.map((stage, index) => { const same = events.filter(event => event.stage === stage.id); const current = active === stage.id && task.status === 'RUNNING'; const done = same.length >= 2 || (stage.id === 'ARCHIVE' && task.status === 'COMPLETED'); return <article key={stage.id} className={current ? 'current' : done ? 'done' : ''}><div><b>{index + 1}. {stage.label}</b><small>{stage.owner}</small></div><span className="gantt-track"><i style={{ width: done ? '100%' : current ? '58%' : '0%' }}/></span><em>{done ? '완료' : current ? '진행 중' : '대기'}</em></article> })}</div><div className="timeline-events">{events.map(event => <p key={event.id}><b>{event.stage}</b> {event.message}</p>)}</div></> : <p className="empty-state">표시할 작업이 없습니다.</p>}</aside>
}

type SortField = 'title' | 'domain' | 'date'
type SortDirection = 'asc' | 'desc'
const sortIndicator = (field: SortField, sortField: SortField, sortDirection: SortDirection) => field !== sortField ? '' : sortDirection === 'asc' ? ' ▲' : ' ▼'

function FileExplorer({ onClose, onTaskStarted, onOpenGraph, initialPath, onInitialPathHandled }: { onClose: () => void; onTaskStarted: (task: Task) => void; onOpenGraph: () => void; initialPath?: string; onInitialPathHandled?: () => void }) {
  const [files, setFiles] = useState<ArchiveFile[]>([]); const [selected, setSelected] = useState<MarkdownDoc | null>(null); const [error, setError] = useState(''); const [processing, setProcessing] = useState(false); const [query, setQuery] = useState(''); const [results, setResults] = useState<{ path: string; name: string; excerpt: string }[]>([])
  const [readPaths, setReadPaths] = useState<Set<string>>(() => { try { return new Set(JSON.parse(localStorage.getItem('archive-read-files') ?? '[]')) } catch { return new Set() } })
  const [sortField, setSortField] = useState<SortField>('date'); const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [category, setCategory] = useState<FileCategory>('all')
  const toggleSort = (field: SortField) => { if (field === sortField) { setSortDirection(direction => direction === 'asc' ? 'desc' : 'asc') } else { setSortField(field); setSortDirection(field === 'date' ? 'desc' : 'asc') } }
  const sortedFiles = files.filter(file => fileMatchesCategory(file, category)).sort((a, b) => {
    const sign = sortDirection === 'asc' ? 1 : -1
    if (sortField === 'title') return sign * displayTitle(a).localeCompare(displayTitle(b))
    if (sortField === 'domain') return sign * domainLabel(a.domain).localeCompare(domainLabel(b.domain))
    // date: is day-granularity only, so files touched the same day previously fell back to the backend's
    // alphabetical-by-path order — tie-break with the real modifiedAt instant so same-day files still land
    // in actual chronological order.
    const dateCompare = (a.date ?? '').localeCompare(b.date ?? '')
    return sign * (dateCompare !== 0 ? dateCompare : a.modifiedAt.localeCompare(b.modifiedAt))
  })
  useEffect(() => {
    const load = () => fetch('/api/archive/files', { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setFiles).catch(() => setError('파일 목록을 불러오지 못했습니다.'))
    load()
    // Polls quietly while the explorer stays open so a file created by a task that finishes (or a
    // collection/archive sweep) mid-session shows up without the user having to close and reopen the panel.
    const timer = window.setInterval(load, 5000)
    return () => window.clearInterval(timer)
  }, [])
  const openFile = async (file: Pick<ArchiveFile, 'path'>) => {
    const response = await fetch(`/api/archive/content?path=${encodeURIComponent(file.path)}`, { credentials: 'include' })
    if (!response.ok) { setError('Markdown 미리보기를 열지 못했습니다.'); return }
    setSelected(await response.json())
    setReadPaths(previous => {
      if (previous.has(file.path)) return previous
      const next = new Set(previous); next.add(file.path)
      localStorage.setItem('archive-read-files', JSON.stringify([...next]))
      return next
    })
  }
  // 대시보드의 "최근 파일" 목록에서 특정 파일을 클릭했을 때, 목록만 보여주고 끝나지 않도록 곧바로 그 파일을 열어준다.
  useEffect(() => { if (!initialPath) return; openFile({ path: initialPath }); onInitialPathHandled?.() }, [initialPath])
  useEffect(() => { if (query.trim().length < 2) { setResults([]); return } const timer = window.setTimeout(() => { fetch(`/api/archive/search?query=${encodeURIComponent(query)}`, { credentials: 'include' }).then(response => response.ok ? response.json() : []).then(setResults) }, 250); return () => window.clearTimeout(timer) }, [query])
  const reprocess = async () => { if (!selected) return; setProcessing(true); const response = await fetch('/api/tasks', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: `[재가공] ${documentTitle(selected)}`.slice(0, 160), domain: 'GENERAL', instruction: `아래 기존 Markdown 노트를 제2의 뇌용으로 재가공하세요. 핵심 요약, 중요도, 관련 개념, 기존 노트와의 연결 후보, 중복·오래된 정보, 필요한 경우 보강 조사 항목을 자연스러운 한국어 Markdown으로 정리하세요. 원본을 덮어쓰지 말고 새 연관 노트로 보관하세요.\n\n원본 경로: obsidian/${selected.path}\n\n원본 내용:\n${selected.body.slice(0, 4500)}` }) }); setProcessing(false); if (!response.ok) { setError('재가공 작업을 만들지 못했습니다.'); return } onTaskStarted(await response.json() as Task); onClose() }
  return <aside className="file-explorer" role="dialog" aria-modal="true">
    <div className="sheet-header">
      <div><p className="eyebrow">OBSIDIAN ARCHIVE</p><h2>가공 파일 탐색기</h2></div>
      <div className="explorer-header-actions">
        <div className="explorer-category-filter">
          <button className={category === 'all' ? 'active' : ''} onClick={() => setCategory('all')}><Layers size={13}/>전체보기</button>
          <button className={category === 'economy' ? 'active' : ''} onClick={() => setCategory('economy')}><TrendingUp size={13}/>경제</button>
          <button className={category === 'security' ? 'active' : ''} onClick={() => setCategory('security')}><LockKeyhole size={13}/>보안</button>
          <button className={category === 'manual' ? 'active' : ''} onClick={() => setCategory('manual')}><MessageCircle size={13}/>질문</button>
          <button className={category === 'upload' ? 'active' : ''} onClick={() => setCategory('upload')}><FileUp size={13}/>업로드 파일</button>
        </div>
        <button className="sheet-close" onClick={onClose}><X size={18}/></button>
      </div>
    </div>
    <div className="explorer-toolbar"><label className="archive-search"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="파일명·본문 검색 (2글자 이상)"/></label><button className="graph-open-button" onClick={onOpenGraph}>연결 그래프 보기</button></div>
    {results.length > 0 && <div className="search-results">{results.map(result => <button key={result.path} onClick={() => openFile(result)}><b>{result.name}</b><small>{result.path} · {result.excerpt}</small></button>)}</div>}
    {error && <p className="form-error">{error}</p>}
    <div className="explorer-body">
      <nav className="explorer-sidebar file-table">{sortedFiles.length ? <>
        <div className="file-table-head file-table-head-sortable">
          <button onClick={() => toggleSort('title')}>제목{sortIndicator('title', sortField, sortDirection)}</button>
          <button onClick={() => toggleSort('domain')}>분류{sortIndicator('domain', sortField, sortDirection)}</button>
          <button onClick={() => toggleSort('date')}>날짜{sortIndicator('date', sortField, sortDirection)}</button>
        </div>
        {sortedFiles.map(file => <button key={file.path} className={`file-table-row ${selected?.path === file.path ? 'active' : ''} ${readPaths.has(file.path) ? 'is-read' : ''}`} onClick={() => openFile(file)}>
          <span className="file-table-name"><Archive size={14}/>{displayTitle(file)}</span>
          <span className="file-table-domain">{domainLabel(file.domain)}{file.topic ? ` · ${file.topic}` : ''}</span>
          <span className="file-table-date">{file.date ?? '-'}</span>
        </button>)}
      </> : <p className="empty-state">{files.length ? '이 분류에 해당하는 파일이 없습니다.' : '아직 가공된 Markdown 파일이 없습니다.'}</p>}</nav>
      <div className="explorer-preview">{selected ? <><div className="explorer-preview-header"><b>{documentTitle(selected)}</b><span><button className="reprocess-button" onClick={reprocess} disabled={processing}>{processing ? '요청 중…' : 'AI 재가공'}</button><button onClick={() => setSelected(null)}><X size={17}/></button></span></div><div className="explorer-preview-body"><DocumentCard doc={selected}/></div></> : <div className="explorer-empty"><FileText size={34}/><p>왼쪽에서 파일을 선택하면 여기에서 바로 읽을 수 있습니다.</p></div>}</div>
    </div>
  </aside>
}
/** 노드를 원 둘레에 균등 배치하던 이전 방식은 노드 수가 늘면(지금 100개 이상) 라벨이 서로 겹쳐 뭉친
 * 원형 덩어리로만 보였다 -- d3-force로 실제 반발력·링크 인력 시뮬레이션을 돌려 자연스럽게 퍼지게 하고,
 * 계산된 좌표의 실제 bounding box를 0~100 퍼센트 좌표로 정규화해 기존 퍼센트 기반 렌더링과 그대로 맞춘다. */
function useForceLayout(graph: GraphData | null): Record<string, { x: number; y: number }> {
  return useMemo(() => {
    if (!graph || graph.nodes.length === 0) return {}
    const nodePaths = new Set(graph.nodes.map(node => node.path))
    const simNodes: (SimulationNodeDatum & { id: string; category: string })[] = graph.nodes.map(node => ({ id: node.path, category: node.category }))
    const simLinks = graph.edges
      .filter(edge => nodePaths.has(edge.from) && nodePaths.has(edge.to))
      .map(edge => ({ source: edge.from, target: edge.to }))

    const width = 800, height = 600
    // 카테고리별로 캔버스 둘레에 중심점을 하나씩 배정하고, 매 틱마다 노드를 자기 카테고리의 중심 쪽으로
    // 약하게 당겨서 색상뿐 아니라 위치로도 주제 구역이 뭉쳐 보이게 한다 -- link/charge보다 약하게 줘서
    // 실제 연결(엣지) 기반 배치를 구역 배정이 뭉개지 않게 한다.
    const categories = [...new Set(simNodes.map(node => node.category))]
    const clusterRadius = Math.min(width, height) * 0.32
    const centroids: Record<string, { x: number; y: number }> = {}
    categories.forEach((category, index) => {
      const angle = (2 * Math.PI * index) / categories.length
      centroids[category] = { x: width / 2 + clusterRadius * Math.cos(angle), y: height / 2 + clusterRadius * Math.sin(angle) }
    })
    const clusterForce = (alpha: number) => {
      for (const node of simNodes) {
        const centroid = centroids[node.category]
        if (!centroid || node.x == null || node.y == null) continue
        node.vx = (node.vx ?? 0) - (node.x - centroid.x) * 0.06 * alpha
        node.vy = (node.vy ?? 0) - (node.y - centroid.y) * 0.06 * alpha
      }
    }

    const simulation = forceSimulation(simNodes)
      // 상호 반발력(charge)이 링크 인력보다 세면 연결 여부와 무관하게 다들 고르게 밀려나 "가스처럼 퍼진"
      // 모양이 된다 -- 반발력은 약하게, 거리 상한을 둬서 멀리 있는 쌍끼리는 영향 없게 하고, 링크는 짧고
      // 세게 당겨서 실제로 연결된 노드끼리 뭉치는 게 눈에 보이게 한다.
      .force('link', forceLink(simLinks).id((node: SimulationNodeDatum) => (node as { id: string }).id).distance(38).strength(0.9))
      .force('charge', forceManyBody().strength(-28).distanceMax(240))
      .force('center', forceCenter(width / 2, height / 2))
      .force('collide', forceCollide(15))
      .force('cluster', clusterForce)
      .stop()
    for (let tick = 0; tick < 300; tick++) simulation.tick()

    const xs = simNodes.map(node => node.x ?? width / 2)
    const ys = simNodes.map(node => node.y ?? height / 2)
    const spanX = Math.max(Math.max(...xs) - Math.min(...xs), 1)
    const spanY = Math.max(Math.max(...ys) - Math.min(...ys), 1)
    const minX = Math.min(...xs), minY = Math.min(...ys)

    const positions: Record<string, { x: number; y: number }> = {}
    for (const node of simNodes) positions[node.id] = { x: 8 + (((node.x ?? width / 2) - minX) / spanX) * 84, y: 8 + (((node.y ?? height / 2) - minY) / spanY) * 84 }
    return positions
  }, [graph])
}

function GraphView({ onClose, onOpenFile }: { onClose: () => void; onOpenFile: (path: string) => void }) {
  const [graph, setGraph] = useState<GraphData | null>(null)
  const [selected, setSelected] = useState<MarkdownDoc | null>(null)
  useEffect(() => { fetch('/api/archive/graph', { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(setGraph) }, [])
  const positions = useForceLayout(graph)
  const openFile = async (path: string) => { const response = await fetch(`/api/archive/content?path=${encodeURIComponent(path)}`, { credentials: 'include' }); if (response.ok) setSelected(await response.json()); else onOpenFile(path) }
  const colors: Record<string, string> = { '웹 진단': '#df805a', '모바일 진단': '#dba43a', '소스코드 진단': '#c2588f', '모의해킹 시나리오': '#b23b3b', '시스템': '#7a8a4e', '클라우드': '#3f9e8f', '리버스 엔지니어링': '#5c6bc0', '기타': '#9a96a1', economy: '#4e94c7', ideas: '#9b77d5', general: '#69aa8b' }
  return <aside className="graph-view" role="dialog" aria-modal="true">
    <div className="sheet-header"><div><p className="eyebrow">KNOWLEDGE GRAPH</p><h2>주제 연결 그래프</h2></div><button className="sheet-close" onClick={onClose}><X size={18}/></button></div>
    <p className="source-intro">색상과 위치로 세부 주제 구역을 나타냅니다. 노드를 클릭하면 오른쪽에서 바로 읽을 수 있습니다.</p>
    <div className="explorer-body">
      <div className="graph-canvas-wrap"><div className="graph-canvas">{graph?.edges.map((edge, index) => { const a = positions[edge.from]; const b = positions[edge.to]; if (!a || !b) return null; return <svg className="graph-edge" key={`${edge.from}-${edge.to}-${index}`} viewBox="0 0 100 100"><line x1={a.x} y1={a.y} x2={b.x} y2={b.y}/></svg> })}{graph?.nodes.map(node => { const point = positions[node.path]; if (!point) return null; const color = colors[node.category] ?? '#69aa8b'; return <button className={`graph-node ${selected?.path === node.path ? 'active' : ''}`} key={node.path} onClick={() => openFile(node.path)} style={{ left: `${point.x}%`, top: `${point.y}%`, '--node-color': color } as CSSProperties}><span>{node.name}</span><small>{node.category}</small></button> })}</div><div className="graph-legend">{[...new Set(graph?.nodes.map(node => node.category) ?? [])].map(category => <span key={category}><i style={{ background: colors[category] ?? '#69aa8b' }}/>{category}</span>)}</div></div>
      <div className="explorer-preview">{selected ? <><div className="explorer-preview-header"><b>{documentTitle(selected)}</b><button onClick={() => setSelected(null)}><X size={17}/></button></div><div className="explorer-preview-body"><DocumentCard doc={selected}/></div></> : <div className="explorer-empty"><FileText size={34}/><p>노드를 클릭하면 여기에서 바로 읽을 수 있습니다.</p></div>}</div>
    </div>
  </aside>
}

function cheatSheetCommand(tool: CheatSheetTool, selected: Set<string>, values: Record<string, string>, target: string): string {
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

function CheatSheetModal({ onClose }: { onClose: () => void }) {
  const [tool, setTool] = useState<CheatSheetTool | null>(null)
  const [selectedOptions, setSelectedOptions] = useState<Set<string>>(new Set())
  const [values, setValues] = useState<Record<string, string>>({})
  const [target, setTarget] = useState('')
  const [copied, setCopied] = useState(false)

  const selectTool = (next: CheatSheetTool) => { setTool(next); setSelectedOptions(new Set()); setValues({}); setTarget(''); setCopied(false) }
  const toggleOption = (id: string) => { setSelectedOptions(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next }); setCopied(false) }
  const command = tool ? cheatSheetCommand(tool, selectedOptions, values, target) : ''
  const copy = async () => { if (!command) return; await navigator.clipboard.writeText(command); setCopied(true); window.setTimeout(() => setCopied(false), 1500) }

  return <aside className="file-explorer" role="dialog" aria-modal="true">
    <div className="sheet-header"><div><p className="eyebrow">CHEAT SHEET</p><h2>도구·명령어 치트시트</h2></div><button className="sheet-close" onClick={onClose}><X size={18}/></button></div>
    <div className="explorer-body">
      <nav className="explorer-sidebar cheatsheet-sidebar">
        {CHEATSHEET_CATEGORIES.map(category => <div className="cheatsheet-category" key={category.id}>
          <p className="cheatsheet-category-title">{category.name}</p>
          {category.tools.map(t => <button key={t.id} className={`cheatsheet-tool-row ${tool?.id === t.id ? 'active' : ''}`} onClick={() => selectTool(t)}><Terminal size={14}/>{t.name}</button>)}
        </div>)}
      </nav>
      <div className="explorer-preview">
        {tool ? <>
          <div className="explorer-preview-header"><b>{tool.name}</b></div>
          {tool.id === 'xss-payloads' ? <div className="explorer-preview-body cheatsheet-options-body"><XssPayloadBuilder/></div> : <div className="explorer-preview-body cheatsheet-options-body">
            {tool.note && <p className="cheatsheet-note">{tool.note}</p>}
            {tool.options.length === 0 && !tool.targetPlaceholder && <p className="empty-state">이 명령어는 별도 옵션 없이 그대로 사용합니다.</p>}
            {tool.options.map(option => <label className="cheatsheet-option" key={option.id}>
              <input type="checkbox" checked={selectedOptions.has(option.id)} onChange={() => toggleOption(option.id)}/>
              <span className="cheatsheet-option-body">
                <span className="cheatsheet-option-head">{option.flag && <code>{option.flag}</code>}<b>{option.label}</b></span>
                <small>{option.description}</small>
                {option.needsValue && selectedOptions.has(option.id) && <input className="cheatsheet-option-value" value={values[option.id] ?? ''} onChange={event => setValues(current => ({ ...current, [option.id]: event.target.value }))} placeholder={option.placeholder}/>}
              </span>
            </label>)}
            {tool.targetPlaceholder && <label className="cheatsheet-option cheatsheet-target">
              <span className="cheatsheet-option-body">
                <span className="cheatsheet-option-head"><b>대상</b></span>
                <input className="cheatsheet-option-value" value={target} onChange={event => setTarget(event.target.value)} placeholder={tool.targetPlaceholder}/>
              </span>
            </label>}
          </div>}
          {tool.id !== 'xss-payloads' && <div className="cheatsheet-command-bar">
            <pre className="cheatsheet-command">{command || tool.base || '(옵션을 선택하세요)'}</pre>
            <button className="cheatsheet-copy" onClick={copy} disabled={!command}><Clipboard size={14}/>{copied ? '복사됨' : '복사'}</button>
          </div>}
        </> : <div className="explorer-empty"><Terminal size={34}/><p>왼쪽에서 도구나 명령어를 선택하면 옵션을 조합할 수 있습니다.</p></div>}
      </div>
    </div>
  </aside>
}

const NOTE_PROMPT_TEMPLATE = (topic: string) => `"${topic || '{주제}'}"에 대한 심층 리서치 노트를 작성해줘. 아래 구조로 정리해:
1. 개요 — 이 주제가 왜 중요한지, 핵심 요약 2~3문장
2. 핵심 개념 — 꼭 필요한 용어와 원리를 명확히 정의
3. 상세 분석 — 실제 사례·기술적 원리·최신 동향을 근거와 함께 구체적으로 설명 (뭉뚱그린 설명 금지)
4. 실무 시사점 / 대응방안 — 이 내용을 어떻게 활용하거나 방어할 수 있는지
5. 참고 근거 — 사용한 출처나 판단 근거를 명시

분량보다 밀도가 중요해. 근거 없는 내용으로 억지로 늘리지 말고, 각 섹션이 실제로 새로운 정보를 담도록 작성해줘.`

function NotePromptBuilder() {
  const [topic, setTopic] = useState('')
  const [copied, setCopied] = useState(false)
  const prompt = NOTE_PROMPT_TEMPLATE(topic.trim())
  const copy = async () => { await navigator.clipboard.writeText(prompt); setCopied(true); window.setTimeout(() => setCopied(false), 1500) }
  return <div>
    <label className="cheatsheet-option">
      <span className="cheatsheet-option-body">
        <span className="cheatsheet-option-head"><b>주제</b></span>
        <input className="cheatsheet-option-value" value={topic} onChange={event => setTopic(event.target.value)} placeholder="예: SSRF 취약점"/>
      </span>
    </label>
    <div className="cheatsheet-command-bar">
      <pre className="cheatsheet-command">{prompt}</pre>
      <button className="cheatsheet-copy" onClick={copy}><Clipboard size={14}/>{copied ? '복사됨' : '복사'}</button>
    </div>
  </div>
}

function ParallelWorkflow({ tasks, tracks }: { tasks: Task[]; tracks: Record<string, TaskEvent[]> }) {
  const visible = tasks.filter(task => task.status === 'RUNNING' || task.status === 'QUEUED').slice(0, 5)
  const color = (domain: Task['domain']) => domain === 'SECURITY' ? '#df805a' : domain === 'ECONOMY' ? '#4e94c7' : '#9b77d5'
  const route = (task: Task, stage: string) => {
    const scoutX = task.domain === 'SECURITY' ? 16 : task.domain === 'ECONOMY' ? 83 : 50
    const scoutY = task.domain === 'GENERAL' ? 47 : 62
    const leadX = task.domain === 'SECURITY' ? 23 : task.domain === 'ECONOMY' ? 76 : 50
    const leadY = task.domain === 'GENERAL' ? 67 : 42
    if (stage === 'COLLECT') return `M${scoutX} ${scoutY} L39 60`; if (stage === 'REVIEW_A') return 'M39 60 L61 60'; if (stage === 'REVIEW_B') return `M61 60 L${leadX} ${leadY}`; if (stage === 'TEAM_LEAD') return `M${leadX} ${leadY} L50 29`; if (stage === 'PM') return 'M50 29 L50 80'; return 'M50 80 L50 80'
  }
  const stagePosition = (task: Task, stage: string) => stage === 'COLLECT' ? { x: task.domain === 'SECURITY' ? 16 : task.domain === 'ECONOMY' ? 83 : 50, y: task.domain === 'GENERAL' ? 47 : 62 } : stage === 'REVIEW_A' ? { x: 39, y: 60 } : stage === 'REVIEW_B' ? { x: 61, y: 60 } : stage === 'TEAM_LEAD' ? { x: task.domain === 'SECURITY' ? 23 : task.domain === 'ECONOMY' ? 76 : 50, y: task.domain === 'GENERAL' ? 67 : 42 } : stage === 'PM' ? { x: 50, y: 29 } : { x: 50, y: 80 }
  return <div className="parallel-workflows">{visible.map((task, index) => { const stage = tracks[task.id]?.at(-1)?.stage ?? 'PM'; const position = stagePosition(task, stage); const hue = color(task.domain); return <div className={`parallel-track ${task.status.toLowerCase()}`} key={task.id} style={{ '--track-color': hue, '--track-offset': `${index * 5}px` } as CSSProperties}><svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d={route(task, stage)}/></svg><span className="track-dot" style={{ left: `${position.x}%`, top: `${position.y}%` }}/><p style={{ left: `${position.x}%`, top: `calc(${position.y}% + ${index * 23}px)` }}><b>{task.status === 'QUEUED' ? '대기열' : stage}</b>{archiveTaskLabel(task.title).slice(0, 24)}</p></div> })}</div>
}

const DASHBOARD_STAGES = [{ id: 'COLLECT', label: '자료 수집' }, { id: 'REVIEW_A', label: '1차 정리' }, { id: 'REVIEW_B', label: '독립 재검토' }, { id: 'TEAM_LEAD', label: '팀장 종합' }, { id: 'PM', label: 'PM 판정' }, { id: 'ARCHIVE', label: '아카이브' }]

function autoGrowTextarea(node: HTMLTextAreaElement | null, maxPx: number) {
  if (!node) return
  node.style.height = 'auto'
  node.style.height = `${Math.min(node.scrollHeight, maxPx)}px`
}

// 백엔드 /api/archive/ask는 검색+답변 생성을 한 번의 blocking 요청으로 처리해서 실제 단계별 이벤트가 없다 --
// 경과 시간 기준으로 대략의 진행 단계만 흉내내는 용도이며, PM 작업 진행표처럼 실제 서버 단계 신호는 아니다.
function ragProgressLabel(elapsedMs: number): string {
  if (elapsedMs < 1200) return '질문을 분석하는 중…'
  if (elapsedMs < 3500) return '관련 노트를 검색하는 중…'
  return '답변을 작성하는 중…'
}

function taskStatusLabel(status: Task['status']): string {
  switch (status) {
    case 'COMPLETED': return '보고 완료'
    case 'FAILED': return '작업 중단'
    case 'CANCELLED': return '사용자가 중지함'
    case 'AWAITING_BATCH': return '야간 배치 대기'
    default: return '작업 진행 중'
  }
}

/** 대시보드 좌측에 세로로 붙는 대화 패널 — PM 대화와 RAG 아카이브 질문을 탭으로 오가며 쓴다. PM 대화 쪽 상태는
 * 오피스 화면의 떠 있는 채팅창과 동일한 App() 상태를 그대로 공유해서, 뷰를 오갈 때 대화가 끊기지 않는다. */
function DashboardSidebarChat({ recentTasks, taskTracks, chatInput, setChatInput, taskDomain, setTaskDomain, chatError, onSubmitTask, onOpenFile }: {
  recentTasks: Task[]; taskTracks: Record<string, TaskEvent[]>; chatInput: string; setChatInput: (value: string) => void
  taskDomain: 'SECURITY' | 'ECONOMY' | 'GENERAL'; setTaskDomain: (value: 'SECURITY' | 'ECONOMY' | 'GENERAL') => void
  chatError: string; onSubmitTask: (event: FormEvent) => void; onOpenFile: (path: string) => void
}) {
  const [tab, setTab] = useState<'pm' | 'rag'>('pm')
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [answer, setAnswer] = useState<RagAnswer | null>(null)
  const [ragError, setRagError] = useState('')
  const [domainFilter, setDomainFilter] = useState<RagDomainFilter>('')
  const [originFilter, setOriginFilter] = useState<RagOriginFilter>('')
  const [ragElapsed, setRagElapsed] = useState(0)
  const ragAbortRef = useRef<AbortController | null>(null)
  const pmFormRef = useRef<HTMLFormElement>(null)
  const pmTextareaRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { if (chatInput === '' && pmTextareaRef.current) pmTextareaRef.current.style.height = 'auto' }, [chatInput])
  const onChatKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); pmFormRef.current?.requestSubmit() }
  }
  const ask = async (event: FormEvent) => {
    event.preventDefault()
    if (!question.trim() || asking) return
    setAsking(true); setRagError(''); setAnswer(null); setRagElapsed(0)
    const asked = question.trim()
    const controller = new AbortController(); ragAbortRef.current = controller
    const started = Date.now()
    const progressTimer = window.setInterval(() => setRagElapsed(Date.now() - started), 300)
    try {
      const response = await fetch('/api/archive/ask', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: asked, domain: domainFilter || null, origin: originFilter || null }), signal: controller.signal })
      if (!response.ok) { setRagError('답변을 가져오지 못했습니다. API 키 설정을 확인해 주세요.'); return }
      setAnswer(await response.json() as RagAnswer); setQuestion('')
    } catch (exception) {
      if ((exception as Error).name !== 'AbortError') setRagError('답변을 가져오지 못했습니다. API 키 설정을 확인해 주세요.')
    } finally {
      window.clearInterval(progressTimer); setAsking(false); ragAbortRef.current = null
    }
  }
  const stopAsking = () => { ragAbortRef.current?.abort() }
  return <aside className="dashboard-chat">
    <div className="dashboard-chat-tabs">
      <button className={tab === 'pm' ? 'active' : ''} onClick={() => setTab('pm')}>PM 대화</button>
      <button className="dashboard-chat-flip" onClick={() => setTab(current => current === 'pm' ? 'rag' : 'pm')} title="대화 전환"><RotateCcw size={13}/></button>
      <button className={tab === 'rag' ? 'active' : ''} onClick={() => setTab('rag')}>RAG 대화</button>
    </div>
    {tab === 'pm' ? <div className="dashboard-chat-body">
      <p className="chat-bubble">수집 사이트를 등록하거나 작업을 지시해 주세요. PM이 팀과 검토 단계를 계획하겠습니다.</p>
      {recentTasks.filter(task => task.status === 'RUNNING' || task.status === 'QUEUED').map(task => (
        <div className="pm-task-block" key={task.id}>
          <p className={`task-state ${task.status.toLowerCase()}`}>{archiveTaskLabel(task.title)} · {taskStatusLabel(task.status)}</p>
          {(taskTracks[task.id] ?? []).map(item => <p className="event-bubble" key={item.id}><b>{item.stage}</b> {item.message}</p>)}
        </div>
      ))}
      {recentTasks.filter(task => task.status !== 'RUNNING' && task.status !== 'QUEUED' && task.status !== 'AWAITING_BATCH').slice(0, 4).map(task => (
        <div className="pm-task-block" key={task.id}>
          <p className={`task-state ${task.status.toLowerCase()}`}>{archiveTaskLabel(task.title)} · {taskStatusLabel(task.status)}</p>
          {task.finalReport && <p className="report-bubble">{task.finalReport}</p>}
          {task.archivePath && <p className="archive-bubble">보관: obsidian/{task.archivePath}</p>}
          {task.failureReason && <p className="form-error">{task.failureReason}</p>}
        </div>
      ))}
    </div> : <div className="dashboard-chat-body">
      <p className="chat-bubble">아카이브에 쌓인 노트를 근거로 답합니다. 노트에 없는 내용은 답하지 않습니다.</p>
      <div className="rag-filter-row">
        <select value={domainFilter} onChange={e => setDomainFilter(e.target.value as RagDomainFilter)} title="분야로 범위 좁히기">
          <option value="">전체 분야</option>
          <option value="economy">경제</option>
          <option value="security">보안</option>
          <option value="ideas">아이디어</option>
        </select>
        <select value={originFilter} onChange={e => setOriginFilter(e.target.value as RagOriginFilter)} title="출처로 범위 좁히기">
          <option value="">전체 출처</option>
          <option value="collection">수집</option>
          <option value="manual">질문·직접작성</option>
          <option value="upload">업로드</option>
        </select>
      </div>
      {asking && <p className="empty-state"><Loader2 size={13} className="spin"/> {ragProgressLabel(ragElapsed)}</p>}
      {ragError && <p className="form-error">{ragError}</p>}
      {answer && <div className="rag-answer"><Suspense fallback={null}><MarkdownBody>{answer.answer}</MarkdownBody></Suspense>
        {answer.citations.length > 0 && <div className="rag-citations"><b>참고 노트</b>{answer.citations.map(citation => <button key={citation.path} onClick={() => onOpenFile(citation.path)}>{citation.path} <small>({(citation.score * 100).toFixed(0)}%)</small></button>)}</div>}
      </div>}
    </div>}
    {tab === 'pm'
      ? <form className="chat-input" ref={pmFormRef} onSubmit={onSubmitTask}><select value={taskDomain} onChange={e => setTaskDomain(e.target.value as typeof taskDomain)}><option value="SECURITY">보안</option><option value="ECONOMY">경제</option><option value="GENERAL">일반</option></select><textarea ref={pmTextareaRef} rows={1} value={chatInput} onChange={e => { setChatInput(e.target.value); autoGrowTextarea(pmTextareaRef.current, 130) }} onKeyDown={onChatKeyDown} placeholder="PM에게 작업을 지시하세요 (Shift+Enter로 줄바꿈)"/><button type="submit"><Send size={16}/></button></form>
      : <form className="chat-input ask-form" onSubmit={ask}><input value={question} onChange={e => setQuestion(e.target.value)} placeholder="아카이브에 질문하기" disabled={asking}/>{asking ? <button type="button" className="ask-stop" onClick={stopAsking}><Square size={15}/></button> : <button type="submit"><Search size={15}/></button>}</form>}
    {tab === 'pm' && chatError && <p className="chat-error">{chatError}</p>}
  </aside>
}

/** 사무실에서 화면을 켜놓고 지켜보는 용도의 정적 현황판 — 애니메이션 사무실 대신 숫자·바로가기 위주로 훑어볼 수 있게 구성한다. */
function OfficeDashboard({ recentTasks, taskTracks, archivedCount, pendingCandidates, budgetExceeded, chatInput, setChatInput, taskDomain, setTaskDomain, chatError, onSubmitTask, onCancelTask, onOpenPanel, onOpenFile, todos }: {
  recentTasks: Task[]; taskTracks: Record<string, TaskEvent[]>; archivedCount: number; pendingCandidates: number; budgetExceeded: boolean
  chatInput: string; setChatInput: (value: string) => void
  taskDomain: 'SECURITY' | 'ECONOMY' | 'GENERAL'; setTaskDomain: (value: 'SECURITY' | 'ECONOMY' | 'GENERAL') => void
  chatError: string; onSubmitTask: (event: FormEvent) => void; onCancelTask: (id: string) => void; onOpenPanel: (panel: Panel) => void; onOpenFile: (path: string) => void
  todos: TodoListProps
}) {
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [trading, setTrading] = useState<TradingState | null>(null)
  const [krTrading, setKrTrading] = useState<KrTradingState | null>(null)
  const [usTrading, setUsTrading] = useState<UsTradingState | null>(null)
  const [trxTrading, setTrxTrading] = useState<TrxTradingState | null>(null)
  const [momentumTrading, setMomentumTrading] = useState<MomentumRotationState | null>(null)
  const [calendarCount, setCalendarCount] = useState<number | null>(null)
  const [archiveFiles, setArchiveFiles] = useState<ArchiveFile[]>([])
  const [calendarTimeline, setCalendarTimeline] = useState<SecurityCalendarTimelineEntry[]>([])
  useEffect(() => {
    const load = () => {
      if (document.hidden) return
      fetch('/api/usage/summary?days=30', { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(setUsage).catch(() => undefined)
      fetch('/api/trading/state', { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(setTrading).catch(() => undefined)
      fetch('/api/trading/kr/state', { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(setKrTrading).catch(() => undefined)
      fetch('/api/trading/us/state', { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(setUsTrading).catch(() => undefined)
      fetch('/api/trading/trx/state', { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(setTrxTrading).catch(() => undefined)
      fetch('/api/trading/momentum-rotation/state', { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(setMomentumTrading).catch(() => undefined)
      const now = new Date(); const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      fetch(`/api/security-calendar?month=${monthKey}`, { credentials: 'include' }).then(r => r.ok ? r.json() : []).then((items: unknown[]) => setCalendarCount(items.length)).catch(() => undefined)
      fetch('/api/archive/files', { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setArchiveFiles).catch(() => undefined)
      fetch('/api/security-calendar/timeline?limit=40', { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setCalendarTimeline).catch(() => undefined)
    }
    load()
    const timer = window.setInterval(load, 60000)
    return () => window.clearInterval(timer)
  }, [])
  const running = recentTasks.filter(task => task.status === 'RUNNING' || task.status === 'QUEUED').length
  const recentFiles = archiveFiles.slice().sort((a, b) => {
    const dateCompare = (b.date ?? '').localeCompare(a.date ?? '')
    return dateCompare !== 0 ? dateCompare : b.modifiedAt.localeCompare(a.modifiedAt)
  }).slice(0, 12)
  const todayKey = new Date().toISOString().slice(0, 10)
  const recentIncidents = calendarTimeline.filter(item => item.event.category === 'INCIDENT').slice(0, 6)
  const upcomingEvents = calendarTimeline
    .filter(item => item.event.category !== 'INCIDENT' && item.event.eventDate >= todayKey)
    .sort((a, b) => a.event.eventDate.localeCompare(b.event.eventDate))
    .slice(0, 6)
  const activeTasksList = recentTasks.filter(task => task.status === 'RUNNING' || task.status === 'QUEUED')
  return <div className="office-dashboard">
    <DashboardSidebarChat recentTasks={recentTasks} taskTracks={taskTracks} chatInput={chatInput} setChatInput={setChatInput} taskDomain={taskDomain} setTaskDomain={setTaskDomain} chatError={chatError} onSubmitTask={onSubmitTask} onOpenFile={onOpenFile}/>
    <div className="dashboard-main">
      <div className="dashboard-grid">
        <button className="dashboard-tile" onClick={() => onOpenPanel('processes')}><span className="dashboard-tile-icon"><LayoutDashboard size={19}/></span><b>{running}</b><span>진행 중인 작업</span></button>
        <button className="dashboard-tile" onClick={() => onOpenPanel('archive')}><span className="dashboard-tile-icon"><Archive size={19}/></span><b>{archivedCount}</b><span>파일 아카이브</span></button>
        <button className="dashboard-tile" onClick={() => onOpenPanel('sources')}><span className="dashboard-tile-icon"><Globe2 size={19}/></span><b>{pendingCandidates}</b><span>수집 후보 대기</span></button>
        <button className={`dashboard-tile ${budgetExceeded ? 'alert' : ''}`} onClick={() => onOpenPanel('usage')}><span className="dashboard-tile-icon"><ScrollText size={19}/></span><b>${usage ? usage.monthToDateCostUsd.toFixed(2) : '-'}</b><span>{budgetExceeded ? '⚠ 이번 달 예산 초과' : '이번 달 사용 비용'}</span></button>
        <button className={`dashboard-tile ${trading?.tradingHalted ? 'alert' : ''}`} onClick={() => onOpenPanel('trading')}><span className="dashboard-tile-icon"><TrendingUp size={19}/></span><b className={trading ? (trading.totalPnlUsdt >= 0 ? 'dashboard-positive' : 'dashboard-negative') : ''}>{trading ? `$${trading.totalPnlUsdt.toFixed(2)}` : '-'}</b><span>{trading?.tradingHalted ? '⚠ 트레이딩 중단됨' : '트레이딩 손익'}</span></button>
        <button className="dashboard-tile" onClick={() => onOpenPanel('kr-trading')}><span className="dashboard-tile-icon"><Landmark size={19}/></span><b>{krTrading ? Object.keys(krTrading.stopPrice).length : '-'}</b><span>국장 보유 종목</span></button>
        <button className="dashboard-tile" onClick={() => onOpenPanel('us-trading')}><span className="dashboard-tile-icon"><Globe2 size={19}/></span><b>{usTrading ? Object.keys(usTrading.stopPrice).length : '-'}</b><span>미장 보유 종목</span></button>
        <button className="dashboard-tile" onClick={() => onOpenPanel('momentum-rotation-trading')}><span className="dashboard-tile-icon"><TrendingUp size={19}/></span><b className={momentumTrading ? ((momentumTrading.cumulativeRealizedPnlUsdt + momentumTrading.unrealizedPnlUsdt - momentumTrading.cumulativeFeeUsdt) >= 0 ? 'dashboard-positive' : 'dashboard-negative') : ''}>{momentumTrading ? `$${(momentumTrading.cumulativeRealizedPnlUsdt + momentumTrading.unrealizedPnlUsdt - momentumTrading.cumulativeFeeUsdt).toFixed(2)}` : '-'}</b><span>모멘텀 로테이션 손익(페이퍼)</span></button>
        <button className="dashboard-tile" onClick={() => onOpenPanel('trx-trading')}><span className="dashboard-tile-icon"><TrendingUp size={19}/></span><b className={trxTrading ? ((trxTrading.cumulativeRealizedPnlUsdt - trxTrading.cumulativeFeeUsdt) >= 0 ? 'dashboard-positive' : 'dashboard-negative') : ''}>{trxTrading ? `$${(trxTrading.cumulativeRealizedPnlUsdt - trxTrading.cumulativeFeeUsdt).toFixed(2)}` : '-'}</b><span>{trxTrading?.position ? 'TRX 보유 중' : 'TRX 손익'}</span></button>
        <button className="dashboard-tile" onClick={() => onOpenPanel('calendar')}><span className="dashboard-tile-icon"><CalendarDays size={19}/></span><b>{calendarCount ?? '-'}</b><span>이번 달 보안 일정</span></button>
      </div>
      {activeTasksList.length > 0 && <div className="dashboard-progress">
        {activeTasksList.map(task => {
          const stage = taskTracks[task.id]?.at(-1)?.stage
          const stageIndex = DASHBOARD_STAGES.findIndex(s => s.id === stage)
          return <div className="dashboard-progress-block" key={task.id}>
            <div className="dashboard-progress-head"><b>{archiveTaskLabel(task.title)}</b><button className="dashboard-progress-stop" onClick={() => onCancelTask(task.id)}><Square size={11}/> 중지</button></div>
            <div className="dashboard-progress-bar">
              {DASHBOARD_STAGES.map((s, index) => <div key={s.id} className={`dashboard-progress-seg ${index < stageIndex ? 'done' : ''} ${index === stageIndex ? 'current' : ''}`}><span/><small>{s.label}</small></div>)}
            </div>
          </div>
        })}
      </div>}
      <div className="dashboard-recent-split">
        <TodoDashboardCard {...todos}/>
        <div className="dashboard-calendar-widget">
          <div className="dashboard-calendar-half">
            <b>최근 피해사고</b>
            {recentIncidents.length === 0 ? <p className="empty-state">기록된 피해사고가 없습니다.</p> : <ul className="dashboard-calendar-list">
              {recentIncidents.map(item => <li key={item.event.id}><button onClick={() => onOpenPanel('calendar')}>
                <span className="dashboard-calendar-title">{item.event.title}</span>
                <span className="dashboard-calendar-meta">{item.event.lastUpdatedDate}{item.updates.length > 0 ? ` · 업데이트 ${item.updates.length}건` : ''}</span>
              </button></li>)}
            </ul>}
          </div>
          <div className="dashboard-calendar-half">
            <b>다가오는 행사·세미나</b>
            {upcomingEvents.length === 0 ? <p className="empty-state">예정된 행사·세미나가 없습니다.</p> : <ul className="dashboard-calendar-list">
              {upcomingEvents.map(item => <li key={item.event.id}><button onClick={() => onOpenPanel('calendar')}>
                <span className="dashboard-calendar-title">{item.event.title}</span>
                <span className="dashboard-calendar-meta">{item.event.eventDate} · {CALENDAR_CATEGORY_LABEL[item.event.category]}</span>
              </button></li>)}
            </ul>}
          </div>
        </div>
        <div className="dashboard-files">
          <b>최근 파일</b>
          {recentFiles.length === 0 ? <p className="empty-state">아직 파일이 없습니다.</p> : <ul className="dashboard-files-list">
            {recentFiles.map(file => <li key={file.path}><button onClick={() => onOpenFile(file.path)}>
              <span className="dashboard-file-title">{displayTitle(file)}</span>
              <span className="dashboard-file-meta">{domainLabel(file.domain)} · {file.date ?? '-'}</span>
            </button></li>)}
          </ul>}
        </div>
      </div>
    </div>
  </div>
}

/** Powers both the always-on floating widget and the dashboard card. Each caller mounts its own copy of
 * this hook and polls independently — todos are personal (per-account), so brief staleness between two
 * simultaneously-open copies is harmless and not worth a shared store for. */
function useTodos() {
  const [items, setItems] = useState<TodoItem[]>([])
  useEffect(() => {
    const load = () => {
      if (document.hidden) return
      fetch('/api/todos', { credentials: 'include' }).then(r => r.ok ? r.json() as Promise<TodoItem[]> : null).then(data => { if (data) setItems(data) }).catch(() => undefined)
    }
    load()
    const timer = window.setInterval(load, 8000)
    return () => window.clearInterval(timer)
  }, [])
  const add = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    fetch('/api/todos', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: trimmed }) })
      .then(r => r.ok ? r.json() as Promise<TodoItem> : null).then(item => { if (item) setItems(previous => [...previous, item]) }).catch(() => undefined)
  }
  const toggle = (id: string, completed: boolean) => {
    fetch(`/api/todos/${id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed }) })
      .then(r => r.ok ? r.json() as Promise<TodoItem> : null).then(updated => { if (updated) setItems(previous => previous.map(item => item.id === updated.id ? updated : item)) }).catch(() => undefined)
  }
  return { items, add, toggle }
}

function TodoRow({ item, checking, onToggle }: { item: TodoItem; checking: boolean; onToggle: () => void }) {
  const done = item.completed || checking
  return <div className={`todo-item ${checking ? 'todo-item-checking' : ''}`}>
    <button className={`todo-checkbox ${done ? 'checked' : ''}`} onClick={onToggle} aria-label={item.completed ? '완료 취소' : '완료 처리'}>
      {done && <Check size={12} strokeWidth={3}/>}
    </button>
    <span className={`todo-item-text ${done ? 'done' : ''}`}>{item.text}</span>
  </div>
}

/** Checking an item strikes its text immediately, then — after a short delay so the strike is visible —
 * collapses the row, which is what makes the rows below it visibly slide up rather than just snapping into
 * place once the item disappears from the unchecked list. */
function TodoPanelBody({ items, onAdd, onToggle }: { items: TodoItem[]; onAdd: (text: string) => void; onToggle: (id: string, completed: boolean) => void }) {
  const [text, setText] = useState('')
  const [showCompleted, setShowCompleted] = useState(false)
  const [checkingIds, setCheckingIds] = useState<Set<string>>(new Set())
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const unchecked = items.filter(item => !item.completed)
  const completed = items.filter(item => item.completed).sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))

  const handleCheck = (id: string) => {
    setCheckingIds(previous => new Set(previous).add(id))
    window.setTimeout(() => {
      onToggle(id, true)
      setCheckingIds(previous => { const next = new Set(previous); next.delete(id); return next })
    }, 420)
  }

  const submit = () => {
    if (!text.trim()) return
    onAdd(text)
    setText('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }
  const onChange = (value: string) => {
    setText(value)
    const node = textareaRef.current
    if (node) { node.style.height = 'auto'; node.style.height = `${Math.min(node.scrollHeight, 120)}px` }
  }
  const onKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit() }
  }

  return <div className="todo-panel-body">
    <div className="todo-list">
      {unchecked.length === 0 ? <p className="empty-state">할 일이 없습니다.</p> : unchecked.map(item => (
        <TodoRow key={item.id} item={item} checking={checkingIds.has(item.id)} onToggle={() => handleCheck(item.id)}/>
      ))}
    </div>
    <button className="todo-history-toggle" onClick={() => setShowCompleted(value => !value)}>
      {showCompleted ? '완료 항목 숨기기' : `완료 항목 보기${completed.length > 0 ? ` · ${completed.length}` : ''}`}
    </button>
    {showCompleted && <div className="todo-list todo-list-completed">
      {completed.length === 0 ? <p className="empty-state">완료한 항목이 없습니다.</p> : completed.map(item => (
        <TodoRow key={item.id} item={item} checking={false} onToggle={() => onToggle(item.id, false)}/>
      ))}
    </div>}
    <textarea ref={textareaRef} className="todo-input" rows={1} value={text} placeholder="할 일을 입력하고 Enter…"
      onChange={e => onChange(e.target.value)} onKeyDown={onKeyDown}/>
  </div>
}

type TodoListProps = { items: TodoItem[]; onAdd: (text: string) => void; onToggle: (id: string, completed: boolean) => void }

function TodoDashboardCard({ items, onAdd, onToggle }: TodoListProps) {
  return <div className="dashboard-recent todo-card">
    <b>할 일</b>
    <TodoPanelBody items={items} onAdd={onAdd} onToggle={onToggle}/>
  </div>
}

/** Always mounted at the top level of the app (outside every panel/officeView branch), so it floats over
 * the file explorer, archive, and every other screen — not just the office/dashboard views. Takes its data
 * from the single `useTodos()` call in `App()` (passed down as props) rather than polling on its own, so
 * having both this and `TodoDashboardCard` on screen at once doesn't double the poll rate. */
function TodoFloating({ items, onAdd, onToggle }: TodoListProps) {
  const [open, setOpen] = useState(false)
  const pendingCount = items.filter(item => !item.completed).length
  return <>
    <button className="todo-fab" onClick={() => setOpen(value => !value)} title="할 일">
      {open ? <X size={20}/> : <ListChecks size={20}/>}
      {!open && pendingCount > 0 && <span className="todo-fab-badge">{pendingCount}</span>}
    </button>
    {open && <div className="todo-float-panel" role="dialog" aria-label="할 일 목록">
      <div className="todo-float-header"><b>할 일</b><button className="sheet-close" onClick={() => setOpen(false)}><X size={15}/></button></div>
      <TodoPanelBody items={items} onAdd={onAdd} onToggle={onToggle}/>
    </div>}
  </>
}

function SettingsPanel({ onClose, onOpenDigest }: { onClose: () => void, onOpenDigest: () => void }) {
  const [running, setRunning] = useState(false); const [result, setResult] = useState<MaintenanceResult | null>(null); const [error, setError] = useState('')
  const runMaintenance = async () => { setRunning(true); setError(''); const response = await fetch('/api/archive/maintenance/run-now', { method: 'POST', credentials: 'include' }); setRunning(false); if (!response.ok) { setError('정리 작업을 실행하지 못했습니다.'); return } setResult(await response.json() as MaintenanceResult) }
  const [pmProvider, setPmProvider] = useState<'DEEPSEEK' | 'BEDROCK' | null>(null); const [pmProviderBusy, setPmProviderBusy] = useState(false); const [pmProviderError, setPmProviderError] = useState('')
  useEffect(() => { fetch('/api/tasks/pm-provider', { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(body => body && setPmProvider(body.provider)).catch(() => setPmProviderError('현재 설정을 불러오지 못했습니다.')) }, [])
  const switchPmProvider = async (provider: 'DEEPSEEK' | 'BEDROCK') => {
    if (provider === pmProvider || pmProviderBusy) return
    setPmProviderBusy(true); setPmProviderError('')
    const response = await fetch('/api/tasks/pm-provider', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider }) })
    setPmProviderBusy(false)
    if (!response.ok) { setPmProviderError('전환하지 못했습니다.'); return }
    const body = await response.json(); setPmProvider(body.provider)
  }
  const [collectionEnabled, setCollectionEnabled] = useState<boolean | null>(null); const [collectionBusy, setCollectionBusy] = useState(false); const [collectionError, setCollectionError] = useState('')
  useEffect(() => { fetch('/api/research-sources/collection-enabled', { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(body => body && setCollectionEnabled(body.enabled)).catch(() => setCollectionError('현재 설정을 불러오지 못했습니다.')) }, [])
  const switchCollectionEnabled = async (enabled: boolean) => {
    if (enabled === collectionEnabled || collectionBusy) return
    setCollectionBusy(true); setCollectionError('')
    const response = await fetch('/api/research-sources/collection-enabled', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) })
    setCollectionBusy(false)
    if (!response.ok) { setCollectionError('전환하지 못했습니다.'); return }
    const body = await response.json(); setCollectionEnabled(body.enabled)
  }
  return <aside className="side-modal" role="dialog" aria-modal="true"><div className="sheet-header"><div><p className="eyebrow">DEVELOPMENT SETTINGS</p><h2>설정 안내</h2></div><button className="sheet-close" onClick={onClose}><X size={18}/></button></div><p className="source-intro">API 키와 모델 단가는 프로젝트 `.env`에서만 관리합니다. 화면에는 키를 표시하거나 전송하지 않습니다.</p><div className="sheet-section"><b>PM 최종 판정 모델</b><p>PM 단계를 DeepSeek 대신 AWS Bedrock의 Claude로 돌릴 수 있습니다. 필요할 때만 Claude로 켜고, 크레딧을 다 쓰면 다시 DeepSeek으로 되돌리세요.</p><div className="source-actions"><button className={pmProvider === 'DEEPSEEK' ? 'source-add' : 'source-cancel'} onClick={() => switchPmProvider('DEEPSEEK')} disabled={pmProviderBusy || pmProvider === null}>DeepSeek{pmProvider === 'DEEPSEEK' ? ' · 사용 중' : ''}</button><button className={pmProvider === 'BEDROCK' ? 'source-add' : 'source-cancel'} onClick={() => switchPmProvider('BEDROCK')} disabled={pmProviderBusy || pmProvider === null}>Claude (Bedrock){pmProvider === 'BEDROCK' ? ' · 사용 중' : ''}</button></div>{pmProviderError && <p className="form-error">{pmProviderError}</p>}</div><div className="sheet-section"><b>수집 사이트 자동 수집</b><p>뉴스를 못 챙겨볼 만큼 바쁠 때 꺼두면 야간 정기 수집·재시도 수집이 전부 멈춰서 비용이 안 나갑니다. 등록된 사이트 각각의 설정은 그대로 유지되고, "즉시 수집" 버튼은 꺼져있어도 계속 동작합니다.</p><div className="source-actions"><button className={collectionEnabled === true ? 'source-add' : 'source-cancel'} onClick={() => switchCollectionEnabled(true)} disabled={collectionBusy || collectionEnabled === null}>켜짐{collectionEnabled === true ? ' · 사용 중' : ''}</button><button className={collectionEnabled === false ? 'source-add' : 'source-cancel'} onClick={() => switchCollectionEnabled(false)} disabled={collectionBusy || collectionEnabled === null}>꺼짐{collectionEnabled === false ? ' · 사용 중' : ''}</button></div>{collectionError && <p className="form-error">{collectionError}</p>}</div><div className="sheet-section"><b>작업 다이제스트</b><p>일간·주간 작업 처리 현황을 확인하고 n8n으로 전송합니다.</p><button className="source-add" onClick={onOpenDigest}><ScrollText size={16}/> 다이제스트 보기</button></div><div className="sheet-section"><b>아카이브 주간 정리</b><p>서로 다른 폴더에 저장된 중복 노트를 매주 자동으로 찾아 병합하고, 수집 노트는 실제 주제별 폴더로 재분류하며, 질문·직접작성 노트는 웹 진단/암호학 같은 넓은 주제 버킷으로 모으고 버킷이 너무 커지면 하위 주제로 나눕니다. 관련 노트끼리는 [[위키링크]]로 연결합니다. 병합·분할에서 밀린 파일은 삭제하지 않고 obsidian/_archived/로 옮깁니다.</p><button className="source-add" onClick={runMaintenance} disabled={running}><Archive size={16}/>{running ? '정리 실행 중…' : '지금 정리 실행'}</button>{result && <p className="form-notice">{result.notesExamined}개 노트 확인 · {result.merged}건 병합 · {result.reclassified}건 주제 재분류 · {result.bucketed}건 버킷 통합 · {result.split}건 버킷 분할 · {result.weeklyDigested}건 주간 정리 취합 · {result.linked}건 관련 노트 연결{result.mergedPairs.length > 0 ? ' · 병합: ' + result.mergedPairs.join(', ') : ''}{result.reclassifiedNotes.length > 0 ? ' · 재분류: ' + result.reclassifiedNotes.join(', ') : ''}{result.bucketedNotes.length > 0 ? ' · 버킷 통합: ' + result.bucketedNotes.join(', ') : ''}{result.splitBuckets.length > 0 ? ' · 버킷 분할: ' + result.splitBuckets.join(', ') : ''}{result.weeklyDigestedNotes.length > 0 ? ' · 주간 취합: ' + result.weeklyDigestedNotes.join(', ') : ''}</p>}{result && result.failed > 0 && <p className="form-error">⚠ {result.failed}건 처리 실패 · {result.failedNotes.join(' · ')}</p>}{error && <p className="form-error">{error}</p>}</div></aside>
}

function UserManagementModal({ onClose }: { onClose: () => void }) {
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [loginId, setLoginId] = useState(''); const [displayName, setDisplayName] = useState(''); const [role, setRole] = useState<Role>('USER'); const [password, setPassword] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null); const [notice, setNotice] = useState('')
  const load = () => fetch('/api/admin/users', { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setUsers).catch(() => setNotice('사용자 목록을 불러오지 못했습니다.'))
  useEffect(() => { load() }, [])
  const reset = () => { setLoginId(''); setDisplayName(''); setRole('USER'); setPassword(''); setEditingId(null) }
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setNotice('')
    const response = await fetch(editingId ? `/api/admin/users/${editingId}` : '/api/admin/users', {
      method: editingId ? 'PUT' : 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingId ? { displayName, role, password: password || null } : { id: loginId, displayName, role, password })
    })
    if (!response.ok) { const body = await response.json().catch(() => null); setNotice(body?.message ?? '저장하지 못했습니다.'); return }
    reset(); load()
  }
  const remove = async (user: ManagedUser) => {
    setNotice('')
    const response = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE', credentials: 'include' })
    if (!response.ok) { const body = await response.json().catch(() => null); setNotice(body?.message ?? '삭제하지 못했습니다.'); return }
    load()
  }
  return <aside className="source-sheet" role="dialog" aria-modal="true">
    <div className="sheet-header"><div><p className="eyebrow">ACCOUNT ADMIN</p><h2>사용자 관리</h2></div><button className="sheet-close" onClick={onClose}><X size={18}/></button></div>
    <p className="source-intro">관리자는 모든 기능을 사용할 수 있고, 사용자는 파일 아카이브 · 수집 사이트(조회) · 에이전트 · 보안 캘린더 · 치트시트만 조회할 수 있습니다.</p>
    <form className="source-form" onSubmit={submit}>
      <label>아이디<input value={loginId} onChange={e => setLoginId(e.target.value)} required maxLength={320} disabled={Boolean(editingId)}/></label>
      <label>표시 이름<input value={displayName} onChange={e => setDisplayName(e.target.value)} required maxLength={120}/></label>
      <label>권한<select value={role} onChange={e => setRole(e.target.value as Role)}><option value="USER">사용자</option><option value="ADMIN">관리자</option></select></label>
      <label>{editingId ? '비밀번호(변경 시에만 입력)' : '비밀번호'}<input value={password} onChange={e => setPassword(e.target.value)} type="password" required={!editingId} minLength={8} maxLength={200}/></label>
      {notice && <p className={notice.includes('못했') ? 'form-error' : 'form-notice'}>{notice}</p>}
      <button className="source-add" type="submit"><Plus size={16}/>{editingId ? '설정 저장' : '사용자 추가'}</button>
      {editingId && <button className="source-cancel" type="button" onClick={reset}>편집 취소</button>}
    </form>
    <div className="source-list"><div className="source-list-head"><b>등록됨</b><span>{users.length}명</span></div>
      {users.map(user => <article className="source-row" key={user.id}>
        <span className={`domain-dot ${user.role === 'ADMIN' ? 'security' : 'economy'}`}/>
        <div><b>{user.displayName}</b><small>{user.loginId} · {user.role === 'ADMIN' ? '관리자' : '사용자'} · {user.createdAt.slice(0, 10)}</small>
          <div className="source-actions"><button onClick={() => { setEditingId(user.id); setLoginId(user.loginId); setDisplayName(user.displayName); setRole(user.role); setPassword(''); setNotice('') }}>설정</button></div>
        </div>
        <button onClick={() => remove(user)}><Trash2 size={15}/></button>
      </article>)}
    </div>
  </aside>
}

function NotificationStack({ notices, onDismiss }: { notices: Notice[]; onDismiss: (id: string) => void }) {
  if (notices.length === 0) return null
  return <div className="notification-stack">{notices.map(notice => <article key={notice.id} className={`notice notice-${notice.kind}`} onClick={() => onDismiss(notice.id)}><p>{notice.message}</p></article>)}</div>
}

function ProcessBoard({ tasks, tracks, onClose }: { tasks: Task[]; tracks: Record<string, TaskEvent[]>; onClose: () => void }) {
  const stages = ['COLLECT', 'REVIEW_A', 'REVIEW_B', 'TEAM_LEAD', 'PM', 'ARCHIVE']
  const visible = tasks.filter(task => task.status === 'RUNNING' || task.status === 'QUEUED')
  return <aside className="process-board" role="dialog" aria-modal="true"><div className="sheet-header"><div><p className="eyebrow">ALL PROCESSES</p><h2>전체 진행표</h2></div><button className="sheet-close" onClick={onClose}><X size={18}/></button></div>{visible.length ? <div className="process-list">{visible.map(task => { const events = tracks[task.id] ?? []; const current = events.at(-1)?.stage; const currentIndex = stages.indexOf(current ?? ''); return <article key={task.id}><header><b>{archiveTaskLabel(task.title)}</b><span className={task.status.toLowerCase()}>{task.status === 'QUEUED' ? '대기열' : '진행 중'}</span></header><p>{events.at(-1)?.message ?? 'PM이 작업을 접수했습니다.'}</p><div>{stages.map((stage, index) => <i className={index < currentIndex ? 'done' : stage === current && task.status === 'RUNNING' ? 'current' : ''} key={stage} title={stage}/>)}</div></article> })}</div> : <p className="empty-state">진행 중이거나 대기 중인 작업이 없습니다.</p>}</aside>
}

const TRADING_PERIOD_DAYS: Record<TradingPeriod, number | null> = { all: null, month: 30, week: 7, day: 1 }
const TRADING_PERIOD_LABEL: Record<TradingPeriod, string> = { all: '전체', month: '월간', week: '주간', day: '일간' }
const TRADING_PERIOD_ORDER: TradingPeriod[] = ['day', 'week', 'month', 'all']

function tradingPeriodPnl(data: TradingState, period: TradingPeriod): number {
  const days = TRADING_PERIOD_DAYS[period]
  if (days === null || data.equityHistory.length === 0) return data.totalPnlUsdt
  const cutoff = Date.now() - days * 86400000
  const baseline = [...data.equityHistory].reverse().find(point => new Date(point.ts).getTime() <= cutoff)
  return data.totalPnlUsdt - (baseline ? baseline.totalPnlUsdt : 0)
}

/** 여러 봇의 equity_history 필드명이 제각각(totalPnlUsdt/Krw/Usd)이라, 각 봇 쪽에서 {ts, value}로
 * 정규화한 뒤 이 두 헬퍼(기간 필터링, 라인차트 렌더링)를 공유해서 쓴다. */
function filterChartPoints(points: ChartPoint[], period: TradingPeriod): ChartPoint[] {
  const days = TRADING_PERIOD_DAYS[period]
  if (days === null) return points
  const cutoff = Date.now() - days * 86400000
  return points.filter(point => new Date(point.ts).getTime() >= cutoff)
}

function EquityLineChart({ points, formatValue }: { points: ChartPoint[]; formatValue: (value: number) => string }) {
  if (points.length < 2) return <p className="empty-state">아직 표시할 데이터가 부족합니다.</p>
  const width = 640
  const height = 150
  const padding = 6
  const values = points.map(point => point.value)
  const min = Math.min(...values, 0)
  const max = Math.max(...values, 0)
  const range = max - min || 1
  const xStep = (width - padding * 2) / (points.length - 1)
  const toY = (value: number) => height - padding - ((value - min) / range) * (height - padding * 2)
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${(padding + index * xStep).toFixed(2)} ${toY(point.value).toFixed(2)}`).join(' ')
  const zeroY = toY(0)
  const last = points[points.length - 1].value
  return <div className="chart-wrap">
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="line-chart">
      <line x1={padding} y1={zeroY} x2={width - padding} y2={zeroY} className="chart-zero-line"/>
      <path d={path} className={`chart-line ${last >= 0 ? 'positive' : 'negative'}`} fill="none"/>
    </svg>
    <div className="chart-range"><span>{formatValue(max)}</span><span>{formatValue(min)}</span></div>
  </div>
}

function PeriodTabs({ period, onChange }: { period: TradingPeriod; onChange: (value: TradingPeriod) => void }) {
  return <div className="period-tabs">{TRADING_PERIOD_ORDER.map(value => <button key={value} className={period === value ? 'active' : ''} onClick={() => onChange(value)}>{TRADING_PERIOD_LABEL[value]}</button>)}</div>
}

/** 종목별 차트 섹션 — 심볼을 고르면 그 심볼의 시계열(가격 또는 손익)을 라인차트로 보여준다.
 * symbolSeries는 각 봇의 position_history를 {ts, value}로 미리 정규화해서 넘긴다. */
function PositionHistorySection({ symbolSeries, formatValue }: { symbolSeries: Record<string, ChartPoint[]>; formatValue: (value: number) => string }) {
  const symbols = Object.keys(symbolSeries)
  const [selected, setSelected] = useState<string | null>(symbols[0] ?? null)
  useEffect(() => { if (selected === null || !symbols.includes(selected)) setSelected(symbols[0] ?? null) }, [symbols.join(',')])
  if (symbols.length === 0) return <p className="empty-state">아직 종목별 기록이 없습니다.</p>
  return <div className="position-history-section">
    <div className="source-actions">{symbols.map(symbol => <button key={symbol} className={selected === symbol ? 'source-add' : 'source-cancel'} onClick={() => setSelected(symbol)}>{symbol}</button>)}</div>
    {selected && <EquityLineChart points={symbolSeries[selected]} formatValue={formatValue}/>}
  </div>
}

function Wrap({ embedded, onClose, eyebrow, title, children }: { embedded?: boolean; onClose: () => void; eyebrow: string; title: string; children: React.ReactNode }) {
  if (embedded) return <div className="trading-dashboard-embedded">{children}</div>
  return <aside className="side-modal trading-dashboard" role="dialog" aria-modal="true">
    <div className="sheet-header"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div><button className="sheet-close" onClick={onClose}><X size={18}/></button></div>
    {children}
  </aside>
}

function TradingDashboard({ onClose, embedded }: { onClose: () => void; embedded?: boolean }) {
  const [data, setData] = useState<TradingState | null>(null)
  const [period, setPeriod] = useState<TradingPeriod>('all')
  useEffect(() => {
    const load = () => { if (!document.hidden) fetch('/api/trading/state', { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(setData) }
    load()
    const timer = window.setInterval(load, 30000)
    return () => window.clearInterval(timer)
  }, [])
  const fmt = (value: string) => new Date(value).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  const fmtDate = (value: string) => new Date(value).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
  const positions = data ? Object.entries(data.positions) : []
  const openNotional = positions.reduce((sum, [, p]) => sum + p.notionalUsdt, 0)
  const periodPnl = data ? tradingPeriodPnl(data, period) : 0
  const periodReturnPct = data && data.totalCapitalUsdt > 0 ? (periodPnl / data.totalCapitalUsdt) * 100 : 0
  const chartPoints: ChartPoint[] = data ? filterChartPoints(data.equityHistory.map(point => ({ ts: point.ts, value: point.totalPnlUsdt })), period) : []
  const symbolSeries: Record<string, ChartPoint[]> = data ? Object.fromEntries(Object.entries(data.positionHistory).map(([symbol, points]) => [symbol, points.map(point => ({ ts: point.ts, value: point.unrealizedPnlUsdt }))])) : {}
  return <Wrap embedded={embedded} onClose={onClose} eyebrow="TRADER Q" title="트레이딩 대시보드">
    <p className="source-intro">바이낸스 실계좌 실거래 현황입니다. 실제 자금이 투입되며, 총 자본은 매 사이클 실제 잔고를 조회해 동적으로 산정됩니다 — 펀딩비·현물/선물 체결가는 실거래소 실측치이며, 두 다리의 가격 괴리(베이시스)·슬리피지에서 나는 손익도 총 손익에 반영됩니다.</p>
    <div className="trading-status-card">
      <span className={`status-pill ${data?.tradingHalted ? 'halted' : ''}`}>{data?.tradingHalted ? '⚠ 손실 한도로 중지됨' : '가동 중 · 실거래'}</span>
      <p>전략: 펀딩비 차익거래(현물 롱 + 무기한선물 숏, ETH·XRP·DOGE) · 총 자본 ${data?.totalCapitalUsdt.toFixed(2) ?? '-'}</p>
      <p>시작일: {data?.inceptionTs ? fmtDate(data.inceptionTs) : '아직 시작 전'}</p>
    </div>
    {data?.tradingHalted && <p className="trading-halt-banner">누적 손실이 총 자본의 8%를 넘어 전 포지션을 자동 청산하고 신규 진입을 중지했습니다. 재개하려면 서버의 상태 파일을 수동으로 초기화해야 합니다.</p>}
    {data ? <>
      <PeriodTabs period={period} onChange={setPeriod}/>
      <div className="trading-metrics">
        <div><b className={periodReturnPct >= 0 ? 'positive' : 'negative'}>{periodReturnPct >= 0 ? '+' : ''}{periodReturnPct.toFixed(2)}%</b><span>{TRADING_PERIOD_LABEL[period]} 수익률</span></div>
        <div><b>${periodPnl.toFixed(2)}</b><span>{TRADING_PERIOD_LABEL[period]} 손익</span></div>
        <div><b>{positions.length}</b><span>보유 종목</span></div>
        <div><b>${openNotional.toFixed(2)}</b><span>매수 금액(진입시점 기준)</span></div>
      </div>
      <EquityLineChart points={chartPoints} formatValue={value => `$${value.toFixed(2)}`}/>
      <p className="usage-note">매수 금액은 각 포지션이 진입한 시점의 노셔널로 고정됩니다 — 청산 전까지 재조정하지 않으므로(왕복수수료 절감), 총 자본이 늘어도 이미 보유중인 포지션의 금액은 그대로입니다. 신규 진입/재진입 시에만 그 시점의 총 자본 기준으로 다시 계산됩니다.</p>
      <div className="usage-table">
        <b>보유 포지션 ({positions.length})</b>
        {positions.length === 0 ? <p className="empty-state">현재 보유 중인 포지션이 없습니다.</p> : positions.map(([symbol, p]) => {
          const netPnl = p.accruedFundingUsdt + p.unrealizedPricePnlUsdt - p.entryFeeUsdt
          const returnPct = p.notionalUsdt > 0 ? (netPnl / p.notionalUsdt) * 100 : 0
          return <article key={symbol}><b>{symbol}</b> <span className={returnPct >= 0 ? 'positive' : 'negative'}>{returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}%</span><span>진입가 현물 {p.entrySpotPrice || p.entryPrice} / 선물 {p.entryPerpPrice || p.entryPrice} · 수량 {p.amount.toFixed(4)}</span><small>누적 펀딩수취 ${p.accruedFundingUsdt.toFixed(2)} · 미실현 가격손익 ${p.unrealizedPricePnlUsdt.toFixed(2)} · 진입수수료 ${p.entryFeeUsdt.toFixed(2)} · 순손익 ${netPnl.toFixed(2)}</small></article>
        })}
      </div>
      <b className="chart-section-title">종목별 미실현손익 추이</b>
      <PositionHistorySection symbolSeries={symbolSeries} formatValue={value => `$${value.toFixed(2)}`}/>
      <div className="usage-table">
        <b>최근 로그</b>
        {data.tradeLog.length === 0 ? <p className="empty-state">아직 기록이 없습니다.</p> : data.tradeLog.slice(-15).reverse().map((entry, index) => <article key={index}><span>{fmt(entry.ts)}</span><small>{entry.message}</small></article>)}
      </div>
      <p className="usage-note">누적 펀딩수취 ${data.cumulativeFundingUsdt.toFixed(2)} · 누적 가격손익(베이시스/슬리피지) ${data.cumulativePricePnlUsdt.toFixed(2)} · 미실현 가격손익 ${data.unrealizedPricePnlUsdt.toFixed(2)} · 누적 수수료 ${data.cumulativeFeeUsdt.toFixed(2)} · 전체 누적 순손익 ${data.totalPnlUsdt.toFixed(2)} · 30초마다 자동 새로고침됩니다.</p>
    </> : <p className="empty-state">상태를 불러오는 중…</p>}
  </Wrap>
}

function KrTradingDashboard({ onClose, embedded }: { onClose: () => void; embedded?: boolean }) {
  const [data, setData] = useState<KrTradingState | null>(null)
  const [period, setPeriod] = useState<TradingPeriod>('all')
  useEffect(() => {
    const load = () => { if (!document.hidden) fetch('/api/trading/kr/state', { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(setData) }
    load()
    const timer = window.setInterval(load, 30000)
    return () => window.clearInterval(timer)
  }, [])
  const fmt = (value: string) => new Date(value).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  const positions = data ? Object.entries(data.stopPrice) : []
  const chartPoints: ChartPoint[] = data ? filterChartPoints(data.equityHistory.map(point => ({ ts: point.ts, value: point.totalPnlKrw })), period) : []
  const symbolSeries: Record<string, ChartPoint[]> = data ? Object.fromEntries(Object.entries(data.positionHistory).map(([symbol, points]) => [symbol, points.map(point => ({ ts: point.ts, value: point.unrealizedPnlKrw }))])) : {}
  return <Wrap embedded={embedded} onClose={onClose} eyebrow="TRADER Q" title="국장 스윙 대시보드">
    <p className="source-intro">한국투자증권 모의투자(국내주식) 스윙 자동매매 현황입니다. EMA9/21 골든크로스 + SMA200 필터 · 장마감후 일일스캔 + 장중 분단위 손절체크(-2%) 이중주기로 동작합니다.</p>
    <div className="trading-status-card">
      <span className="status-pill">가동 중 · 모의투자</span>
      <p>예산: 500만원 기준 + 누적 실현손익 {data ? `${data.realizedPnlKrw >= 0 ? '+' : ''}${data.realizedPnlKrw.toLocaleString()}원` : '-'} (벌면 늘고 잃으면 줄어듦)</p>
      <p>마지막 스캔일: {data?.lastScanDate ?? '아직 없음'}</p>
    </div>
    {data ? <>
      <PeriodTabs period={period} onChange={setPeriod}/>
      <div className="trading-metrics">
        <div><b>{positions.length}</b><span>보유 종목</span></div>
        <div><b>{data.pendingEntries.length}</b><span>진입 대기</span></div>
        <div><b>{data.pendingExits.length}</b><span>청산 대기</span></div>
      </div>
      <EquityLineChart points={chartPoints} formatValue={value => `${value.toLocaleString()}원`}/>
      <div className="usage-table">
        <b>보유 포지션 ({positions.length})</b>
        {positions.length === 0 ? <p className="empty-state">현재 보유 중인 포지션이 없습니다.</p> : positions.map(([symbol, stop]) => <article key={symbol}><b>{symbol}</b><span>손절가 {stop.toLocaleString()}원</span></article>)}
      </div>
      {(data.pendingEntries.length > 0 || data.pendingExits.length > 0) && <div className="usage-table">
        <b>매매 대기열</b>
        {data.pendingEntries.map(symbol => <article key={`entry-${symbol}`}><b>{symbol}</b><span>진입 대기 (다음 장시작에 매수)</span></article>)}
        {data.pendingExits.map(symbol => <article key={`exit-${symbol}`}><b>{symbol}</b><span>청산 대기 (다음 장시작에 매도)</span></article>)}
      </div>}
      <b className="chart-section-title">종목별 미실현손익 추이</b>
      <PositionHistorySection symbolSeries={symbolSeries} formatValue={value => `${value.toLocaleString()}원`}/>
      <div className="usage-table">
        <b>최근 로그</b>
        {data.tradeLog.length === 0 ? <p className="empty-state">아직 기록이 없습니다.</p> : data.tradeLog.slice(-15).reverse().map((entry, index) => <article key={index}><span>{fmt(entry.ts)}</span><small>{entry.message}</small></article>)}
      </div>
      <p className="usage-note">30초마다 자동 새로고침됩니다.</p>
    </> : <p className="empty-state">상태를 불러오는 중…</p>}
  </Wrap>
}

function UsTradingDashboard({ onClose, embedded }: { onClose: () => void; embedded?: boolean }) {
  const [data, setData] = useState<UsTradingState | null>(null)
  const [period, setPeriod] = useState<TradingPeriod>('all')
  useEffect(() => {
    const load = () => { if (!document.hidden) fetch('/api/trading/us/state', { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(setData) }
    load()
    const timer = window.setInterval(load, 30000)
    return () => window.clearInterval(timer)
  }, [])
  const fmt = (value: string) => new Date(value).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  const positions = data ? Object.entries(data.stopPrice) : []
  const chartPoints: ChartPoint[] = data ? filterChartPoints(data.equityHistory.map(point => ({ ts: point.ts, value: point.totalPnlUsd })), period) : []
  const symbolSeries: Record<string, ChartPoint[]> = data ? Object.fromEntries(Object.entries(data.positionHistory).map(([symbol, points]) => [symbol, points.map(point => ({ ts: point.ts, value: point.unrealizedPnlUsd }))])) : {}
  return <Wrap embedded={embedded} onClose={onClose} eyebrow="TRADER Q" title="미장 스윙 대시보드">
    <p className="source-intro">한국투자증권 모의투자(미국주식) 스윙 자동매매 현황입니다. 국장과 동일 전략(EMA9/21 골든크로스 + SMA200 필터), 미국 동부시간 기준 이중주기로 동작합니다. 모의투자는 지정가만 가능해 즉시체결용 마켓터블 리밋(±1%)으로 주문합니다.</p>
    <div className="trading-status-card">
      <span className="status-pill">가동 중 · 모의투자</span>
      <p>예산: 500만원(환산 약 ${(5_000_000/1400).toFixed(0)}) 기준 + 누적 실현손익 {data ? `${data.realizedPnlUsd >= 0 ? '+' : ''}$${data.realizedPnlUsd.toFixed(2)}` : '-'}</p>
      <p>마지막 스캔일(ET): {data?.lastScanDate ?? '아직 없음'}</p>
    </div>
    {data ? <>
      <PeriodTabs period={period} onChange={setPeriod}/>
      <div className="trading-metrics">
        <div><b>{positions.length}</b><span>보유 종목</span></div>
        <div><b>{data.pendingEntries.length}</b><span>진입 대기</span></div>
        <div><b>{data.pendingExits.length}</b><span>청산 대기</span></div>
      </div>
      <EquityLineChart points={chartPoints} formatValue={value => `$${value.toFixed(2)}`}/>
      <div className="usage-table">
        <b>보유 포지션 ({positions.length})</b>
        {positions.length === 0 ? <p className="empty-state">현재 보유 중인 포지션이 없습니다.</p> : positions.map(([symbol, stop]) => <article key={symbol}><b>{symbol}</b><span>손절가 ${stop.toFixed(2)}</span></article>)}
      </div>
      {(data.pendingEntries.length > 0 || data.pendingExits.length > 0) && <div className="usage-table">
        <b>매매 대기열</b>
        {data.pendingEntries.map(symbol => <article key={`entry-${symbol}`}><b>{symbol}</b><span>진입 대기 (다음 장시작에 매수)</span></article>)}
        {data.pendingExits.map(symbol => <article key={`exit-${symbol}`}><b>{symbol}</b><span>청산 대기 (다음 장시작에 매도)</span></article>)}
      </div>}
      <b className="chart-section-title">종목별 미실현손익 추이</b>
      <PositionHistorySection symbolSeries={symbolSeries} formatValue={value => `$${value.toFixed(2)}`}/>
      <div className="usage-table">
        <b>최근 로그</b>
        {data.tradeLog.length === 0 ? <p className="empty-state">아직 기록이 없습니다.</p> : data.tradeLog.slice(-15).reverse().map((entry, index) => <article key={index}><span>{fmt(entry.ts)}</span><small>{entry.message}</small></article>)}
      </div>
      <p className="usage-note">30초마다 자동 새로고침됩니다.</p>
    </> : <p className="empty-state">상태를 불러오는 중…</p>}
  </Wrap>
}

function MomentumRotationDashboard({ onClose, embedded }: { onClose: () => void; embedded?: boolean }) {
  const [data, setData] = useState<MomentumRotationState | null>(null)
  const [period, setPeriod] = useState<TradingPeriod>('all')
  useEffect(() => {
    const load = () => { if (!document.hidden) fetch('/api/trading/momentum-rotation/state', { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(setData) }
    load()
    const timer = window.setInterval(load, 30000)
    return () => window.clearInterval(timer)
  }, [])
  const fmt = (value: string) => new Date(value).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  const positions = data ? Object.entries(data.positions) : []
  const longs = positions.filter(([, p]) => p.side === 'long')
  const shorts = positions.filter(([, p]) => p.side === 'short')
  const totalPnl = data ? data.cumulativeRealizedPnlUsdt + data.unrealizedPnlUsdt - data.cumulativeFeeUsdt : 0
  const chartPoints: ChartPoint[] = data ? filterChartPoints(data.equityHistory.map(point => ({ ts: point.ts, value: point.totalPnlUsdt })), period) : []
  const symbolSeries: Record<string, ChartPoint[]> = data ? Object.fromEntries(Object.entries(data.positionHistory).map(([symbol, points]) => [symbol, points.map(point => ({ ts: point.ts, value: point.unrealizedPnlUsdt }))])) : {}
  return <Wrap embedded={embedded} onClose={onClose} eyebrow="TRADER Q" title="모멘텀 로테이션 대시보드">
    <p className="source-intro">코인 선물 상대모멘텀 롱숏 로테이션 백테스트(페이퍼) 현황입니다. 실주문 없음 — 가상자본으로 시뮬레이션만 진행합니다. 48종목 중 14일 모멘텀 상위 8개 롱 / 하위 8개 숏, 3일마다 리밸런스(백테스트 검증: 연환산 29.16%, MDD 18.6%).</p>
    <div className="trading-status-card">
      <span className="status-pill">가동 중 · 백테스트(페이퍼)</span>
      <p>가상자본 기준 누적 손익 {data ? `${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}` : '-'} (실현 {data ? data.cumulativeRealizedPnlUsdt.toFixed(2) : '-'} + 미실현 {data ? data.unrealizedPnlUsdt.toFixed(2) : '-'} - 수수료 {data ? data.cumulativeFeeUsdt.toFixed(2) : '-'})</p>
      <p>마지막 리밸런스: {data?.lastRebalanceTs ? fmt(data.lastRebalanceTs) : '아직 없음'}</p>
    </div>
    {data ? <>
      <PeriodTabs period={period} onChange={setPeriod}/>
      <div className="trading-metrics">
        <div><b>{longs.length}</b><span>롱 포지션</span></div>
        <div><b>{shorts.length}</b><span>숏 포지션</span></div>
        <div><b>${data.equityUsdt.toFixed(0)}</b><span>현재 자본</span></div>
      </div>
      <EquityLineChart points={chartPoints} formatValue={value => `$${value.toFixed(2)}`}/>
      <div className="usage-table">
        <b>롱 ({longs.length})</b>
        {longs.length === 0 ? <p className="empty-state">없음</p> : longs.map(([symbol, p]) => {
          const returnPct = p.notionalUsdt ? (p.unrealizedPnlUsdt / p.notionalUsdt) * 100 : 0
          return <article key={symbol}><b>{symbol}</b><span className={returnPct >= 0 ? 'positive' : 'negative'}>{returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}% (${p.unrealizedPnlUsdt.toFixed(2)})</span></article>
        })}
      </div>
      <div className="usage-table">
        <b>숏 ({shorts.length})</b>
        {shorts.length === 0 ? <p className="empty-state">없음</p> : shorts.map(([symbol, p]) => {
          const returnPct = p.notionalUsdt ? (p.unrealizedPnlUsdt / p.notionalUsdt) * 100 : 0
          return <article key={symbol}><b>{symbol}</b><span className={returnPct >= 0 ? 'positive' : 'negative'}>{returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}% (${p.unrealizedPnlUsdt.toFixed(2)})</span></article>
        })}
      </div>
      <b className="chart-section-title">종목별 미실현손익 추이</b>
      <PositionHistorySection symbolSeries={symbolSeries} formatValue={value => `$${value.toFixed(2)}`}/>
      <div className="usage-table">
        <b>최근 로그</b>
        {data.tradeLog.length === 0 ? <p className="empty-state">아직 기록이 없습니다.</p> : data.tradeLog.slice(-15).reverse().map((entry, index) => <article key={index}><span>{fmt(entry.ts)}</span><small>{entry.message}</small></article>)}
      </div>
      <p className="usage-note">30초마다 자동 새로고침됩니다. 실주문 없는 백테스트 시뮬레이션이며 실계좌와 무관합니다.</p>
    </> : <p className="empty-state">상태를 불러오는 중…</p>}
  </Wrap>
}

function TrxTradingDashboard({ onClose, embedded }: { onClose: () => void; embedded?: boolean }) {
  const [data, setData] = useState<TrxTradingState | null>(null)
  const [period, setPeriod] = useState<TradingPeriod>('all')
  useEffect(() => {
    const load = () => { if (!document.hidden) fetch('/api/trading/trx/state', { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(setData) }
    load()
    const timer = window.setInterval(load, 30000)
    return () => window.clearInterval(timer)
  }, [])
  const fmt = (value: string) => new Date(value).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  const fmtDate = (value: string) => new Date(value).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
  const netPnl = data ? data.cumulativeRealizedPnlUsdt - data.cumulativeFeeUsdt : 0
  const chartPoints: ChartPoint[] = data ? filterChartPoints(data.equityHistory.map(point => ({ ts: point.ts, value: point.totalPnlUsdt })), period) : []
  const symbolSeries: Record<string, ChartPoint[]> = data ? Object.fromEntries(Object.entries(data.positionHistory).map(([symbol, points]) => [symbol, points.map(point => ({ ts: point.ts, value: point.unrealizedPnlUsdt }))])) : {}
  return <Wrap embedded={embedded} onClose={onClose} eyebrow="TRADER Q" title="TRX 스윙 대시보드">
    <p className="source-intro">바이낸스 실계좌 임시 전략입니다. 펀딩비 차익거래 신규진입을 막아 자연청산시킨 자금을 이어받아, EMA9/21 골든크로스 진입 + 고정 -12% 손절 규칙으로만 거래합니다(분할매수·익절 없음, 백테스트 검증: 연환산 39.53%).</p>
    <div className="trading-status-card">
      <span className="status-pill">{data?.position ? '보유 중' : '관망 · 골든크로스 대기중'}</span>
      <p>누적 실현손익 {data ? `${netPnl >= 0 ? '+' : ''}$${netPnl.toFixed(2)}` : '-'} (실현 {data ? data.cumulativeRealizedPnlUsdt.toFixed(2) : '-'} - 수수료 {data ? data.cumulativeFeeUsdt.toFixed(2) : '-'})</p>
      <p>시작일: {data?.inceptionTs ? fmtDate(data.inceptionTs) : '아직 시작 전'}</p>
    </div>
    {data ? <>
      <PeriodTabs period={period} onChange={setPeriod}/>
      <EquityLineChart points={chartPoints} formatValue={value => `$${value.toFixed(2)}`}/>
      <div className="usage-table">
        <b>보유 포지션</b>
        {data.position ? <article><b>TRX</b><span>진입가 ${data.position.entryPrice} · 수량 {data.position.qty.toFixed(2)}</span><small>노셔널 ${data.position.notionalUsdt.toFixed(2)} · 진입수수료 ${data.position.entryFeeUsdt.toFixed(2)} · 손절가 ${(data.position.entryPrice * 0.88).toFixed(5)}</small></article> : <p className="empty-state">현재 보유 중인 포지션이 없습니다.</p>}
      </div>
      <b className="chart-section-title">종목별 미실현손익 추이</b>
      <PositionHistorySection symbolSeries={symbolSeries} formatValue={value => `$${value.toFixed(2)}`}/>
      <div className="usage-table">
        <b>최근 로그</b>
        {data.tradeLog.length === 0 ? <p className="empty-state">아직 기록이 없습니다.</p> : data.tradeLog.slice(-15).reverse().map((entry, index) => <article key={index}><span>{fmt(entry.ts)}</span><small>{entry.message}</small></article>)}
      </div>
      <p className="usage-note">30초마다 자동 새로고침됩니다.</p>
    </> : <p className="empty-state">상태를 불러오는 중…</p>}
  </Wrap>
}

type RealTradingTab = 'trading' | 'trx-trading'
type PaperTradingTab = 'kr-trading' | 'us-trading' | 'momentum-rotation-trading'

function RealTradingHub({ onClose, initialTab }: { onClose: () => void; initialTab: RealTradingTab }) {
  const [tab, setTab] = useState<RealTradingTab>(initialTab)
  useEffect(() => setTab(initialTab), [initialTab])
  return <aside className="file-explorer trading-hub" role="dialog" aria-modal="true">
    <div className="sheet-header"><div><p className="eyebrow">TRADER Q</p><h2>실물투자</h2></div><button className="sheet-close" onClick={onClose}><X size={18}/></button></div>
    <div className="explorer-body">
      <nav className="explorer-sidebar">
        <div className="file-list">
          <button className={tab === 'trading' ? 'active' : ''} onClick={() => setTab('trading')}><TrendingUp size={16}/><span><b>펀딩비 차익거래</b><small>바이낸스 실계좌</small></span></button>
          <button className={tab === 'trx-trading' ? 'active' : ''} onClick={() => setTab('trx-trading')}><TrendingUp size={16}/><span><b>TRX 스윙</b><small>바이낸스 실계좌</small></span></button>
        </div>
      </nav>
      <div className="explorer-preview">
        {tab === 'trading' && <TradingDashboard embedded onClose={onClose}/>}
        {tab === 'trx-trading' && <TrxTradingDashboard embedded onClose={onClose}/>}
      </div>
    </div>
  </aside>
}

function PaperTradingHub({ onClose, initialTab }: { onClose: () => void; initialTab: PaperTradingTab }) {
  const [tab, setTab] = useState<PaperTradingTab>(initialTab)
  useEffect(() => setTab(initialTab), [initialTab])
  return <aside className="file-explorer trading-hub" role="dialog" aria-modal="true">
    <div className="sheet-header"><div><p className="eyebrow">TRADER Q</p><h2>모의투자</h2></div><button className="sheet-close" onClick={onClose}><X size={18}/></button></div>
    <div className="explorer-body">
      <nav className="explorer-sidebar">
        <div className="file-list">
          <button className={tab === 'kr-trading' ? 'active' : ''} onClick={() => setTab('kr-trading')}><Landmark size={16}/><span><b>국장 스윙</b><small>한투 모의투자</small></span></button>
          <button className={tab === 'us-trading' ? 'active' : ''} onClick={() => setTab('us-trading')}><Globe2 size={16}/><span><b>미장 스윙</b><small>한투 모의투자</small></span></button>
          <button className={tab === 'momentum-rotation-trading' ? 'active' : ''} onClick={() => setTab('momentum-rotation-trading')}><TrendingUp size={16}/><span><b>모멘텀 로테이션</b><small>백테스트(페이퍼)</small></span></button>
        </div>
      </nav>
      <div className="explorer-preview">
        {tab === 'kr-trading' && <KrTradingDashboard embedded onClose={onClose}/>}
        {tab === 'us-trading' && <UsTradingDashboard embedded onClose={onClose}/>}
        {tab === 'momentum-rotation-trading' && <MomentumRotationDashboard embedded onClose={onClose}/>}
      </div>
    </div>
  </aside>
}

function SecurityCalendarModal({ onClose }: { onClose: () => void }) {
  const [cursor, setCursor] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1) })
  const [entries, setEntries] = useState<SecurityCalendarEntry[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [timeline, setTimeline] = useState<SecurityCalendarTimelineEntry[]>([])
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const monthKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
  useEffect(() => {
    setSelectedDate(null)
    fetch(`/api/security-calendar?month=${monthKey}`, { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setEntries)
  }, [monthKey])
  useEffect(() => { fetch('/api/security-calendar/timeline', { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setTimeline) }, [])
  const toggleExpanded = (id: string) => setExpandedIds(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const byDate = entries.reduce<Record<string, SecurityCalendarEntry[]>>((acc, entry) => { (acc[entry.eventDate] ??= []).push(entry); return acc }, {})
  const firstWeekday = new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay()
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  const dayKey = (day: number) => `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const selectedEntries = selectedDate ? byDate[selectedDate] ?? [] : entries
  return <aside className="side-modal calendar-modal" role="dialog" aria-modal="true">
    <div className="sheet-header"><div><p className="eyebrow">SECURITY OPS</p><h2>보안 캘린더</h2></div><button className="sheet-close" onClick={onClose}><X size={18}/></button></div>
    <p className="source-intro">수집된 사이트 원문에서 AI가 날짜가 명시된 행사·세미나·피해사고만 자동으로 골라 기록합니다.</p>
    <div className="calendar-legend"><span><i className="calendar-dot event"/> 행사</span><span><i className="calendar-dot seminar"/> 세미나</span><span><i className="calendar-dot incident"/> 피해사고</span></div>
    <div className="calendar-nav">
      <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft size={16}/></button>
      <b>{cursor.getFullYear()}년 {cursor.getMonth() + 1}월</b>
      <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight size={16}/></button>
    </div>
    <div className="calendar-grid">
      {['일', '월', '화', '수', '목', '금', '토'].map(label => <span className="calendar-weekday" key={label}>{label}</span>)}
      {cells.map((day, index) => {
        if (day === null) return <span className="calendar-cell empty" key={index}/>
        const key = dayKey(day)
        const dayEntries = byDate[key] ?? []
        return <button key={index} className={`calendar-cell ${selectedDate === key ? 'active' : ''}`} onClick={() => setSelectedDate(selectedDate === key ? null : key)}>
          <span>{day}</span>
          <span className="calendar-dots">{dayEntries.slice(0, 3).map(entry => <i key={entry.id} className={`calendar-dot ${entry.category.toLowerCase()}`}/>)}</span>
        </button>
      })}
    </div>
    <div className="usage-table calendar-entries">
      <b>{selectedDate ? `${selectedDate} 일정 (${selectedEntries.length})` : `이번 달 전체 (${entries.length})`}</b>
      {selectedEntries.length === 0 ? <p className="empty-state">기록된 일정이 없습니다.</p> : selectedEntries.map(entry => <article key={entry.id}>
        <span className={`calendar-badge ${entry.category.toLowerCase()}`}>{CALENDAR_CATEGORY_LABEL[entry.category]}</span>
        <b>{entry.title}</b>
        <span>{entry.eventDate}{entry.sourceName ? ` · ${entry.sourceName}` : ''}</span>
        <small>{entry.summary}</small>
      </article>)}
    </div>
    <div className="calendar-timeline">
      <b>최근 업데이트순 타임라인</b>
      <p className="source-intro small">후속 소식이 들어오면 원래 자리 대신 맨 위로 다시 올라옵니다.</p>
      {timeline.length === 0 ? <p className="empty-state">아직 기록된 사고·행사·세미나가 없습니다.</p> : timeline.map(item => {
        const expanded = expandedIds.has(item.event.id)
        const latest = item.updates.at(-1)
        return <article key={item.event.id} className="timeline-card">
          <div className="timeline-card-head">
            <span className={`calendar-badge ${item.event.category.toLowerCase()}`}>{CALENDAR_CATEGORY_LABEL[item.event.category]}</span>
            <b>{item.event.title}</b>
            <span className="timeline-updated">최근 업데이트 {item.event.lastUpdatedDate}</span>
          </div>
          <small>{latest ? latest.summary : item.event.summary}</small>
          {item.updates.length > 0 && <button className="timeline-toggle" onClick={() => toggleExpanded(item.event.id)}>{expanded ? '이전 내용 접기' : `이전 업데이트 ${item.updates.length}건 보기`}</button>}
          {expanded && <div className="timeline-history">
            <p><span className="timeline-history-date">{item.event.eventDate}</span> {item.event.summary}</p>
            {item.updates.map((update, index) => <p key={index}><span className="timeline-history-date">{update.updateDate}</span> {update.summary}</p>)}
          </div>}
        </article>
      })}
    </div>
  </aside>
}

export function App() {
  const [session, setSession] = useState<Session | null>(null); const [sessionChecked, setSessionChecked] = useState(false); const [entered, setEntered] = useState(false); const [selected, setSelected] = useState<Agent | null>(null); const [chatOpen, setChatOpen] = useState(true); const [panel, setPanel] = useState<Panel>(null); const [archivedCount, setArchivedCount] = useState(0); const [budgetExceeded, setBudgetExceeded] = useState(false); const [recentTasks, setRecentTasks] = useState<Task[]>([]); const [taskTracks, setTaskTracks] = useState<Record<string, TaskEvent[]>>({}); const [chatInput, setChatInput] = useState(''); const [taskDomain, setTaskDomain] = useState<'SECURITY' | 'ECONOMY' | 'GENERAL'>('SECURITY'); const [activeTask, setActiveTask] = useState<Task | null>(null); const [taskEvents, setTaskEvents] = useState<TaskEvent[]>([]); const [chatError, setChatError] = useState(''); const [uploading, setUploading] = useState(false); const [sidebarCollapsed, setSidebarCollapsed] = useState(false); const [updateAvailable, setUpdateAvailable] = useState(false); const [notices, setNotices] = useState<Notice[]>([]); const [pendingCandidates, setPendingCandidates] = useState(0); const [officeView, setOfficeView] = useState<'office' | 'dashboard'>(() => readCookie('orchestration-view') === 'dashboard' ? 'dashboard' : 'office'); const [pendingFilePath, setPendingFilePath] = useState<string | null>(null); const [loginError, setLoginError] = useState(''); const [loggingIn, setLoggingIn] = useState(false)
  const { items: todoItems, add: addTodo, toggle: toggleTodo } = useTodos()
  const notify = (kind: Notice['kind'], message: string) => { const id = crypto.randomUUID(); setNotices(previous => [...previous, { id, kind, message }].slice(-5)); window.setTimeout(() => setNotices(previous => previous.filter(notice => notice.id !== id)), 7000) }
  const dismissNotice = (id: string) => setNotices(previous => previous.filter(notice => notice.id !== id))
  const taskStatusRef = useRef<Record<string, Task['status']>>({})
  const activeTaskIdRef = useRef<string | null>(null)
  useEffect(() => { activeTaskIdRef.current = activeTask?.id ?? null }, [activeTask?.id])
  const candidateCountRef = useRef<number | null>(null)
  // panel (side-modal) and selected (agent detail sheet) are both right-side overlays with the same fixed
  // positioning — if both were left independently settable, opening one while the other was already open
  // rendered two overlapping asides at once. openPanel/openAgent keep the two mutually exclusive.
  const openPanel = (next: Panel) => { setSelected(null); setPanel(next) }
  const openAgent = (agent: Agent) => { setPanel(null); setSelected(agent) }
  const openFileInExplorer = (path: string) => { setPendingFilePath(path); openPanel('files') }
  const chatBodyRef = useRef<HTMLDivElement>(null); const stickToBottom = useRef(true); const fileInputRef = useRef<HTMLInputElement>(null)
  const floatingPmFormRef = useRef<HTMLFormElement>(null); const floatingPmTextareaRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { if (chatInput === '' && floatingPmTextareaRef.current) floatingPmTextareaRef.current.style.height = 'auto' }, [chatInput])
  const onFloatingChatKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); floatingPmFormRef.current?.requestSubmit() }
  }
  const panelRef = useRef(panel); panelRef.current = panel
  const selectedRef = useRef(selected); selectedRef.current = selected
  useEffect(() => { writeCookie('orchestration-view', officeView) }, [officeView])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (selectedRef.current) setSelected(null)
      else if (panelRef.current) setPanel(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
  const homePosition = (agent: Agent) => ({ x: parseFloat(agent.left), y: parseFloat(agent.top) })
  // Not free-roaming: everyone sits at their own desk until it's their turn, then walks over to hand
  // the work to whoever is next in the chain, then returns to their desk. PM never leaves the meeting
  // room — staff report to the PM, not the other way around.
  // Each target sits a few points off the recipient's own desk coordinate (not on top of it) — landing on
  // the exact same (x%, y%) as the stationary recipient made the two agent buttons overlap pixel-for-pixel,
  // so whichever rendered later in the array buried the other's name label and "작업 중" message bubble.
  const deliveryTarget = (agentId: string, domain: Task['domain']): { x: number; y: number } => {
    const lead = domain === 'ECONOMY' ? { x: 70, y: 48 } : domain === 'GENERAL' ? { x: 56, y: 73 } : { x: 29, y: 48 }
    switch (agentId) {
      case 'security-scout': case 'economy-scout': case 'general-scout': return { x: 33, y: 66 } // approaching Review A's desk
      case 'review-a': return { x: 67, y: 66 } // approaching Review B's desk
      case 'review-b': return lead // approaching the domain lead's desk
      case 'security-lead': case 'economy-lead': case 'general-lead': return { x: 50, y: 36 } // approaching the PM's desk
      case 'archivist': return { x: 50, y: 36 } // approaching the PM to collect the finished report
      default: return { x: 50, y: 36 }
    }
  }
  // /api/files/intake-jobs is capped at the 20 most recent rows (findTop20ByOrderByDiscoveredAtDesc),
  // and it's the pending file-intake backlog anyway, not the archive — so items.length pinned at 20
  // forever once the backlog passed that size. The dock button opens ArchivePanel, so it should count
  // actual archived notes (/api/archive/files, uncapped) instead.
  const loadArchivedCount = () => fetch('/api/archive/files', { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(items => setArchivedCount(items.length)).catch(() => undefined)
  const loadBudgetStatus = () => fetch('/api/usage/summary?days=30', { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(data => { if (data) setBudgetExceeded(data.budgetExceeded) }).catch(() => undefined)
  const loadTasks = () => fetch('/api/tasks', { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setRecentTasks).catch(() => undefined)
  const loadCandidateCount = () => fetch('/api/source-candidates', { credentials: 'include' }).then(r => r.ok ? r.json() : []).then((items: SourceCandidateEntry[]) => {
    // Only notify on a genuine increase after the first load, so opening the app never fires a
    // notification for candidates that were already sitting there from a previous session.
    if (candidateCountRef.current !== null && items.length > candidateCountRef.current) notify('info', `AI가 새 출처 후보 ${items.length - candidateCountRef.current}건을 찾았습니다.`)
    candidateCountRef.current = items.length
    setPendingCandidates(items.length)
  }).catch(() => undefined)
  useEffect(() => { fetch('/api/auth/session', { credentials: 'include' }).then(r => r.json()).then(setSession).catch(() => setSession({ authenticationEnabled: false, user: { displayName: 'Developer', email: 'local', role: 'ADMIN' } })).finally(() => setSessionChecked(true)); loadArchivedCount(); loadTasks(); loadBudgetStatus(); loadCandidateCount(); const timer = window.setInterval(() => { if (!document.hidden) loadCandidateCount() }, 30000); return () => window.clearInterval(timer) }, [])
  useEffect(() => { if (session?.authenticationEnabled && session.user) setEntered(true) }, [session])
  const login = async (id: string, password: string) => {
    setLoggingIn(true); setLoginError('')
    const response = await fetch('/api/auth/login', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, password }) })
    setLoggingIn(false)
    if (!response.ok) { const body = await response.json().catch(() => null); setLoginError(body?.message ?? '로그인에 실패했습니다.'); return }
    setSession(await response.json()); setEntered(true)
  }
  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    window.location.reload()
  }
  const role: Role | null = session?.user?.role ?? null
  const isAdmin = role === 'ADMIN'
  // A forced reload the instant a new build appears used to yank away whatever panel the user had open
  // mid-session (every backend/frontend redeploy triggers this). Now it only reloads immediately if no
  // panel/agent sheet is open; otherwise it waits (see the effect below) until the user closes them.
  useEffect(() => { const check = async () => { if (document.hidden) return; try { const data = await fetch(`/build-info.json?at=${Date.now()}`, { cache: 'no-store' }).then(response => response.json()); const previous = sessionStorage.getItem('orchestration-build'); if (previous === data.buildId) return; sessionStorage.setItem('orchestration-build', data.buildId); if (!previous) return; if (!panelRef.current && !selectedRef.current) window.location.reload(); else setUpdateAvailable(true) } catch { /* 개발 중 임시 연결 실패는 무시 */ } }; void check(); const timer = window.setInterval(check, 5000); return () => window.clearInterval(timer) }, [])
  useEffect(() => { if (updateAvailable && !panel && !selected) window.location.reload() }, [updateAvailable, panel, selected])
  useEffect(() => { if (!activeTask || ['COMPLETED', 'FAILED', 'CANCELLED'].includes(activeTask.status)) return
    const polledId = activeTask.id
    const timer = window.setInterval(() => {
      if (document.hidden) return
      // Guard every apply against the id having moved on in the meantime -- without this, a response for
      // a question the user already left behind (after firing a second one) can arrive after the newer
      // task's state is already set and silently overwrite it with the stale task's data/events.
      fetch(`/api/tasks/${polledId}`, { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(task => { if (task && activeTaskIdRef.current === polledId) { setActiveTask(task); loadTasks(); if (task.status === 'COMPLETED') loadArchivedCount() } })
      fetch(`/api/tasks/${polledId}/events`, { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(events => { if (activeTaskIdRef.current === polledId) setTaskEvents(events) })
    }, 1800)
    return () => window.clearInterval(timer)
  }, [activeTask?.id, activeTask?.status])
  useEffect(() => { const refreshTracks = async () => { if (document.hidden) return; const tasks = await fetch('/api/tasks', { credentials: 'include' }).then(response => response.ok ? response.json() : []) as Task[]; setRecentTasks(tasks);
    // Only notify on a RUNNING/QUEUED -> COMPLETED/FAILED transition seen since the last poll, so the
    // first load after opening the app doesn't fire a notification for every already-finished task.
    const previousStatuses = taskStatusRef.current
    for (const task of tasks) {
      const previous = previousStatuses[task.id]
      if (previous && previous !== task.status && (task.status === 'COMPLETED' || task.status === 'FAILED')) {
        notify(task.status === 'COMPLETED' ? 'success' : 'error', `${archiveTaskLabel(task.title)} — ${task.status === 'COMPLETED' ? '완료' : '실패'}`)
      }
    }
    taskStatusRef.current = Object.fromEntries(tasks.map(task => [task.id, task.status]))
    const active = tasks.filter(task => task.status === 'RUNNING' || task.status === 'QUEUED')
    // events fetch가 일시적으로 실패해도(타임아웃/일시적 5xx) 프로그레스 바가 순간적으로 리셋되지 않도록,
    // 실패한 항목은 []로 덮어쓰지 않고 직전 폴링에서 받은 값을 그대로 유지한다.
    const pairs = await Promise.all(active.map(async task => [task.id, await fetch(`/api/tasks/${task.id}/events`, { credentials: 'include' }).then(response => response.ok ? response.json() as Promise<TaskEvent[]> : null)] as const))
    setTaskTracks(prev => Object.fromEntries(pairs.map(([id, events]) => [id, events ?? prev[id] ?? []]))) }; void refreshTracks(); const timer = window.setInterval(() => void refreshTracks(), 2000); return () => window.clearInterval(timer) }, [])
  useEffect(() => { const node = chatBodyRef.current; if (node && stickToBottom.current) node.scrollTop = node.scrollHeight }, [taskEvents, activeTask?.finalReport, activeTask?.failureReason])
  const submitTask = async (event: FormEvent) => { event.preventDefault(); const instruction = chatInput.trim(); if (!instruction) return; setChatError(''); setTaskEvents([]); stickToBottom.current = true; const response = await fetch('/api/tasks', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: instruction.slice(0, 80), instruction, domain: taskDomain }) }); if (!response.ok) { setChatError('작업 접수에 실패했습니다. API 상태와 모델 설정을 확인해 주세요.'); return } const task = await response.json() as Task; setActiveTask(task); setChatInput(''); setChatOpen(true); loadTasks(); fetch(`/api/tasks/${task.id}/events`, { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setTaskEvents) }
  // 잘못 지시했을 때 되돌릴 방법: 진행 중인 파이프라인 단계 사이사이에 취소 여부를 확인하게 해 두었으므로,
  // 지금 실행 중인 LLM 호출 하나는 끝까지 가더라도 다음 단계로는 넘어가지 않는다.
  const cancelTask = async (id: string) => {
    const response = await fetch(`/api/tasks/${id}/cancel`, { method: 'POST', credentials: 'include' })
    if (!response.ok) return
    setActiveTask(current => current && current.id === id ? { ...current, status: 'CANCELLED' } : current)
    loadTasks()
    fetch(`/api/tasks/${id}/events`, { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setTaskEvents)
  }
  const upload = async (fileList?: FileList | null) => {
    const files = fileList ? Array.from(fileList) : []
    if (files.length === 0) return
    setUploading(true); setChatError('')
    let failures = 0
    const taskIds: string[] = []
    for (const file of files) {
      const form = new FormData(); form.append('file', file)
      const response = await fetch('/api/files/upload', { method: 'POST', credentials: 'include', body: form })
      if (!response.ok) { failures++; continue }
      const uploaded = await response.json() as { analysisTaskId: string | null }
      if (uploaded.analysisTaskId) taskIds.push(uploaded.analysisTaskId)
    }
    setUploading(false); loadArchivedCount(); loadTasks()
    if (failures > 0) setChatError(`${files.length}개 중 ${failures}개 업로드에 실패했습니다. 50MB 이하 파일인지 확인해 주세요.`)
    if (taskIds.length === 0) { openPanel('archive'); return }
    if (taskIds.length > 1) { openPanel('processes'); return }
    const taskResponse = await fetch(`/api/tasks/${taskIds[0]}`, { credentials: 'include' })
    if (!taskResponse.ok) { openPanel('archive'); return }
    const task = await taskResponse.json() as Task
    setActiveTask(task); setTaskEvents([]); setPanel(null); setChatOpen(true); stickToBottom.current = true
    fetch(`/api/tasks/${task.id}/events`, { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setTaskEvents)
  }
  const latest = taskEvents.at(-1); const stageAgent: Record<string, string> = { COLLECT: activeTask?.domain === 'ECONOMY' ? 'economy-scout' : activeTask?.domain === 'GENERAL' ? 'general-scout' : 'security-scout', REVIEW_A: 'review-a', REVIEW_B: 'review-b', TEAM_LEAD: activeTask?.domain === 'ECONOMY' ? 'economy-lead' : activeTask?.domain === 'GENERAL' ? 'general-lead' : 'security-lead', PM: 'pm', ARCHIVE: 'archivist' }; const workingId = activeTask?.status === 'RUNNING' && latest ? stageAgent[latest.stage] : undefined
  if (!sessionChecked) return <div className="app-loading"/>
  if (!entered) return <LoginGate session={session} loginError={loginError} loggingIn={loggingIn} onEnter={() => setEntered(true)} onLogin={login} />
  return <main className={`workspace ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}><NotificationStack notices={notices} onDismiss={dismissNotice}/><TodoFloating items={todoItems} onAdd={addTodo} onToggle={toggleTodo}/>{sidebarCollapsed && <button className="sidebar-expand-toggle" onClick={() => setSidebarCollapsed(false)} title="사이드바 펼치기"><PanelLeft/></button>}<aside className="sidebar" aria-label="주 메뉴"><button className="icon-button" onClick={() => setSidebarCollapsed(value => !value)} title="사이드바 접기"><PanelLeft/></button><div className="sidebar-rule"/><button className="icon-button active" onClick={() => setPanel(null)} title="오피스"><LayoutDashboard/></button><button className="icon-button" title="수집 사이트" onClick={() => openPanel('sources')}><Globe2/></button><button className="icon-button" title="아카이브" onClick={() => { loadTasks(); openPanel('archive') }}><Archive/></button><button className="icon-button" title="에이전트" onClick={() => openPanel('agents')}><Users/></button><div className="sidebar-spacer"/>{isAdmin && <button className="icon-button" title="설정" onClick={() => openPanel('settings')}><Settings/></button>}<button className="icon-button" title="도움말" onClick={() => openPanel('help')}><CircleHelp/></button></aside><section className={`office ${officeView === 'dashboard' ? 'office-dashboard-mode' : ''}`}><header className="office-header"><div><p className="eyebrow">LIVE OFFICE</p><h2>Orchestration Lab</h2></div>{isAdmin ? <button className={`header-status ${budgetExceeded ? 'budget-exceeded' : ''}`} onClick={() => openPanel('usage')} title={budgetExceeded ? '이번 달 예산 초과 — 클릭해서 확인' : '모델 사용량과 비용 보기'}><span className="online-dot"/>개발 모드 · {session?.user?.displayName ?? '연결 중'}<small>{budgetExceeded ? '⚠ 예산 초과' : '사용량 · 비용'}</small></button> : <span className="header-status"><span className="online-dot"/>{session?.user?.displayName ?? '연결 중'}<small>사용자 계정</small></span>}{updateAvailable && <button className="update-banner" onClick={() => window.location.reload()}>새 버전 있음 · 새로고침</button>}<button className="icon-button" onClick={logout} title="로그아웃"><LogOut size={17}/></button></header>{isAdmin && <button className="dashboard-toggle" onClick={() => setOfficeView(view => view === 'office' ? 'dashboard' : 'office')}>{officeView === 'office' ? <LayoutDashboard size={15}/> : <Bot size={15}/>}{officeView === 'office' ? '대시보드로 보기' : '오피스로 보기'}</button>}{officeView === 'office' && <>{isAdmin && <button className="process-overview-button" onClick={() => openPanel('processes')}>전체 진행표 · {recentTasks.filter(task => task.status === 'RUNNING' || task.status === 'QUEUED').length}</button>}<div className="floor-grid"/><ParallelWorkflow tasks={recentTasks} tracks={taskTracks}/><button className="room calendar-room" onClick={() => openPanel('calendar')}><span>보안 캘린더</span></button><div className="room meeting-room"><span>PM 회의실</span><div className="meeting-table"/></div><div className="room security-room"><span>보안팀</span></div><div className="room market-room"><span>경제팀</span></div><div className="room archive-room"><span>지식 아카이브</span></div>{isAdmin ? <button className="room trading-room" onClick={() => openPanel('trading')}><span>트레이딩룸</span></button> : <div className="room trading-room"><span>트레이딩룸</span></div>}{isAdmin ? <button className="room trading-room" onClick={() => openPanel('kr-trading')}><span>국장룸</span></button> : <div className="room trading-room"><span>국장룸</span></div>}{isAdmin ? <button className="room trading-room" onClick={() => openPanel('us-trading')}><span>미장룸</span></button> : <div className="room trading-room"><span>미장룸</span></div>}{isAdmin ? <button className="room trading-room" onClick={() => openPanel('momentum-rotation-trading')}><span>모멘텀룸</span></button> : <div className="room trading-room"><span>모멘텀룸</span></div>}{isAdmin ? <button className="room trading-room" onClick={() => openPanel('trx-trading')}><span>TRX룸</span></button> : <div className="room trading-room"><span>TRX룸</span></div>}{latest && activeTask?.status === 'RUNNING' && <div className={`workflow-signal stage-${latest.stage.toLowerCase()}`}><span>{latest.stage}</span><b>{latest.message}</b></div>}{agents.map(agent => { const working = agent.id === workingId; const position = working && activeTask ? deliveryTarget(agent.id, activeTask.domain) : homePosition(agent); return <button key={agent.id} className={`agent ${working ? 'is-working' : ''}`} style={{ left: `${position.x}%`, top: `${position.y}%`, '--agent-color': agent.color } as CSSProperties} onClick={() => openAgent(agent)}><span className="agent-avatar"><PixelAgent id={agent.id} color={agent.color} size={26}/></span><span className="agent-label"><b>{agent.name}</b><small>{working ? '작업 중' : agent.status}</small></span>{working && <span className="agent-bubble" onClick={event => { event.stopPropagation(); openPanel('timeline') }} title="진행표 보기">{latest?.message}<small>진행표 보기</small></span>}</button> })}</>}{officeView === 'dashboard' && <OfficeDashboard recentTasks={recentTasks} taskTracks={taskTracks} archivedCount={archivedCount} pendingCandidates={pendingCandidates} budgetExceeded={budgetExceeded} chatInput={chatInput} setChatInput={setChatInput} taskDomain={taskDomain} setTaskDomain={setTaskDomain} chatError={chatError} onSubmitTask={submitTask} onCancelTask={cancelTask} onOpenPanel={openPanel} onOpenFile={openFileInExplorer} todos={{ items: todoItems, onAdd: addTodo, onToggle: toggleTodo }}/>}<div className="office-dock">{isAdmin && <><button onClick={() => openPanel('debate')}><MessagesSquare size={18}/> 토론</button><i/></>}{isAdmin && <><input ref={fileInputRef} type="file" multiple hidden accept=".txt,.md,.pdf,.docx,.xlsx,.pptx,.hwp,image/png,image/jpeg,image/gif,image/webp,image/bmp" onChange={e => { upload(e.target.files); e.target.value = '' }}/><button onClick={() => fileInputRef.current?.click()} disabled={uploading}><FileUp size={18}/>{uploading ? '업로드 중…' : '파일 추가'}</button><i/></>}<button onClick={() => openPanel('sources')}><Globe2 size={18}/> 수집 사이트{pendingCandidates > 0 && <span className="dock-badge">{pendingCandidates}</span>}</button><i/><button onClick={() => { loadTasks(); loadArchivedCount(); openPanel('archive') }}><Archive size={18}/> 파일 아카이브 {archivedCount}건</button><i/>{isAdmin && <><button onClick={() => openPanel('ask')}><Search size={18}/> 아카이브 질문</button><i/></>}<button onClick={() => openPanel('agents')}><Users size={18}/> 에이전트 {agents.length}명</button><i/>{isAdmin && <><button onClick={() => openPanel('trading')}><TrendingUp size={18}/> 실물투자</button><i/></>}{isAdmin && <><button onClick={() => openPanel('kr-trading')}><TrendingUp size={18}/> 모의투자</button><i/></>}<button onClick={() => openPanel('calendar')}><CalendarDays size={18}/> 보안 캘린더</button><i/><button onClick={() => openPanel('cheatsheet')}><Terminal size={18}/> 치트시트</button>{isAdmin && <><i/><button onClick={() => openPanel('users')}><UserPlus size={18}/> 사용자 추가</button></>}</div>{isAdmin && officeView === 'office' && <><button className="message-toggle" onClick={() => setChatOpen(!chatOpen)}><MessageCircle size={20}/> PM 메시지</button>{chatOpen && <section className="chat-panel"><div className="chat-title"><div><span className="online-dot"/> PM 대화</div><button onClick={() => setChatOpen(false)}><X size={16}/></button></div><div ref={chatBodyRef} className="chat-body" onScroll={event => { const node = event.currentTarget; stickToBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 24 }}><p className="chat-bubble">수집 사이트를 등록하거나 작업을 지시해 주세요. PM이 팀과 검토 단계를 계획하겠습니다.</p>{activeTask && <><p className={`task-state ${activeTask.status.toLowerCase()}`}>{activeTask.status === 'COMPLETED' ? '보고 완료' : activeTask.status === 'FAILED' ? '작업 중단' : activeTask.status === 'CANCELLED' ? '사용자가 중지함' : '작업 진행 중'} · {activeTask.domain}</p>{taskEvents.map(item => <p className="event-bubble" key={item.id}><b>{item.stage}</b> {item.message}</p>)}{activeTask.finalReport && <p className="report-bubble">{activeTask.finalReport}</p>}{activeTask.archivePath && <p className="archive-bubble">보관: obsidian/{activeTask.archivePath}</p>}{activeTask.failureReason && <p className="form-error">{activeTask.failureReason}</p>}</>}</div><form className="chat-input" ref={floatingPmFormRef} onSubmit={submitTask}><select value={taskDomain} onChange={e => setTaskDomain(e.target.value as typeof taskDomain)}><option value="SECURITY">보안</option><option value="ECONOMY">경제</option><option value="GENERAL">일반</option></select><textarea ref={floatingPmTextareaRef} rows={1} value={chatInput} onChange={e => { setChatInput(e.target.value); autoGrowTextarea(floatingPmTextareaRef.current, 130) }} onKeyDown={onFloatingChatKeyDown} placeholder="PM에게 작업을 지시하세요 (Shift+Enter로 줄바꿈)"/><button type="submit"><Send size={17}/></button></form>{chatError && <p className="chat-error">{chatError}</p>}</section>}</>}</section>{selected && <aside className="agent-sheet"><button className="sheet-close" onClick={() => setSelected(null)}><X size={18}/></button><span className="agent-avatar large" style={{ '--agent-color': selected.color } as CSSProperties}><PixelAgent id={selected.id} color={selected.color} size={38}/></span><p className="eyebrow">{selected.role}</p><h2>{selected.name}</h2><span className="status-pill">{selected.id === workingId ? '현재 작업 중' : selected.status}</span><p className="sheet-message">“{selected.id === workingId ? latest?.message : selected.message}”</p><div className="sheet-section"><b>지식베이스</b><p>업무와 관련된 근거 패킷과 노트를 우선 참고합니다.</p></div>{isAdmin && <button className="secondary-button" onClick={() => { setSelected(null); setChatOpen(true) }}>PM 대화 열기 <ChevronRight size={16}/></button>}</aside>}{panel === 'sources' && <SourceRegistry onClose={() => setPanel(null)} readOnly={!isAdmin} onTaskStarted={task => { setActiveTask(task); setTaskEvents([]); setPanel(null); setChatOpen(true); stickToBottom.current = true; loadTasks(); fetch(`/api/tasks/${task.id}/events`, { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setTaskEvents) }}/>} {isAdmin && panel === 'usage' && <UsageModal onClose={() => setPanel(null)}/>} {isAdmin && panel === 'digest' && <DigestModal onClose={() => setPanel(null)}/>} {isAdmin && panel === 'ask' && <AskArchiveModal onClose={() => setPanel(null)}/>} {panel === 'archive' && <ArchivePanel tasks={recentTasks} onClose={() => setPanel(null)} onOpenExplorer={() => openPanel('files')} onRetried={loadTasks}/>} {panel === 'timeline' && <TimelineModal task={activeTask} events={taskEvents} onClose={() => setPanel(null)}/>} {panel === 'files' && <FileExplorer onClose={() => setPanel(null)} onOpenGraph={() => openPanel('graph')} initialPath={pendingFilePath ?? undefined} onInitialPathHandled={() => setPendingFilePath(null)} onTaskStarted={task => { setActiveTask(task); setTaskEvents([]); setPanel(null); setChatOpen(true); stickToBottom.current = true; loadTasks(); fetch(`/api/tasks/${task.id}/events`, { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setTaskEvents) }}/>} {panel === 'graph' && <GraphView onClose={() => openPanel('files')} onOpenFile={() => openPanel('files')}/>} {isAdmin && panel === 'processes' && <ProcessBoard tasks={recentTasks} tracks={taskTracks} onClose={() => setPanel(null)}/>} {isAdmin && (panel === 'trading' || panel === 'trx-trading') && <RealTradingHub onClose={() => setPanel(null)} initialTab={panel}/>} {isAdmin && (panel === 'kr-trading' || panel === 'us-trading' || panel === 'momentum-rotation-trading') && <PaperTradingHub onClose={() => setPanel(null)} initialTab={panel}/>}{panel === 'calendar' && <SecurityCalendarModal onClose={() => setPanel(null)}/>} {panel === 'cheatsheet' && <CheatSheetModal onClose={() => setPanel(null)}/>} {panel === 'debate' && <DebatePanel onClose={() => setPanel(null)}/>} {isAdmin && panel === 'users' && <UserManagementModal onClose={() => setPanel(null)}/>} {panel === 'agents' && <aside className="side-modal"><div className="sheet-header"><div><p className="eyebrow">AGENT ROSTER</p><h2>에이전트 현황</h2></div><button className="sheet-close" onClick={() => setPanel(null)}><X size={18}/></button></div><div className="agent-roster">{agents.map(agent => <button key={agent.id} onClick={() => { setSelected(agent); setPanel(null) }}><span style={{ background: `color-mix(in srgb, ${agent.color} 22%, white)` }}><PixelAgent id={agent.id} color={agent.color} size={20}/></span><div><b>{agent.name}</b><small>{agent.id === workingId ? `작업 중 · ${latest?.stage}` : agent.role}</small></div></button>)}</div></aside>} {isAdmin && panel === 'settings' && <SettingsPanel onClose={() => setPanel(null)} onOpenDigest={() => openPanel('digest')}/>} {panel === 'help' && <aside className="side-modal"><div className="sheet-header"><div><p className="eyebrow">QUICK HELP</p><h2>사용 방법</h2></div><button className="sheet-close" onClick={() => setPanel(null)}><X size={18}/></button></div><p className="source-intro">PM 대화에서 지시를 보내면 수집 → 상호 검토 → 팀장 → PM → 아카이브 순서로 진행됩니다. 에이전트를 누르면 역할을, Owner 상태를 누르면 사용량을 볼 수 있습니다.</p><p className="source-intro">아래에 주제를 입력하면 이 오케스트레이션에 맞는 노트 생성 프롬프트가 완성됩니다 — 복사해서 PM 대화창에 붙여넣으세요.</p><NotePromptBuilder/></aside>}</main>
}
