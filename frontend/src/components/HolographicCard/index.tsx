// vgpu 커뮤니티 예제(holographic-card) 그대로 포팅 -- WebGPU 셰이더 로직(scene.ts/
// renderer.ts/lettering.ts/shader.wgsl)은 손대지 않음. 이 프로젝트는 Tailwind가 없어서
// 원본의 유틸리티 클래스만 styles.css의 일반 클래스로 바꿈(동작은 동일).
import { useEffect, useRef, useState } from 'react'
import { createRenderer } from './renderer'

export function HolographicCard() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let mounted = true
    const renderer = createRenderer(canvas)
    void renderer.ready.catch((cause: unknown) => {
      if (!mounted) return
      console.error('Holographic card initialization failed:', cause)
      setError(true)
    })
    return () => { mounted = false; renderer.dispose() }
  }, [])

  return (
    <div className="holo-card">
      <canvas ref={canvasRef} className="holo-card-canvas" aria-label="ochestration. Holographic. Light, computed. Edition 001. LAB. A graphite card with a visible triangle outline; hover or drag to reveal its holographic engraving."/>
      <p className="holo-card-caption">{error ? 'This example requires a LAB-capable browser.' : 'MOVE TO REVEAL'}</p>
    </div>
  )
}

export default HolographicCard
