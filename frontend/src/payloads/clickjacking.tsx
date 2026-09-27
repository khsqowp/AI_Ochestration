import { useState } from 'react'
import { DISCLAIMER, Note, TextInput, Readout } from './shared'

export function ClickjackingPoCBuilder() {
  const [url, setUrl] = useState('')
  const target = url.trim() || 'https://TARGET'
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
    <TextInput label="대상 URL" value={url} onChange={setUrl} placeholder="https://example.com/account"/>
    <p className="payload-builder-hint">이 HTML을 로컬에서 열었을 때 대상 페이지가 그대로 iframe 안에 로드되면 X-Frame-Options/CSP frame-ancestors 방어가 없다는 뜻 — 클릭재킹에 취약하다.</p>
    <Readout title="Clickjacking PoC HTML" value={html}/>
  </div>
}

export default ClickjackingPoCBuilder
