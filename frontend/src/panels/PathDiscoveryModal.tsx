import { FolderSearch, X } from 'lucide-react'
import {
  PATH_DISCOVERY_FIXTURES, PATH_DISCOVERY_PRINCIPLES, PATH_DISCOVERY_HOWTO, PATH_DISCOVERY_READING,
} from '../path-discovery-data'
import { PanelShell } from '../components/shared'
import { useModalA11y } from '../hooks/useModalA11y'

export function PathDiscoveryModal({ onClose }: { onClose: () => void }) {
  const modalRef = useModalA11y(true, onClose)

  return <PanelShell className="file-explorer tool-modal diag-modal" modalRef={modalRef}>
    <div className="sheet-header"><div><p className="eyebrow">진단 · 정찰</p><h2><FolderSearch size={18} style={{ verticalAlign: '-3px', marginRight: 6 }}/>경로/백업 파일 탐색</h2></div><button className="sheet-close" onClick={onClose}><X size={18}/></button></div>
    <p className="diag-warning">소유하거나 명시적으로 허가받은 대상에서만 사용한다. 스캔은 화면이 아니라 다운로드한 스크립트를 로컬에서 직접 실행한다 -- 사내망 IP·자기 노트북 대상도 그대로 된다.</p>
    <div className="explorer-preview tool-modal-body">
      <div className="explorer-preview-body cheatsheet-options-body">

        <section className="diag-block diag-howto">
          <h3 className="cheatsheet-options-title">이게 뭐고, 어떻게 쓰나</h3>
          <p>대상 뒤에 흔한 백업·설정·관리자 경로들을 붙여 GET/HEAD로만 확인하고, 실제로 존재하는(200/401/403) 의심 항목만 추려서 마지막에 표 + CSV로 보여주는 로컬 실행 스캐너다. Burp 확장으로 잡던 걸 브라우저 없이, 파일 하나로 빠르게 훑을 때 쓴다.</p>
          <ol className="diag-howto-steps">{PATH_DISCOVERY_HOWTO.map((s, i) => <li key={i}>{s}</li>)}</ol>
        </section>

        <section className="diag-block">
          <h3 className="cheatsheet-options-title">다운로드</h3>
          <div className="diag-file-list">
            {PATH_DISCOVERY_FIXTURES.map(f => <a className="diag-file-download" key={f.filename} href={`/diagnostics-fixtures/path-discovery/${f.filename}`} download={f.filename}>
              <FolderSearch size={14}/><span><b>{f.filename}</b><small>{f.note}</small></span>
            </a>)}
          </div>
        </section>

        <section className="diag-block">
          <h3 className="cheatsheet-options-title">운영 원칙</h3>
          <ul className="diag-bullet-list">{PATH_DISCOVERY_PRINCIPLES.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </section>

        <section className="diag-block">
          <h3 className="cheatsheet-options-title">결과 읽는 법</h3>
          <div className="diag-reading-table">
            {PATH_DISCOVERY_READING.map((row, i) => <div className="diag-reading-row" key={i}>
              <div className="diag-reading-pattern">{row.status}</div>
              <div className="diag-reading-meaning">{row.meaning}</div>
              <span className={`diag-chip diag-reading-verdict ${row.severity === '-' ? 'diag-chip-pass' : 'diag-chip-danger'}`}>{row.severity}</span>
            </div>)}
          </div>
        </section>

      </div>
    </div>
  </PanelShell>
}
