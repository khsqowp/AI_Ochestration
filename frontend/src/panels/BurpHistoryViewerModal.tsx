import { Download, History, X } from 'lucide-react'
import { PanelShell } from '../components/shared'
import { useModalA11y } from '../hooks/useModalA11y'

export function BurpHistoryViewerModal({ onClose, embedded }: { onClose?: () => void; embedded?: boolean }) {
  const modalRef = useModalA11y(!embedded, onClose ?? (() => {}))
  const href = '/diagnostics-fixtures/burp-history-viewer/burp-history-viewer.html'

  return <PanelShell embedded={embedded} className="file-explorer tool-modal diag-modal route-tree-modal" modalRef={modalRef}>
    <div className="sheet-header"><div><p className="eyebrow">진단 · 정찰</p><h2><History size={18} style={{ verticalAlign: '-3px', marginRight: 6 }}/>Burp History 뷰어</h2></div>{onClose && <button className="sheet-close" onClick={onClose}><X size={18}/></button>}</div>
    <p className="diag-warning">소유하거나 명시적으로 허가받은 대상에서만 사용한다. 완전히 독립된 HTML 파일이라 폐쇄망에 저장해 열어도 동일하게 동작한다.</p>
    <div className="explorer-preview tool-modal-body">
      <div className="explorer-preview-body cheatsheet-options-body diag-scanner-list">
        <div className="diag-file-list">
          <a className="diag-file-download" href={href} download="burp-history-viewer.html">
            <Download size={14}/><span><b>폐쇄망용 다운로드</b><small>서버 전송 없음, 브라우저 안에서만 XML 파싱 -- 이 파일 하나만 저장하면 인터넷 없는 PC에서도 그대로 열려서 동작</small></span>
          </a>
        </div>
        <iframe className="diag-route-tree-frame" src={href} title="Burp History 뷰어" sandbox="allow-scripts allow-downloads allow-popups"/>
      </div>
    </div>
  </PanelShell>
}
