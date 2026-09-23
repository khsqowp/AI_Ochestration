/** 모든 클라이언트가 같은 방(day+시작시각+후보 순서)에서 같은 당첨자를 보게 하는 결정론적 선택.
 * 서버는 승자를 계산하지 않는다("누가 후보인지"와 "언제 시작했는지"만 들고 있음) -- 대신 방을
 * 특정하는 문자열을 시드로 삼아 각 클라이언트가 독립적으로 같은 값을 계산한다. FNV-1a로 시드를
 * 만들고 mulberry32로 그 시드에서 하나의 난수를 뽑아 인덱스로 쓴다(둘 다 순수 정수 연산이라
 * 부동소수점 구현 차이에 안 흔들림 -- 이전 box2d-wasm 물리 시뮬레이션의 "결정론적 재생"이
 * 맡던 역할을 훨씬 단순한 방식으로 대신한다). */

function fnv1aHash(input: string): number {
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function mulberry32(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function pickWinnerIndex(day: string, startedAt: string, candidates: string[]): number {
  if (candidates.length <= 1) return 0
  const seed = fnv1aHash(`${day}|${startedAt}|${candidates.join(',')}`)
  const random = mulberry32(seed)
  return Math.floor(random() * candidates.length)
}
