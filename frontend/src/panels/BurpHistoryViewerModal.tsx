import { Download, History, X } from 'lucide-react'
import { PanelShell } from '../components/shared'
import { useModalA11y } from '../hooks/useModalA11y'

export function BurpHistoryViewerModal({ onClose, embedded }: { onClose?: () => void; embedded?: boolean }) {
  const modalRef = useModalA11y(!embedded, onClose ?? (() => {}))
  const href = '/diagnostics-fixtures/burp-history-viewer/burp-history-viewer.html'

  return <PanelShell embedded={embedded} className="file-explorer tool-modal diag-modal route-tree-modal" modalRef={modalRef}>
    <div className="sheet-header"><div><p className="eyebrow">진단 · 정찰</p><h2><History size={18} style={{ verticalAlign: '-3px', marginRight: 6 }}/>Burp History 뷰어</h2></div>{onClose && <button className="sheet-close" onClick={onClose}><X size={18}/></button>}</div>
    <p className="diag-warning">허가받은 대상에서만 사용하세요. XML 분석은 브라우저 로컬에서 처리되며 서버로 전송되지 않습니다.</p>
    <div className="explorer-preview tool-modal-body">
      <div className="explorer-preview-body cheatsheet-options-body diag-scanner-list">
        <div className="diag-file-list">
          <a className="diag-file-download" href={href} download="burp-history-viewer.html">
            <Download size={14}/><span><b>폐쇄망용 HTML 다운로드</b><small>독립 실행형 파일로 인터넷 없이 열 수 있습니다.</small></span>
          </a>
        </div>
        <iframe className="diag-route-tree-frame" src={`${href}?embedded=1`} title="Burp History 뷰어" sandbox="allow-scripts allow-downloads allow-popups" allow="clipboard-read; clipboard-write"/>
      </div>
    </div>
  </PanelShell>
}
