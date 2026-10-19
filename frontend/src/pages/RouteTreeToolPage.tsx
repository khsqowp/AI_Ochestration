import { Navigate } from 'react-router-dom'
import { Download, Route } from 'lucide-react'
import { PanelShell } from '../components/shared'
import { ROUTE_TREE_TOOLS } from '../route-tree-tools'

export function RouteTreeToolPage({ toolId }: { toolId: string }) {
  const tool = ROUTE_TREE_TOOLS.find(item => item.id === toolId)
  if (!tool) return <Navigate to="/dashboard/diag" replace/>

  const href = `/diagnostics-fixtures/route-tree-tools/${tool.file}`
  const Icon = tool.icon

  return <div className="page diag-tool-page">
    <PanelShell embedded className="file-explorer tool-modal diag-modal route-tree-modal">
      <div className="sheet-header">
        <div><p className="eyebrow">진단 · 정찰</p><h2 className="diag-route-tool-title"><Icon size={18}/>{tool.name}</h2></div>
      </div>
      <p className="diag-warning">{tool.tagline} 입력 자료는 브라우저 안에서 처리되며 서버로 전송되지 않습니다. 허가받은 대상의 자료만 사용하세요.</p>
      <div className="explorer-preview tool-modal-body">
        <div className="explorer-preview-body cheatsheet-options-body diag-scanner-list">
          <a className="diag-file-download" href={href} download={tool.file}>
            <Download size={14}/><span><b>폐쇄망용 다운로드</b><small>독립 실행형 HTML 파일입니다. 내려받아 인터넷이 없는 환경에서도 열 수 있습니다.</small></span>
          </a>
          <iframe className="diag-route-tree-frame" src={href} title={tool.name} sandbox="allow-scripts allow-downloads allow-popups"/>
        </div>
      </div>
    </PanelShell>
  </div>
}
