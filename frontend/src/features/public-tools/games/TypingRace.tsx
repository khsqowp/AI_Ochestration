import { useEffect, useRef, useState } from 'react'
import { connectLiveSocket, type LiveSocket, type LiveServerEvent } from '../../../lib/liveSocket'

const enA = ['A quiet morning', 'A careful traveler', 'The small workshop', 'Every useful habit', 'An open window', 'The night market', 'A curious reader', 'The old lighthouse', 'A bright idea', 'The garden path', 'A patient artist', 'A friendly neighbor', 'The mountain train', 'A paper notebook', 'The first snow', 'A little bakery', 'The city library', 'A steady rhythm', 'The blue bicycle', 'A warm cup of tea']
const enB = ['creates room for a fresh start.', 'moves one step closer to a clear goal.', 'finds a better way through a simple question.', 'keeps a promise by finishing one small task.', 'shares a useful thought with the whole team.']
const koA = ['조용한 아침에는', '꼼꼼한 여행자는', '작은 작업실에서', '꾸준한 습관은', '열린 창문 너머로', '저녁 시장에는', '호기심 많은 독자는', '오래된 등대는', '새로운 생각은', '정원으로 난 길은', '인내심 있는 화가는', '친절한 이웃은', '산길을 달리는 기차는', '종이 노트에는', '첫눈이 내리는 날에는', '동네 빵집에서는', '도시의 도서관은', '일정한 리듬은', '파란 자전거는', '따뜻한 차 한 잔은']
const koB = ['새로운 시작을 위한 여유를 만듭니다.', '작은 질문에서 더 나은 방법을 찾습니다.', '하나의 일을 끝내며 약속을 지킵니다.', '분명한 목표를 향해 한 걸음 다가갑니다.', '쓸모 있는 생각을 주변 사람과 나눕니다.']
const passages = {
  en: Array.from({ length: 100 }, (_, i) => `${enA[i % 20]} ${enB[Math.floor(i / 20)]}`),
  ko: Array.from({ length: 100 }, (_, i) => `${koA[i % 20]} ${koB[Math.floor(i / 20)]}`),
}

type Locale = 'ko' | 'en'
type Mode = 'practice' | 'race'
type Player = { id?: string; nickname: string; chars: number; wpm: number; finished: boolean; accuracy?: number; durationMs?: number }
type RaceResult = { rank: number; id: string; nickname: string; durationMs: number; wpm: number; accuracy: number }
type RaceStatus = 'waiting' | 'countdown' | 'running' | 'finished'
type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'error'

const connectionLabel: Record<ConnectionStatus, string> = {
  connecting: '서버 연결 중',
  open: '서버 연결됨',
  closed: '서버 연결 끊김',
  error: '서버 연결 오류',
}

export function TypingRace() {
  const [lang, setLang] = useState<Locale>('ko')
  const [mode, setMode] = useState<Mode>('practice')
  const [index, setIndex] = useState(() => Math.floor(Math.random() * 100))
  const [value, setValue] = useState('')
  const [start, setStart] = useState(0)
  const [countdown, setCountdown] = useState(0)
  const [players, setPlayers] = useState<Player[]>([])
  const [nickname, setNickname] = useState('')
  const [joined, setJoined] = useState(false)
  const [raceStatus, setRaceStatus] = useState<RaceStatus>('waiting')
  const [raceText, setRaceText] = useState('')
  const [socket, setSocket] = useState<LiveSocket | null>(null)
  const [connection, setConnection] = useState<ConnectionStatus>('closed')
  const [error, setError] = useState('')
  const [rank, setRank] = useState<number | null>(null)
  const [raceResults, setRaceResults] = useState<RaceResult[]>([])
  const [connectionAttempt, setConnectionAttempt] = useState(0)
  const [connectionLost, setConnectionLost] = useState(false)
  const clientId = useRef('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const countdownTimer = useRef<number | null>(null)
  const hostIdRef = useRef('')
  const [hostId, setHostId] = useState('')

  const passage = mode === 'race' && raceText ? raceText : passages[lang][index]
  const typedComplete = value === passage
  const ownPlayer = players.find(player => player.id === clientId.current)
  const practiceDone = mode === 'practice' && typedComplete
  const raceFinished = mode === 'race' && Boolean(ownPlayer?.finished)
  const done = practiceDone || raceFinished
  const correct = [...value].filter((character, position) => character === [...passage][position]).length
  const accuracy = value.length ? Math.round(correct / [...value].length * 100) : 100
  const elapsed = start ? Math.max(1, (performance.now() - start) / 60000) : 0
  const wpm = value ? Math.round((value.length / (lang === 'en' ? 5 : 1)) / elapsed) : 0
  const shownAccuracy = mode === 'race' ? ownPlayer?.accuracy ?? 100 : accuracy
  const shownWpm = mode === 'race' ? ownPlayer?.wpm ?? 0 : wpm
  const isActiveRace = raceStatus === 'running' || raceStatus === 'countdown'
  const isHost = Boolean(joined && clientId.current && clientId.current === hostId)

  useEffect(() => {
    if (mode !== 'race') return
    const live = connectLiveSocket((event: LiveServerEvent) => {
      if (event.type === 'hello') {
        clientId.current = String(event.id || '')
      } else if (event.type === 'race.lobby') {
        const lobby = event as unknown as { status: RaceStatus; hostId: string | null; passage?: { text: string; locale: Locale }; players: Player[] }
        setRaceStatus(lobby.status)
        hostIdRef.current = lobby.hostId || ''
        setHostId(hostIdRef.current)
        setPlayers(lobby.players || [])
        setJoined((lobby.players || []).some(player => player.id === clientId.current))
        if (lobby.passage?.text) {
          setRaceText(lobby.passage.text)
          setLang(lobby.passage.locale)
        }
      } else if (event.type === 'race.started') {
        const race = event as unknown as { passage: { text: string; locale: Locale }; players: Player[]; startsAt: number; countdownMs: number }
        setRaceText(race.passage.text)
        setLang(race.passage.locale)
        setPlayers(race.players || [])
        setValue('')
        setRank(null)
        setRaceResults([])
        setStart(0)
        setCountdown(Math.ceil(race.countdownMs / 1000))
        requestAnimationFrame(() => inputRef.current?.focus())
        if (countdownTimer.current !== null) window.clearInterval(countdownTimer.current)
        const timer = window.setInterval(() => {
          const left = Math.max(0, Math.ceil((race.startsAt - Date.now()) / 1000))
          setCountdown(left)
          if (left <= 0) {
            window.clearInterval(timer)
            countdownTimer.current = null
          }
        }, 100)
        countdownTimer.current = timer
      } else if (event.type === 'race.go') {
        const race = event as unknown as { startedAt: number }
        setRaceStatus('running')
        setCountdown(0)
        setStart(performance.now())
        requestAnimationFrame(() => inputRef.current?.focus())
      } else if (event.type === 'race.results') {
        const resultEvent = event as unknown as { results: RaceResult[] }
        const results = resultEvent.results || []
        setRaceResults(results)
        const me = results.find(player => player.id === clientId.current)
        if (me) setRank(me.rank)
      } else if (event.type === 'error') {
        setError(String(event.message || event.code))
      }
    }, status => {
      setConnection(status)
      if (status === 'open') {
        setConnectionLost(false)
      } else if (status === 'closed' || status === 'error') {
        setConnectionLost(true)
        setJoined(false)
        setError(status === 'closed' ? '서버 연결이 끊겼습니다. 다시 연결한 뒤 레이스에 참가하세요.' : '서버 연결에 문제가 있습니다. 다시 연결해 주세요.')
        if (countdownTimer.current !== null) window.clearInterval(countdownTimer.current)
        countdownTimer.current = null
        setCountdown(0)
      }
    })
    setSocket(live)
    return () => {
      if (countdownTimer.current !== null) window.clearInterval(countdownTimer.current)
      countdownTimer.current = null
      live.send({ type: 'race.leave' })
      live.close()
      setSocket(null)
    }
  }, [mode, connectionAttempt])

  useEffect(() => {
    if (mode === 'race' && joined && socket && raceStatus === 'running' && !raceFinished) {
      const timer = window.setTimeout(() => socket.send({ type: 'race.progress', text: value }), 120)
      return () => window.clearTimeout(timer)
    }
  }, [mode, joined, socket, value, raceFinished, raceStatus])

  useEffect(() => {
    if (mode === 'race' && typedComplete && joined && socket && raceStatus === 'running' && !raceFinished) socket.send({ type: 'race.finish', text: value })
  }, [mode, typedComplete, joined, socket, value, raceStatus, raceFinished])

  const next = () => {
    setIndex(current => {
      const candidate = Math.floor(Math.random() * 99)
      return candidate >= current ? candidate + 1 : candidate
    })
    setValue('')
    setStart(0)
    setRank(null)
    setError('')
  }

  const join = () => {
    if (!nickname.trim()) {
      setError('닉네임을 입력하세요.')
      return
    }
    if (connection !== 'open') {
      setError('서버에 연결된 뒤 다시 시도하세요.')
      return
    }
    setError('')
    socket?.send({ type: 'race.join', nickname: nickname.trim().slice(0, 20) })
  }

  const reconnect = () => {
    setConnectionLost(false)
    setError('')
    setJoined(false)
    setPlayers([])
    setHostId('')
    hostIdRef.current = ''
    setRaceStatus('waiting')
    setRaceText('')
    setValue('')
    setStart(0)
    setCountdown(0)
    setRank(null)
    setRaceResults([])
    setConnectionAttempt(attempt => attempt + 1)
  }

  const startRace = () => {
    if (!joined) {
      setError('레이스 참가를 먼저 누르세요.')
      return
    }
    if (clientId.current !== hostIdRef.current) {
      setError('방 개설자만 레이스를 시작할 수 있습니다.')
      return
    }
    setError('')
    socket?.send({ type: 'race.start', locale: lang })
  }

  const change = (text: string) => {
    if (countdown > 0 || done || (mode === 'race' && (!joined || raceStatus !== 'running' || connection !== 'open'))) return
    if (!start && text) setStart(performance.now())
    setValue([...text].slice(0, [...passage].length).join(''))
  }

  const selectMode = (nextMode: Mode) => {
    if (mode === nextMode) return
    setMode(nextMode)
    setValue('')
    setStart(0)
    setCountdown(0)
    setError('')
    setRank(null)
    setRaceResults([])
    if (nextMode === 'practice') setJoined(false)
  }

  const retryFinish = () => {
    if (!joined || !socket || connection !== 'open' || raceStatus !== 'running' || !typedComplete || raceFinished) return
    setError('')
    socket.send({ type: 'race.finish', text: value })
  }

  return (
    <div className={`typing-shell typing-shell--${mode}`}>
      <header className="typing-toolbar">
        <div className="typing-mode-switch" role="group" aria-label="타자 모드">
          <button type="button" className={mode === 'practice' ? 'selected' : ''} aria-pressed={mode === 'practice'} onClick={() => selectMode('practice')}>혼자 연습</button>
          <button type="button" className={mode === 'race' ? 'selected' : ''} aria-pressed={mode === 'race'} onClick={() => selectMode('race')}>실시간 레이스</button>
        </div>
        <label className="typing-language">언어
          <select disabled={mode === 'race' && isActiveRace} value={lang} onChange={event => {
            setLang(event.target.value as Locale)
            setValue('')
            setStart(0)
            setError('')
            if (mode === 'practice') next()
          }}>
            <option value="ko">한국어 · 자/분</option>
            <option value="en">English · WPM</option>
          </select>
        </label>
      </header>

      {mode === 'race' && (
        <section className="race-room" aria-label="레이스 대기실">
          <div className="race-room__header">
            <div>
              <p className="race-room__eyebrow">LIVE ROOM</p>
              <h2>실시간 레이스</h2>
              <p className="race-room__description">같은 문장을 동시에 입력하고 순위를 겨뤄보세요.</p>
            </div>
            <span className={`race-connection race-connection--${connection}`} role="status">
              <i aria-hidden="true" />{connectionLabel[connection]}
            </span>
          </div>

          <div className="race-room__controls">
            <label className="race-nickname">닉네임
              <input maxLength={20} disabled={joined || isActiveRace} value={nickname} onChange={event => setNickname(event.target.value)} placeholder="레이서 이름" />
            </label>
            <button className="race-join-button" type="button" onClick={join} disabled={joined || isActiveRace || connection !== 'open'}>
              {joined ? '참가 중' : players.length === 0 ? '방 만들기' : '방 참가'}
            </button>
            {isHost ? (
              <button className="race-start-button" type="button" disabled={isActiveRace || connection !== 'open'} onClick={startRace}>
                <span aria-hidden="true">▶</span> {raceStatus === 'finished' ? '다음 레이스 시작' : '레이스 시작'}
              </button>
            ) : (
              <p className="race-host-wait" role="status">{joined ? '방 개설자가 시작하면 레이스가 출발합니다.' : '참가하면 대기실에 표시됩니다.'}</p>
            )}
          </div>

          {connectionLost && (
            <div className="race-connection-lost" role="alert">
              <span>연결이 끊겨 레이스 입력을 멈췄습니다. 재연결 후 대기실에 다시 참가하세요.</span>
              <button type="button" onClick={reconnect}>다시 연결</button>
            </div>
          )}
          {error && <p className="race-error" role="alert">{error}</p>}

          <div className="race-roster-heading">
            <h3>참가자</h3>
            <span>{players.length} / 10</span>
          </div>
          {players.length ? (
            <ol className="race-roster">
              {players.map(player => {
                const progress = raceText ? Math.min(100, Math.round(player.chars / [...raceText].length * 100)) : 0
                const isMe = player.id === clientId.current
                return (
                  <li key={player.id || player.nickname} className={`race-roster__player${isMe ? ' is-me' : ''}`}>
                    <div className="race-roster__identity">
                      <b>{player.nickname}</b>
                      {isMe && <span className="race-you-badge">나</span>}
                      {player.id === hostId && <span className="race-host-badge">방장</span>}
                      {player.finished && <span className="race-finished-badge">완주</span>}
                    </div>
                    <progress aria-label={`${player.nickname} 진행률`} value={progress} max="100" />
                    <span className="race-roster__score">{progress}% <small>{player.wpm} {lang === 'ko' ? '자/분' : 'WPM'}</small></span>
                  </li>
                )
              })}
            </ol>
          ) : (
            <p className="race-empty">아직 참가자가 없습니다. 닉네임을 정하고 방을 만들어보세요.</p>
          )}
        </section>
      )}

      <section className="typing-race-card" aria-label={mode === 'race' ? '타자 레이스' : '타자 연습'}>
        <div className="typing-race-card__header">
          <div>
            <p className="typing-race-card__eyebrow">{mode === 'race' ? 'SHARED PASSAGE' : `PRACTICE · ${index + 1} / 100`}</p>
            <h2>{mode === 'race' ? '모두 같은 문장으로 출발합니다' : '문장을 보고 그대로 입력하세요'}</h2>
          </div>
          <div className="typing-live-metrics">
            <span className="typing-metric"><b>{shownAccuracy}%</b><small>정확도</small></span>
            <span className="typing-metric"><b>{shownWpm}</b><small>{lang === 'ko' ? '자/분' : 'WPM'}</small></span>
          </div>
        </div>

        <p className="typing-passage" aria-label="입력할 문장">
          {[...passage].map((character, position) => (
            <span key={`${position}-${character}`} className={position < [...value].length ? ([...value][position] === character ? 'typed-correct' : 'typed-error') : position === [...value].length ? 'typed-current' : ''}>{character}</span>
          ))}
        </p>

        {mode === 'race' && countdown > 0 && (
          <div className="race-countdown" role="status" aria-live="polite" aria-label={`출발까지 ${countdown}초`}>
            <span>{countdown}</span><small>출발 준비</small>
          </div>
        )}
        {mode === 'race' && typedComplete && !raceFinished && raceStatus === 'running' && (
          <div className="race-finish-pending" role="status" aria-live="polite">
            <span>완주 기록을 서버에서 확인하고 있습니다.</span>
            {error && <button type="button" onClick={retryFinish}>기록 다시 보내기</button>}
          </div>
        )}
        {mode === 'race' && raceFinished && (
          <div className="race-finish-confirmed" role="status">서버 기록 완료{rank ? ` · 현재 ${rank}위` : ' · 다른 참가자의 완주를 기다리는 중'}</div>
        )}

        {mode === 'race' && raceStatus === 'waiting' && !joined && (
          <p className="typing-input-hint">대기실에 참가하면 입력창이 준비됩니다.</p>
        )}
        {mode === 'race' && raceStatus === 'waiting' && joined && (
          <p className="typing-input-hint">입력창에 포커스한 상태로 출발을 기다립니다.</p>
        )}
        {mode === 'race' && countdown > 0 && (
          <p className="typing-input-hint" role="status">입력창은 준비됐습니다. 카운트다운 중에는 입력되지 않습니다.</p>
        )}
        {mode === 'race' && raceStatus === 'countdown' && countdown === 0 && (
          <p className="typing-input-hint" role="status">출발 신호를 기다리는 중입니다. 입력창은 아직 잠겨 있습니다.</p>
        )}

        <textarea
          ref={inputRef}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={value}
          onChange={event => change(event.target.value)}
          placeholder={mode === 'race' ? !joined ? '먼저 레이스에 참가하세요' : raceStatus === 'running' ? '문장을 입력하세요' : raceStatus === 'finished' ? '이번 레이스가 끝났습니다' : countdown > 0 ? '출발 신호를 기다리는 중' : '레이스 시작을 기다리는 중' : '문장을 입력하세요'}
          readOnly={mode === 'race' && (raceStatus !== 'running')}
          disabled={practiceDone || raceFinished || (mode === 'race' && (!joined || connection !== 'open' || connectionLost))}
          aria-label={mode === 'race' && countdown > 0 ? '카운트다운 중 입력 대기' : '문장 입력'}
          aria-describedby="typing-input-help"
        />
        <span id="typing-input-help" className="typing-input-help">
          {mode === 'race' ? '레이스 도중에는 되돌리거나 붙여넣을 수 없습니다.' : '오타는 색으로 표시됩니다. 문장을 끝까지 입력하면 기록이 계산됩니다.'}
        </span>

        <div className="typing-actions">
          {mode === 'practice' ? (
            <button className="typing-next-button" type="button" onClick={next}>새 문장 <span aria-hidden="true">↗</span></button>
          ) : (
            <span className="typing-race-state" role="status">{raceStatus === 'running' ? '레이스 진행 중' : raceStatus === 'finished' ? '레이스 완료' : '다른 참가자를 기다리는 중'}</span>
          )}
          <span>{lang === 'ko' ? '분당 입력 글자 수' : '표준 단어/분 (5자=1단어)'}</span>
        </div>

        {mode === 'practice' && practiceDone && (
          <div className="typing-complete" role="status">
            <span className="typing-complete__icon" aria-hidden="true">✓</span>
            <div><small>연습 완료</small><strong>{wpm} {lang === 'ko' ? '자/분' : 'WPM'} <i>·</i> 정확도 {accuracy}%</strong></div>
            <button type="button" onClick={next}>다음 문장</button>
          </div>
        )}

        {mode === 'race' && raceStatus === 'finished' && (
          <section className="race-results" aria-labelledby="race-results-title">
            <div className="race-results__header">
              <div><p className="typing-race-card__eyebrow">ROUND RESULTS</p><h3 id="race-results-title">이번 레이스 순위</h3></div>
              {rank && <span className="race-my-rank">내 순위 <b>{rank}위</b></span>}
            </div>
            {raceResults.length ? (
              <ol className="race-results__list">
                {raceResults.map(result => (
                  <li key={result.id} className={result.id === clientId.current ? 'is-me' : ''}>
                    <strong>{String(result.rank).padStart(2, '0')}</strong><span>{result.nickname}{result.id === clientId.current && <small>나</small>}</span>
                    <b>{result.wpm} {lang === 'ko' ? '자/분' : 'WPM'}</b><small>{result.accuracy}%</small>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="race-results__waiting">모든 참가자가 완주하면 순위가 표시됩니다.</p>
            )}
          </section>
        )}
      </section>
      <small className="typing-source-note">연습 문장은 자체 제작 100개입니다. 서버 레이스도 별도의 자체 제작 문장집을 사용합니다.</small>
    </div>
  )
}
