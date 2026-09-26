import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Dices, Minus, Play, Plus } from 'lucide-react'
import { MarbleRace } from '../../marble-roulette/MarbleRace'

interface Room { day: string; candidates: string[]; startedAt: string | null }

const POLL_MS = 3000

/** "짜장면*3" -> {name:"짜장면", count:3}. *n이 없으면 count 1(마블 1개). 가중치 문법 —
 * 같은 메뉴를 n개 더 등록해서 당첨 확률을 표 개수만큼 올린다. */
function parseCandidateInput(raw: string): { name: string; count: number } | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const match = trimmed.match(/^(.*)\*\s*(\d+)$/)
  if (!match) return { name: trimmed, count: 1 }
  const name = match[1].trim()
  const count = Number(match[2])
  if (!name || count < 1) return null
  return { name, count }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/lunch-roulette${path}`, { headers: { 'Content-Type': 'application/json' }, ...init })
  const raw = await response.text()
  let body: unknown = null
  if (raw.trim()) { try { body = JSON.parse(raw) } catch { throw new Error('서버가 읽을 수 없는 응답을 반환했습니다.') } }
  if (!response.ok) { const message = typeof body === 'object' && body !== null && 'message' in body ? String((body as { message?: unknown }).message ?? '') : ''; throw new Error(message || `서버 응답 ${response.status}`) }
  return body as T
}

/** 점심 룰렛 -- 로그인 없이 아무나 후보를 등록하고 시작 버튼을 누를 수 있는 사무실 화면용 페이지.
 * 승자는 서버가 아니라 각 클라이언트가 방(day+시작시각+후보 순서)에서 결정론적으로 계산한다 --
 * 서버는 여전히 "누가 후보인지"와 "언제 시작했는지"만 들고 있으면 된다.
 *
 * 룰렛 엔진은 lazygyu/roulette(MIT, 302★)를 통째로 이식했다(frontend/src/marble-roulette/) --
 * 예전 box2d-wasm 자작 갈톤보드는 캔버스 폭을 거의 못 써서(중앙 좁은 통로만 차지) 실사용성이
 * 없었고, 그다음 시도한 react-custom-roulette 원판도 마블 레이스만큼의 볼거리가 없어 통째로
 * 교체했다. 광고 시스템/분석 트래킹/유료 스킨 연동은 사내 도구라 빼고 물리·렌더링·카메라·
 * 미니맵·스킬 이펙트·랭킹·배속·멀티맵·녹화는 그대로 가져왔다. 결정론적 재생은 원래 엔진에
 * 없던 부분이라 새로 만든 시드 PRNG(marble-roulette/rng.ts)로 게임플레이에 영향을 주는
 * Math.random() 호출부만 바꿔 넣었다. */
export function LunchRoulettePage() {
  const [room, setRoom] = useState<Room | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [winner, setWinner] = useState<string | null>(null)
  const [record, setRecord] = useState(false)

  const load = useCallback(async () => {
    try { setRoom(await api<Room>('/today')); setError('') } catch (e) { setError(e instanceof Error ? e.message : '불러오기 실패') }
  }, [])

  useEffect(() => { void load() }, [load])

  // 아직 시작 전이면 다른 사람이 등록/시작하는 걸 보려고 짧게 폴링.
  useEffect(() => {
    if (room?.startedAt) return
    const timer = window.setInterval(() => void load(), POLL_MS)
    return () => window.clearInterval(timer)
  }, [room?.startedAt, load])

  const started = room?.startedAt != null

  // 후보 배열은 서버가 "표" 단위(가중치)로 중복을 그대로 들고 있다(예: ["짜장면","짜장면"])
  // -- 화면에는 등록 순서를 유지하면서 메뉴별로 묶어 "짜장면 ×2"로 보여준다.
  const grouped = useMemo(() => {
    const order: string[] = []
    const counts = new Map<string, number>()
    for (const name of room?.candidates ?? []) {
      if (!counts.has(name)) order.push(name)
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
    return order.map(name => ({ name, count: counts.get(name)! }))
  }, [room?.candidates])

  // 모든 클라이언트가 같은 값을 얻는 방 식별자 -- MarbleRace가 이 값으로 물리 시뮬레이션을
  // 재현한다(marble-roulette/rng.ts).
  const roomKey = useMemo(() => {
    if (!room?.startedAt) return null
    return `${room.day}|${room.startedAt}|${room.candidates.join(',')}`
  }, [room?.day, room?.startedAt, room?.candidates])

  useEffect(() => { setWinner(null) }, [roomKey])

  const addCandidate = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    const parsed = parseCandidateInput(name)
    if (!parsed) { setError('이름을 입력하세요. "메뉴*개수" 형식으로 개수도 지정할 수 있습니다.'); return }
    setBusy(true)
    try {
      setRoom(await api<Room>('/today/candidates', { method: 'POST', body: JSON.stringify(parsed) }))
      setName(''); setError('')
    } catch (e) { setError(e instanceof Error ? e.message : '후보를 추가하지 못했습니다.') }
    finally { setBusy(false) }
  }

  const bumpCandidate = async (candidateName: string, delta: 1 | -1) => {
    if (busy) return
    setBusy(true)
    try {
      const path = delta > 0 ? '/today/candidates' : '/today/candidates/remove'
      setRoom(await api<Room>(path, { method: 'POST', body: JSON.stringify({ name: candidateName, count: 1 }) }))
      setError('')
    } catch (e) { setError(e instanceof Error ? e.message : '표를 변경하지 못했습니다.') }
    finally { setBusy(false) }
  }

  const start = async () => {
    if (busy) return
    setBusy(true)
    try { setRoom(await api<Room>('/today/start', { method: 'POST' })); setError('') }
    catch (e) { setError(e instanceof Error ? e.message : '시작하지 못했습니다.') }
    finally { setBusy(false) }
  }

  return <div className="lunch-roulette-page">
    <div className={`lunch-roulette-shell${started ? ' lunch-roulette-shell--racing' : ''}`}>
      <header className="lunch-roulette-head"><Dices size={22}/><h1>점심 룰렛</h1></header>
      {error && <p className="lunch-roulette-error">{error}</p>}
      {!room ? <p className="lunch-roulette-loading">불러오는 중…</p> : !started ? <>
        <ul className="lunch-roulette-candidates">
          {grouped.length === 0 && <li className="lunch-roulette-empty">아직 등록된 후보가 없습니다.</li>}
          {grouped.map(({ name: c, count }) => <li key={c}>
            <span>{c}{count > 1 && <b className="lunch-roulette-weight"> ×{count}</b>}</span>
            <span className="lunch-roulette-weight-controls">
              <button type="button" aria-label={`${c} 표 빼기`} disabled={busy} onClick={() => void bumpCandidate(c, -1)}><Minus size={12}/></button>
              <button type="button" aria-label={`${c} 표 더하기`} disabled={busy} onClick={() => void bumpCandidate(c, 1)}><Plus size={12}/></button>
            </span>
          </li>)}
        </ul>
        <form className="lunch-roulette-form" onSubmit={event => void addCandidate(event)}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="오늘 후보(예: 국밥집, 짜장면*3)" maxLength={24} disabled={busy}/>
          <button type="submit" disabled={busy || !name.trim()}><Plus size={16}/>추가</button>
        </form>
        <p className="lunch-roulette-hint">"메뉴*개수"로 표를 한 번에 여러 장 등록할 수 있습니다(예: 짜장면*3) — 표가 많을수록 당첨 확률이 올라갑니다. 등록 후에도 ±로 조정 가능.</p>
        <label className="lunch-roulette-record-toggle">
          <input type="checkbox" checked={record} onChange={e => setRecord(e.target.checked)}/>
          경주 영상 녹화(끝나면 내 브라우저에 mp4로 저장)
        </label>
        <button className="lunch-roulette-start" onClick={() => void start()} disabled={busy || room.candidates.length < 2}>
          <Play size={16}/>{room.candidates.length < 2 ? '후보 2명 이상 등록 필요' : '룰렛 시작'}
        </button>
      </> : roomKey && <>
        <MarbleRace key={roomKey} roomKey={roomKey} candidates={room.candidates} record={record} onWinner={setWinner}/>
        {winner && <p className="lunch-roulette-winner">오늘 점심은 <b>{winner}</b> 🎉</p>}
      </>}
    </div>
  </div>
}
