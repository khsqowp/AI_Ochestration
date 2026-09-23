import { useEffect, useRef, useState } from 'react'
import { stages } from './data/maps'
import { gameRandom, pickMapIndex } from './rng'
import { Roulette } from './roulette'
import options from './options'

interface MarbleRaceProps {
  /** 모든 클라이언트가 동일하게 만들 수 있는 방 식별자(day+시작시각+후보목록). 이 문자열 하나로
   * PRNG 시드 + 맵 선택 + 스폰 순서 + 스킬 발동까지 전부 재현된다(rng.ts 주석 참고). */
  roomKey: string
  candidates: string[]
  /** 켜면 경주가 끝날 때 mp4를 자동으로 다운로드한다(브라우저별로 각자). 기본은 꺼짐 -- 공용
   * 사무실 화면에서 매번 조용히 다운로드가 뜨면 당황스럽다. */
  record: boolean
  onWinner: (name: string) => void
}

/** lazygyu/roulette 엔진을 캔버스 하나에 마운트해서 굴린다. day+시작시각+후보목록이 같으면
 * 어느 브라우저에서 열어도 물리 시뮬레이션이 똑같이 진행되어 같은 구슬이 이긴다(rng.ts). */
export function MarbleRace({ roomKey, candidates, record, onWinner }: MarbleRaceProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let cancelled = false
    let startTimer = 0

    gameRandom.seed(roomKey)
    const mapIndex = pickMapIndex(stages.length)
    options.autoRecording = record

    const roulette = new Roulette(container)

    const onGoal = (e: Event) => {
      const detail = (e as CustomEvent<{ winner: string }>).detail
      onWinner(detail.winner)
    }
    roulette.addEventListener('goal', onGoal)

    const waitReady = () => {
      if (cancelled) return
      if (!roulette.isReady) {
        window.setTimeout(waitReady, 50)
        return
      }
      roulette.setTheme('dark')
      // 맵을 먼저 바꾼 뒤(아직 구슬 없음, 랜덤 안 씀) 후보를 채운다 -- 이 순서로 해야 스폰
      // 셔플/쿨타임 굴림이 맵 선택 이후에 일어나 모든 클라이언트가 같은 순서로 gameRandom을 소비한다
      roulette.setMap(mapIndex)
      roulette.setMarbles(candidates)
      setReady(true)
      startTimer = window.setTimeout(() => {
        if (!cancelled) roulette.start()
      }, 1200)
    }
    waitReady()

    return () => {
      cancelled = true
      window.clearTimeout(startTimer)
      roulette.removeEventListener('goal', onGoal)
      roulette.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roomKey 하나로 후보/기록여부까지
    // 전부 파생되고, 부모가 key={roomKey}로 이 컴포넌트를 통째로 재마운트하므로 마운트당 1회면 된다
  }, [])

  return (
    <div className="marble-race-wrap">
      <div className="marble-race-canvas" ref={containerRef} />
      {!ready && <p className="marble-race-loading">물리 엔진 불러오는 중…</p>}
    </div>
  )
}
