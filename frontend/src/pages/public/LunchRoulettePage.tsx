import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Dices, Play, Plus } from 'lucide-react'

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
 * 물리 시뮬레이션은 각 브라우저가 동일 후보 순서로 로컬 재생(서버는 승자를 계산하지 않는다) --
 * 자세한 이유는 lunch-roulette/simulation.ts 상단 주석. */
export function LunchRoulettePage() {
  const [room, setRoom] = useState<Room | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [winner, setWinner] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const raceStartedForRef = useRef<string | null>(null)

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

  // 레이스 본체 -- startedAt이 생기면(내가 눌렀든 남이 눌렀든) 한 번만 시뮬레이션을 만들고 rAF로 돌린다.
  useEffect(() => {
    if (!room?.startedAt || room.candidates.length < 2) return
    if (raceStartedForRef.current === room.startedAt) return
    raceStartedForRef.current = room.startedAt
    let cancelled = false
    let frame = 0
    const startedAtMs = new Date(room.startedAt).getTime()

    void (async () => {
      const [{ LunchRace }, { drawRace }] = await Promise.all([import('../../lunch-roulette/simulation'), import('../../lunch-roulette/renderer')])
      const race = await LunchRace.create(room.candidates)
      if (cancelled) { race.destroy(); return }
      const elapsedOnJoin = (Date.now() - startedAtMs) / 1000
      if (elapsedOnJoin > 0) race.fastForward(elapsedOnJoin)

      const tick = () => {
        if (cancelled) return
        race.step()
        const snapshot = race.snapshot()
        const canvas = canvasRef.current
        if (canvas) {
          const ctx = canvas.getContext('2d')
          const width = canvas.clientWidth, height = canvas.clientHeight
          if (ctx && (canvas.width !== width || canvas.height !== height)) { canvas.width = width; canvas.height = height }
          if (ctx) drawRace(ctx, canvas.width, canvas.height, snapshot)
        }
        if (snapshot.winner) { setWinner(snapshot.winner); return }
        frame = requestAnimationFrame(tick)
      }
      tick()
    })()

    return () => { cancelled = true; if (frame) cancelAnimationFrame(frame) }
  }, [room?.startedAt, room?.candidates])

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

  const started = room?.startedAt != null

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
        <canvas ref={canvasRef} className="lunch-roulette-canvas"/>
        {winner && <p className="lunch-roulette-winner">오늘 점심은 <b>{winner}</b> 🎉</p>}
      </>}
    </div>
  </div>
}
