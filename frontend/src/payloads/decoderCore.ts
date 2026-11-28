/* decoder.tsx / decoderTree.tsx 공용 코어 — 바이트 ⇄ 텍스트 변환과 "문자셋 재해석" 개념을
 * 한 군데에 모아서 두 파일이 같은 인코더/디코더를 쓰게 한다(따로 구현하면 EUC-KR 처리가
 * 갈라질 위험이 있어서). 문자셋은 UTF-8 / EUC-KR 두 가지만 다룬다 — base64 같은 "포장 형식"
 * 자체를 바꾸는 게 아니라, 포장을 벗긴 바이트를 어떤 문자셋으로 읽을지만 고르는 용도. */

import { EucKrEncodeError, eucKrDecodeBytes, eucKrEncodeBytes } from './euckr'

export type Charset = 'utf-8' | 'euc-kr'

export const CHARSETS: { id: Charset; label: string }[] = [
  { id: 'utf-8', label: 'UTF-8' },
  { id: 'euc-kr', label: 'EUC-KR' },
]

const te = new TextEncoder()
const utf8Decoder = new TextDecoder('utf-8', { fatal: false })
const utf8DecoderFatal = new TextDecoder('utf-8', { fatal: true })

export function bytesToBinary(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i])
  return s
}
export function binaryToBytes(s: string): Uint8Array {
  const b = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i)
  return b
}

/** bytes를 charset으로 디코딩한다. fatal=true면 utf-8이 유효하지 않을 때 예외를 던진다
 * (자동판별에서 "진짜 utf-8인지" 확인하는 용도 — euc-kr은 정의상 fatal 모드가 없다, 항상
 * 치환문자(U+FFFD)로 대체). */
export function decodeBytesWithCharset(bytes: Uint8Array, charset: Charset, fatal = false): string {
  if (charset === 'euc-kr') return eucKrDecodeBytes(bytes)
  return (fatal ? utf8DecoderFatal : utf8Decoder).decode(bytes)
}

/** text를 charset의 바이트로 인코딩한다. euc-kr로 표현할 수 없는 문자가 있으면
 * EucKrEncodeError를 던진다(호출부에서 잡아 사용자에게 보여줘야 함). */
export function encodeTextWithCharset(text: string, charset: Charset): Uint8Array {
  if (charset === 'euc-kr') return eucKrEncodeBytes(text)
  return te.encode(text)
}

export { EucKrEncodeError }

/* ── 바이트 단위 % / Base64 / Hex 포장·해제 (문자셋과 무관) ──────────────── */

/** %XX 이스케이프와 리터럴 문자(ASCII 범위 가정)를 그대로 바이트로 풀어낸다 — decodeURIComponent는
 * 항상 UTF-8로만 해석해서, EUC-KR로 퍼센트 인코딩된 옛 한국 사이트 URL은 이걸로 그대로 깨진다. */
export function percentDecodeToBytes(raw: string): Uint8Array {
  const bytes: number[] = []
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '%' && /^[0-9a-fA-F]{2}$/.test(raw.substring(i + 1, i + 3))) {
      bytes.push(parseInt(raw.substring(i + 1, i + 3), 16))
      i += 2
    } else {
      bytes.push(raw.charCodeAt(i) & 0xff)
    }
  }
  return new Uint8Array(bytes)
}

/** 바이트 단위 범용 퍼센트 인코더(문자셋 무관) — 영숫자와 -_.~ 만 리터럴로 두고 나머지는 %XX. */
export function percentEncodeBytes(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]
    const ch = String.fromCharCode(b)
    if (/[A-Za-z0-9\-_.~]/.test(ch)) out += ch
    else out += '%' + b.toString(16).toUpperCase().padStart(2, '0')
  }
  return out
}

export function b64DecodeToBytes(raw: string): Uint8Array {
  let t = raw.trim().replace(/\s+/g, '')
  if (/[-_]/.test(t)) t = t.replace(/-/g, '+').replace(/_/g, '/')
  t = t + '='.repeat((4 - (t.length % 4)) % 4)
  return binaryToBytes(atob(t))
}
export function b64EncodeBytes(bytes: Uint8Array, urlSafe = false): string {
  const out = btoa(bytesToBinary(bytes))
  return urlSafe ? out.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : out
}

export function hexDecodeToBytes(raw: string): Uint8Array {
  const t = raw.trim().replace(/\s+/g, '')
  const b = new Uint8Array(t.length / 2)
  for (let i = 0; i < b.length; i++) b[i] = parseInt(t.substr(i * 2, 2), 16)
  return b
}
export function hexEncodeBytes(bytes: Uint8Array): string {
  return Array.from(bytes).map(x => x.toString(16).padStart(2, '0')).join('')
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
export function base32Encode(s: string): string {
  const bytes = te.encode(s); let bits = 0, value = 0, out = ''
  for (const byte of bytes) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { bits -= 5; out += BASE32[(value >>> bits) & 31] } }
  if (bits) out += BASE32[(value << (5 - bits)) & 31]
  return out.padEnd(Math.ceil(out.length / 8) * 8, '=')
}
export function base32Decode(s: string): string {
  let bits = 0, value = 0; const bytes: number[] = []
  for (const ch of s.toUpperCase().replace(/=+$/, '').replace(/\s/g, '')) { const n = BASE32.indexOf(ch); if (n < 0) throw new Error('Base32 입력 오류'); value = (value << 5) | n; bits += 5; if (bits >= 8) { bits -= 8; bytes.push((value >>> bits) & 255) } }
  return utf8Decoder.decode(new Uint8Array(bytes))
}
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
export function base58Encode(s: string): string {
  const bytes = te.encode(s); let zeros = 0; while (zeros < bytes.length && bytes[zeros] === 0) zeros++
  let n = bytes.length ? BigInt('0x' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')) : 0n, out = ''
  while (n) { out = BASE58[Number(n % 58n)] + out; n /= 58n }
  return '1'.repeat(zeros) + out
}
export function base58Decode(s: string): string {
  let n = 0n; for (const ch of s) { const d = BASE58.indexOf(ch); if (d < 0) throw new Error('Base58 입력 오류'); n = n * 58n + BigInt(d) }
  const hex = n ? n.toString(16).padStart(Math.ceil(n.toString(16).length / 2) * 2, '0') : ''
  let zeros = 0; while (zeros < s.length && s[zeros] === '1') zeros++
  const bytes = new Uint8Array(zeros + hex.length / 2); for (let i = 0; i < hex.length / 2; i++) bytes[zeros + i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return utf8Decoder.decode(bytes)
}
export function ascii85Encode(s: string): string {
  const bytes = te.encode(s); let out = '<~'
  for (let i = 0; i < bytes.length; i += 4) { const chunk = bytes.slice(i, i + 4); let n = 0; for (let j = 0; j < 4; j++) n = n * 256 + (chunk[j] ?? 0); if (chunk.length === 4 && n === 0) { out += 'z'; continue } let chars = ''; for (let j = 0; j < 5; j++) { chars = String.fromCharCode(n % 85 + 33) + chars; n = Math.floor(n / 85) } out += chars.slice(0, chunk.length + 1) }
  return out + '~>'
}
export function ascii85Decode(s: string): string {
  const input = s.trim().replace(/^<~/, '').replace(/~>$/, '').replace(/\s/g, ''), bytes: number[] = []
  for (let i = 0; i < input.length;) { if (input[i] === 'z') { bytes.push(0, 0, 0, 0); i++; continue } const chunk = input.slice(i, i + 5); i += chunk.length; if (chunk.length === 1) throw new Error('Ascii85 입력 오류'); let n = 0; for (let j = 0; j < 5; j++) { const c = chunk[j] ?? 'u'; if (c < '!' || c > 'u') throw new Error('Ascii85 입력 오류'); n = n * 85 + c.charCodeAt(0) - 33 } for (let j = 0; j < chunk.length - 1; j++) bytes.push(Math.floor(n / (256 ** (3 - j))) & 255) }
  return utf8Decoder.decode(new Uint8Array(bytes))
}
export const quotedPrintableEncode = (s: string) => Array.from(te.encode(s), b => b >= 33 && b <= 126 && b !== 61 ? String.fromCharCode(b) : `=${b.toString(16).toUpperCase().padStart(2, '0')}`).join('')
export const quotedPrintableDecode = (s: string) => utf8Decoder.decode(new Uint8Array(Array.from(s.replace(/=\r?\n/g, '').matchAll(/=([0-9a-f]{2})|([\s\S])/gi), m => m[1] ? parseInt(m[1], 16) : m[2].charCodeAt(0))))
export const rot47 = (s: string) => s.replace(/[!-~]/g, c => String.fromCharCode(33 + ((c.charCodeAt(0) - 33 + 47) % 94)))
export const rot13 = (s: string) => s.replace(/[a-z]/gi, c => String.fromCharCode(c.charCodeAt(0) + (c.toLowerCase() <= 'm' ? 13 : -13)))
export const octalEscapeEncode = (s: string) => Array.from(te.encode(s), b => `\\${b.toString(8).padStart(3, '0')}`).join('')
export const octalEscapeDecode = (s: string) => utf8Decoder.decode(new Uint8Array(Array.from(s.matchAll(/\\([0-7]{1,3})/g), m => parseInt(m[1], 8))))
export const decimalEscapeEncode = (s: string) => Array.from(te.encode(s), b => `\\${b.toString(10).padStart(3, '0')}`).join('')
export const decimalEscapeDecode = (s: string) => utf8Decoder.decode(new Uint8Array(Array.from(s.matchAll(/\\([0-9]{1,3})/g), m => parseInt(m[1], 10))))
export const base36Encode = (s: string) => Array.from(te.encode(s), b => b.toString(36).padStart(2, '0')).join('')
export const base36Decode = (s: string) => utf8Decoder.decode(new Uint8Array((s.match(/.{2}/g) ?? []).map(x => { const n = parseInt(x, 36); if (!/^[0-9a-z]{2}$/i.test(x) || n > 255) throw new Error('Base36 입력 오류'); return n })))
export const utf16Encode = (s: string, littleEndian: boolean) => { const b = new Uint8Array(s.length * 2); for (let i = 0; i < s.length; i++) { const n = s.charCodeAt(i); b[i * 2 + (littleEndian ? 0 : 1)] = n & 255; b[i * 2 + (littleEndian ? 1 : 0)] = n >>> 8 } return percentEncodeBytes(b) }
export const utf16Decode = (s: string, littleEndian: boolean) => { const b = percentDecodeToBytes(s); const bom = littleEndian ? [0xff, 0xfe] : [0xfe, 0xff]; const off = b[0] === bom[0] && b[1] === bom[1] ? 2 : 0; if ((b.length - off) % 2) throw new Error('UTF-16 입력 길이는 짝수여야 합니다'); return new TextDecoder(littleEndian ? 'utf-16le' : 'utf-16be').decode(b.slice(off)) }
export const utf7Encode = (s: string) => Array.from(s).map(c => { if (/^[\x20-\x7e]$/.test(c)) return c === '+' ? '+-' : c; const bytes = utf16Encode(c, false).replace(/%([0-9A-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16))); return `+${btoa(bytes).replace(/=+$/, '')}-` }).join('')
export const utf7Decode = (s: string) => s.replace(/\+([A-Za-z0-9+/]+)-?/g, (_, encoded: string) => { const bin = atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')); const b = Uint8Array.from(bin, c => c.charCodeAt(0)); return new TextDecoder('utf-16be').decode(b) }).replace(/\+-/g, '+')
const PUNY_BASE = 36, PUNY_TMIN = 1, PUNY_TMAX = 26, PUNY_SKEW = 38, PUNY_DAMP = 700, PUNY_INITIAL_BIAS = 72, PUNY_INITIAL_N = 128
function punyAdapt(delta: number, points: number, first: boolean): number { delta = Math.floor(first ? delta / PUNY_DAMP : delta / 2) + Math.floor(delta / points); let k = 0; while (delta > ((PUNY_BASE - PUNY_TMIN) * PUNY_TMAX) / 2) { delta = Math.floor(delta / (PUNY_BASE - PUNY_TMIN)); k += PUNY_BASE } return k + Math.floor(((PUNY_BASE - PUNY_TMIN + 1) * delta) / (delta + PUNY_SKEW)) }
function punyDigit(n: number): string { return String.fromCharCode(n + 22 + 75 * Number(n < 26)) }
function punyValue(c: string): number { const n = c.charCodeAt(0); return n >= 48 && n <= 57 ? n - 22 : n >= 65 && n <= 90 ? n - 65 : n >= 97 && n <= 122 ? n - 97 : PUNY_BASE }
function encodePunyLabel(label: string): string {
  const points = Array.from(label, c => c.codePointAt(0)!); let out = points.filter(cp => cp < 128).map(cp => String.fromCharCode(cp)).join(''); const basic = out.length
  if (basic && basic < points.length) out += '-'
  let n = PUNY_INITIAL_N, delta = 0, bias = PUNY_INITIAL_BIAS, handled = basic
  while (handled < points.length) { const m = Math.min(...points.filter(cp => cp >= n)); delta += (m - n) * (handled + 1); n = m
    for (const cp of points) { if (cp < n) delta++; if (cp === n) { let q = delta; for (let k = PUNY_BASE;; k += PUNY_BASE) { const t = k <= bias ? PUNY_TMIN : k >= bias + PUNY_TMAX ? PUNY_TMAX : k - bias; if (q < t) break; out += punyDigit(t + ((q - t) % (PUNY_BASE - t))); q = Math.floor((q - t) / (PUNY_BASE - t)) } out += punyDigit(q); bias = punyAdapt(delta, handled + 1, handled === basic); delta = 0; handled++ } }
    delta++; n++
  }
  return `xn--${out}`
}
function decodePunyLabel(label: string): string {
  const input = label.replace(/^xn--/i, '').toLowerCase(), delimiter = input.lastIndexOf('-'), out: number[] = delimiter < 0 ? [] : Array.from(input.slice(0, delimiter), c => c.charCodeAt(0))
  let i = 0, n = PUNY_INITIAL_N, bias = PUNY_INITIAL_BIAS, index = 0
  for (let pos = delimiter < 0 ? 0 : delimiter + 1; pos < input.length;) { const old = i; let weight = 1
    for (let k = PUNY_BASE;; k += PUNY_BASE) { if (pos >= input.length) throw new Error('Punycode 입력 오류'); const digit = punyValue(input[pos++]); if (digit >= PUNY_BASE) throw new Error('Punycode 입력 오류'); i += digit * weight; const t = k <= bias ? PUNY_TMIN : k >= bias + PUNY_TMAX ? PUNY_TMAX : k - bias; if (digit < t) break; weight *= PUNY_BASE - t }
    bias = punyAdapt(i - old, out.length + 1, old === 0); n += Math.floor(i / (out.length + 1)); i %= out.length + 1; out.splice(i++, 0, n)
  }
  return String.fromCodePoint(...out)
}
export const punycodeEncode = (s: string) => s.split('.').map(label => /[^\x00-\x7f]/.test(label) ? encodePunyLabel(label) : label).join('.')
export const punycodeDecode = (s: string) => s.split('.').map(label => /^xn--/i.test(label) ? decodePunyLabel(label) : label).join('.')
export function overlongUtf8Decode(s: string): string { const b = percentDecodeToBytes(s), out: number[] = []; for (let i = 0; i < b.length; i++) { const a = b[i]; if (a >= 0xc0 && a <= 0xdf && i + 1 < b.length) out.push(((a & 31) << 6) | (b[++i] & 63)); else if (a >= 0xe0 && a <= 0xef && i + 2 < b.length) out.push(((a & 15) << 12) | ((b[++i] & 63) << 6) | (b[++i] & 63)); else out.push(a) } return String.fromCodePoint(...out) }
export function xorBest(s: string): { text: string; key: number } { const b = te.encode(s); let best = { text: s, key: 0, score: -1 }; for (let key = 0; key < 256; key++) { const text = utf8Decoder.decode(Uint8Array.from(b, x => x ^ key)); const score = textScore(text); if (score > best.score) best = { text, key, score } } return best }

/* ── "문자셋 재해석이 가능한 코덱" 공용 목록 — 체인(decoder.tsx)과 트리(decoderTree.tsx)가
   둘 다 이 목록으로 "이 단계, 다른 문자셋으로 다시 읽으면?" 드롭다운을 그린다. ───────────── */

export interface FlexibleCodec {
  id: 'base64' | 'hex' | 'url' | 'raw'
  /** ALL_DECODERS 쪽 라벨과 매칭시키는 기준 라벨(접미사 " (EUC-KR)" 붙은 변형도 같이 매칭됨) */
  baseLabel: string
  /** 포장된 문자열(base64 문자열, %XX 문자열, raw 바이너리 문자열 등) → 원본 바이트 */
  toBytes: (wrapped: string) => Uint8Array
}

export const FLEXIBLE_CODECS: FlexibleCodec[] = [
  { id: 'base64', baseLabel: 'Base64', toBytes: b64DecodeToBytes },
  { id: 'hex', baseLabel: 'Hex', toBytes: hexDecodeToBytes },
  { id: 'url', baseLabel: 'URL 인코딩', toBytes: s => percentDecodeToBytes(s.replace(/\+/g, ' ')) },
  // "EUC-KR" 단독 항목 — 이미 바이트인 문자열(전체 디코더 그리드 등에서 쓰는 raw 재해석)을
  // EUC-KR/UTF-8 양쪽으로 눈대중 없이 비교해보는 용도. 기본 문자셋이 utf-8이 아니라 euc-kr이다.
  { id: 'raw', baseLabel: 'EUC-KR', toBytes: binaryToBytes },
]

const URL_LABELS = new Set(['URL 디코딩', 'URL 인코딩'])

/** method 라벨(체인의 step.label / 트리 노드의 method)로부터 매칭되는 FlexibleCodec을 찾는다.
 * "Base64 (EUC-KR)", "URL 디코딩 (EUC-KR)" 같은 접미사 변형과, decoder.tsx 쪽 "URL 디코딩"/
 * decoderCore 쪽 "URL 인코딩" 라벨 차이도 함께 흡수한다. */
export function codecForLabel(label: string): FlexibleCodec | undefined {
  const base = label.replace(/\s*\(EUC-KR\)\s*$/, '')
  if (URL_LABELS.has(base)) return FLEXIBLE_CODECS.find(c => c.id === 'url')
  return FLEXIBLE_CODECS.find(c => c.baseLabel === base)
}

export function labelCharset(label: string): Charset {
  return /\(EUC-KR\)\s*$/.test(label) || label === 'EUC-KR' ? 'euc-kr' : 'utf-8'
}

/** label이 가리키는 코덱으로 value를 charset으로 다시 디코딩한다. 실패하면 null. */
export function reinterpretWithCharset(label: string, value: string, charset: Charset): string | null {
  const codec = codecForLabel(label)
  if (!codec) return null
  try {
    const bytes = codec.toBytes(value)
    return decodeBytesWithCharset(bytes, charset)
  } catch {
    return null
  }
}

/* ── 텍스트 품질 휴리스틱 (자동판별에 사용) ──────────────────────────────── */

/** U+FFFD(치환문자)나 C0 제어문자가 아닌 코드포인트의 비율. TextDecoder(non-fatal)는 깨진 바이트를
 * U+FFFD로 바꾸므로, 무작위 바이트를 텍스트로 잘못 해석하면 낮은 점수가, 진짜 텍스트(ASCII/한글
 * 등)는 ~1에 가까운 점수가 나온다. */
export function textScore(s: string): number {
  if (!s) return 0
  const chars = [...s]
  let bad = 0
  for (const c of chars) {
    const cp = c.codePointAt(0)!
    if (cp === 0xfffd || (cp < 32 && cp !== 9 && cp !== 10 && cp !== 13)) bad++
  }
  return 1 - bad / chars.length
}
export const looksText = (s: string) => s.length > 0 && textScore(s) > 0.9
export const strongText = (s: string) => s.length > 0 && textScore(s) > 0.95 && /\S/.test(s)
