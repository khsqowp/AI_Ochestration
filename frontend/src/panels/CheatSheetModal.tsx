import { useState, type ComponentType } from 'react'
import { Clipboard, Terminal, X } from 'lucide-react'
import { CHEATSHEET_CATEGORIES, type CheatSheetTool } from '../cheatsheet-data'
import { cheatSheetCommand } from '../lib/util'
import { PanelShell } from '../components/shared'
import { XssPayloadBuilder } from '../payloads/xss'
import { SqliPayloadBuilder } from '../payloads/sqli'
import { SsrfPayloadBuilder } from '../payloads/ssrf'
import { CsrfPayloadBuilder } from '../payloads/csrf'

const PAYLOAD_BUILDERS: Record<string, ComponentType> = {
  'xss-payloads': XssPayloadBuilder,
  'sqli-payloads': SqliPayloadBuilder,
  'ssrf-payloads': SsrfPayloadBuilder,
  'csrf-payloads': CsrfPayloadBuilder,
}

export function CheatSheetModal({ onClose, embedded }: { onClose?: () => void; embedded?: boolean }) {
  const [tool, setTool] = useState<CheatSheetTool | null>(null)
  const [selectedOptions, setSelectedOptions] = useState<Set<string>>(new Set())
  const [values, setValues] = useState<Record<string, string>>({})
  const [target, setTarget] = useState('')
  const [copied, setCopied] = useState(false)

  const selectTool = (next: CheatSheetTool) => { setTool(next); setSelectedOptions(new Set()); setValues({}); setTarget(''); setCopied(false) }
  const toggleOption = (id: string) => { setSelectedOptions(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next }); setCopied(false) }
  const command = tool ? cheatSheetCommand(tool, selectedOptions, values, target) : ''
  const copy = async () => { if (!command) return; await navigator.clipboard.writeText(command); setCopied(true); window.setTimeout(() => setCopied(false), 1500) }

  return <PanelShell embedded={embedded} className="file-explorer">
    <div className="sheet-header"><div><p className="eyebrow">CHEAT SHEET</p><h2>도구·명령어 치트시트</h2></div>{onClose && <button className="sheet-close" onClick={onClose}><X size={18}/></button>}</div>
    <div className="explorer-body">
      <nav className="explorer-sidebar cheatsheet-sidebar">
        {CHEATSHEET_CATEGORIES.map(category => <div className="cheatsheet-category" key={category.id}>
          <p className="cheatsheet-category-title">{category.name}</p>
          {category.tools.map(t => <button key={t.id} className={`cheatsheet-tool-row ${tool?.id === t.id ? 'active' : ''}`} onClick={() => selectTool(t)}><Terminal size={14}/>{t.name}</button>)}
        </div>)}
      </nav>
      <div className="explorer-preview">
        {tool ? <>
          <div className="explorer-preview-header"><b>{tool.name}</b></div>
          {PAYLOAD_BUILDERS[tool.id] ? <div className="explorer-preview-body cheatsheet-options-body">{(() => { const Builder = PAYLOAD_BUILDERS[tool.id]!; return <Builder/> })()}</div> : <div className="explorer-preview-body cheatsheet-options-body">
            {tool.note && <p className="cheatsheet-note">{tool.note}</p>}
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
          </div>}
          {!PAYLOAD_BUILDERS[tool.id] && <div className="cheatsheet-command-bar">
            <pre className="cheatsheet-command">{command || tool.base || '(옵션을 선택하세요)'}</pre>
            <button className="cheatsheet-copy" onClick={copy} disabled={!command}><Clipboard size={14}/>{copied ? '복사됨' : '복사'}</button>
          </div>}
        </> : <div className="explorer-empty"><Terminal size={34}/><p>왼쪽에서 도구나 명령어를 선택하면 옵션을 조합할 수 있습니다.</p></div>}
      </div>
    </div>
  </PanelShell>
}
