import { useState } from 'react'
import { Clipboard, Download, ShieldAlert, X } from 'lucide-react'
import xssScoutV33 from '../scanner-scripts/xssScoutV33.txt?raw'
import xssScoutV33ResultCheck from '../scanner-scripts/xssScoutV33ResultCheck.txt?raw'
import { PanelShell } from '../components/shared'
import { useModalA11y } from '../hooks/useModalA11y'

export function XssScoutConsoleModal({ onClose, embedded }: { onClose?: () => void; embedded?: boolean }) {
  const modalRef = useModalA11y(!embedded, onClose ?? (() => {}))
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null)
  const href = '/diagnostics-fixtures/xss-scout-console/xss-scout-console-viewer.html'

  const copyScript = async (label: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedLabel(label)
    } catch {
      setCopiedLabel(`${label}__failed`)
    }
    window.setTimeout(() => setCopiedLabel(value => value === label || value === `${label}__failed` ? null : value), 1500)
  }

  const scriptButton = (label: string, content: string, note: string) => <button className="diag-file-download" key={label} onClick={() => void copyScript(label, content)}>
    <Clipboard size={14}/><span><b>{copiedLabel === label ? '복사됨' : copiedLabel === `${label}__failed` ? '복사 실패 -- 브라우저 권한을 확인하세요' : label}</b><small>{note}</small></span>
  </button>

  return <PanelShell embedded={embedded} className="file-explorer tool-modal diag-modal route-tree-modal" modalRef={modalRef}>
    <div className="sheet-header"><div><p className="eyebrow">진단 · 정찰</p><h2><ShieldAlert size={18} style={{ verticalAlign: '-3px', marginRight: 6 }}/>XSS 콘솔 스캐너</h2></div>{onClose && <button className="sheet-close" onClick={onClose}><X size={18}/></button>}</div>
    <p className="diag-warning">1) 본 스크립트 하나를 대상 사이트 콘솔에 붙여넣고 실행 → 2) 로그 출력이 멈추면 콘솔 내용 전체를 복사(우클릭 &gt; Save as 또는 콘솔 패널에서 전체 선택 후 복사) → 3) 아래 뷰어 입력란에 그대로 붙여넣으면 결과표가 자동으로 뜬다.</p>
    <div className="explorer-preview tool-modal-body">
      <div className="explorer-preview-body cheatsheet-options-body diag-scanner-list">
        <div className="diag-file-list">
          {scriptButton('본 스크립트 복사', xssScoutV33, '대상 사이트 DevTools 콘솔에서 실행 (DOM 관찰 + GET 반사 분석)')}
          {scriptButton('결과 확인 스크립트 복사 (선택)', xssScoutV33ResultCheck, '뷰어 사용엔 필요 없음 -- fixture 자가진단/console.table 재출력용')}
          <a className="diag-file-download" href={href} download="xss-scout-console-viewer.html">
            <Download size={14}/><span><b>오프라인 결과 뷰어 다운로드</b><small>결과 JSON은 이 브라우저 안에서만 파싱합니다. 네트워크 요청을 보내지 않습니다.</small></span>
          </a>
        </div>
        <iframe className="diag-route-tree-frame" src={`${href}?embedded=1`} title="XSS Scout 결과 뷰어" sandbox="allow-scripts allow-downloads allow-popups" allow="clipboard-read; clipboard-write"/>
      </div>
    </div>
  </PanelShell>
}
