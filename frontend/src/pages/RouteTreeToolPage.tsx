import { useState, type MouseEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Download } from 'lucide-react'
import { PanelShell } from '../components/shared'
import { ROUTE_TREE_TOOLS } from '../route-tree-tools'

export function RouteTreeToolPage({ toolId }: { toolId: string }) {
  const [touchedToolId, setTouchedToolId] = useState<string | null>(null)
  const tool = ROUTE_TREE_TOOLS.find(item => item.id === toolId)
  if (!tool) return <Navigate to="/dashboard/diag" replace/>

  const confirmNavigation = (event: MouseEvent<HTMLAnchorElement>) => {
    if (touchedToolId === tool.id && !window.confirm('입력한 내용이 사라집니다. 이동할까요?')) event.preventDefault()
  }

  const href = `/diagnostics-fixtures/route-tree-tools/${tool.file}`
  const Icon = tool.icon

  return <div className="page diag-tool-page">
    <PanelShell embedded className="file-explorer tool-modal diag-modal route-tree-modal">
      <div className="sheet-header">
        <div><p className="eyebrow">진단 · 정찰</p><h2 className="diag-route-tool-title"><Icon size={18}/>{tool.name}</h2></div>
      </div>
      <div className="diag-tool-links"><Link to="/dashboard/diag" onClick={confirmNavigation}>진단 도구</Link>{ROUTE_TREE_TOOLS.filter(item => item.id !== tool.id).map(item => <Link key={item.id} to={`/dashboard/diag/${item.id}`} onClick={confirmNavigation}>{item.name}</Link>)}</div>
      <p className="diag-warning">허가받은 대상의 자료만 사용하세요. {tool.tagline} 브라우저 로컬에서 처리하며 서버로 전송하지 않습니다.</p>
      <div className="explorer-preview tool-modal-body">
        <div className="explorer-preview-body cheatsheet-options-body diag-scanner-list">
          <a className="diag-file-download" href={href} download={tool.file}>
            <Download size={14}/><span><b>폐쇄망용 HTML 다운로드</b><small>독립 실행형 파일로 인터넷 없이 열 수 있습니다.</small></span>
          </a>
          <iframe className="diag-route-tree-frame" src={`${href}?embedded=1`} title={tool.name} sandbox="allow-scripts allow-downloads allow-popups" onMouseDown={() => setTouchedToolId(tool.id)} onFocus={() => setTouchedToolId(tool.id)}/>
        </div>
      </div>
    </PanelShell>
  </div>
}
