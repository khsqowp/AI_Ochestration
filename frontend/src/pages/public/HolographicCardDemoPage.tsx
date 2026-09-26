import { HolographicCard } from '../../components/HolographicCard'

// 배치 위치는 임시 -- vgpu holographic-card 예제가 실제로 빌드/렌더되는지 확인하기 위한
// 데모 라우트. 최종적으로 어디에 넣을지는 사용자 결정 대기 중.
export function HolographicCardDemoPage() {
  return <div style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', background: '#050506' }}>
    <div style={{ width: 380, height: 540 }}>
      <HolographicCard/>
    </div>
  </div>
}
