import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Dices, Play, Plus } from 'lucide-react'
import { Wheel } from 'react-custom-roulette'
import { pickWinnerIndex } from '../../lunch-roulette'

interface Room { day: string; candidates: string[]; startedAt: string | null }

const POLL_MS = 3000
const WHEEL_COLORS = ['#7667dc', '#a99bf0']

/** react-custom-roulette 자체 버그 우회: Wheel을 mustStartSpinning=true로 곧장 마운트하면,
 * "돌기 시작" 이펙트가 아직 초기값([[0]])인 prizeMap을 읽어 prizeMap[prizeNumber]가
 * undefined인 채로 인덱싱해 그대로 throw한다(당첨자가 0번 후보가 아닐 때마다 발생 -- 화면
 * 전체가 빈 채로 죽는 원인이었다). false로 마운트해 Wheel이 자기 prizeMap을 먼저 채우게 한 뒤,
 * 다음 렌더에서 true로 올리면 안전하다(라이브러리 데모도 항상 이 순서). key로 방마다 새로 마운트.
 */
function RouletteWheel({ candidates, prizeIndex, onWinner }: { candidates: string[]; prizeIndex: number; onWinner: () => void }) {
  const [spin, setSpin] = useState(false)
  useEffect(() => { setSpin(true) }, [])
  return <Wheel
    mustStartSpinning={spin}
    prizeNumber={prizeIndex}
    data={candidates.map(option => ({ option }))}
    backgroundColors={WHEEL_COLORS}
    textColors={['#ffffff']}
    outerBorderColor="#4d43a0"
    outerBorderWidth={4}
    radiusLineColor="#ffffff"
    radiusLineWidth={2}
    // 'sans-serif'는 라이브러리 내장 웹세이프 폰트 목록에 있어 Google Fonts로 폰트를 fetch하러
    // 가지 않는다(WebFontLoader가 실패/타임아웃하면 바퀴가 안 보이는 별개의 경로도 있어, 우리 앱
    // 폰트인 Pretendard처럼 그 목록에 없는 이름은 여기 쓰면 안 된다).
    fontFamily="sans-serif"
    fontSize={16}
    spinDuration={0.9}
    onStopSpinning={onWinner}
  />
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
 * 승자는 서버가 아니라 각 클라이언트가 방(day+시작시각+후보 순서)에서 결정론적으로 계산한다
 * (lunch-roulette.ts) -- 그래서 같은 방을 보는 모든 사람이 같은 회전 결과를 보되, 서버는 여전히
 * "누가 후보인지"와 "언제 시작했는지"만 들고 있으면 된다. 바퀴는 react-custom-roulette(MIT, 365★)
 * 그대로 사용 -- 예전 box2d-wasm 갈톤보드는 캔버스 폭을 거의 못 써서(중앙 좁은 통로만 차지) 실사용성이
 * 없었다. */
export function LunchRoulettePage() {
  const [room, setRoom] = useState<Room | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [winner, setWinner] = useState<string | null>(null)

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

  const prizeIndex = useMemo(() => {
    if (!room?.startedAt || room.candidates.length < 2) return 0
    return pickWinnerIndex(room.day, room.startedAt, room.candidates)
  }, [room?.day, room?.startedAt, room?.candidates])

  useEffect(() => { setWinner(null) }, [room?.startedAt])

  const addCandidate = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    try { setRoom(await api<Room>('/today/candidates', { method: 'POST', body: JSON.stringify({ name }) })); setName(''); setError('') }
    catch (e) { setError(e instanceof Error ? e.message : '후보를 추가하지 못했습니다.') }
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
    <div className="lunch-roulette-shell">
      <header className="lunch-roulette-head"><Dices size={22}/><h1>점심 룰렛</h1></header>
      {error && <p className="lunch-roulette-error">{error}</p>}
      {!room ? <p className="lunch-roulette-loading">불러오는 중…</p> : !started ? <>
        <ul className="lunch-roulette-candidates">
          {room.candidates.length === 0 && <li className="lunch-roulette-empty">아직 등록된 후보가 없습니다.</li>}
          {room.candidates.map(c => <li key={c}>{c}</li>)}
        </ul>
        <form className="lunch-roulette-form" onSubmit={event => void addCandidate(event)}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="오늘 후보(식당 이름)" maxLength={20} disabled={busy}/>
          <button type="submit" disabled={busy || !name.trim()}><Plus size={16}/>추가</button>
        </form>
        <button className="lunch-roulette-start" onClick={() => void start()} disabled={busy || room.candidates.length < 2}>
          <Play size={16}/>{room.candidates.length < 2 ? '후보 2명 이상 등록 필요' : '룰렛 시작'}
        </button>
      </> : <>
        <div className="lunch-roulette-wheel-wrap">
          <RouletteWheel key={room.startedAt} candidates={room.candidates} prizeIndex={prizeIndex} onWinner={() => setWinner(room.candidates[prizeIndex])}/>
        </div>
        {winner && <p className="lunch-roulette-winner">오늘 점심은 <b>{winner}</b> 🎉</p>}
      </>}
    </div>
  </div>
}
