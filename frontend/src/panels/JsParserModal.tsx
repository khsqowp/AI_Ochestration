import { useState } from 'react'
import { Binary, Download, X } from 'lucide-react'
import { PanelShell } from '../components/shared'
import { useModalA11y } from '../hooks/useModalA11y'
import { DISCLAIMER, Note, Field, Readout } from '../payloads/shared'

function beautifyJs(code: string): string {
  if (!code.trim()) return ''
  
  let result = ''
  let quoteChar: string | null = null
  let escaped = false

  for (let i = 0; i < code.length; i++) {
    const char = code[i]

    if (escaped) {
      result += char
      escaped = false
      continue
    }

    if (char === '\\') {
      result += char
      escaped = true
      continue
    }

    if (quoteChar) {
      if (char === quoteChar) {
        quoteChar = null
      }
      result += char
    } else {
      if (char === "'" || char === '"' || char === '`') {
        quoteChar = char
        result += char
      } else if (char === '{' || char === '}' || char === ';') {
        result += char + '\n'
      } else {
        result += char
      }
    }
  }

  const lines = result.split('\n')
  let indent = 0
  return lines
    .map(raw => raw.trim())
    .filter(Boolean)
    .map(line => {
      if (line.startsWith('}')) indent = Math.max(0, indent - 1)
      const formatted = '  '.repeat(indent) + line
      if (line.endsWith('{')) indent += 1
      return formatted
    })
    .join('\n')
}

function extractUnique(text: string, regex: RegExp): string[] {
  const matches = text.match(regex) ?? []
  return Array.from(new Set(matches.map(m => m.trim())))
}

const ENDPOINT_RE = /(?:"|')(?:https?:\/\/|\/api\/|\/v\d+\/)[^"'\s]*(?:"|')|https?:\/\/[^\s"'<>]+/g
const SECRET_RE = /(?:api[_-]?key|secret|token|passwd|password)\s*[:=]\s*["'][^"'\s]{6,}["']|AKIA[0-9A-Z]{16}|Bearer\s+[A-Za-z0-9._-]{10,}/gi
const COMMENT_RE = /\/\/[^\n]*|\/\*[\s\S]*?\*\//g

export function JsParserModal({ onClose, embedded }: { onClose?: () => void; embedded?: boolean }) {
  const modalRef = useModalA11y(!embedded, onClose ?? (() => {}))
  const [input, setInput] = useState('')

  const beautified = beautifyJs(input)
  const endpoints = extractUnique(input, ENDPOINT_RE)
  const secrets = extractUnique(input, SECRET_RE)
  const comments = extractUnique(input, COMMENT_RE)

  return <PanelShell embedded={embedded} className="file-explorer tool-modal diag-modal" modalRef={modalRef}>
    <div className="sheet-header"><div><p className="eyebrow">진단 · 정찰</p><h2><Binary size={18} style={{ verticalAlign: '-3px', marginRight: 6 }}/>JS Beautifier & 정규식 추출기</h2></div>{onClose && <button className="sheet-close" onClick={onClose}><X size={18}/></button>}</div>
    <div className="explorer-preview tool-modal-body">
      <div className="explorer-preview-body cheatsheet-options-body">
        <Note>{DISCLAIMER}</Note>
        <div className="diag-file-list">
          <a className="diag-file-download diag-offline-bundle" href="/diagnostics-fixtures/js-parser/offline-js-parser.html" download="offline-js-parser.html">
            <Download size={14}/><span><b>폐쇄망용 독립 파일 다운로드</b><small>외부 통신·라이브러리 없이 브라우저에서 실행합니다. 입력 코드는 브라우저 밖으로 전송되지 않습니다.</small></span>
          </a>
          <a className="diag-file-download" href="/diagnostics-fixtures/js-parser/설명서.txt" download="JS-오프라인-분석기-설명서.txt">
            <Download size={14}/><span><b>오프라인 사용 설명서</b><small>기능과 분석 한계를 안내합니다.</small></span>
          </a>
        </div>
        <div className="js-parser-layout">
          <div className="js-parser-input-section">
            <div className="js-parser-field">
              <Field label="난독화/압축 JS 코드">
                <textarea className="payload-builder-textarea" rows={12} value={input} onChange={e => setInput(e.target.value)} placeholder="분석할 JavaScript 코드를 붙여넣으세요…"/>
              </Field>
            </div>
            {beautified && <Readout title="Beautified JS" value={beautified} wrap="pre"/>}
          </div>
          <div className="js-parser-output-section">
            <div className="js-parser-result-group">
              <strong>API 엔드포인트</strong>
              <div className="js-parser-list">
                {endpoints.length ? endpoints.map((e, i) => <div className="js-parser-item" key={i}>{e}</div>) : <p className="js-parser-empty">발견된 엔드포인트가 없습니다.</p>}
              </div>
            </div>
            <div className="js-parser-result-group">
              <strong>키 · 시크릿 · 토큰 후보</strong>
              <div className="js-parser-list">
                {secrets.length ? secrets.map((s, i) => <div className="js-parser-item" key={i}>{s}</div>) : <p className="js-parser-empty">발견된 시크릿 패턴이 없습니다.</p>}
              </div>
            </div>
            <div className="js-parser-result-group">
              <strong>주석</strong>
              <div className="js-parser-list">
                {comments.length ? comments.map((c, i) => <div className="js-parser-item" key={i}>{c}</div>) : <p className="js-parser-empty">발견된 주석이 없습니다.</p>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </PanelShell>
}
