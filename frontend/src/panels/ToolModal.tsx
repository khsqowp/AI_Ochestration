import { useState, type ComponentType } from 'react'
import { Clipboard, X } from 'lucide-react'
import { CHEATSHEET_QUICK_STARTS, type CheatSheetTool } from '../cheatsheet-data'
import { cheatSheetCommand } from '../lib/util'
import { PanelShell } from '../components/shared'
import { useModalA11y } from '../hooks/useModalA11y'
import { XssPayloadBuilder } from '../payloads/xss'
import { SqliPayloadBuilder } from '../payloads/sqli'
import { SsrfPayloadBuilder } from '../payloads/ssrf'
import { CsrfPayloadBuilder } from '../payloads/csrf'
import { SmartDecoderBuilder } from '../payloads/decoder'
import { RainbowTableBuilder } from '../payloads/rainbow'

const PAYLOAD_BUILDERS: Record<string, ComponentType> = {
  'xss-payloads': XssPayloadBuilder,
  'sqli-payloads': SqliPayloadBuilder,
  'ssrf-payloads': SsrfPayloadBuilder,
  'csrf-payloads': CsrfPayloadBuilder,
  'smart-decoder': SmartDecoderBuilder,
  'rainbow-crack': RainbowTableBuilder,
}

/* 치트시트 도구 하나를 곧장 보여주는 모달. 타일 그리드(DiagnosticsPage)에서 도구를 클릭하면
   카테고리 목록을 거치지 않고 바로 이 화면으로 연다 -- 이전 CheatSheetModal의 사이드바를
   그리드가 대신하므로, 여기는 우측 프리뷰였던 부분만 남긴다. */
export function ToolModal({ tool, onClose }: { tool: CheatSheetTool; onClose: () => void }) {
  const modalRef = useModalA11y(true, onClose)
  const [selectedOptions, setSelectedOptions] = useState<Set<string>>(new Set())
  const [values, setValues] = useState<Record<string, string>>({})
  const [target, setTarget] = useState('')
  const [copied, setCopied] = useState(false)

  const toggleOption = (id: string) => { setSelectedOptions(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next }); setCopied(false) }
  const command = cheatSheetCommand(tool, selectedOptions, values, target)
  const copy = async (text = command) => { if (!text) return; await navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 1500) }

  const Builder = PAYLOAD_BUILDERS[tool.id]

  return <PanelShell className="file-explorer tool-modal" modalRef={modalRef}>
    <div className="sheet-header"><div><p className="eyebrow">CHEAT SHEET</p><h2>{tool.name}</h2></div><button className="sheet-close" onClick={onClose}><X size={18}/></button></div>
    <div className="explorer-preview tool-modal-body">
      {Builder ? <div className="explorer-preview-body cheatsheet-options-body"><Builder/></div> : <>
        <div className="explorer-preview-body cheatsheet-options-body">
          {tool.note && <p className="cheatsheet-note">{tool.note}</p>}
          {(CHEATSHEET_QUICK_STARTS[tool.id] ?? []).length > 0 && <section className="cheatsheet-quick-starts">
            <div><b>목적별 권장 명령</b><small>대상 값을 바꾼 뒤 복사한다. 명령 실행 전 승인 범위와 영향도를 확인한다.</small></div>
            {CHEATSHEET_QUICK_STARTS[tool.id].map(quickStart => <article key={quickStart.id}>
              <header><div><strong>{quickStart.label}</strong><p>{quickStart.description}</p></div><button onClick={() => void copy(quickStart.command)}><Clipboard size={13}/>복사</button></header>
              <pre>{quickStart.command}</pre>
              <p><b>예상 결과:</b> {quickStart.expected}</p>
              <p className="cheatsheet-caution"><b>주의:</b> {quickStart.caution}</p>
            </article>)}
          </section>}
          {tool.options.length > 0 && <h3 className="cheatsheet-options-title">세부 옵션 조합</h3>}
          {tool.options.length === 0 && !tool.targetPlaceholder && <p className="empty-state">이 명령어는 별도 옵션 없이 그대로 사용합니다.</p>}
          {tool.options.map(option => <label className="cheatsheet-option" key={option.id}>
            <input type="checkbox" checked={selectedOptions.has(option.id)} onChange={() => toggleOption(option.id)}/>
            <span className="cheatsheet-option-body">
              <span className="cheatsheet-option-head">{option.flag && <code>{option.flag}</code>}<b>{option.label}</b></span>
              <small>{option.description}</small>
              {option.needsValue && selectedOptions.has(option.id) && <input className="cheatsheet-option-value" value={values[option.id] ?? ''} onChange={event => setValues(current => ({ ...current, [option.id]: event.target.value }))} placeholder={option.placeholder}/>}
            </span>
          </label>)}
          {tool.targetPlaceholder && <label className="cheatsheet-option cheatsheet-target">
            <span className="cheatsheet-option-body">
              <span className="cheatsheet-option-head"><b>대상</b></span>
              <input className="cheatsheet-option-value" value={target} onChange={event => setTarget(event.target.value)} placeholder={tool.targetPlaceholder}/>
            </span>
          </label>}
        </div>
        <div className="cheatsheet-command-bar">
          <pre className="cheatsheet-command">{command || tool.base || '(옵션을 선택하세요)'}</pre>
          <button className="cheatsheet-copy" onClick={() => void copy()} disabled={!command}><Clipboard size={14}/>{copied ? '복사됨' : '복사'}</button>
        </div>
      </>}
    </div>
  </PanelShell>
}
