import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { UsageSummary } from '../lib/types'
import { PanelShell } from '../components/shared'

export function UsageModal({ onClose, embedded }: { onClose?: () => void; embedded?: boolean }) {
  const [days, setDays] = useState(30); const [data, setData] = useState<UsageSummary | null>(null)
  useEffect(() => { fetch(`/api/usage/summary?days=${days}`, { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(setData) }, [days])
  const money = (value: number) => value > 0 ? `$${value.toFixed(4)}` : '단가 미설정'
  return <PanelShell embedded={embedded} className="side-modal"><div className="sheet-header"><div><p className="eyebrow">OWNER INSIGHTS</p><h2>모델 사용량 · 비용</h2></div>{onClose && <button className="sheet-close" onClick={onClose}><X size={18}/></button>}</div>{data?.budgetExceeded && <p className="budget-alert">이번 달 예상 비용이 예산(${data.budgetUsdPerMonth.toFixed(2)})을 넘었습니다 — 현재 ${data.monthToDateCostUsd.toFixed(2)}</p>}<div className="period-tabs">{[7, 30, 90].map(value => <button className={days === value ? 'active' : ''} key={value} onClick={() => setDays(value)}>{value}일</button>)}</div>{data ? <><div className="usage-total"><b>{data.total.tokens.toLocaleString()} tokens</b><span>{data.total.calls}회 호출 · {money(data.total.estimatedCostUsd)}</span><small>{days}일 동안의 실제 응답 토큰 합계입니다.</small></div><p className="usage-note">이번 달 누적: {money(data.monthToDateCostUsd)} / 예산 {money(data.budgetUsdPerMonth)}</p><div className="usage-table">{data.models.length === 0 ? <p className="empty-state">이 기간에 완료된 모델 호출이 없습니다.</p> : data.models.map(row => <article key={row.model}><b>{row.model}</b><span>{row.calls}회 · {row.tokens.toLocaleString()} tokens</span><small>입력 {row.inputTokens.toLocaleString()} / 출력 {row.outputTokens.toLocaleString()} · {money(row.estimatedCostUsd)}</small></article>)}</div><p className="usage-note">표시 금액은 지금 설정된 단가로 과거 기록까지 다시 계산한 추정치입니다. Gemini Google Search grounding, 캐시·세금·프로모션·계약 할인은 포함하지 않으며, `.env` 값이 있으면 그 값이 우선합니다.</p></> : <p className="empty-state">사용량을 불러오는 중…</p>}</PanelShell>
}
