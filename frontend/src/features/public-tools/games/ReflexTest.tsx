import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchLeaderboard, submitLeaderboardScore, type LeaderboardEntry } from '../../../lib/liveApi'

type Phase = 'ready' | 'waiting' | 'go' | 'false-start' | 'finished'
const ROUNDS = 5

export function ReflexTest() {
  const [phase, setPhase] = useState<Phase>('ready')
  const [round, setRound] = useState(0)
  const [times, setTimes] = useState<number[]>([])
  const [last, setLast] = useState<number | null>(null)
  const [nickname, setNickname] = useState('')
  const [ranking, setRanking] = useState<LeaderboardEntry[]>([])
  const [error, setError] = useState('')
  const goAt = useRef(0)
  const timer = useRef<number | undefined>(undefined)
  const score = times.length === ROUNDS ? Math.round(times.reduce((sum, time) => sum + time, 0) / ROUNDS) : null

  useEffect(() => {
    void fetchLeaderboard('reflex-test').then(data => setRanking(data.entries)).catch(() => setError('기록 서버에 연결할 수 없습니다.'))
    return () => window.clearTimeout(timer.current)
  }, [])

  const beginRound = useCallback(() => {
    window.clearTimeout(timer.current)
    setPhase('waiting')
    timer.current = window.setTimeout(() => {
      goAt.current = performance.now()
      setPhase('go')
    }, 1_200 + Math.random() * 2_800)
  }, [])

  const start = () => {
    setError(''); setTimes([]); setLast(null); setRound(1)
    beginRound()
  }

  const hit = () => {
    if (phase === 'waiting') {
      window.clearTimeout(timer.current); setPhase('false-start'); setError('대기 중에 눌러 5회 측정이 취소됐습니다. 다시 시작하세요.'); return
    }
    if (phase !== 'go') return
    const ms = Math.max(1, Math.round(performance.now() - goAt.current))
    setLast(ms)
    const next = [...times, ms]
    setTimes(next)
    if (next.length >= ROUNDS) { setRound(ROUNDS); setPhase('finished') }
    else { setRound(next.length + 1); beginRound() }
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code === 'Space' && ['waiting', 'go'].includes(phase) && (document.activeElement as HTMLElement | null)?.tagName !== 'INPUT') {
        event.preventDefault(); hit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, times, beginRound])

  const save = async () => {
    if (!nickname.trim() || score === null) return
    try {
      const result = await submitLeaderboardScore('reflex-test', nickname.trim(), score)
      setRanking(result.entries); setError('')
    } catch { setError('기록 저장에 실패했습니다. 서버 연결과 기록 범위를 확인하세요.') }
  }

  const face = phase === 'go' ? '지금 누르세요' : phase === 'waiting' ? '초록색이 될 때까지 기다리세요' : phase === 'false-start' ? '너무 빨랐어요' : phase === 'finished' ? '측정 완료' : '시작할 준비가 되면 누르세요'
  return <div className="game-layout"><section className="game-play reflex-play">
    <div className="game-toolbar"><b>{phase === 'finished' ? '5회 평균 기록' : `${Math.max(1, round)} / ${ROUNDS}회`}</b><span>{last === null ? '반응속도는 ms 단위로 측정합니다' : `직전 ${last} ms`}</span></div>
    <button className={`reflex-surface phase-${phase}`} onClick={phase === 'ready' || phase === 'false-start' ? start : hit} aria-live="polite" aria-label={face}>{face}</button>
    <p className="reflex-hint">초록색이 나타나면 클릭하거나 스페이스바를 누르세요. 대기 중 먼저 누르면 해당 측정을 다시 시작합니다.</p>
    <div className="reflex-times" aria-label="회차별 기록">{Array.from({ length: ROUNDS }, (_, i) => <span key={i} className={times[i] ? 'recorded' : ''}>{times[i] ? `${times[i]} ms` : `— ${i + 1}회`}</span>)}</div>
    {phase === 'finished' && score !== null && <div className="game-result"><strong>평균 {score} ms</strong><p>낮은 평균 반응 시간이 더 높은 순위입니다.</p><label>닉네임<input maxLength={20} value={nickname} onChange={event => setNickname(event.target.value)} placeholder="기록에 표시할 이름"/></label><button className="game-primary" disabled={!nickname.trim()} onClick={() => void save()}>랭킹 등록</button></div>}
    {error && <p role="alert">{error}</p>}
  </section><aside className="game-side"><h2>반응속도 랭킹</h2><p>5회 평균 기록 · 낮은 시간 우선</p><ol className="leaderboard">{ranking.length ? ranking.slice(0, 10).map((entry, i) => <li key={entry.id}><b>#{i + 1} {entry.nickname}</b><span>{entry.score} ms</span></li>) : <li>아직 기록이 없습니다.</li>}</ol><small>점수는 브라우저가 제출한 값이며 공식 경기 기록으로 검증되지 않습니다.</small></aside></div>
}
