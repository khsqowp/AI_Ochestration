import { gameRandom } from '../rng';

export function rad(degree: number) {
  return (Math.PI * degree) / 180;
}

function getRegexValue(regex: RegExp, str: string) {
  const result = regex.exec(str);
  return result ? result[1] : '';
}

export function parseName(nameStr: string) {
  const weightRegex = /\/(\d+)/;
  const countRegex = /\*(\d+)/;
  const hasWeight = weightRegex.test(nameStr);
  const hasCount = countRegex.test(nameStr);
  const name = getRegexValue(/^\s*([^/*]+)?/, nameStr);
  if (!name) return null;
  const weight = hasWeight ? parseInt(getRegexValue(weightRegex, nameStr), 10) : 1;
  const count = hasCount ? parseInt(getRegexValue(countRegex, nameStr), 10) : 1;
  return {
    name,
    weight,
    count,
  };
}

export function pad(v: number) {
  return v.toString().padStart(2, '0');
}

/** 스폰 순서(= 구슬 id, 트랙 위치, 색상)를 결정하는 셔플. 방마다 결과가 같아야 하므로
 * gameRandom(시드된 PRNG)을 쓴다 -- 원본은 여기서 Math.random을 썼다. */
export function shuffle<T>(originalArray: T[]): T[] {
  const array = originalArray.slice();
  let currentIndex = array.length;
  let randomIndex;

  // While there remain elements to shuffle.
  while (currentIndex !== 0) {
    // Pick a remaining element.
    randomIndex = Math.floor(gameRandom.next() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }

  return array;
}
