/// <reference lib="webworker" />
import { type AlgoId, hashSync, hashWith } from './hashCore'

/* 브루트포스 전용 워커 — 메인 스레드가 코어 수만큼(navigator.hardwareConcurrency) 이 워커를 띄우고,
 * 같은 길이의 키스페이스를 워커별로 겹치지 않는 인덱스 구간으로 쪼개 맡긴다. 인덱스 → 후보 문자열
 * 변환은 charset 을 진법으로 쓰는 표준 mixed-radix 인코딩(자릿수 = length)이라 워커 간 중복·누락이
 * 없다. MD5/NTLM/CRC32 는 동기 계산이라 await 오버헤드 없이 순수 루프로 돌리고, SHA 계열만
 * async(SubtleCrypto)로 처리한다 — 그래서 진짜 무차별대입은 MD5/NTLM/CRC32 가 압도적으로 빠르다.
 * 중단은 메인 스레드가 이 워커를 바로 terminate() 해서 처리한다(강제 종료라 별도 협조 프로토콜
 * 불필요) — 그래서 이 파일엔 stop 메시지 핸들링이 없다. */

type RunMsg = { cmd: 'run'; algos: AlgoId[]; charset: string; length: number; startIndex: number; endIndex: number; target: string; reportEvery: number }

function indexToString(index: number, charset: string, length: number): string {
  const base = charset.length
  const chars = new Array(length)
  let n = index
  for (let pos = length - 1; pos >= 0; pos--) {
    chars[pos] = charset[n % base]
    n = Math.floor(n / base)
  }
  return chars.join('')
}

async function run(msg: RunMsg) {
  const { algos, charset, length, startIndex, endIndex, target, reportEvery } = msg
  const onlySync = algos.every(a => a === 'md5' || a === 'ntlm' || a === 'crc32')
  let tried = 0
  for (let i = startIndex; i < endIndex; i++) {
    const candidate = indexToString(i, charset, length)
    if (onlySync) {
      for (const a of algos) {
        if (hashSync(a as 'md5' | 'ntlm' | 'crc32', candidate) === target) {
          postMessage({ type: 'found', plain: candidate, algo: a }); return
        }
      }
    } else {
      for (const a of algos) {
        if ((await hashWith(a, candidate)) === target) { postMessage({ type: 'found', plain: candidate, algo: a }); return }
      }
    }
    tried++
    if (tried % reportEvery === 0) {
      postMessage({ type: 'progress', tried })
      await new Promise(resolve => setTimeout(resolve, 0)) // 메인 스레드 배려 차원의 가벼운 양보 — 없어도 정확성엔 무관
    }
  }
  postMessage({ type: 'progress', tried })
  postMessage({ type: 'done' })
}

self.onmessage = (e: MessageEvent<RunMsg>) => { void run(e.data) }
