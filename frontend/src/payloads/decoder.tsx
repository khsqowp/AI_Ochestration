import { useMemo, useState } from 'react'
import { Clipboard } from 'lucide-react'
import { Note } from './shared'

/* 스마트 디코더 — khsqowp/Burp_Extension 의 DecoderPanel.java + tab_encoder.py 로직 이식.
   값을 붙여넣으면 인코딩/해시 포맷을 자동 판별해 (연쇄로) 디코딩하고, 디코딩 결과를
   수정하면 감지된 체인을 역순으로 다시 적용해 원래 포맷으로 재인코딩한다. 순수 클라이언트. */

const td = new TextDecoder('utf-8', { fatal: false })
const te = new TextEncoder()

const bytesToBinary = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return s }
const binaryToBytes = (s: string) => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b }

function b64Decode(raw: string): string {
  let t = raw.trim().replace(/\s+/g, '')
  const urlSafe = /[-_]/.test(t)
  if (urlSafe) t = t.replace(/-/g, '+').replace(/_/g, '/')
  t = t + '='.repeat((4 - (t.length % 4)) % 4)
  return td.decode(binaryToBytes(atob(t)))
}
function b64Encode(s: string, urlSafe = false): string {
  const out = btoa(bytesToBinary(te.encode(s)))
  return urlSafe ? out.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : out
}
function hexDecode(raw: string): string {
  const t = raw.trim().replace(/\s+/g, '')
  const b = new Uint8Array(t.length / 2)
  for (let i = 0; i < b.length; i++) b[i] = parseInt(t.substr(i * 2, 2), 16)
  return td.decode(b)
}
const hexEncode = (s: string) => Array.from(te.encode(s)).map(x => x.toString(16).padStart(2, '0')).join('')

function htmlDecode(s: string): string {
  const doc = new DOMParser().parseFromString(s, 'text/html')
  return doc.documentElement.textContent ?? s
}
const htmlEncode = (s: string) => Array.from(s).map(c => `&#${c.codePointAt(0)};`).join('')

function unicodeUnescape(s: string): string {
  return s.replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
}
const unicodeEscape = (s: string) => Array.from(s).map(c => {
  const cp = c.codePointAt(0)!
  return cp < 128 ? c : cp > 0xffff ? `\\u{${cp.toString(16)}}` : `\\u${cp.toString(16).padStart(4, '0')}`
}).join('')

const rot13 = (s: string) => s.replace(/[a-zA-Z]/g, c => {
  const base = c <= 'Z' ? 65 : 97
  return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base)
})

/** Fraction of code points that are NOT the U+FFFD replacement char or a C0 control.
 * TextDecoder(non-fatal) turns invalid UTF-8 byte runs into U+FFFD, so random bytes
 * reinterpreted as text score low while real text (ASCII or CJK) scores ~1. */
const textScore = (s: string) => {
  if (!s) return 0
  const chars = [...s]
  let bad = 0
  for (const c of chars) {
    const cp = c.codePointAt(0)!
    if (cp === 0xfffd || (cp < 32 && cp !== 9 && cp !== 10 && cp !== 13)) bad++
  }
  return 1 - bad / chars.length
}
const looksText = (s: string) => s.length > 0 && textScore(s) > 0.9
const strongText = (s: string) => s.length > 0 && textScore(s) > 0.95 && /\S/.test(s)

/* ── 감지 가능한 코덱 (우선순위 순) ─────────────────────────────── */

type Step = { label: string; decoded: string; reencode: (edited: string) => string }

function jwtStep(input: string): Step | null {
  const t = input.trim()
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(t)) return null
  const [h, p, sig = ''] = t.split('.')
  let header: unknown, payload: unknown
  try {
    header = JSON.parse(b64Decode(h))
    payload = JSON.parse(b64Decode(p))
  } catch { return null }
  if (typeof header !== 'object' || header === null || !('alg' in header)) return null
  const pretty = JSON.stringify({ header, payload }, null, 2)
  return {
    label: 'JWT',
    decoded: pretty,
    reencode: edited => {
      try {
        const o = JSON.parse(edited) as { header: unknown; payload: unknown }
        return `${b64Encode(JSON.stringify(o.header), true)}.${b64Encode(JSON.stringify(o.payload), true)}.${sig}`
      } catch { return '(JSON 파싱 실패 — {"header":{…},"payload":{…}} 형식 유지)' }
    },
  }
}

function detectStep(input: string): Step | null {
  const s = input
  const jwt = jwtStep(s)
  if (jwt) return jwt

  if (/%[0-9a-fA-F]{2}/.test(s)) {
    try {
      const d = decodeURIComponent(s.replace(/\+/g, ' '))
      if (d !== s) return { label: 'URL 인코딩', decoded: d, reencode: e => encodeURIComponent(e) }
    } catch { /* malformed % sequence */ }
  }

  if (/&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,31});/.test(s)) {
    const d = htmlDecode(s)
    if (d !== s) return { label: 'HTML 엔티티', decoded: d, reencode: e => htmlEncode(e) }
  }

  if (/\\u\{?[0-9a-fA-F]{2,}\}?|\\x[0-9a-fA-F]{2}/.test(s)) {
    const d = unicodeUnescape(s)
    if (d !== s) return { label: 'Unicode escape', decoded: d, reencode: e => unicodeEscape(e) }
  }

  const bt = s.trim().replace(/\s+/g, '')
  if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(bt) && bt.length >= 8 && bt.replace(/=+$/, '').length % 4 !== 1) {
    try {
      const d = b64Decode(bt)
      if (looksText(d) && d !== bt) {
        const urlSafe = /[-_]/.test(bt) && !/[+/]/.test(bt)
        return { label: urlSafe ? 'Base64 (URL-safe)' : 'Base64', decoded: d, reencode: e => b64Encode(e, urlSafe) }
      }
    } catch { /* not base64 */ }
  }

  if (/^[0-9a-fA-F]+$/.test(bt) && bt.length >= 8 && bt.length % 2 === 0) {
    try {
      const d = hexDecode(bt)
      if (looksText(d)) return { label: 'Hex', decoded: d, reencode: e => hexEncode(e) }
    } catch { /* not hex text */ }
  }

  return null
}

/* ── 해시 포맷 식별 (DecoderPanel.HASH_PREFIX_RULES + HASH_HEX_LENGTHS) ── */

const HASH_PREFIX: [RegExp, string, boolean][] = [
  [/^\$2[aby]\$/, 'bcrypt', false],
  [/^\$1\$/, 'md5crypt', true],
  [/^\$5\$/, 'sha256crypt', false],
  [/^\$6\$/, 'sha512crypt', false],
  [/^\$argon2(i|d|id)\$/, 'argon2', false],
  [/^\$P\$/, 'phpass (WordPress/phpBB)', true],
  [/^\$H\$/, 'phpass (phpBB3 구버전)', true],
  [/^pbkdf2_sha256\$/, 'Django PBKDF2-SHA256', false],
  [/^\$apr1\$/, 'Apache apr1-md5', true],
  [/^\{SSHA\}/, 'LDAP Salted SHA1', true],
]
const HEX_HASH: Record<number, [string, boolean]> = {
  32: ['MD5 / NTLM (길이·charset 동일)', true],
  40: ['SHA1', true],
  56: ['SHA224', false],
  64: ['SHA256', false],
  96: ['SHA384', false],
  128: ['SHA512', false],
}

function identifyHash(input: string): { name: string; weak: boolean }[] {
  const v = input.trim()
  const out: { name: string; weak: boolean }[] = []
  for (const [re, name, weak] of HASH_PREFIX) if (re.test(v)) out.push({ name, weak })
  if (out.length === 0) {
    const body = v.startsWith('*') ? v.slice(1) : v
    if (/^[0-9a-fA-F]+$/.test(body) && HEX_HASH[body.length]) {
      const [name, weak] = HEX_HASH[body.length]
      out.push({ name, weak })
    }
  }
  return out
}

/* ── 분석: 연쇄 디코딩 + 최종 재인코딩 ─────────────────────────── */

function analyze(input: string) {
  const hashGuess = identifyHash(input)
  const isPrefixHash = HASH_PREFIX.some(([re]) => re.test(input.trim()))
  if (isPrefixHash) return { steps: [] as Step[], final: input, hash: hashGuess }

  const steps: Step[] = []
  let cur = input
  const seen = new Set([input])
  for (let depth = 0; depth < 6; depth++) {
    const step = detectStep(cur)
    if (!step || step.decoded === cur || seen.has(step.decoded)) break
    steps.push(step)
    cur = step.decoded
    seen.add(cur)
  }

  // hash-shaped (known hex length) but some codec claimed it — trust the codec only if it
  // decoded to clearly readable text, otherwise it's almost certainly a hash digest.
  if (hashGuess.length > 0 && steps.length > 0 && /^(Base64|Hex)/.test(steps[0].label) && !strongText(steps[0].decoded)) {
    return { steps: [] as Step[], final: input, hash: hashGuess }
  }
  if (steps.length === 0) return { steps, final: cur, hash: hashGuess }
  return { steps, final: cur, hash: [] as { name: string; weak: boolean }[] }
}

/* ── tab_encoder.py: 전체 디코더/인코더 동시 시도 ──────────────── */

const ALL_DECODERS: [string, (s: string) => string][] = [
  ['Base64', b64Decode],
  ['URL 디코딩', s => decodeURIComponent(s.replace(/\+/g, ' '))],
  ['URL 디코딩 (2중)', s => decodeURIComponent(decodeURIComponent(s))],
  ['HTML 엔티티', htmlDecode],
  ['Hex', hexDecode],
  ['Unicode escape', unicodeUnescape],
  ['ROT13', rot13],
]
const ALL_ENCODERS: [string, (s: string) => string][] = [
  ['Base64', s => b64Encode(s)],
  ['Base64 (URL-safe)', s => b64Encode(s, true)],
  ['Base64 (2중)', s => b64Encode(b64Encode(s))],
  ['URL 인코딩', s => encodeURIComponent(s)],
  ['URL 인코딩 (2중)', s => encodeURIComponent(encodeURIComponent(s))],
  ['HTML 엔티티 (10진수)', htmlEncode],
  ['HTML 엔티티 (16진수)', s => Array.from(s).map(c => `&#x${c.codePointAt(0)!.toString(16)};`).join('')],
  ['Hex', hexEncode],
  ['ROT13', rot13],
  ['Unicode escape', unicodeEscape],
]

function Row({ name, value }: { name: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return <div className="dec-row">
    <span className="dec-row-name">{name}</span>
    <input className="dec-row-val" readOnly value={value} onFocus={e => e.currentTarget.select()}/>
    <button className="dec-row-copy" onClick={async () => { if (!value) return; await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200) }}>
      <Clipboard size={12}/>{copied ? '됨' : ''}
    </button>
  </div>
}

export function SmartDecoderBuilder() {
  const [raw, setRaw] = useState('')
  const [edited, setEdited] = useState<string | null>(null)
  const [gridInput, setGridInput] = useState('')

  const result = useMemo(() => analyze(raw.trim()), [raw])
  // 입력이 바뀌면 편집 상태 초기화
  const finalText = edited ?? result.final
  const reencoded = useMemo(() => {
    if (result.steps.length === 0) return ''
    try {
      return result.steps.reduceRight((acc, step) => step.reencode(acc), finalText)
    } catch (e) {
      return `(재인코딩 실패: ${e instanceof Error ? e.message : e})`
    }
  }, [result.steps, finalText])

  const copy = async (v: string) => { if (v) await navigator.clipboard.writeText(v) }

  return <div className="payload-builder smart-decoder">
    <Note>값을 붙여넣으면 인코딩/해시 포맷을 자동 판별합니다. 인코딩된 값은 연쇄로 디코딩하고, 디코딩 결과를 수정하면 같은 포맷으로 즉시 재인코딩됩니다. 모든 처리는 이 브라우저 안에서만 일어납니다.</Note>

    <label className="payload-builder-label">입력</label>
    <textarea className="payload-builder-textarea" rows={3} value={raw}
      onChange={e => { setRaw(e.target.value); setEdited(null) }}
      placeholder="Base64 / URL / Hex / HTML 엔티티 / JWT / 해시 …"/>

    {raw.trim() && <div className="dec-verdict">
      {result.steps.length > 0 && <>
        <span className="dec-verdict-label">감지</span>
        {result.steps.map((s, i) => <span key={i} className="dec-chain-badge">{s.label}</span>)}
      </>}
      {result.steps.length === 0 && result.hash.length > 0 && <>
        <span className="dec-verdict-label">해시</span>
        {result.hash.map((h, i) => <span key={i} className={`dec-hash-badge ${h.weak ? 'weak' : ''}`}>{h.name}{h.weak ? ' · 취약' : ''}</span>)}
        <span className="dec-hash-note">해시는 단방향이라 디코딩할 수 없습니다.</span>
      </>}
      {result.steps.length === 0 && result.hash.length === 0 && <span className="dec-verdict-plain">평문 — 알려진 인코딩/해시 아님</span>}
    </div>}

    {result.steps.length > 0 && <>
      <label className="payload-builder-label">디코딩 결과 <small>(수정하면 아래가 즉시 재인코딩됨)</small></label>
      <textarea className="payload-builder-textarea" rows={result.steps.some(s => s.label === 'JWT') ? 10 : 4}
        value={finalText} onChange={e => setEdited(e.target.value)}/>

      <div className="payload-readout-title">원래 포맷으로 재인코딩 ({result.steps.map(s => s.label).reverse().join(' → ')})</div>
      <div className="cheatsheet-command-bar">
        <pre className="cheatsheet-command wrap-anywhere">{reencoded}</pre>
        <button className="cheatsheet-copy" onClick={() => copy(reencoded)}><Clipboard size={14}/>복사</button>
      </div>
    </>}

    <details className="dec-grid-wrap">
      <summary>전체 디코더 · 인코더 동시 시도</summary>
      <input className="payload-builder-input" value={gridInput} onChange={e => setGridInput(e.target.value)} placeholder="여기에 값을 넣으면 아래 모든 방식으로 동시 변환"/>
      <div className="dec-grid">
        <div>
          <p className="dec-grid-head">디코딩 시도</p>
          {ALL_DECODERS.map(([name, fn]) => {
            let v = ''
            try { v = gridInput ? fn(gridInput) : '' } catch (e) { v = gridInput ? `(실패: ${e instanceof Error ? e.message : e})` : '' }
            return <Row key={name} name={name} value={v}/>
          })}
        </div>
        <div>
          <p className="dec-grid-head">인코딩</p>
          {ALL_ENCODERS.map(([name, fn]) => {
            let v = ''
            try { v = gridInput ? fn(gridInput) : '' } catch (e) { v = gridInput ? `(실패: ${e instanceof Error ? e.message : e})` : '' }
            return <Row key={name} name={name} value={v}/>
          })}
        </div>
      </div>
    </details>
  </div>
}
