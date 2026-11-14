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
