import { useState, type ReactNode } from 'react'
import { Clipboard } from 'lucide-react'

/* ── 인코딩·조립 헬퍼 (전부 순수 문자열 변환) ───────────────────── */

export function escapeSingleQuoted(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

export function jsStringConcat(code: string): string {
  if (code.length < 4) return `'${escapeSingleQuoted(code)}'`
  const cut1 = Math.max(1, Math.floor(code.length / 3))
  const cut2 = Math.max(cut1 + 1, Math.floor((code.length * 2) / 3))
  return [code.slice(0, cut1), code.slice(cut1, cut2), code.slice(cut2)]
    .filter(Boolean)
    .map(part => `'${escapeSingleQuoted(part)}'`)
    .join('+')
}

export function hexEscape(code: string): string {
  return Array.from(code).map(ch => '\\x' + ch.charCodeAt(0).toString(16).padStart(2, '0')).join('')
}

export function unicodeEscape(code: string): string {
  return Array.from(code).map(ch => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0')).join('')
}

export function base64Encode(code: string): string {
  return btoa(unescape(encodeURIComponent(code)))
}

export function htmlEntityDecimal(input: string): string {
  return Array.from(input).map(ch => `&#${ch.codePointAt(0)};`).join('')
}

export function htmlEntityHex(input: string): string {
  return Array.from(input).map(ch => `&#x${ch.codePointAt(0)!.toString(16)};`).join('')
}

export function urlEncodeAll(input: string): string {
  return Array.from(input).map(ch => {
    const cp = ch.codePointAt(0)!
    return cp < 128 ? '%' + cp.toString(16).padStart(2, '0').toUpperCase() : encodeURIComponent(ch)
  }).join('')
}

/** eval(atob(...)) 로 감싸 base64 문자열만 노출 */
export function wrapEvalBase64(code: string): string {
  return `eval(atob("${base64Encode(code)}"))`
}

export function wrapEvalHex(code: string): string {
  return `eval("${hexEscape(code)}")`
}

export function wrapEvalConcat(code: string): string {
  return `eval(${jsStringConcat(code)})`
}

/* ── 공용 UI ──────────────────────────────────────────────────── */

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <>
    <label className="payload-builder-label">{label}</label>
    {children}
  </>
}

export function Pick<T extends string>({ label, value, onChange, options }: {
  label: string
  value: T
  onChange: (next: T) => void
  options: { id: T; label: string }[]
}) {
  return <Field label={label}>
    <select className="payload-builder-select" value={value} onChange={e => onChange(e.target.value as T)}>
      {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  </Field>
}

export function TextInput({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return <Field label={label}>
    <input className="payload-builder-input" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}/>
  </Field>
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="cheatsheet-note">{children}</p>
}

/** 결과 코드 블록 + 복사 버튼. 여러 개를 쌓아 렌더할 수 있다. */
export function Readout({ title, value, wrap }: { title?: string; value: string; wrap?: 'anywhere' | 'pre' }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true); window.setTimeout(() => setCopied(false), 1500)
  }
  return <div className="payload-readout">
    {title && <div className="payload-readout-title">{title}</div>}
    <div className="cheatsheet-command-bar">
      <pre className={`cheatsheet-command ${wrap === 'anywhere' ? 'wrap-anywhere' : ''}`}>{value}</pre>
      <button className="cheatsheet-copy" onClick={copy}><Clipboard size={14}/>{copied ? '복사됨' : '복사'}</button>
    </div>
  </div>
}

export const DISCLAIMER = '사전에 서면으로 허가된 대상·범위에서만 사용하세요. 생성 결과는 순수 문자열이며 이 화면은 어떤 요청도 보내지 않습니다.'
