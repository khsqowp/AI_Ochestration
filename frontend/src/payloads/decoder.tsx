import { useMemo, useState } from 'react'
import { Clipboard } from 'lucide-react'
import { Note } from './shared'
import {
  type Charset, CHARSETS, EucKrEncodeError, b64DecodeToBytes, b64EncodeBytes,
  binaryToBytes, bytesToBinary, codecForLabel, decodeBytesWithCharset, encodeTextWithCharset,
  hexDecodeToBytes, hexEncodeBytes, labelCharset, looksText, percentDecodeToBytes, percentEncodeBytes,
  strongText,
} from './decoderCore'
import { eucKrDecodeBytes, eucKrEncodeBytes } from './euckr'

/* 스마트 디코더 — khsqowp/Burp_Extension 의 DecoderPanel.java + tab_encoder.py 로직 이식.
   값을 붙여넣으면 인코딩/해시 포맷을 자동 판별해 (연쇄로) 디코딩하고, 디코딩 결과를
   수정하면 감지된 체인을 역순으로 다시 적용해 원래 포맷으로 재인코딩한다. 순수 클라이언트.

   바이트 ⇄ 텍스트 변환과 EUC-KR 인코더/디코더 본체는 ./decoderCore 와 ./euckr 로 뽑아뒀다 —
   트리형 변형(decoderTree.tsx)도 같은 모듈을 그대로 가져다 쓰기 때문에 두 화면이 서로 다른
   EUC-KR 판정을 내리는 일은 없다. */

const td = new TextDecoder('utf-8', { fatal: false })

export function b64Decode(raw: string): string {
  return td.decode(b64DecodeToBytes(raw))
}
function b64Encode(s: string, urlSafe = false): string {
  return b64EncodeBytes(new TextEncoder().encode(s), urlSafe)
}
function urlDecodeWithCharset(raw: string, charset: Charset): string {
  return decodeBytesWithCharset(percentDecodeToBytes(raw.replace(/\+/g, ' ')), charset)
}
export function hexDecode(raw: string): string {
  return td.decode(hexDecodeToBytes(raw))
}
export function euckrDecode(raw: string): string {
  return eucKrDecodeBytes(binaryToBytes(raw))
}
/** euckrDecode의 역 — 지금까지 UTF-8로만 가능하던 재인코딩을, 직접 이식한 EUC-KR 인코더로
 * 실제 EUC-KR 바이트로 되돌린다(./euckr.ts 참고). */
export function euckrEncode(s: string): string {
  return bytesToBinary(eucKrEncodeBytes(s))
}
const hexEncode = (s: string) => hexEncodeBytes(new TextEncoder().encode(s))

export function htmlDecode(s: string): string {
  const doc = new DOMParser().parseFromString(s, 'text/html')
  return doc.documentElement.textContent ?? s
}
const htmlEncode = (s: string) => Array.from(s).map(c => `&#${c.codePointAt(0)};`).join('')

export function unicodeUnescape(s: string): string {
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

/* ── 감지 가능한 코덱 (우선순위 순) ─────────────────────────────── */

type Step = {
  label: string
  decoded: string
  reencode: (edited: string) => string
  /** 이 단계가 바이트→텍스트 변환이라 UTF-8/EUC-KR 둘 중 하나로 수동 재해석할 수 있을 때만 존재.
   * charset은 "지금 이 단계가 실제로 쓰고 있는" 문자셋(자동판별 결과 또는 사용자가 고른 값). */
  flexible?: { charset: Charset }
}

export function jwtStep(input: string): Step | null {
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

/** value가 charset으로 "읽을 만한 텍스트"로 보이는지(치환문자 없이 깨지지 않는지) */
function tryUtf8Fatal(bytes: Uint8Array): string | null {
  try { return decodeBytesWithCharset(bytes, 'utf-8', true) } catch { return null }
}

function detectStep(input: string, overrideCharset?: Charset): Step | null {
  const s = input
  const jwt = jwtStep(s)
  if (jwt) return jwt

  if (/%[0-9a-fA-F]{2}/.test(s)) {
    const bytes = percentDecodeToBytes(s.replace(/\+/g, ' '))
    let charset: Charset = 'utf-8'
    let d: string | null = null
    if (overrideCharset) {
      charset = overrideCharset
      d = decodeBytesWithCharset(bytes, charset)
    } else {
      // 먼저 UTF-8(표준)로 시도한다 — decodeURIComponent 와 동치. 실패하거나 아무것도 안 바뀌면,
      // 옛 한국 사이트 URL 이 흔히 쓰는 EUC-KR 로 다시 읽어서 정상 텍스트가 나오는지 확인한다.
      const utf8 = tryUtf8Fatal(bytes)
      if (utf8 !== null && utf8 !== s) { charset = 'utf-8'; d = utf8 } else {
        const euckr = decodeBytesWithCharset(bytes, 'euc-kr')
        if (strongText(euckr) && euckr !== s) { charset = 'euc-kr'; d = euckr } else d = null
      }
    }
    if (d !== null && d !== s) {
      return {
        label: charset === 'euc-kr' ? 'URL 인코딩 (EUC-KR)' : 'URL 인코딩',
        decoded: d,
        flexible: { charset },
        reencode: e => percentEncodeBytes(encodeTextWithCharset(e, charset)),
      }
    }
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
      const bytes = b64DecodeToBytes(bt)
      const charset: Charset = overrideCharset ?? 'utf-8'
      const d = decodeBytesWithCharset(bytes, charset)
      if (d !== bt && (overrideCharset ? true : looksText(d))) {
        const urlSafe = /[-_]/.test(bt) && !/[+/]/.test(bt)
        const label = `Base64${urlSafe ? ' (URL-safe)' : ''}${charset === 'euc-kr' ? ' (EUC-KR)' : ''}`
        return { label, decoded: d, flexible: { charset }, reencode: e => b64EncodeBytes(encodeTextWithCharset(e, charset), urlSafe) }
      }
    } catch { /* not base64 */ }
  }

  if (/^[0-9a-fA-F]+$/.test(bt) && bt.length >= 8 && bt.length % 2 === 0) {
    try {
      const bytes = hexDecodeToBytes(bt)
      const charset: Charset = overrideCharset ?? 'utf-8'
      const d = decodeBytesWithCharset(bytes, charset)
      if (overrideCharset ? d !== bt : looksText(d)) {
        return { label: charset === 'euc-kr' ? 'Hex (EUC-KR)' : 'Hex', decoded: d, flexible: { charset }, reencode: e => hexEncodeBytes(encodeTextWithCharset(e, charset)) }
      }
    } catch { /* not hex text */ }
  }

  return null
}

/* ── 해시 포맷 식별 (DecoderPanel.HASH_PREFIX_RULES + HASH_HEX_LENGTHS) ── */

export const HASH_PREFIX: [RegExp, string, boolean][] = [
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

export function identifyHash(input: string): { name: string; weak: boolean }[] {
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

function analyze(input: string, overrides: Record<number, Charset> = {}) {
  const hashGuess = identifyHash(input)
  const isPrefixHash = HASH_PREFIX.some(([re]) => re.test(input.trim()))
  if (isPrefixHash) return { steps: [] as Step[], final: input, hash: hashGuess }

  const steps: Step[] = []
  let cur = input
  const seen = new Set([input])
  for (let depth = 0; depth < 6; depth++) {
    const step = detectStep(cur, overrides[depth])
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

export const ALL_DECODERS: [string, (s: string) => string][] = [
  ['Base64', b64Decode],
  ['URL 디코딩', s => decodeURIComponent(s.replace(/\+/g, ' '))],
  ['URL 디코딩 (2중)', s => decodeURIComponent(decodeURIComponent(s))],
  ['URL 디코딩 (EUC-KR)', s => urlDecodeWithCharset(s, 'euc-kr')],
  ['HTML 엔티티', htmlDecode],
  ['Hex', hexDecode],
  ['Base64 (EUC-KR)', s => decodeBytesWithCharset(b64DecodeToBytes(s), 'euc-kr')],
  ['Hex (EUC-KR)', s => decodeBytesWithCharset(hexDecodeToBytes(s), 'euc-kr')],
  ['EUC-KR', euckrDecode],
  ['Unicode escape', unicodeUnescape],
  ['ROT13', rot13],
]
const ALL_ENCODERS: [string, (s: string) => string][] = [
  ['Base64', s => b64Encode(s)],
  ['Base64 (URL-safe)', s => b64Encode(s, true)],
  ['Base64 (2중)', s => b64Encode(b64Encode(s))],
  ['Base64 (EUC-KR)', s => b64EncodeBytes(eucKrEncodeBytes(s))],
  ['URL 인코딩', s => encodeURIComponent(s)],
  ['URL 인코딩 (2중)', s => encodeURIComponent(encodeURIComponent(s))],
  ['URL 인코딩 (EUC-KR)', s => percentEncodeBytes(eucKrEncodeBytes(s))],
  ['HTML 엔티티 (10진수)', htmlEncode],
  ['HTML 엔티티 (16진수)', s => Array.from(s).map(c => `&#x${c.codePointAt(0)!.toString(16)};`).join('')],
  ['Hex', hexEncode],
  ['Hex (EUC-KR)', s => hexEncodeBytes(eucKrEncodeBytes(s))],
  ['EUC-KR', euckrEncode],
  ['ROT13', rot13],
  ['Unicode escape', unicodeEscape],
]

function Row({ name, value }: { name: string; value: string }) {
  const [copied, setCopied] = useState<boolean | 'error'>(false)
  return <div className="dec-row">
    <span className="dec-row-name">{name}</span>
    <input className="dec-row-val" readOnly value={value} onFocus={e => e.currentTarget.select()}/>
    <button className="dec-row-copy" onClick={async () => { if (!value) return; try { await navigator.clipboard.writeText(value); setCopied(true) } catch { setCopied('error') } setTimeout(() => setCopied(false), 1200) }}>
      <Clipboard size={12}/>{copied === 'error' ? '실패' : copied ? '됨' : ''}
    </button>
  </div>
}

/** 체인/트리 단계 옆에 붙는 작은 UTF-8/EUC-KR 전환 드롭다운. 바꾸면 이 단계부터 다시 디코드된다.
 * decoderTree.tsx 도 그대로 가져다 쓴다(두 화면이 같은 모양의 컨트롤을 쓰게 하려고). */
export function CharsetSwitch({ charset, onChange }: { charset: Charset; onChange: (next: Charset) => void }) {
  return <select className="dec-charset-switch" value={charset} onClick={e => e.stopPropagation()}
    onChange={e => onChange(e.target.value as Charset)} title="이 단계를 다른 문자셋으로 재해석">
    {CHARSETS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
  </select>
}

export function SmartDecoderBuilder() {
  const [raw, setRaw] = useState('')
  const [edited, setEdited] = useState<string | null>(null)
  const [charsetOverrides, setCharsetOverrides] = useState<Record<number, Charset>>({})
  const [gridInput, setGridInput] = useState('')
  const [copyFailed, setCopyFailed] = useState(false)

  const result = useMemo(() => analyze(raw.trim(), charsetOverrides), [raw, charsetOverrides])
  const finalText = edited ?? result.final
  const reencoded = useMemo(() => {
    if (result.steps.length === 0) return ''
    try {
      return result.steps.reduceRight((acc, step) => step.reencode(acc), finalText)
    } catch (e) {
      return `(재인코딩 실패: ${e instanceof EucKrEncodeError ? e.message : e instanceof Error ? e.message : e})`
    }
  }, [result.steps, finalText])

  const setStepCharset = (index: number, charset: Charset) => {
    setEdited(null)
    setCharsetOverrides(prev => {
      const next: Record<number, Charset> = {}
      for (const k of Object.keys(prev)) { const i = Number(k); if (i < index) next[i] = prev[i] }
      next[index] = charset
      return next
    })
  }

  const copy = async (v: string) => {
    if (!v) return
    try { await navigator.clipboard.writeText(v); setCopyFailed(false) } catch { setCopyFailed(true); window.setTimeout(() => setCopyFailed(false), 1500) }
  }

  return <div className="payload-builder smart-decoder">
    <Note>값을 붙여넣으면 인코딩/해시 포맷을 자동 판별합니다. 인코딩된 값은 연쇄로 디코딩하고, 디코딩 결과를
      수정하면 같은 포맷으로 즉시 재인코딩됩니다. 각 단계 옆 드롭다운으로 UTF-8/EUC-KR 해석을 수동으로
      바꿀 수 있습니다. 모든 처리는 이 브라우저 안에서만 일어납니다.</Note>

    <div className="decoder-workspace"><div className="decoder-input-pane"><label className="payload-builder-label">입력</label>
    <textarea className="payload-builder-textarea" rows={3} value={raw}
      onChange={e => { setRaw(e.target.value); setEdited(null); setCharsetOverrides({}) }}
      placeholder="Base64 / URL / Hex / HTML 엔티티 / JWT / 해시 …"/>

    {raw.trim() && <div className="dec-verdict">
      {result.steps.length > 0 && <>
        <span className="dec-verdict-label">감지</span>
        {result.steps.map((s, i) => <span key={i} className="dec-chain-badge-wrap">
          <span className="dec-chain-badge">{s.label}</span>
          {s.flexible && <CharsetSwitch charset={s.flexible.charset} onChange={cs => setStepCharset(i, cs)}/>}
        </span>)}
      </>}
      {result.steps.length === 0 && result.hash.length > 0 && <>
        <span className="dec-verdict-label">해시</span>
        {result.hash.map((h, i) => <span key={i} className={`dec-hash-badge ${h.weak ? 'weak' : ''}`}>{h.name}{h.weak ? ' · 취약' : ''}</span>)}
        <span className="dec-hash-note">해시는 단방향이라 디코딩할 수 없습니다.</span>
      </>}
      {result.steps.length === 0 && result.hash.length === 0 && <span className="dec-verdict-plain">평문 — 알려진 인코딩/해시 아님</span>}
    </div>}

    </div><div className="decoder-result-pane">
    {result.steps.length > 0 && <>
      <label className="payload-builder-label">디코딩 결과 <small>(수정하면 아래가 즉시 재인코딩됨)</small></label>
      <textarea className="payload-builder-textarea" rows={result.steps.some(s => s.label === 'JWT') ? 10 : 4}
        value={finalText} onChange={e => setEdited(e.target.value)}/>

      <div className="payload-readout-title">원래 포맷으로 재인코딩 ({result.steps.map(s => s.label).reverse().join(' → ')})</div>
      <div className="cheatsheet-command-bar">
        <pre className="cheatsheet-command wrap-anywhere">{reencoded}</pre>
        <button className="cheatsheet-copy" onClick={() => void copy(reencoded)}><Clipboard size={14}/>{copyFailed ? '복사 실패' : '복사'}</button>
      </div>
    </>}
    {result.steps.length === 0 && <div className="diag-result-empty">{raw.trim() ? '알려진 디코딩 단계가 없습니다. 입력 형식과 인코딩 방식을 확인하세요.' : 'Base64, URL, Hex, HTML 엔티티 또는 JWT를 입력하면 현재 디코딩 단계가 여기에 표시됩니다.'}</div>}
    </div></div>

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

// 참고용으로 내부 헬퍼도 내보내서 decoderTree.tsx 와 테스트가 같은 구현을 공유한다.
export { codecForLabel, labelCharset }
