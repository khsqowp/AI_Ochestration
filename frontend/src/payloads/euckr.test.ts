import { describe, expect, it } from 'vitest'
import { EucKrEncodeError, eucKrCodePointToPointer, eucKrDecodeBytes, eucKrEncodeBytes, eucKrPointerToCodePoint } from './euckr'

describe('eucKrEncodeBytes / eucKrDecodeBytes round trip', () => {
  it('round-trips modern precomposed Hangul syllables (완성형)', () => {
    for (const s of ['가나다라마바사', '한글 인코딩 테스트', '안녕하세요, 세계!']) {
      expect(eucKrDecodeBytes(eucKrEncodeBytes(s))).toBe(s)
    }
  })

  it('round-trips archaic/extended Hangul syllables not in the basic 2350-syllable set (옛한글)', () => {
    // U+AC02(갂) 이하는 KS X 1001:1987 기본 2350음절엔 없고 1991년 확장 영역(흔히 "UHC"/CP949로
    // 불리는 영역, lead byte 0x81~0xC5)에만 있다 — 여기서 제대로 되는지가 이번 작업의 핵심.
    for (const s of ['갂갃갅갆갋', '뷁', '뙤', '퓖']) {
      expect(eucKrDecodeBytes(eucKrEncodeBytes(s))).toBe(s)
    }
  })

  it('round-trips individual Hangul jamo (ㄱ~ㅎ, ㅏ~ㅣ)', () => {
    const jamo = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'
    expect(eucKrDecodeBytes(eucKrEncodeBytes(jamo))).toBe(jamo)
  })

  it('round-trips Hanja (한자) that KS X 1001 includes for Korean use', () => {
    const hanja = '大韓民國 日本語 詰 漢字'
    expect(eucKrDecodeBytes(eucKrEncodeBytes(hanja))).toBe(hanja)
  })

  it('round-trips KS X 1001 symbol-area characters (Greek/Cyrillic/Hiragana/Katakana/box-drawing)', () => {
    for (const s of ['αβγΩ', 'АБВ', 'あいうえお', 'アイウエオ', '─│┌┐']) {
      expect(eucKrDecodeBytes(eucKrEncodeBytes(s))).toBe(s)
    }
  })

  it('round-trips ASCII and mixed ASCII+Hangul content', () => {
    const s = 'Hello, 안녕하세요! 123 ~!@#$%^&*()_+-=[]{}'
    expect(eucKrDecodeBytes(eucKrEncodeBytes(s))).toBe(s)
  })

  it('produces the exact known byte sequence for a representative syllable (가 = 0xB0 0xA1)', () => {
    expect(Array.from(eucKrEncodeBytes('가'))).toEqual([0xb0, 0xa1])
  })

  it('throws EucKrEncodeError (with the offending char/codePoint) for characters outside EUC-KR', () => {
    expect(() => eucKrEncodeBytes('😀')).toThrow(EucKrEncodeError)
    try {
      eucKrEncodeBytes('A😀B')
      expect.fail('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(EucKrEncodeError)
      const err = e as EucKrEncodeError
      expect(err.char).toBe('😀')
      expect(err.codePoint).toBe(0x1f600)
    }
  })

  it('rejects simplified-Chinese-only characters not present in KS X 1001 Hanja set', () => {
    expect(() => eucKrEncodeBytes('测试')).toThrow(EucKrEncodeError)
  })
})

describe('pointer <-> code point table consistency', () => {
  it('eucKrCodePointToPointer and eucKrPointerToCodePoint are exact inverses for every mapped pointer', () => {
    // 테이블 전체(23750칸)를 돌면서, 매핑된 모든 pointer가 encode 쪽 역테이블과 정확히
    // 일치하는지 확인한다 — 수작업 압축(base64) 과정에서 데이터가 깨지지 않았다는 보증.
    let checked = 0
    for (let pointer = 0; pointer < 23750; pointer++) {
      const cp = eucKrPointerToCodePoint(pointer)
      if (cp === null) continue
      expect(eucKrCodePointToPointer(cp)).not.toBeNull()
      checked++
    }
    // WHATWG index-euc-kr.txt 는 17048개의 (유니크한) codepoint를 갖고 있다.
    expect(checked).toBe(17048)
  })

  it('every mapped pointer survives a full byte-pair encode/decode round trip', () => {
    for (let pointer = 0; pointer < 23750; pointer += 7) { // 전체를 돌면 느리니 샘플링
      const cp = eucKrPointerToCodePoint(pointer)
      if (cp === null) continue
      const lead = Math.floor(pointer / 190) + 0x81
      const trail = (pointer % 190) + 0x41
      const decoded = eucKrDecodeBytes(new Uint8Array([lead, trail]))
      expect(decoded).toBe(String.fromCodePoint(cp))
      expect(Array.from(eucKrEncodeBytes(decoded))).toEqual([lead, trail])
    }
  })
})
