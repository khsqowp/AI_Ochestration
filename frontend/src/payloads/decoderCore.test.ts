import { describe, expect, it } from 'vitest'
import {
  binaryToBytes, b64DecodeToBytes, b64EncodeBytes, bytesToBinary, codecForLabel, decodeBytesWithCharset,
  encodeTextWithCharset, hexDecodeToBytes, hexEncodeBytes, labelCharset, percentDecodeToBytes, percentEncodeBytes,
  reinterpretWithCharset,
} from './decoderCore'
import { EucKrEncodeError } from './euckr'

const SAMPLE_KO = '안녕하세요, 이것은 EUC-KR 재인코딩 테스트입니다 (옛한글 갂갃도 포함: 뷁뙤퓖).'

describe('decode -> edit -> re-encode workflow stays byte-identical (실사용 시나리오)', () => {
  it('round-trips through percent-encoding exactly like an old EUC-KR URL', () => {
    // 1) 원본이 EUC-KR 바이트라고 가정하고 %XX 로 감싼다(옛 한국 사이트 URL 흉내).
    const originalBytes = encodeTextWithCharset(SAMPLE_KO, 'euc-kr')
    const wrapped = percentEncodeBytes(originalBytes)

    // 2) 디코더가 하는 일: %XX 풀어서 바이트로 만들고 EUC-KR 로 해석.
    const decodedBytes = percentDecodeToBytes(wrapped)
    expect(Array.from(decodedBytes)).toEqual(Array.from(originalBytes))
    const decodedText = decodeBytesWithCharset(decodedBytes, 'euc-kr')
    expect(decodedText).toBe(SAMPLE_KO)

    // 3) "수정 없이" 재인코딩하면 바이트 단위로 원본과 완전히 같아야 한다.
    const reencodedBytes = encodeTextWithCharset(decodedText, 'euc-kr')
    expect(Array.from(reencodedBytes)).toEqual(Array.from(originalBytes))
    expect(percentEncodeBytes(reencodedBytes)).toBe(wrapped)
  })

  it('round-trips through Base64 wrapping', () => {
    const originalBytes = encodeTextWithCharset(SAMPLE_KO, 'euc-kr')
    const wrapped = b64EncodeBytes(originalBytes)
    const decoded = decodeBytesWithCharset(b64DecodeToBytes(wrapped), 'euc-kr')
    expect(decoded).toBe(SAMPLE_KO)
    expect(b64EncodeBytes(encodeTextWithCharset(decoded, 'euc-kr'))).toBe(wrapped)
  })

  it('round-trips through Hex wrapping', () => {
    const originalBytes = encodeTextWithCharset(SAMPLE_KO, 'euc-kr')
    const wrapped = hexEncodeBytes(originalBytes)
    const decoded = decodeBytesWithCharset(hexDecodeToBytes(wrapped), 'euc-kr')
    expect(decoded).toBe(SAMPLE_KO)
    expect(hexEncodeBytes(encodeTextWithCharset(decoded, 'euc-kr'))).toBe(wrapped)
  })

  it('round-trips raw-byte reinterpretation (mojibake-style, no wrapping at all)', () => {
    const originalBytes = encodeTextWithCharset(SAMPLE_KO, 'euc-kr')
    const asBinaryString = bytesToBinary(originalBytes)
    const decoded = decodeBytesWithCharset(binaryToBytes(asBinaryString), 'euc-kr')
    expect(decoded).toBe(SAMPLE_KO)
    expect(bytesToBinary(encodeTextWithCharset(decoded, 'euc-kr'))).toBe(asBinaryString)
  })

  it('an edit after decoding re-encodes the *edited* text, not the original', () => {
    const originalBytes = encodeTextWithCharset('안녕', 'euc-kr')
    const wrapped = percentEncodeBytes(originalBytes)
    const decoded = decodeBytesWithCharset(percentDecodeToBytes(wrapped), 'euc-kr')
    expect(decoded).toBe('안녕')

    const edited = decoded + ' 하세요'
    const reencoded = percentEncodeBytes(encodeTextWithCharset(edited, 'euc-kr'))
    expect(reencoded).not.toBe(wrapped)
    expect(decodeBytesWithCharset(percentDecodeToBytes(reencoded), 'euc-kr')).toBe(edited)
  })

  it('surfaces EucKrEncodeError through the pipeline when the edited text is not EUC-KR representable', () => {
    expect(() => encodeTextWithCharset('한글 + 😀', 'euc-kr')).toThrow(EucKrEncodeError)
  })

  it('utf-8 charset path is unaffected (still works exactly like before)', () => {
    const text = 'hello world + unicode ☕'
    const bytes = encodeTextWithCharset(text, 'utf-8')
    expect(decodeBytesWithCharset(bytes, 'utf-8')).toBe(text)
  })
})

describe('codecForLabel / reinterpretWithCharset (체인·트리 공용 charset 재해석)', () => {
  it('resolves the byte codec for every flexible label variant used by decoder.tsx / decoderTree.tsx', () => {
    expect(codecForLabel('Base64')?.id).toBe('base64')
    expect(codecForLabel('Base64 (EUC-KR)')?.id).toBe('base64')
    expect(codecForLabel('Hex')?.id).toBe('hex')
    expect(codecForLabel('Hex (EUC-KR)')?.id).toBe('hex')
    expect(codecForLabel('URL 디코딩')?.id).toBe('url')
    expect(codecForLabel('URL 인코딩')?.id).toBe('url')
    expect(codecForLabel('URL 디코딩 (EUC-KR)')?.id).toBe('url')
    expect(codecForLabel('EUC-KR')?.id).toBe('raw')
    expect(codecForLabel('HTML 엔티티')).toBeUndefined()
    expect(codecForLabel('ROT13')).toBeUndefined()
  })

  it('labelCharset reflects the "(EUC-KR)" suffix convention', () => {
    expect(labelCharset('Base64')).toBe('utf-8')
    expect(labelCharset('Base64 (EUC-KR)')).toBe('euc-kr')
    expect(labelCharset('EUC-KR')).toBe('euc-kr')
    expect(labelCharset('URL 디코딩 (EUC-KR)')).toBe('euc-kr')
  })

  it('reinterprets a Base64-wrapped EUC-KR payload when asked for euc-kr, and gets mojibake-ish text for utf-8', () => {
    const bytes = encodeTextWithCharset('한글테스트', 'euc-kr')
    const wrapped = b64EncodeBytes(bytes)
    expect(reinterpretWithCharset('Base64', wrapped, 'euc-kr')).toBe('한글테스트')
    const asUtf8 = reinterpretWithCharset('Base64', wrapped, 'utf-8')
    expect(asUtf8).not.toBe('한글테스트')
  })

  it('returns null for malformed input instead of throwing', () => {
    expect(reinterpretWithCharset('Base64', '!!!not base64!!!', 'euc-kr')).toBeNull()
  })

  it('returns null when the label has no associated flexible codec', () => {
    expect(reinterpretWithCharset('ROT13', 'anything', 'euc-kr')).toBeNull()
  })
})
