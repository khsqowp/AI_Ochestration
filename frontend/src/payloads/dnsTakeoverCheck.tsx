import { useState } from 'react'
import { DISCLAIMER, Note, Readout, TextInput } from './shared'
import { DNS_PROVIDER_FINGERPRINTS, DNS_RECORD_CHECKS } from './reconCatalog'

export function DnsTakeoverCheckBuilder() {
  const [domain, setDomain] = useState('')
  const [ns, setNs] = useState('')
  const domainValue = domain.trim() || 'example.com'
  const hostnamePattern = /^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(?:\.(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?))+$/
  const d = hostnamePattern.test(domainValue) ? domainValue : 'example.com'
  const nsValue = ns.trim() || 'ns1.example.com'
  const server = hostnamePattern.test(nsValue) ? nsValue : 'ns1.example.com'

  return (
    <div className="payload-builder">
      <Note>{DISCLAIMER}</Note>
      <TextInput label="대상 도메인" value={domain} onChange={setDomain} placeholder="example.com" />
      <TextInput label="네임서버 (AXFR 테스트용)" value={ns} onChange={setNs} placeholder="ns1.example.com" />
      {(domainValue !== d || nsValue !== server) && <Note>입력값이 호스트명 형식과 맞지 않아 안전한 예시값으로 표시합니다. 승인된 대상의 정확한 도메인과 NS 이름만 입력하세요.</Note>}

      <div className="payload-readout-group">
        <strong className="payload-group-title">DNS 기본 레코드·메일 정책 확인</strong>
        {DNS_RECORD_CHECKS.map(([label, command]) => <Readout key={label} title={label} value={command.replaceAll('<DOMAIN>', d).replaceAll('<SUBDOMAIN>', `www.${d}`).replace('<NONCE>', 'audit-random')} wrap="anywhere" />)}
        <Note>SPF·DMARC 결과는 TXT 레코드의 원문이 표시될 수 있습니다. 공개 DNS 결과만 확인하고 토큰·계정 정보로 오인하지 마세요.</Note>
      </div>

      <div className="payload-readout-group">
        <strong className="payload-group-title">수동적 서브도메인 후보 수집</strong>
        <Readout title="subfinder (passive sources)" value={`subfinder -d ${d} -silent -o subdomains.txt`} wrap="anywhere" />
        <Readout title="amass (passive)" value={`amass enum -passive -d ${d} -o subdomains-amass.txt`} wrap="anywhere" />
        <Readout title="crt.sh 인증서 이름" value={`curl -sS --max-time 10 "https://crt.sh/?q=%25.${d}&output=json" | jq -r '.[].name_value' | sort -u > subdomains-crtsh.txt`} wrap="anywhere" />
        <Note>결과는 외부 공개 자료 기반 후보이며, 현재 DNS에 존재하거나 소유 관계가 확인됐다는 뜻은 아닙니다. 수집 대상 도메인의 허가 범위를 지키세요.</Note>
      </div>

      <div className="payload-readout-group">
        <strong className="payload-group-title">DNS Zone Transfer (AXFR) 검토</strong>
        <Readout title="지정 NS에 대한 AXFR" value={`dig axfr @${server} ${d}`} wrap="anywhere" />
        <Readout title="권한 있는 NS 목록" value={`dig NS +short ${d}`} wrap="anywhere" />
        <Note>AXFR은 승인된 도메인과 네임서버에만 요청하세요. 전체 존이 반환되면 구성 이슈 후보로 기록하고, 공개되어도 되는 레코드인지 소유자와 확인합니다.</Note>
      </div>

      <div className="payload-readout-group">
        <strong className="payload-group-title">서브도메인 CNAME 일괄 확인</strong>
        <Readout title="목록에서 CNAME 추출" value={'while IFS= read -r sub; do printf "%s: " "$sub"; dig CNAME +short "$sub"; done < subdomains.txt'} wrap="pre" />
        <Readout title="CNAME 체인·최종 응답 확인" value={'while IFS= read -r sub; do printf "\\n[%s]\\n" "$sub"; dig +noall +answer "$sub" CNAME A AAAA; done < subdomains.txt'} wrap="pre" />
        <Note>외부 공급자를 가리키는 CNAME과 공급자 오류 페이지가 함께 보여도 테이크오버 취약점이 확정되는 것은 아닙니다. 서비스 측 소유 상태를 권한 있는 채널로 확인하고 리소스를 등록·점유하는 시도는 하지 마세요.</Note>
      </div>

      <div className="payload-readout-group">
        <strong className="payload-group-title">서비스별 테이크오버 핑거프린트</strong>
        {DNS_PROVIDER_FINGERPRINTS.map(({ provider, cname, fingerprint, status }) => (
          <Readout key={provider} title={`${provider} · 출처 분류: ${status}`} value={`CNAME 후보: ${cname}\n오류 지문 후보: "${fingerprint}"`} wrap="pre" />
        ))}
        <Note>‘출처 분류’는 참조 카탈로그의 서비스 분류이며 현재 대상의 판정이 아닙니다. can-i-take-over-xyz의 지문 데이터는 자동 갱신되므로 실행 전 최신 항목과 대조하세요. DNS CNAME·응답 지문 하나로 취약점을 확정하지 말고, 리소스를 생성하거나 점유하는 시도는 하지 마세요.</Note>
      </div>
    </div>
  )
}

export default DnsTakeoverCheckBuilder
