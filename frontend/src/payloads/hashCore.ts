/* 해시 계산 공용 코어 — 메인 스레드(rainbow.tsx)와 브루트포스 워커(rainbowWorker.ts) 양쪽이 그대로
 * 가져다 쓴다. MD4/MD5 는 RFC 1320/1321 을 직접 이식했고(Web Crypto 가 지원 안 함), 각 테스트
 * 벡터(md4/md5 표준 벡터 + 실제 NTLM("password")=8846f7ea... 상수)로 대조 검증했다. */

export function add32(a: number, b: number): number { return (a + b) & 0xffffffff }
function rol(x: number, s: number) { return (x << s) | (x >>> (32 - s)) }

// MD5 라운드 함수
function cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
  a = add32(add32(a, q), add32(x, t))
  return add32(rol(a, s), b)
}
function md5ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn((b & c) | (~b & d), a, b, x, s, t) }
function md5gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn((b & d) | (c & ~d), a, b, x, s, t) }
function md5hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn(b ^ c ^ d, a, b, x, s, t) }
function md5ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn(c ^ (b | ~d), a, b, x, s, t) }

function md5cycle(x: number[], k: number[]) {
  let [a, b, c, d] = x
  a = md5ff(a, b, c, d, k[0], 7, -680876936); d = md5ff(d, a, b, c, k[1], 12, -389564586); c = md5ff(c, d, a, b, k[2], 17, 606105819); b = md5ff(b, c, d, a, k[3], 22, -1044525330)
  a = md5ff(a, b, c, d, k[4], 7, -176418897); d = md5ff(d, a, b, c, k[5], 12, 1200080426); c = md5ff(c, d, a, b, k[6], 17, -1473231341); b = md5ff(b, c, d, a, k[7], 22, -45705983)
  a = md5ff(a, b, c, d, k[8], 7, 1770035416); d = md5ff(d, a, b, c, k[9], 12, -1958414417); c = md5ff(c, d, a, b, k[10], 17, -42063); b = md5ff(b, c, d, a, k[11], 22, -1990404162)
  a = md5ff(a, b, c, d, k[12], 7, 1804603682); d = md5ff(d, a, b, c, k[13], 12, -40341101); c = md5ff(c, d, a, b, k[14], 17, -1502002290); b = md5ff(b, c, d, a, k[15], 22, 1236535329)
  a = md5gg(a, b, c, d, k[1], 5, -165796510); d = md5gg(d, a, b, c, k[6], 9, -1069501632); c = md5gg(c, d, a, b, k[11], 14, 643717713); b = md5gg(b, c, d, a, k[0], 20, -373897302)
  a = md5gg(a, b, c, d, k[5], 5, -701558691); d = md5gg(d, a, b, c, k[10], 9, 38016083); c = md5gg(c, d, a, b, k[15], 14, -660478335); b = md5gg(b, c, d, a, k[4], 20, -405537848)
  a = md5gg(a, b, c, d, k[9], 5, 568446438); d = md5gg(d, a, b, c, k[14], 9, -1019803690); c = md5gg(c, d, a, b, k[3], 14, -187363961); b = md5gg(b, c, d, a, k[8], 20, 1163531501)
  a = md5gg(a, b, c, d, k[13], 5, -1444681467); d = md5gg(d, a, b, c, k[2], 9, -51403784); c = md5gg(c, d, a, b, k[7], 14, 1735328473); b = md5gg(b, c, d, a, k[12], 20, -1926607734)
  a = md5hh(a, b, c, d, k[5], 4, -378558); d = md5hh(d, a, b, c, k[8], 11, -2022574463); c = md5hh(c, d, a, b, k[11], 16, 1839030562); b = md5hh(b, c, d, a, k[14], 23, -35309556)
  a = md5hh(a, b, c, d, k[1], 4, -1530992060); d = md5hh(d, a, b, c, k[4], 11, 1272893353); c = md5hh(c, d, a, b, k[7], 16, -155497632); b = md5hh(b, c, d, a, k[10], 23, -1094730640)
  a = md5hh(a, b, c, d, k[13], 4, 681279174); d = md5hh(d, a, b, c, k[0], 11, -358537222); c = md5hh(c, d, a, b, k[3], 16, -722521979); b = md5hh(b, c, d, a, k[6], 23, 76029189)
  a = md5hh(a, b, c, d, k[9], 4, -640364487); d = md5hh(d, a, b, c, k[12], 11, -421815835); c = md5hh(c, d, a, b, k[15], 16, 530742520); b = md5hh(b, c, d, a, k[2], 23, -995338651)
  a = md5ii(a, b, c, d, k[0], 6, -198630844); d = md5ii(d, a, b, c, k[7], 10, 1126891415); c = md5ii(c, d, a, b, k[14], 15, -1416354905); b = md5ii(b, c, d, a, k[5], 21, -57434055)
  a = md5ii(a, b, c, d, k[12], 6, 1700485571); d = md5ii(d, a, b, c, k[3], 10, -1894986606); c = md5ii(c, d, a, b, k[10], 15, -1051523); b = md5ii(b, c, d, a, k[1], 21, -2054922799)
  a = md5ii(a, b, c, d, k[8], 6, 1873313359); d = md5ii(d, a, b, c, k[15], 10, -30611744); c = md5ii(c, d, a, b, k[6], 15, -1560198380); b = md5ii(b, c, d, a, k[13], 21, 1309151649)
  a = md5ii(a, b, c, d, k[4], 6, -145523070); d = md5ii(d, a, b, c, k[11], 10, -1120210379); c = md5ii(c, d, a, b, k[2], 15, 718787259); b = md5ii(b, c, d, a, k[9], 21, -343485551)
  x[0] = add32(a, x[0]); x[1] = add32(b, x[1]); x[2] = add32(c, x[2]); x[3] = add32(d, x[3])
}

// MD4 라운드 함수 (덧셈 상수 없는 라운드1, 고정 상수 라운드2·3, 다른 메시지 순서·시프트)
function md4f1(a: number, b: number, c: number, d: number, x: number, s: number) { return rol(add32(add32(a, (b & c) | (~b & d)), x), s) }
function md4f2(a: number, b: number, c: number, d: number, x: number, s: number) { return rol(add32(add32(add32(a, (b & c) | (b & d) | (c & d)), x), 0x5a827999), s) }
function md4f3(a: number, b: number, c: number, d: number, x: number, s: number) { return rol(add32(add32(add32(a, b ^ c ^ d), x), 0x6ed9eba1), s) }

function md4cycle(x: number[], k: number[]) {
  let [a, b, c, d] = x
  a = md4f1(a, b, c, d, k[0], 3); d = md4f1(d, a, b, c, k[1], 7); c = md4f1(c, d, a, b, k[2], 11); b = md4f1(b, c, d, a, k[3], 19)
  a = md4f1(a, b, c, d, k[4], 3); d = md4f1(d, a, b, c, k[5], 7); c = md4f1(c, d, a, b, k[6], 11); b = md4f1(b, c, d, a, k[7], 19)
  a = md4f1(a, b, c, d, k[8], 3); d = md4f1(d, a, b, c, k[9], 7); c = md4f1(c, d, a, b, k[10], 11); b = md4f1(b, c, d, a, k[11], 19)
  a = md4f1(a, b, c, d, k[12], 3); d = md4f1(d, a, b, c, k[13], 7); c = md4f1(c, d, a, b, k[14], 11); b = md4f1(b, c, d, a, k[15], 19)
  a = md4f2(a, b, c, d, k[0], 3); d = md4f2(d, a, b, c, k[4], 5); c = md4f2(c, d, a, b, k[8], 9); b = md4f2(b, c, d, a, k[12], 13)
  a = md4f2(a, b, c, d, k[1], 3); d = md4f2(d, a, b, c, k[5], 5); c = md4f2(c, d, a, b, k[9], 9); b = md4f2(b, c, d, a, k[13], 13)
  a = md4f2(a, b, c, d, k[2], 3); d = md4f2(d, a, b, c, k[6], 5); c = md4f2(c, d, a, b, k[10], 9); b = md4f2(b, c, d, a, k[14], 13)
  a = md4f2(a, b, c, d, k[3], 3); d = md4f2(d, a, b, c, k[7], 5); c = md4f2(c, d, a, b, k[11], 9); b = md4f2(b, c, d, a, k[15], 13)
  a = md4f3(a, b, c, d, k[0], 3); d = md4f3(d, a, b, c, k[8], 9); c = md4f3(c, d, a, b, k[4], 11); b = md4f3(b, c, d, a, k[12], 15)
  a = md4f3(a, b, c, d, k[2], 3); d = md4f3(d, a, b, c, k[10], 9); c = md4f3(c, d, a, b, k[6], 11); b = md4f3(b, c, d, a, k[14], 15)
  a = md4f3(a, b, c, d, k[1], 3); d = md4f3(d, a, b, c, k[9], 9); c = md4f3(c, d, a, b, k[5], 11); b = md4f3(b, c, d, a, k[13], 15)
  a = md4f3(a, b, c, d, k[3], 3); d = md4f3(d, a, b, c, k[11], 9); c = md4f3(c, d, a, b, k[7], 11); b = md4f3(b, c, d, a, k[15], 15)
  x[0] = add32(a, x[0]); x[1] = add32(b, x[1]); x[2] = add32(c, x[2]); x[3] = add32(d, x[3])
}

// MD4/MD5 공용 메시지 워드 추출 + 패딩(둘 다 64바이트 블록, little-endian 길이 — RFC 1320/1321 동일)
function toBlk(s: string): number[] {
  const blk: number[] = []
  for (let i = 0; i < 64; i += 4) blk[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24)
  return blk
}
function digest128(input: string, cycle: (x: number[], k: number[]) => void): number[] {
  const n = input.length
  const state = [1732584193, -271733879, -1732584194, 271733878]
  let i: number
  for (i = 64; i <= input.length; i += 64) cycle(state, toBlk(input.substring(i - 64, i)))
  const tailStr = input.substring(i - 64)
  const tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  for (i = 0; i < tailStr.length; i++) tail[i >> 2] |= tailStr.charCodeAt(i) << ((i % 4) << 3)
  tail[i >> 2] |= 0x80 << ((i % 4) << 3)
  if (i > 55) { cycle(state, tail); for (i = 0; i < 16; i++) tail[i] = 0 }
  tail[14] = n * 8
  cycle(state, tail)
  return state
}
const HEX_CHARS = '0123456789abcdef'
function rhex(n: number): string { let s = ''; for (let j = 0; j < 4; j++) s += HEX_CHARS[(n >> (j * 8 + 4)) & 0xf] + HEX_CHARS[(n >> (j * 8)) & 0xf]; return s }
export function utf8Bytes(s: string): string { return unescape(encodeURIComponent(s)) } // UTF-8 바이트를 1문자=1바이트 문자열로
export function utf16leBytes(s: string): string { let out = ''; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); out += String.fromCharCode(c & 0xff, (c >> 8) & 0xff) }; return out }

export function md5Hex(plain: string): string { return digest128(utf8Bytes(plain), md5cycle).map(rhex).join('') }
/** NTLM = MD4(UTF-16LE(비밀번호)) — 솔트 없음. Windows/AD 인증에서 흔히 보는 32자리 hex. */
export function ntlmHex(plain: string): string { return digest128(utf16leBytes(plain), md4cycle).map(rhex).join('') }

/* ── CRC32 (표준 IEEE 802.3 다항식 0xEDB88320) — 암호학적 해시는 아니지만 흔히 마주치는 8자리 hex 체크섬 ── */
const CRC_TABLE: number[] = (() => {
  const table: number[] = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    table[n] = c >>> 0
  }
  return table
})()
export function crc32Hex(plain: string): string {
  const bytes = utf8Bytes(plain)
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes.charCodeAt(i)) & 0xff] ^ (crc >>> 8)
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0')
}

/* ── SHA 계열은 Web Crypto SubtleCrypto 사용(브라우저·워커 둘 다 내장, HTTPS/localhost 전용) ── */

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}
async function shaHex(algo: 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512', plain: string): Promise<string> {
  const digest = await crypto.subtle.digest(algo, new TextEncoder().encode(plain))
  return bufToHex(digest)
}
export const subtleAvailable = typeof crypto !== 'undefined' && !!crypto.subtle

export type AlgoId = 'md5' | 'ntlm' | 'sha1' | 'sha256' | 'sha384' | 'sha512' | 'crc32'
export const ALGO_LABEL: Record<AlgoId, string> = { md5: 'MD5', ntlm: 'NTLM', sha1: 'SHA1', sha256: 'SHA256', sha384: 'SHA384', sha512: 'SHA512', crc32: 'CRC32' }
export const ALL_ALGOS = Object.keys(ALGO_LABEL) as AlgoId[]
/** 동기(md5/ntlm/crc32) — 브루트포스 워커에서 await 오버헤드 없이 빠르게 돌리는 용도. */
export const SYNC_ALGOS: AlgoId[] = ['md5', 'ntlm', 'crc32']
// 길이만으로는 여러 알고리즘이 겹친다(MD5/NTLM 둘 다 32자리) — 후보를 전부 나열해두고 자동판별은
// 사전 대조 시 후보 전부를 시도한다.
export const HASH_LENGTH_TO_ALGOS: Record<number, AlgoId[]> = { 8: ['crc32'], 32: ['md5', 'ntlm'], 40: ['sha1'], 64: ['sha256'], 96: ['sha384'], 128: ['sha512'] }

export function hashSync(algo: 'md5' | 'ntlm' | 'crc32', plain: string): string {
  return algo === 'md5' ? md5Hex(plain) : algo === 'ntlm' ? ntlmHex(plain) : crc32Hex(plain)
}
export async function hashWith(algo: AlgoId, plain: string): Promise<string> {
  if (algo === 'md5' || algo === 'ntlm' || algo === 'crc32') return hashSync(algo, plain)
  return shaHex(algo === 'sha1' ? 'SHA-1' : algo === 'sha256' ? 'SHA-256' : algo === 'sha384' ? 'SHA-384' : 'SHA-512', plain)
}
