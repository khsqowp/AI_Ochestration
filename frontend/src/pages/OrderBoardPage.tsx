import { useEffect, useMemo, useState } from 'react'
import type { PersonOrders } from '../lib/types'

const ME_KEY = 'order-board:me'
const keyOf = (p: PersonOrders) => `${p.personName} ${p.pin}`
const unitLabel = (u: string) => (u === 'BOX' ? 'box' : '개')

function OrderTable({ group, onToggle }: { group: PersonOrders; onToggle: (id: string, field: 'boughtPrimary' | 'boughtAlt', value: boolean) => void }) {
  return <section className="ob-table">
    <h3>{group.personName} <small>#{group.pin}</small></h3>
    <div className="ob-grid-wrap">
      <table className="ob-grid">
        <thead><tr>
          <th>#</th><th>구매 희망항목</th><th>수량</th><th className="ob-check">샀음</th>
          <th>없으면 고르는 항목</th><th>수량</th><th className="ob-check">샀음</th>
        </tr></thead>
        <tbody>
          {group.items.map((it, i) => {
            const hasAlt = !!it.altProduct
            return <tr key={it.id}>
              <td className="ob-num">{i + 1}</td>
              <td className={`ob-item ${it.boughtPrimary ? 'ob-bought' : ''}`}>
                <span className="ob-item-name">{it.product}</span>
                {it.boughtPrimary && <span className="ob-badge">구매완료</span>}
              </td>
              <td className={it.boughtPrimary ? 'ob-bought' : ''}>{it.qty} {unitLabel(it.unit)}</td>
              <td className="ob-check">
                <input type="checkbox" checked={!!it.boughtPrimary}
                  onChange={e => onToggle(it.id!, 'boughtPrimary', e.target.checked)}/>
              </td>
              <td className={`ob-item ${hasAlt && it.boughtAlt ? 'ob-bought' : ''}`}>
                {hasAlt ? <span className="ob-item-name">{it.altProduct}</span> : <span className="ob-empty">—</span>}
                {hasAlt && it.boughtAlt && <span className="ob-badge">구매완료</span>}
              </td>
              <td className={hasAlt && it.boughtAlt ? 'ob-bought' : ''}>{hasAlt ? `${it.altQty ?? 1} ${unitLabel(it.altUnit ?? 'EA')}` : ''}</td>
              <td className="ob-check">
                {hasAlt && <input type="checkbox" checked={!!it.boughtAlt}
                  onChange={e => onToggle(it.id!, 'boughtAlt', e.target.checked)}/>}
              </td>
            </tr>
          })}
        </tbody>
      </table>
    </div>
  </section>
}

export function OrderBoardPage() {
  const [groups, setGroups] = useState<PersonOrders[]>([])
  const [loading, setLoading] = useState(true)
  const [me, setMe] = useState<string>(() => localStorage.getItem(ME_KEY) ?? '')

  const load = async () => {
    try {
      const res = await fetch('/api/orders/all', { credentials: 'include' })
      if (res.ok) setGroups((await res.json()) as PersonOrders[])
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const setMine = (value: string) => {
    setMe(value)
    if (value) localStorage.setItem(ME_KEY, value)
    else localStorage.removeItem(ME_KEY)
  }

  const toggle = async (id: string, field: 'boughtPrimary' | 'boughtAlt', value: boolean) => {
    setGroups(gs => gs.map(g => ({ ...g, items: g.items.map(it => (it.id === id ? { ...it, [field]: value } : it)) })))
    try {
      const res = await fetch(`/api/orders/item/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setGroups(gs => gs.map(g => ({ ...g, items: g.items.map(it => (it.id === id ? { ...it, [field]: !value } : it)) })))
    }
  }

  const mine = useMemo(() => groups.find(g => keyOf(g) === me) ?? null, [groups, me])
  const others = useMemo(() => groups.filter(g => keyOf(g) !== me), [groups, me])

  return <div className="page order-board-page">
    <div className="ob-head">
      <h2>주문</h2>
      <label className="ob-me">
        내 이름
        <select value={me} onChange={e => setMine(e.target.value)}>
          <option value="">선택 안 함</option>
          {groups.map(g => <option key={keyOf(g)} value={keyOf(g)}>{g.personName} (#{g.pin})</option>)}
        </select>
      </label>
    </div>

    {loading && <p className="ob-note">불러오는 중…</p>}
    {!loading && groups.length === 0 && <p className="ob-note">아직 주문이 없습니다.</p>}

    {mine && <div className="ob-section">
      <p className="ob-label">내가 주문한 표</p>
      <OrderTable group={mine} onToggle={toggle}/>
    </div>}

    {others.length > 0 && <div className="ob-section">
      <p className="ob-label">{mine ? '다른 사람이 주문한 표' : '주문한 표'}</p>
      {others.map(g => <OrderTable key={keyOf(g)} group={g} onToggle={toggle}/>)}
    </div>}
  </div>
}
