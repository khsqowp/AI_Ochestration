import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Dices, Play, Plus } from 'lucide-react'
import { MarbleRace } from '../../marble-roulette/MarbleRace'

interface Room { day: string; candidates: string[]; startedAt: string | null }

const POLL_MS = 3000

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

  // 모든 클라이언트가 같은 값을 얻는 방 식별자 -- MarbleRace가 이 값으로 물리 시뮬레이션을
  // 재현한다(marble-roulette/rng.ts).
  const roomKey = useMemo(() => {
    if (!room?.startedAt) return null
    return `${room.day}|${room.startedAt}|${room.candidates.join(',')}`
  }, [room?.day, room?.startedAt, room?.candidates])

  useEffect(() => { setWinner(null) }, [roomKey])

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
    <div className={`lunch-roulette-shell${started ? ' lunch-roulette-shell--racing' : ''}`}>
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
