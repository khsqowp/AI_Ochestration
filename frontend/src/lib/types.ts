export type Role = 'ADMIN' | 'USER'
export type OrderUnit = 'EA' | 'BOX'
export type OrderItem = {
  id?: string
  product: string
  qty: number
  unit: OrderUnit
  altProduct: string
  altQty: number
  altUnit: OrderUnit
  boughtPrimary?: boolean
  boughtAlt?: boolean
}
export type PersonOrders = { personName: string; pin: string; items: OrderItem[] }
export type AccessPoint = {
  ip: string; lat: number; lon: number; accuracy: 'cf' | 'ipapi'
  city: string | null; region: string | null; country: string | null; countryCode: string | null
  isp: string | null; org: string | null
  hits: number; sessionHits: number; lastSeen: string
}
export type AccessRecent = {
  ts: string; ip: string; method: string; path: string; status: number; hadSession: boolean
  source: 'edge' | 'api'; city: string | null; country: string | null; countryCode: string | null; isp: string | null
}
export type AccessStats = { totalHits: number; uniqueIps: number; countries: number; mappedIps: number; last24h: number }
export type AccessLogSummary = { points: AccessPoint[]; recent: AccessRecent[]; stats: AccessStats }
export type User = { displayName: string; email: string; role: Role }
export type Session = { authenticationEnabled: boolean; user: User | null }
export type Agent = { id: string; name: string; role: string; color: string; left: string; top: string; status: string; message: string }
export type ResearchSource = { id: string; name: string; url: string; domain: 'SECURITY' | 'ECONOMY'; intervalHours: number; crawlDepth: number; maxPages: number; note: string | null; lastCollectedAt: string | null; consecutiveNoContentCycles: number }
export type SourceCandidateEntry = { id: string; name: string; url: string; domain: 'SECURITY' | 'ECONOMY'; justification: string; discoveredAt: string }
export type Notice = { id: string; kind: 'success' | 'error' | 'info'; message: string }
export type Task = { id: string; title: string; instruction: string; domain: 'SECURITY' | 'ECONOMY' | 'GENERAL'; status: 'QUEUED' | 'AWAITING_BATCH' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'; archivePath: string | null; finalReport: string | null; failureReason: string | null }
export type TaskEvent = { id: string; stage: string; message: string; model: string | null; createdAt: string; inputTokens: number | null; outputTokens: number | null; totalTokens: number | null; elapsedMs: number | null; estimatedCostUsd: number | null }
export type ModelUsage = { model: string; calls: number; inputTokens: number; outputTokens: number; tokens: number; elapsedMs: number; estimatedCostUsd: number }
export type UsageSummary = { from: string; to: string; days: number; models: ModelUsage[]; total: ModelUsage; monthToDateCostUsd: number; budgetUsdPerMonth: number; budgetExceeded: boolean }
export type DigestEntry = { taskId: string; title: string; domain: string; detail: string | null }
export type NoContentSource = { name: string; domain: string; consecutiveNoContentCycles: number }
export type DigestResult = { period: string; from: string; to: string; total: number; completed: number; failed: number; byDomain: Record<string, number>; completedTasks: DigestEntry[]; failedTasks: DigestEntry[]; noContentSources: NoContentSource[] }
export type RagCitation = { path: string; score: number }
export type RagAnswer = { answer: string; citations: RagCitation[] }
export type RagHistoryEntry = { id: string; question: string; answer: string; citations: RagCitation[]; createdAt: string }
export type ArchiveFile = { path: string; name: string; size: number; title: string | null; domain: string | null; topic: string | null; date: string | null; origin: string | null; modifiedAt: string }
export type FileCategory = 'all' | 'economy' | 'security' | 'manual' | 'upload'
export type ManagedUser = { id: string; loginId: string; displayName: string; role: Role; createdAt: string }
export type FrontMatter = { title: string | null; domain: string | null; topic: string | null; date: string | null; tags: string[] }
export type MarkdownDoc = { path: string; frontMatter: FrontMatter; body: string }
export type GraphData = { nodes: { path: string; name: string; category: string }[]; edges: { from: string; to: string }[] }
export type MaintenanceResult = { notesExamined: number; merged: number; mergedPairs: string[]; reclassified: number; reclassifiedNotes: string[]; bucketed: number; bucketedNotes: string[]; split: number; splitBuckets: string[]; weeklyDigested: number; weeklyDigestedNotes: string[]; linked: number; failed: number; failedNotes: string[] }
export type TradingPosition = { notionalUsdt: number; entryPrice: number; entrySpotPrice: number; entryPerpPrice: number; amount: number; entryFeeUsdt: number; accruedFundingUsdt: number; unrealizedPricePnlUsdt: number }
export type TradingLogEntry = { ts: string; message: string }
export type TradingEquityPoint = { ts: string; totalPnlUsdt: number }
export type TradingPositionPoint = { ts: string; price: number; unrealizedPnlUsdt: number; accruedFundingUsdt: number }
export type TradingState = { positions: Record<string, TradingPosition>; tradeLog: TradingLogEntry[]; cumulativeFundingUsdt: number; cumulativeFeeUsdt: number; cumulativePricePnlUsdt: number; unrealizedPricePnlUsdt: number; realizedPnlUsdt: number; inceptionTs: string | null; totalCapitalUsdt: number; totalPnlUsdt: number; equityHistory: TradingEquityPoint[]; tradingHalted: boolean; positionHistory: Record<string, TradingPositionPoint[]> }
export type TradingPeriod = 'all' | 'month' | 'week' | 'day'
export type ChartPoint = { ts: string; value: number }
export type UsdtPositionPoint = { ts: string; price: number; unrealizedPnlUsdt: number }
export type MomentumRotationPosition = { side: 'long' | 'short'; entryPrice: number; markPrice: number; notionalUsdt: number; unrealizedPnlUsdt: number }
export type MomentumBroker = { queriedTs: string | null; exchange: string; equityUsdt: number; inceptionEquityUsdt: number; grossNotionalUsdt: number; returnPct: number; sessionStartEquityUsdt: number; sessionStartTs: string | null; sessionPnlUsdt: number; sessionReturnPct: number; unrealizedPnlUsdt: number; drawdown: number; hwmUsdt: number; leverage: number; halted: boolean; manualFlat?: boolean; manualFlatTs?: string | null; positions: Record<string, MomentumRotationPosition> }
export type MomentumRotationState = { positions: Record<string, MomentumRotationPosition>; tradeLog: TradingLogEntry[]; mode: string; equityUsdt: number; cumulativeRealizedPnlUsdt: number; cumulativeFeeUsdt: number; unrealizedPnlUsdt: number; drawdown: number; hwmUsdt: number; inceptionEquityUsdt: number; halted: boolean; broker: MomentumBroker | null; inceptionTs: string | null; lastRebalanceTs: string | null; nextRebalanceTs: string | null; rebalanceEveryDays: number | null; equityHistory: TradingEquityPoint[]; positionHistory: Record<string, UsdtPositionPoint[]>; consumedControlNonce: string | null }
export type RotationBrokerPosition = { qty: number; price: number; evalAmt: number; purchaseAmt: number; pnl: number; pnlPct: number }
export type RotationBroker = { queriedTs: string | null; positions: Record<string, RotationBrokerPosition>; positionsEval: number; positionsEntry: number; positionsUnrealizedPnl: number; accountCashKrw: number; accountTotalKrw: number; manualFlat?: boolean; manualFlatPending?: boolean; manualFlatTs?: string | null }
export type RotationEquityPoint = { ts: string; totalPnl: number; equity: number; deployed: number }
export type RotationPositionPoint = { ts: string; price: number; unrealizedPnl: number }
export type StockRotationState = { symbolNames: Record<string, string> | null; realizedPnl: number; unrealizedPnl: number; equity: number; budget: number; entryValue: number; deployedValue: number; returnPct: number; heldSymbols: string[]; targetBasket: string[]; pendingSells: string[]; pendingBuys: string[]; lastPlanDate: string | null; lastRebalanceDate: string | null; regimeCash: boolean; broker: RotationBroker | null; tradeLog: TradingLogEntry[]; equityHistory: RotationEquityPoint[]; positionHistory: Record<string, RotationPositionPoint[]>; consumedControlNonce: string | null; consecutiveCycleFailures: number; lastCycleError: string | null; lastCycleErrorTs: string | null }
export type CalendarCategory = 'EVENT' | 'SEMINAR' | 'INCIDENT'
export type SecurityCalendarEntry = { id: string; eventDate: string; lastUpdatedDate: string; category: CalendarCategory; title: string; summary: string; sourceName: string | null; sourceUrl: string | null }
export type CalendarUpdateEntry = { updateDate: string; summary: string; sourceName: string | null; sourceUrl: string | null }
export type SecurityCalendarTimelineEntry = { event: SecurityCalendarEntry; updates: CalendarUpdateEntry[] }
export type TodoItem = { id: string; text: string; completed: boolean; createdAt: string; completedAt: string | null }
export type TodoListProps = { items: TodoItem[]; onAdd: (text: string) => void; onToggle: (id: string, completed: boolean) => void }

export type RagDomainFilter = '' | 'economy' | 'security' | 'ideas'
export type RagOriginFilter = '' | 'collection' | 'manual' | 'upload'

export type DebateMode = 'PRO_CON' | 'FREE'
export type DebateStatus = 'IN_PROGRESS' | 'COMPLETED'
export type DebateModelKey = 'DEEPSEEK' | 'OPENAI' | 'BEDROCK'
export interface DebateSession {
  id: string; mode: DebateMode; topic: string; proModel: string | null; conModel: string | null
  participants: string[] | null; maxTurnsPerSide: number; status: DebateStatus; turnsCompleted: number; createdAt: string
}
export interface DebateTurn { id: string; turnIndex: number; role: string; speakerModel: string; content: string; createdAt: string }

export type SortField = 'title' | 'domain' | 'date'
export type SortDirection = 'asc' | 'desc'

export type RealTradingTab = 'trading' | 'momentum-rotation-trading'
export type PaperTradingTab = 'kr-trading' | 'us-trading'

export type TaskDomain = 'SECURITY' | 'ECONOMY' | 'GENERAL'
