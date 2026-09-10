import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { OrderItem, OrderUnit } from '../../lib/types'

const UNITS: OrderUnit[] = ['EA', 'BOX']
const UNIT_LABEL: Record<OrderUnit, string> = { EA: '개', BOX: 'box' }
const blankRow = (): OrderItem => ({ product: '', qty: 1, unit: 'EA', altProduct: '', altQty: 1, altUnit: 'EA' })

export function OrderPage() {
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [rows, setRows] = useState<OrderItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const identOk = name.trim().length > 0 && /^\d{4}$/.test(pin)

  const load = async () => {
    if (!identOk) { setMsg({ kind: 'err', text: '이름과 숫자 4자리를 입력하세요.' }); return }
    setBusy(true); setMsg(null)
    try {
      const res = await fetch(`/api/orders/mine?name=${encodeURIComponent(name.trim())}&pin=${pin}`)
      if (!res.ok) throw new Error(String(res.status))
      const data = (await res.json()) as OrderItem[]
      setRows(data.length ? data.map(d => ({
        ...d,
        altProduct: d.altProduct ?? '',
        altQty: d.altQty ?? 1,
        altUnit: d.altUnit ?? 'EA',
      })) : [blankRow()])
      setLoaded(true)
    } catch {
      setMsg({ kind: 'err', text: '불러오기 실패. 잠시 후 다시 시도하세요.' })
    } finally {
      setBusy(false)
    }
  }

  const patch = (i: number, p: Partial<OrderItem>) =>
    setRows(rs => rs.map((r, idx) => (idx === i ? { ...r, ...p } : r)))

  const save = async () => {
    const items = rows
      .filter(r => r.product.trim())
      .map(r => ({
        id: r.id ?? null,
        product: r.product.trim(),
        qty: Math.max(1, Math.min(999, Number(r.qty) || 1)),
        unit: r.unit,
        altProduct: r.altProduct.trim() || null,
        altQty: r.altProduct.trim() ? Math.max(1, Math.min(999, Number(r.altQty) || 1)) : null,
        altUnit: r.altProduct.trim() ? r.altUnit : null,
      }))
    if (!items.length && !window.confirm('빈 표를 저장하면 주문이 취소됩니다. 계속할까요?')) return
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/orders/mine', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), pin, items }),
      })
      if (!res.ok) throw new Error(String(res.status))
      const data = (await res.json()) as OrderItem[]
      setRows(data.map(d => ({ ...d, altProduct: d.altProduct ?? '', altQty: d.altQty ?? 1, altUnit: d.altUnit ?? 'EA' })))
      setMsg({ kind: 'ok', text: '저장되었습니다.' })
    } catch {
      setMsg({ kind: 'err', text: '저장 실패. 잠시 후 다시 시도하세요.' })
    } finally {
      setBusy(false)
    }
  }

  return <div className="page order-page">
    <div className="order-head">
      <h1>주문</h1>
      <p className="order-intro">이름과 숫자 4자리를 입력하고 불러오면 내 주문표를 수정할 수 있습니다. 숫자 4자리는 다음에 다시 열 때 필요합니다.</p>
    </div>

    <div className="order-ident">
      <label>이름<input value={name} onChange={e => setName(e.target.value)} maxLength={40} placeholder="홍길동"/></label>
      <label>숫자 4자리<input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" placeholder="0000"/></label>
      <button className="order-btn" onClick={load} disabled={busy || !identOk}>{loaded ? '다시 불러오기' : '불러오기'}</button>
    </div>

    {msg && <p className={`order-msg ${msg.kind}`}>{msg.text}</p>}

    {loaded && <>
      {rows.some(r => r.boughtPrimary || r.boughtAlt) &&
        <p className="order-msg ok">어둡게 표시된 항목은 구매 완료되어 수정할 수 없습니다.</p>}
      <div className="order-grid-wrap">
        <table className="order-grid">
          <thead><tr>
            <th>#</th><th>제품</th><th>개수</th><th>단위</th>
            <th>없으면 (대체 제품)</th><th>개수</th><th>단위</th><th aria-label="삭제"/>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const altOn = !!r.altProduct.trim()
              const locked = r.boughtPrimary || r.boughtAlt
              return <tr key={r.id ?? i}>
                <td className="order-num">{i + 1}</td>
                {r.boughtPrimary ? <>
                  <td className="og-bought"><span className="og-val">{r.product}</span><span className="og-badge">구매완료</span></td>
                  <td className="og-bought">{r.qty}</td>
                  <td className="og-bought">{UNIT_LABEL[r.unit]}</td>
                </> : <>
                  <td><input value={r.product} onChange={e => patch(i, { product: e.target.value })} placeholder="몬스터 화이트에너지"/></td>
                  <td><input className="order-qty" type="number" min={1} max={999} value={r.qty} onChange={e => patch(i, { qty: Number(e.target.value) })}/></td>
                  <td><select value={r.unit} onChange={e => patch(i, { unit: e.target.value as OrderUnit })}>{UNITS.map(u => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}</select></td>
                </>}
                {r.boughtAlt && altOn ? <>
                  <td className="og-bought"><span className="og-val">{r.altProduct}</span><span className="og-badge">구매완료</span></td>
                  <td className="og-bought">{r.altQty}</td>
                  <td className="og-bought">{UNIT_LABEL[r.altUnit]}</td>
                </> : <>
                  <td><input value={r.altProduct} onChange={e => patch(i, { altProduct: e.target.value })} placeholder="몬스터 오리지널"/></td>
                  <td><input className="order-qty" type="number" min={1} max={999} value={r.altQty} onChange={e => patch(i, { altQty: Number(e.target.value) })} disabled={!altOn}/></td>
                  <td><select value={r.altUnit} onChange={e => patch(i, { altUnit: e.target.value as OrderUnit })} disabled={!altOn}>{UNITS.map(u => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}</select></td>
                </>}
                <td><button className="order-row-del" onClick={() => setRows(rs => rs.filter((_, idx) => idx !== i))} aria-label="행 삭제" disabled={locked}><Trash2 size={15}/></button></td>
              </tr>
            })}
          </tbody>
        </table>
      </div>
      <div className="order-actions">
        <button className="order-btn ghost" onClick={() => setRows(rs => [...rs, blankRow()])}><Plus size={15}/> 행 추가</button>
        <button className="order-btn" onClick={save} disabled={busy}>저장</button>
      </div>
    </>}
  </div>
}
