import { useEffect, useState } from 'react'
import { Dices } from 'lucide-react'

/** 점심 룰렛 -- 아직 스켈레톤. box2d-wasm 로딩 스파이크만 먼저 검증(완전 흡수 통합 계획의 제일
 * 큰 리스크였다). 후보 등록/실행/맵·그래픽은 다음 단계에서 붙인다. */
export function LunchRoulettePage() {
  const [status, setStatus] = useState<'loading' | 'ok' | 'failed'>('loading')

  useEffect(() => {
    let cancelled = false
    import('../../lunch-roulette/physics').then(({ runPhysicsSmokeTest }) => runPhysicsSmokeTest()).then(result => {
      if (!cancelled) setStatus(result.loaded && result.steppedYPosition < 10 ? 'ok' : 'failed')
    }).catch(() => { if (!cancelled) setStatus('failed') })
    return () => { cancelled = true }
  }, [])

  return <div className="lunch-roulette-page">
    <div className="lunch-roulette-placeholder">
      <Dices size={40}/>
      <h1>점심 룰렛</h1>
      <p>공사 중입니다. 물리 엔진 로딩 상태: {status === 'loading' ? '확인 중…' : status === 'ok' ? '정상(구슬이 떨어짐 확인)' : '실패'}</p>
    </div>
  </div>
}
