import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, type SimulationNodeDatum } from 'd3-force'
import { FileText, X } from 'lucide-react'
import type { GraphData, MarkdownDoc } from '../lib/types'
import { documentTitle } from '../lib/util'
import { DocumentCard, PanelShell } from '../components/shared'

/** 노드를 원 둘레에 균등 배치하던 이전 방식은 노드 수가 늘면(지금 100개 이상) 라벨이 서로 겹쳐 뭉친
 * 원형 덩어리로만 보였다 -- d3-force로 실제 반발력·링크 인력 시뮬레이션을 돌려 자연스럽게 퍼지게 하고,
 * 계산된 좌표의 실제 bounding box를 0~100 퍼센트 좌표로 정규화해 기존 퍼센트 기반 렌더링과 그대로 맞춘다. */
function useForceLayout(graph: GraphData | null): Record<string, { x: number; y: number }> {
  return useMemo(() => {
    if (!graph || graph.nodes.length === 0) return {}
    const nodePaths = new Set(graph.nodes.map(node => node.path))
    const simNodes: (SimulationNodeDatum & { id: string; category: string })[] = graph.nodes.map(node => ({ id: node.path, category: node.category }))
    const simLinks = graph.edges
      .filter(edge => nodePaths.has(edge.from) && nodePaths.has(edge.to))
      .map(edge => ({ source: edge.from, target: edge.to }))

    const width = 800, height = 600
    // 카테고리별로 캔버스 둘레에 중심점을 하나씩 배정하고, 매 틱마다 노드를 자기 카테고리의 중심 쪽으로
    // 약하게 당겨서 색상뿐 아니라 위치로도 주제 구역이 뭉쳐 보이게 한다 -- link/charge보다 약하게 줘서
    // 실제 연결(엣지) 기반 배치를 구역 배정이 뭉개지 않게 한다.
    const categories = [...new Set(simNodes.map(node => node.category))]
    const clusterRadius = Math.min(width, height) * 0.32
    const centroids: Record<string, { x: number; y: number }> = {}
    categories.forEach((category, index) => {
      const angle = (2 * Math.PI * index) / categories.length
      centroids[category] = { x: width / 2 + clusterRadius * Math.cos(angle), y: height / 2 + clusterRadius * Math.sin(angle) }
    })
    const clusterForce = (alpha: number) => {
      for (const node of simNodes) {
        const centroid = centroids[node.category]
        if (!centroid || node.x == null || node.y == null) continue
        node.vx = (node.vx ?? 0) - (node.x - centroid.x) * 0.06 * alpha
        node.vy = (node.vy ?? 0) - (node.y - centroid.y) * 0.06 * alpha
      }
    }

    const simulation = forceSimulation(simNodes)
      .force('link', forceLink(simLinks).id((node: SimulationNodeDatum) => (node as { id: string }).id).distance(38).strength(0.9))
      .force('charge', forceManyBody().strength(-28).distanceMax(240))
      .force('center', forceCenter(width / 2, height / 2))
      .force('collide', forceCollide(15))
      .force('cluster', clusterForce)
      .stop()
    for (let tick = 0; tick < 300; tick++) simulation.tick()

    const xs = simNodes.map(node => node.x ?? width / 2)
    const ys = simNodes.map(node => node.y ?? height / 2)
    const spanX = Math.max(Math.max(...xs) - Math.min(...xs), 1)
    const spanY = Math.max(Math.max(...ys) - Math.min(...ys), 1)
    const minX = Math.min(...xs), minY = Math.min(...ys)

    const positions: Record<string, { x: number; y: number }> = {}
    for (const node of simNodes) positions[node.id] = { x: 8 + (((node.x ?? width / 2) - minX) / spanX) * 84, y: 8 + (((node.y ?? height / 2) - minY) / spanY) * 84 }
    return positions
  }, [graph])
}

export function GraphView({ onClose, onOpenFile, embedded }: { onClose?: () => void; onOpenFile: (path: string) => void; embedded?: boolean }) {
  const [graph, setGraph] = useState<GraphData | null>(null)
  const [selected, setSelected] = useState<MarkdownDoc | null>(null)
  useEffect(() => { fetch('/api/archive/graph', { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(setGraph) }, [])
  const positions = useForceLayout(graph)
  const openFile = async (path: string) => { const response = await fetch(`/api/archive/content?path=${encodeURIComponent(path)}`, { credentials: 'include' }); if (response.ok) setSelected(await response.json()); else onOpenFile(path) }
  const colors: Record<string, string> = { '웹 진단': '#df805a', '모바일 진단': '#dba43a', '소스코드 진단': '#c2588f', '모의해킹 시나리오': '#b23b3b', '시스템': '#7a8a4e', '클라우드': '#3f9e8f', '리버스 엔지니어링': '#5c6bc0', '기타': '#9a96a1', economy: '#4e94c7', ideas: '#9b77d5', general: '#69aa8b' }
  return <PanelShell embedded={embedded} className="graph-view">
    <div className="sheet-header"><div><p className="eyebrow">KNOWLEDGE GRAPH</p><h2>주제 연결 그래프</h2></div>{onClose && <button className="sheet-close" onClick={onClose}><X size={18}/></button>}</div>
    <p className="source-intro">색상과 위치로 세부 주제 구역을 나타냅니다. 노드를 클릭하면 오른쪽에서 바로 읽을 수 있습니다.</p>
    <div className="explorer-body">
      <div className="graph-canvas-wrap"><div className="graph-canvas">{graph?.edges.map((edge, index) => { const a = positions[edge.from]; const b = positions[edge.to]; if (!a || !b) return null; return <svg className="graph-edge" key={`${edge.from}-${edge.to}-${index}`} viewBox="0 0 100 100"><line x1={a.x} y1={a.y} x2={b.x} y2={b.y}/></svg> })}{graph?.nodes.map(node => { const point = positions[node.path]; if (!point) return null; const color = colors[node.category] ?? '#69aa8b'; return <button className={`graph-node ${selected?.path === node.path ? 'active' : ''}`} key={node.path} onClick={() => openFile(node.path)} style={{ left: `${point.x}%`, top: `${point.y}%`, '--node-color': color } as CSSProperties}><span>{node.name}</span><small>{node.category}</small></button> })}</div><div className="graph-legend">{[...new Set(graph?.nodes.map(node => node.category) ?? [])].map(category => <span key={category}><i style={{ background: colors[category] ?? '#69aa8b' }}/>{category}</span>)}</div></div>
      <div className="explorer-preview">{selected ? <><div className="explorer-preview-header"><b>{documentTitle(selected)}</b><button onClick={() => setSelected(null)}><X size={17}/></button></div><div className="explorer-preview-body"><DocumentCard doc={selected}/></div></> : <div className="explorer-empty"><FileText size={34}/><p>노드를 클릭하면 여기에서 바로 읽을 수 있습니다.</p></div>}</div>
    </div>
  </PanelShell>
}
