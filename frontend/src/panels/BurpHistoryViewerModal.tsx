import { Download, History, Lock, X } from 'lucide-react'
import { PanelShell } from '../components/shared'
import { useModalA11y } from '../hooks/useModalA11y'
import { useAppState } from '../context/AppState'

// 이 도구는 소유자 1명만 접근해야 한다 — FeedbackPage.tsx의 OWNER_EMAIL 패턴을 그대로 재사용.
const OWNER_EMAIL = 'kknd03255'

export function BurpHistoryViewerModal({ onClose, embedded }: { onClose?: () => void; embedded?: boolean }) {
  const modalRef = useModalA11y(!embedded, onClose ?? (() => {}))
  const { session } = useAppState()
  const isOwner = session?.user?.email.toLowerCase() === OWNER_EMAIL
  const href = '/diagnostics-fixtures/burp-history-viewer/burp-history-viewer.html'

  const header = <div className="sheet-header"><div><p className="eyebrow">진단 · 정찰</p><h2><History size={18} style={{ verticalAlign: '-3px', marginRight: 6 }}/>Burp History 뷰어</h2></div>{onClose && <button className="sheet-close" onClick={onClose}><X size={18}/></button>}</div>

  if (!isOwner) return <PanelShell embedded={embedded} className="file-explorer tool-modal diag-modal route-tree-modal" modalRef={modalRef}>
    {header}
    <p className="diag-access-blocked"><Lock size={14}/>이 도구는 접근 제한됨 — 소유자만 사용할 수 있습니다.</p>
  </PanelShell>

  return <PanelShell embedded={embedded} className="file-explorer tool-modal diag-modal route-tree-modal" modalRef={modalRef}>
    {header}
    <p className="diag-warning">허가받은 대상에서만 사용하세요. XML은 브라우저 로컬에서 파싱·표시되지만, 업로드한 파일 원본은 증거 기록용으로 서버에 전송됩니다.</p>
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
