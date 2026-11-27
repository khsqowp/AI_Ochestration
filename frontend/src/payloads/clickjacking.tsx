import { useState } from 'react'
import { DISCLAIMER, Note, TextInput, Readout } from './shared'

export function ClickjackingPoCBuilder() {
  const [url, setUrl] = useState('')
  const trimmed = url.trim()
  const hasTarget = trimmed.length > 0
  const target = trimmed || 'https://TARGET'
  const html = `<HTML>
    <BODY>
    <h1>Clickjacking Test</h1>
    <iframe src="${target}"
        style="border: 0;"
        width="100%"
        height="100%">
    </iframe>
    </BODY>
</HTML>`

  return <div className="payload-builder">
    <Note>{DISCLAIMER}</Note>
    <p className="payload-builder-hint">이 HTML을 로컬에서 열었을 때 대상 페이지가 그대로 iframe 안에 로드되면 X-Frame-Options/CSP frame-ancestors 방어가 없다는 뜻 — 클릭재킹에 취약하다.</p>
    <div className="clickjacking-top-row">
      <div className="clickjacking-url-col">
        <TextInput label="대상 URL" value={url} onChange={setUrl} placeholder="https://example.com/account"/>
      </div>
      <Readout title="Clickjacking PoC HTML" value={html}/>
    </div>
    <div className="clickjacking-preview">
      <div className="clickjacking-preview-label">iframe 미리보기</div>
      <p className="payload-builder-hint">iframe이 비어 보이거나 로드가 거부되면(개발자 도구 콘솔에 X-Frame-Options/CSP 에러가 찍힌다) 방어가 적용되어 있다는 뜻 — 그 자체가 정상적인 진단 결과다.</p>
      {hasTarget
        ? <iframe
            key={target}
            src={target}
            className="clickjacking-preview-frame"
            // allow-scripts만 허용 — allow-same-origin을 주지 않아 대상 페이지가 이 사이트의 top-level을
            // 탐색하거나 쿠키/스토리지에 접근하지 못하게 격리한다. sandbox=""(전체 차단)였을 때는 SPA
            // 대상이 JS 없이 렌더링을 못 해 "클릭재킹 방어됨"처럼 보이는 오탐을 유발했다.
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            title="Clickjacking PoC 미리보기"
          />
        : <div className="clickjacking-preview-placeholder">대상 URL을 입력하면 여기에 iframe 미리보기가 표시됩니다.</div>}
    </div>
  </div>
}

export default ClickjackingPoCBuilder
