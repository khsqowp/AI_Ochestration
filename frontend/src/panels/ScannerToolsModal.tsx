import { useState } from 'react'
import { ChevronDown, Download, FolderSearch, X } from 'lucide-react'
import { SCANNER_TOOLS } from '../scanner-tools-data'
import { PanelShell } from '../components/shared'
import { useModalA11y } from '../hooks/useModalA11y'

export function ScannerToolsModal({ onClose }: { onClose: () => void }) {
  const modalRef = useModalA11y(true, onClose)
  const [open, setOpen] = useState<string | null>(SCANNER_TOOLS[0].id)

  return <PanelShell className="file-explorer tool-modal diag-modal" modalRef={modalRef}>
    <div className="sheet-header"><div><p className="eyebrow">진단 · 정찰</p><h2><FolderSearch size={18} style={{ verticalAlign: '-3px', marginRight: 6 }}/>정찰/취약점 스캐너</h2></div><button className="sheet-close" onClick={onClose}><X size={18}/></button></div>
    <p className="diag-warning">소유하거나 명시적으로 허가받은 대상에서만 사용한다. 실행은 화면이 아니라 다운로드한 스크립트를 로컬에서 직접 한다 -- 사내망 IP·자기 노트북 대상도 그대로 된다.</p>
    <div className="explorer-preview tool-modal-body">
      <div className="explorer-preview-body cheatsheet-options-body diag-scanner-list">
        {SCANNER_TOOLS.map(tool => {
          const expanded = open === tool.id
          return <article className="diag-block diag-scanner-card" key={tool.id}>
            <button className="diag-scanner-head" onClick={() => setOpen(expanded ? null : tool.id)}>
              <div><strong>{tool.name}</strong><small>{tool.tagline}</small></div>
              <ChevronDown size={16} className={expanded ? 'diag-scanner-chevron open' : 'diag-scanner-chevron'}/>
            </button>
            {expanded && <div className="diag-scanner-body">
              <ul className="diag-bullet-list">{tool.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
              <div className="diag-file-list">
                {tool.files.map(f => <a className="diag-file-download" key={f.filename} href={`/diagnostics-fixtures/${tool.id}/${f.filename}`} download={f.filename.split('/').pop()}>
                  <Download size={14}/><span><b>{f.filename}</b>{f.note && <small>{f.note}</small>}</span>
                </a>)}
              </div>
            </div>}
          </article>
        })}
      </div>
    </div>
  </PanelShell>
}
