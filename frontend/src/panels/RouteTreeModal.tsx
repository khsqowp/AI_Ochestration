import { useState } from 'react'
import { ChevronDown, Download, Route, X } from 'lucide-react'
import { PanelShell } from '../components/shared'
import { useModalA11y } from '../hooks/useModalA11y'

interface RouteTreeTool { id: string; name: string; tagline: string; file: string; note: string }

const ROUTE_TREE_TOOLS: RouteTreeTool[] = [
  {
    id: 'har-endpoint-tree',
    name: 'HAR 엔드포인트 트리',
    tagline: 'DevTools에서 내보낸 .har 파일 -- 실제 관측된 요청 + JS 후보 경로를 트리로',
    file: 'har-endpoint-tree.html',
    note: '서버 전송 없음, 브라우저 안에서만 분석',
  },
  {
    id: 'js-route-tree',
    name: 'JS URL · API 경로 트리',
    tagline: 'JS 파일 업로드 또는 코드 붙여넣기 -- fetch/axios 호출, URL 문자열을 트리로',
    file: 'js-route-tree.html',
    note: '서버 전송 없음, 브라우저 안에서만 분석',
  },
]

export function RouteTreeModal({ onClose, embedded }: { onClose?: () => void; embedded?: boolean }) {
  const modalRef = useModalA11y(!embedded, onClose ?? (() => {}))
  const [open, setOpen] = useState<string | null>(ROUTE_TREE_TOOLS[0].id)

  return <PanelShell embedded={embedded} className="file-explorer tool-modal diag-modal route-tree-modal" modalRef={modalRef}>
    <div className="sheet-header"><div><p className="eyebrow">진단 · 정찰</p><h2><Route size={18} style={{ verticalAlign: '-3px', marginRight: 6 }}/>경로 트리 분석기</h2></div>{onClose && <button className="sheet-close" onClick={onClose}><X size={18}/></button>}</div>
    <p className="diag-warning">소유하거나 명시적으로 허가받은 대상에서만 사용한다. 완전히 독립된 HTML 파일이라 폐쇄망에 저장해 열어도 동일하게 동작한다.</p>
    <div className="explorer-preview tool-modal-body">
      <div className="explorer-preview-body cheatsheet-options-body diag-scanner-list">
        {ROUTE_TREE_TOOLS.map(tool => {
          const expanded = open === tool.id
          const href = `/diagnostics-fixtures/route-tree-tools/${tool.file}`
          return <article className="diag-block diag-scanner-card" key={tool.id}>
            <button className="diag-scanner-head" onClick={() => setOpen(expanded ? null : tool.id)}>
              <div><strong>{tool.name}</strong><small>{tool.tagline}</small></div>
              <ChevronDown size={16} className={expanded ? 'diag-scanner-chevron open' : 'diag-scanner-chevron'}/>
            </button>
            {expanded && <div className="diag-scanner-body">
              <div className="diag-file-list">
                <a className="diag-file-download" href={href} download={tool.file}>
                  <Download size={14}/><span><b>폐쇄망용 다운로드</b><small>{tool.note} -- 이 파일 하나만 저장하면 인터넷 없는 PC에서도 그대로 열려서 동작</small></span>
                </a>
              </div>
              <iframe className="diag-route-tree-frame" src={href} title={tool.name} sandbox="allow-scripts allow-downloads allow-popups"/>
            </div>}
          </article>
        })}
      </div>
    </div>
  </PanelShell>
}
