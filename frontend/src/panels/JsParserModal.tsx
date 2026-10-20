import { useState } from 'react'
import { Binary, Download, X } from 'lucide-react'
import { PanelShell } from '../components/shared'
import { useModalA11y } from '../hooks/useModalA11y'
import { DISCLAIMER, Note, Field } from '../payloads/shared'

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
const CRYPTO_RE = /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----|\b(?:aes|des(?:-?ede3?)?|rc2|rc4|rc5|blowfish|camellia|aria|seed|idea|cast5|chacha20)-(?:128-|192-|256-)?(?:cbc|ecb|gcm|ctr|cfb\d*|ofb|ccm|xts|poly1305|ede3|ede|wrap)\b|\b(?:RSA|AES|DES|HMAC|crypt|decrypt|encrypt|private[_-]?key)\b|\bprivateKey\b/gi
const PHONE_RE = /(?<![\d-])\b(?:\d{3}-\d{4}-\d{4}|\d{2}-\d{3,4}-\d{4})\b(?![\d-])/g
const VERSION_RE = /(?<![\w.])\d+\.\d+\.\d+(?:-(?:beta|rc)(?:\.\d+)?)?\b(?!\.\d)/gi
const BASE64_RE = /[A-Za-z0-9+/]{24,}={0,2}/g
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[A-Za-z]{2,}/g

const HIGHLIGHT_RE = new RegExp(
  ([
    ['endpoint', ENDPOINT_RE], ['secret', SECRET_RE], ['comment', COMMENT_RE],
    ['crypto', CRYPTO_RE], ['phone', PHONE_RE], ['version', VERSION_RE],
    ['base64', BASE64_RE], ['email', EMAIL_RE],
  ] as const).map(([category, regex]) => `(?<${category}>${regex.source})`).join('|'),
  'gi',
)

type SyntaxKind = 'text' | 'keyword' | 'string' | 'number' | 'comment' | 'function'
type SyntaxToken = { kind: SyntaxKind; text: string }

const JS_KEYWORDS = new Set([
  'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue',
  'debugger', 'default', 'delete', 'do', 'else', 'export', 'extends', 'false',
  'finally', 'for', 'from', 'function', 'if', 'import', 'in', 'instanceof',
  'let', 'new', 'null', 'of', 'return', 'static', 'super', 'switch', 'this',
  'throw', 'true', 'try', 'typeof', 'undefined', 'var', 'void', 'while', 'yield',
])

function tokenizeSyntax(code: string): SyntaxToken[] {
  const spans: { kind: SyntaxKind; start: number; end: number }[] = []
  const isDigit = (char: string) => char >= '0' && char <= '9'
  const isIdentStart = (char: string) => !!char && (char >= 'a' && char <= 'z' || char >= 'A' && char <= 'Z' || char === '_' || char === '$')
  const isIdentPart = (char: string) => isIdentStart(char) || isDigit(char)
  const add = (kind: SyntaxKind, start: number, end: number) => {
    if (kind === 'text' && spans[spans.length - 1]?.kind === 'text') spans[spans.length - 1].end = end
    else spans.push({ kind, start, end })
  }

  for (let i = 0; i < code.length;) {
    const start = i
    const char = code[i]
    if (char === '/' && code[i + 1] === '/') {
      i += 2
      while (i < code.length && code[i] !== '\n') i++
      add('comment', start, i)
    } else if (char === '/' && code[i + 1] === '*') {
      i += 2
      while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) i++
      if (i < code.length) i += 2
      add('comment', start, i)
    } else if (char === "'" || char === '"' || char === '`') {
      i++
      while (i < code.length) {
        if (code[i] === '\\') { i += Math.min(2, code.length - i); continue }
        if (code[i++] === char) break
      }
      add('string', start, i)
    } else if (isDigit(char) && (i === 0 || !isIdentPart(code[i - 1]))) {
      let probe = i
      let separators = 0
      while (isDigit(code[probe]) || code[probe] === '.' || code[probe] === '-') {
        if (code[probe] === '.' || code[probe] === '-') separators++
        probe++
      }
      if (separators >= 2 || (separators === 0 && probe - start >= 24)) { i = probe; add('text', start, i); continue }
      i++
      while (i < code.length && isDigit(code[i])) i++
      if (code[i] === '.' && isDigit(code[i + 1])) {
        i++
        while (i < code.length && isDigit(code[i])) i++
      }
      if ((code[i] === 'e' || code[i] === 'E') && (isDigit(code[i + 1]) || ((code[i + 1] === '+' || code[i + 1] === '-') && isDigit(code[i + 2])))) {
        i++
        if (code[i] === '+' || code[i] === '-') i++
        while (i < code.length && isDigit(code[i])) i++
      }
      if (isIdentStart(code[i])) {
        while (i < code.length && isIdentPart(code[i])) i++
        add('text', start, i)
      } else add('number', start, i)
    } else if (isIdentStart(char)) {
      i++
      while (i < code.length && isIdentPart(code[i])) i++
      const word = code.slice(start, i)
      let next = i
      while (code[next] === ' ' || code[next] === '\t') next++
      add(JS_KEYWORDS.has(word) ? 'keyword' : code[next] === '(' ? 'function' : 'text', start, i)
    } else {
      i++
      add('text', start, i)
    }
  }
  return spans.map(({ kind, start, end }) => ({ kind, text: code.slice(start, end) }))
}

type SecurityHit = { start: number; end: number; category: string }

function securityOverlays(tokens: SyntaxToken[]): SecurityHit[][] {
  const overlays: SecurityHit[][] = tokens.map(() => [])
  for (let first = 0; first < tokens.length;) {
    if (tokens[first].kind !== 'text' && tokens[first].kind !== 'string') { first++; continue }
    let last = first
    while (last < tokens.length && (tokens[last].kind === 'text' || tokens[last].kind === 'string')) last++
    const run = tokens.slice(first, last).map(token => token.text).join('')
    let tokenIndex = first
    let tokenStart = 0
    for (const match of run.matchAll(HIGHLIGHT_RE)) {
      const category = Object.keys(match.groups ?? {}).find(key => match.groups?.[key] !== undefined) ?? ''
      const matchEnd = match.index + match[0].length
      while (tokenIndex < last && tokenStart + tokens[tokenIndex].text.length <= match.index) {
        tokenStart += tokens[tokenIndex++].text.length
      }
      let partIndex = tokenIndex
      let partStart = tokenStart
      while (partIndex < last && partStart < matchEnd) {
        const partEnd = partStart + tokens[partIndex].text.length
        overlays[partIndex].push({ start: Math.max(match.index, partStart) - partStart, end: Math.min(matchEnd, partEnd) - partStart, category })
        partStart = partEnd
        partIndex++
      }
    }
    first = last
  }
  return overlays
}

function securityParts(text: string, hits: SecurityHit[]) {
  const parts: (string | React.ReactElement)[] = []
  let cursor = 0
  for (const hit of hits) {
    if (hit.start > cursor) parts.push(text.slice(cursor, hit.start))
    parts.push(<span className={'js-parser-hit js-parser-hit--' + hit.category} key={hit.start}>{text.slice(hit.start, hit.end)}</span>)
    cursor = hit.end
  }
  if (cursor < text.length) parts.push(text.slice(cursor))
  return parts
}

function highlightedJs(text: string) {
  const tokens = tokenizeSyntax(text)
  const overlays = securityOverlays(tokens)
  return tokens.map((token, index) => {
    const content = token.kind === 'text' || token.kind === 'string' ? securityParts(token.text, overlays[index]) : token.text
    return token.kind === 'text' ? <span key={index}>{content}</span> :
      <span className={'js-syntax-' + token.kind} key={index}>{content}</span>
  })
}

export function JsParserModal({ onClose, embedded }: { onClose?: () => void; embedded?: boolean }) {
  const modalRef = useModalA11y(!embedded, onClose ?? (() => {}))
  const [input, setInput] = useState('')

  const beautified = beautifyJs(input)
  const endpoints = extractUnique(input, ENDPOINT_RE)
  const secrets = extractUnique(input, SECRET_RE)
  const comments = extractUnique(input, COMMENT_RE)
  const crypto = extractUnique(input, CRYPTO_RE)
  const phones = extractUnique(input, PHONE_RE)
  const versions = extractUnique(input, VERSION_RE)
  const base64 = extractUnique(input, BASE64_RE)
  const emails = extractUnique(input, EMAIL_RE)

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
            {beautified && <div className="js-parser-beautified"><strong>Beautified JS</strong><pre className="js-parser-highlighted-pre">{highlightedJs(beautified)}</pre></div>}
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
            <div className="js-parser-result-group">
              <strong>암호/키 키워드 후보</strong>
              <div className="js-parser-list">
                {crypto.length ? crypto.map((c, i) => <div className="js-parser-item" key={i}>{c}</div>) : <p className="js-parser-empty">발견된 암호/키 키워드가 없습니다.</p>}
              </div>
            </div>
            <div className="js-parser-result-group">
              <strong>전화번호/연락처 후보</strong>
              <div className="js-parser-list">
                {phones.length ? phones.map((p, i) => <div className="js-parser-item" key={i}>{p}</div>) : <p className="js-parser-empty">발견된 전화번호가 없습니다.</p>}
              </div>
            </div>
            <div className="js-parser-result-group">
              <strong>버전 문자열 후보</strong>
              <div className="js-parser-list">
                {versions.length ? versions.map((v, i) => <div className="js-parser-item" key={i}>{v}</div>) : <p className="js-parser-empty">발견된 버전 문자열이 없습니다.</p>}
              </div>
            </div>
            <div className="js-parser-result-group">
              <strong>Base64 추정값 후보</strong>
              <div className="js-parser-list">
                {base64.length ? base64.map((b, i) => <div className="js-parser-item" key={i}>{b}</div>) : <p className="js-parser-empty">발견된 Base64 추정값이 없습니다.</p>}
              </div>
            </div>
            <div className="js-parser-result-group">
              <strong>이메일 후보</strong>
              <div className="js-parser-list">
                {emails.length ? emails.map((e, i) => <div className="js-parser-item" key={i}>{e}</div>) : <p className="js-parser-empty">발견된 이메일이 없습니다.</p>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </PanelShell>
}
