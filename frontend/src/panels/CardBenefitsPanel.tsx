import { useEffect, useState, type FormEvent } from 'react'
import { CreditCard, Pencil, Plus, Trash2, X } from 'lucide-react'
import { PanelShell } from '../components/shared'

type CardBenefit = { id: string; name: string; benefits: string; createdAt: string; updatedAt: string }

export function CardBenefitsPanel({ onClose, embedded }: { onClose?: () => void; embedded?: boolean }) {
  const [cards, setCards] = useState<CardBenefit[]>([])
  const [name, setName] = useState('')
  const [benefits, setBenefits] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/cards', { credentials: 'include' })
      if (!response.ok) throw new Error('카드 목록을 불러오지 못했습니다.')
      setCards(await response.json())
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '카드 목록을 불러오지 못했습니다.')
    } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  const reset = () => { setName(''); setBenefits(''); setEditingId(null) }
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setNotice('')
    try {
      const response = await fetch(editingId ? `/api/admin/cards/${editingId}` : '/api/admin/cards', {
        method: editingId ? 'PUT' : 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, benefits })
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.message ?? '저장하지 못했습니다.')
      }
      reset(); await load()
    } catch (error) { setNotice(error instanceof Error ? error.message : '저장하지 못했습니다.') }
  }
  const remove = async (card: CardBenefit) => {
    if (!window.confirm(`“${card.name}” 카드를 삭제할까요?`)) return
    setNotice('')
    try {
      const response = await fetch(`/api/admin/cards/${card.id}`, { method: 'DELETE', credentials: 'include' })
      if (!response.ok) throw new Error('삭제하지 못했습니다.')
      if (editingId === card.id) reset()
      await load()
    } catch (error) { setNotice(error instanceof Error ? error.message : '삭제하지 못했습니다.') }
  }

  return <PanelShell embedded={embedded} className="source-sheet card-benefits-sheet">
    <div className="sheet-header"><div><p className="eyebrow">CARD BENEFITS</p><h2>내 카드와 혜택</h2></div>{onClose && <button className="sheet-close" onClick={onClose}><X size={18}/></button>}</div>
    <p className="source-intro">카드별 혜택과 사용 조건을 적어두세요. 결제 상황에 맞춰 어떤 카드를 쓸지 빠르게 확인할 수 있습니다.</p>
    <form className="source-form" onSubmit={submit}>
      <label>카드명<input value={name} onChange={event => setName(event.target.value)} required maxLength={160} placeholder="예: 생활비 카드"/></label>
      <label>혜택 및 사용 조건<textarea value={benefits} onChange={event => setBenefits(event.target.value)} required maxLength={10000} rows={5} placeholder="예: 대중교통 10% 할인, 월 할인 한도 5천 원, 전월 실적 30만 원"/></label>
      {notice && <p className="form-error">{notice}</p>}
      <button className="source-add" type="submit"><Plus size={16}/>{editingId ? '수정 저장' : '카드 추가'}</button>
      {editingId && <button className="source-cancel" type="button" onClick={reset}>수정 취소</button>}
    </form>
    <div className="source-list"><div className="source-list-head"><b>저장된 카드</b><span>{cards.length}개</span></div>
      {loading ? <p className="empty-state">불러오는 중…</p> : cards.length === 0 ? <p className="empty-state"><CreditCard size={15}/>아직 등록한 카드가 없습니다.</p> : cards.map(card => <article className="source-row card-benefit-row" key={card.id}>
        <span className="domain-dot economy"/><div><b>{card.name}</b><small>수정 {new Date(card.updatedAt).toLocaleDateString('ko-KR')}</small><p className="card-benefit-text">{card.benefits}</p><div className="source-actions"><button onClick={() => { setEditingId(card.id); setName(card.name); setBenefits(card.benefits); setNotice('') }}><Pencil size={12}/>수정</button><button className="card-delete" onClick={() => void remove(card)}><Trash2 size={12}/>삭제</button></div></div>
      </article>)}
    </div>
  </PanelShell>
}
