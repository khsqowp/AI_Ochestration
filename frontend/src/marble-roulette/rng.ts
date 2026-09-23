/** 결정론적 재생을 위한 시드 가능 PRNG.
 *
 * 서버는 승자를 계산하지 않는다 -- "누가 후보인지"와 "언제 시작했는지"만 들고 있다
 * (`frontend/src/pages/public/LunchRoulettePage.tsx` 상단 주석 참고). 대신 모든 클라이언트가
 * 같은 문자열(day + 시작시각 + 후보목록)을 시드로 이 모듈을 초기화하고, 같은 엔진 코드를
 * 같은 순서로 실행한다. box2d-wasm 물리 시뮬레이션 자체는 WASM 스펙상 부동소수점 연산이
 * 완전히 결정론적이라 브라우저/CPU가 달라도 안 갈린다 -- 갈릴 수 있는 유일한 지점은
 * `Math.random()` 호출부들뿐이라, 게임 결과에 영향을 주는 자리(구슬 밀도 지터, 정지 탈출 충격,
 * 스킬 발동 굴림, 쿨타임 초기값, 스폰 순서 셔플, 맵 선택)만 전부 이 모듈로 바꿨다. 순수 연출용
 * 랜덤(파티클 색/방향 등)은 시드 안 타는 실제 Math.random을 그대로 둬도 결과에 영향 없다. */

function fnv1aHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class SeededRandom {
  private draw: () => number = Math.random;

  /** 방(day+시작시각+후보목록)마다 한 번, 엔진을 만들기 전에 호출한다. */
  seed(key: string): void {
    this.draw = mulberry32(fnv1aHash(key));
  }

  /** Math.random() 대체. [0, 1) */
  next(): number {
    return this.draw();
  }
}

/** 게임플레이에 영향을 주는 랜덤은 전부 이 싱글턴을 거친다. */
export const gameRandom = new SeededRandom();

/** 같은 시드에서 맵을 하나 결정론적으로 고른다. */
export function pickMapIndex(count: number): number {
  if (count <= 1) return 0;
  return Math.floor(gameRandom.next() * count);
}
