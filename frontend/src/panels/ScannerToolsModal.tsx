import { useState } from 'react'
import { ChevronDown, Clipboard, Download, FolderSearch, X } from 'lucide-react'
import { SCANNER_TOOLS } from '../scanner-tools-data'
import { PanelShell } from '../components/shared'
import { useModalA11y } from '../hooks/useModalA11y'

export function ScannerToolsModal({ onClose, embedded }: { onClose?: () => void; embedded?: boolean }) {
  const modalRef = useModalA11y(!embedded, onClose ?? (() => {}))
  const [open, setOpen] = useState<string | null>(SCANNER_TOOLS[0].id)
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null)

  const copyScript = async (label: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedLabel(label)
    } catch {
      setCopiedLabel(`${label}__failed`)
    }
    window.setTimeout(() => setCopiedLabel(l => (l === label || l === `${label}__failed` ? null : l)), 1500)
  }

  return <PanelShell embedded={embedded} className="file-explorer tool-modal diag-modal" modalRef={modalRef}>
    <div className="sheet-header"><div><p className="eyebrow">진단 · 정찰</p><h2><FolderSearch size={18} style={{ verticalAlign: '-3px', marginRight: 6 }}/>정찰/취약점 스캐너</h2></div>{onClose && <button className="sheet-close" onClick={onClose}><X size={18}/></button>}</div>
    <p className="diag-warning">소유하거나 명시적으로 허가받은 대상에서만 사용한다. 실행은 화면이 아니라 다운로드한 스크립트를 로컬에서 직접 한다 -- 사내망 IP·자기 노트북 대상도 그대로 된다.</p>
    <a className="diag-file-download diag-offline-bundle" href="/diagnostics-fixtures/offline-toolkit-bundle.zip" download="offline-toolkit-bundle.zip">
      <Download size={14}/><span><b>오프라인 올인원 패키지</b><small>이 사이트 자체도 못 여는 내부망용 -- 아래 3개 도구(.py+설명서) 전부와 콘텐츠 스캐너/크롤러가 쓰는 SecLists·PayloadsAllTheThings 서브셋(MIT)까지 한 zip에 포함. 풀면 바로 실행, 개별 다운로드 필요 없음 (~100KB). 설명서는 zip 특성상 영문 파일명(MANUAL_KR.txt)으로 들어있지만 내용은 그대로 한글.</small></span>
    </a>
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
              {tool.scripts && <div className="diag-file-list">
                {tool.scripts.map(s => <button className="diag-file-download" key={s.label} onClick={() => void copyScript(s.label, s.content)}>
                  <Clipboard size={14}/><span><b>{copiedLabel === s.label ? '복사됨' : copiedLabel === `${s.label}__failed` ? '복사 실패 -- 직접 선택해 복사해주세요' : s.label}</b>{s.note && <small>{s.note}</small>}</span>
                </button>)}
              </div>}
              {tool.files.length > 0 && <div className="diag-file-list">
                {tool.files.map(f => <a className="diag-file-download" key={f.filename} href={`/diagnostics-fixtures/${tool.id}/${f.filename}`} download={f.filename.split('/').pop()}>
                  <Download size={14}/><span><b>{f.filename}</b>{f.note && <small>{f.note}</small>}</span>
                </a>)}
              </div>}
            </div>}
          </article>
        })}
      </div>
    </div>
  </PanelShell>
}
