import { useState } from 'react'
import { DISCLAIMER, Note, Readout, TextInput } from './shared'

export function DnsTakeoverCheckBuilder() {
  const [domain, setDomain] = useState('')
  const [ns, setNs] = useState('')
  const d = domain.trim() || 'example.com'
  const server = ns.trim() || 'ns1.example.com'

  const fingerprints = [
    { provider: 'AWS S3', cname: '*.s3.amazonaws.com', fingerprint: 'NoSuchBucket', note: '동일 이름으로 버킷 생성 가능하면 테이크오버' },
    { provider: 'GitHub Pages', cname: '*.github.io', fingerprint: "There isn't a GitHub Pages site here", note: '리포지토리 CNAME 파일로 클레임' },
    { provider: 'Heroku', cname: '*.herokuapp.com', fingerprint: 'No such app', note: 'heroku create로 동일 앱 이름 생성' },
    { provider: 'Azure (Cloud/Web App)', cname: '*.azurewebsites.net / *.cloudapp.net', fingerprint: '404 Web Site not found', note: '동일 이름 리소스 생성 가능 여부 확인' },
    { provider: 'Fastly', cname: '*.fastly.net', fingerprint: 'Fastly error: unknown domain', note: '서비스 도메인 매핑 미설정' },
    { provider: 'Shopify', cname: '*.myshopify.com', fingerprint: 'Sorry, this shop is currently unavailable', note: '스토어 재생성으로 클레임' },
    { provider: 'Unbounce', cname: '*.unbouncepages.com', fingerprint: 'The requested URL was not found on this server', note: '랜딩페이지 재생성' },
    { provider: 'WordPress.com', cname: '*.wordpress.com', fingerprint: 'Do you want to register', note: '동일 서브도메인으로 블로그 생성' },
    { provider: 'Surge.sh', cname: '*.surge.sh', fingerprint: 'project not found', note: 'surge 배포시 동일 이름 사용' },
    { provider: 'Pantheon', cname: '*.pantheonsite.io', fingerprint: '404 error unknown site', note: '사이트 환경 재생성' },
  ]

  return (
    <div className="payload-builder">
      <Note>{DISCLAIMER}</Note>
      <TextInput label="대상 도메인" value={domain} onChange={setDomain} placeholder="example.com" />
      <TextInput label="네임서버 (AXFR 테스트용)" value={ns} onChange={setNs} placeholder="ns1.example.com" />

      <div className="payload-readout-group">
        <strong className="payload-group-title">DNS Zone Transfer (AXFR) 테스트</strong>
        <Readout title="dig axfr" value={`dig axfr @${server} ${d}`} wrap="anywhere" />
        <Readout title="fierce (대안, NS 자동 수집)" value={`fierce --domain ${d}`} wrap="anywhere" />
        <Note>AXFR이 성공하면(일부 레코드가 아닌 전체 존이 반환) 모든 서브도메인·내부 호스트명이 노출됩니다. 정상 서비스는 보통 거부(REFUSED)해야 합니다.</Note>
      </div>

      <div className="payload-readout-group">
        <strong className="payload-group-title">서브도메인 CNAME 일괄 확인</strong>
        <Readout title="서브도메인 목록에서 CNAME 추출" value={`for sub in $(cat subdomains.txt); do echo -n "$sub: "; dig CNAME +short $sub.${d}; done`} wrap="pre" />
        <Note>CNAME이 외부 서비스(S3/GitHub Pages/Heroku 등)를 가리키지만 해당 리소스가 삭제된 경우 Dangling CNAME으로 테이크오버 가능합니다.</Note>
      </div>

      <div className="payload-readout-group">
        <strong className="payload-group-title">서비스별 테이크오버 핑거프린트</strong>
        {fingerprints.map((fingerprint, index) => (
          <Readout key={index} title={`${fingerprint.provider} (${fingerprint.cname})`} value={`응답 문자열: "${fingerprint.fingerprint}"  |  ${fingerprint.note}`} wrap="anywhere" />
        ))}
        <Note>참고: can-i-take-over-xyz (EdOverflow) 프로젝트의 핑거프린트 목록을 기반으로 하며, 각 서비스는 정책이 자주 바뀌므로 최신 목록과 대조하십시오.</Note>
      </div>
    </div>
  )
}

export default DnsTakeoverCheckBuilder
