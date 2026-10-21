import { useEffect, useState } from 'react'
import { fetchLeaderboard, submitLeaderboardScore, type MinesweeperDifficulty } from '../../../lib/liveApi'

type Rank = { name: string; seconds: number; date: string }
type Level = 'Beginner' | 'Intermediate' | 'Expert'
const settings: Record<Level, [number, number, number]> = { Beginner: [9, 9, 10], Intermediate: [16, 16, 40], Expert: [30, 16, 99] }

export function Minesweeper() {
  const [level, setLevel] = useState<Level>('Beginner')
  const [seed, setSeed] = useState(0)
  const [opened, setOpened] = useState<Set<number>>(new Set())
  const [flags, setFlags] = useState<Set<number>>(new Set())
  const [bombs, setBombs] = useState<Set<number>>(new Set())
  const [first, setFirst] = useState(-1)
  const [focused, setFocused] = useState(0)
  const [flagMode, setFlagMode] = useState(false)
  const [started, setStarted] = useState(0)
  const [tick, setTick] = useState(0)
  const [lost, setLost] = useState(false)
  const [nickname, setNickname] = useState('')
  const [ranks, setRanks] = useState<Rank[]>([])
  const [rankError, setRankError] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [width, height, mines] = settings[level]
  const total = width * height
  const won = !lost && opened.size === total - mines && first >= 0

  useEffect(() => {
    if (!started || lost || won) return
    const id = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - started) / 1000)
      setTick(seconds)
      setElapsedSeconds(seconds)
    }, 1000)
    return () => clearInterval(id)
  }, [started, lost, won])

  useEffect(() => {
    setRankError('')
    void fetchLeaderboard('minesweeper', level.toLowerCase() as MinesweeperDifficulty)
      .then(data => setRanks(data.entries.map(x => ({ name: x.nickname, seconds: Math.floor(x.score / 1000), date: x.createdAt }))))
      .catch(() => setRankError('랭킹 서버에 연결할 수 없습니다. 게임 서버를 실행하세요.'))
  }, [level])

  useEffect(() => {
    if (won) setAnnouncement('모든 지뢰를 피했습니다. 게임에서 이겼습니다.')
  }, [won])

  const focusCell = (cell: number) => {
    const next = Math.max(0, Math.min(total - 1, cell))
    setFocused(next)
    requestAnimationFrame(() => document.getElementById(`mine-cell-${next}`)?.focus())
  }

  const revealMany = (starts: number[]) => {
    if (lost || won) return
    let activeBombs = bombs
    if (first < 0) {
      const initial = starts.find(i => !flags.has(i))
      if (initial === undefined) return
      setFirst(initial)
      setStarted(Date.now())
      const choices = Array.from({ length: total }, (_, i) => i).filter(i => i !== initial)
      activeBombs = new Set()
      while (activeBombs.size < mines) activeBombs.add(choices[Math.floor(Math.random() * choices.length)])
      setBombs(activeBombs)
    }
    const next = new Set(opened)
    const queue = [...starts]
    const hitBombs: number[] = []
    while (queue.length) {
      const cell = queue.pop()!
      if (next.has(cell) || flags.has(cell)) continue
      if (activeBombs.has(cell)) { hitBombs.push(cell); continue }
      next.add(cell)
      if (countAround(cell, activeBombs, width, height) === 0) {
        const x = cell % width, y = Math.floor(cell / width)
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) queue.push(ny * width + nx)
        }
      }
    }
    if (hitBombs.length) {
      hitBombs.forEach(i => next.add(i))
      setLost(true)
      setAnnouncement('지뢰를 밟았습니다. 게임이 끝났습니다.')
    }
    setOpened(next)
  }

  const reveal = (cell: number) => revealMany([cell])
  const toggleFlag = (cell: number) => {
    if (opened.has(cell) || lost || won) return
    setFlags(old => {
      const next = new Set(old)
      next.has(cell) ? next.delete(cell) : next.add(cell)
      return next
    })
    const count = flags.has(cell) ? flags.size - 1 : flags.size + 1
    setAnnouncement(`깃발 ${count}개, 남은 지뢰 ${mines - count}개`)
  }
  const activateCell = (cell: number) => flagMode ? toggleFlag(cell) : reveal(cell)
  const reset = () => {
    setSeed(value => value + 1); setOpened(new Set()); setFlags(new Set()); setBombs(new Set())
    setFirst(-1); setFocused(0); setFlagMode(false); setStarted(0); setTick(0); setElapsedSeconds(0)
    setLost(false); setNickname(''); setAnnouncement('새 게임을 시작했습니다.')
  }
  const submit = async () => {
    const name = nickname.trim().slice(0, 20)
    if (!name || !won) return
    setRankError('')
    try {
      const data = await submitLeaderboardScore('minesweeper', name, Date.now() - started, level.toLowerCase() as MinesweeperDifficulty)
      setRanks(data.entries.map(x => ({ name: x.nickname, seconds: Math.floor(x.score / 1000), date: x.createdAt })))
      setNickname(''); setAnnouncement('기록을 등록했습니다.')
    } catch { setRankError('기록을 저장하지 못했습니다. 게임 서버 연결을 확인하세요.') }
  }
  const gameFace = lost ? '😵' : won ? '😎' : '🙂'

  return <div className="game-layout mine-layout">
    <section className="game-play mine-wrap">
      <div className="mine-header">
        <button aria-label="새 게임" onClick={reset}>{gameFace}</button>
        <b aria-label={`남은 지뢰 ${Math.max(0, mines - flags.size)}개`}>{String(Math.max(0, mines - flags.size)).padStart(3, '0')}</b>
        <strong aria-label={`경과 시간 ${tick}초`}>{String(Math.min(999, tick)).padStart(3, '0')}</strong>
      </div>
      <div className="mine-controls" role="group" aria-label="칸 동작 선택">
        <button aria-pressed={!flagMode} className={!flagMode ? 'selected' : ''} onClick={() => setFlagMode(false)}>열기</button>
        <button aria-pressed={flagMode} className={flagMode ? 'selected' : ''} onClick={() => setFlagMode(true)}>깃발 표시</button>
      </div>
      <p className="mine-help">방향키 이동 · Enter/Space 열기 · F 깃발</p>
      <div className="mine-board-scroll" aria-label={`${level} 지뢰찾기 보드, ${width}열 ${height}행`}>
        <div className="mine-grid classic-mine" role="grid" aria-label="지뢰찾기 게임판" aria-rowcount={height} aria-colcount={width} style={{ gridTemplateColumns: `repeat(${width}, 28px)` }}>
          {Array.from({ length: total }, (_, i) => {
            const exposed = opened.has(i), bomb = bombs.has(i), number = countAround(i, bombs, width, height)
            const wrongFlag = lost && flags.has(i) && !bomb
            const label = wrongFlag ? '잘못 놓은 깃발' : flags.has(i) ? '깃발 표시' : (exposed || lost) && bomb ? '지뢰' : exposed ? `열림${number ? `, 주변 지뢰 ${number}개` : ', 빈 칸'}` : '닫힘'
            const content = wrongFlag ? '✕' : flags.has(i) ? '⚑' : (exposed || lost) && bomb ? '✹' : exposed && number ? number : ''
            return <button key={`${seed}-${i}`} id={`mine-cell-${i}`} role="gridcell" tabIndex={focused === i ? 0 : -1}
              aria-label={`행 ${Math.floor(i / width) + 1}, 열 ${i % width + 1}, ${label}`}
              className={`${exposed ? `exposed ${number ? `n${number}` : ''}` : ''}${wrongFlag ? ' wrong-flag' : ''}`}
              onFocus={() => setFocused(i)} onClick={() => { setFocused(i); activateCell(i) }}
              onContextMenu={event => { event.preventDefault(); setFocused(i); toggleFlag(i) }}
              onDoubleClick={() => { if (exposed && number > 0 && [...neighbors(i, width, height)].filter(n => flags.has(n)).length === number) revealMany(neighbors(i, width, height)) }}
              onKeyDown={event => {
                const moves: Record<string, number> = { ArrowUp: -width, ArrowDown: width, ArrowLeft: -1, ArrowRight: 1 }
                if (event.key in moves) {
                  const row = Math.floor(i / width), column = i % width
                  if ((event.key === 'ArrowUp' && row === 0) || (event.key === 'ArrowDown' && row === height - 1) || (event.key === 'ArrowLeft' && column === 0) || (event.key === 'ArrowRight' && column === width - 1)) return
                  event.preventDefault(); focusCell(i + moves[event.key])
                }
                else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activateCell(i) }
                else if (event.key.toLowerCase() === 'f') { event.preventDefault(); toggleFlag(i) }
              }}>{content}</button>
          })}
        </div>
      </div>
      <div className="mine-status" aria-live="polite" aria-atomic="true">{lost || won ? '' : announcement}</div>
      {lost && <div className="game-result" role="alert"><h3>지뢰를 밟았습니다.</h3><button onClick={reset}>다시 시작</button></div>}
      {won && <div className="game-result" role="status"><h3>완료 · {elapsedSeconds}초</h3><label>닉네임<input value={nickname} onChange={event => setNickname(event.target.value)} maxLength={20} /></label><button onClick={() => void submit()} disabled={!nickname.trim()}>기록 등록</button>{rankError && <p role="alert">{rankError}</p>}</div>}
    </section>
    <aside className="game-side"><h2>난이도</h2>{(Object.keys(settings) as Level[]).map(item => <button key={item} className={level === item ? 'selected' : ''} onClick={() => { setLevel(item); reset() }}>{item} · {settings[item][0]}×{settings[item][1]} · {settings[item][2]}개</button>)}<h2>최고 기록 · {level}</h2><ol className="leaderboard">{ranks.slice(0, 10).map((rank, i) => <li key={`${rank.name}-${i}`}><b>#{i + 1} {rank.name}</b><span>{rank.seconds}초</span></li>)}</ol><small>오른쪽 클릭·깃발 모드로 표시. 열린 숫자는 주변 깃발 수가 맞으면 더블 클릭할 수 있습니다. 기록은 브라우저 판정이라 공식 대회 기록으로 검증되지 않습니다. 보드는 자체 클래식 규칙 구현이며 Windows 원본 역공학 결과가 아닙니다.</small>{rankError && <p role="alert">{rankError}</p>}</aside>
  </div>
}

function countAround(i: number, bombs: Set<number>, width: number, height: number) {
  let count = 0
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = i % width + dx, y = Math.floor(i / width) + dy
    if (x >= 0 && x < width && y >= 0 && y < height && bombs.has(y * width + x)) count++
  }
  return count
}
function neighbors(i: number, width: number, height: number) {
  const cells: number[] = []
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = i % width + dx, y = Math.floor(i / width) + dy
    if ((dx !== 0 || dy !== 0) && x >= 0 && x < width && y >= 0 && y < height) cells.push(y * width + x)
  }
  return cells
}
