import { useState } from 'react'
import { DISCLAIMER, Note, Readout, TextInput } from './shared'
import {
  CDN_CACHE_AUDIT_VARIANTS,
  DNS_DELEGATION_CHECKS,
  RELEASE_ARTIFACT_PATHS,
  buildHeadBatchProbe,
  buildMsfCveSearch,
  buildMsfModuleInfo,
  classifyStackHeaders,
  shellQuote,
} from './approvedDiagnosticTools'

function safeHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null
    return url
  } catch {
    return null
  }
}

function headCommand(url: string): string {
  return `curl -sS -I --connect-timeout 3 --max-time 8 ${shellQuote(url)}`
}

export function CdnCacheBehaviorBuilder() {
  const [input, setInput] = useState('')
  const base = safeHttpUrl(input.trim())
  const variants = base ? CDN_CACHE_AUDIT_VARIANTS.map(variant => {
    const url = new URL(base)
    if (variant.query) url.searchParams.set(variant.query.split('=')[0], variant.query.split('=')[1])
    if (variant.pathTransform === 'upper') url.pathname = url.pathname.toUpperCase()
    else url.pathname += variant.suffix ?? ''
    return { label: variant.label, url: url.toString() }
  }) : []

  return <div className="payload-builder">
    <Note>{DISCLAIMER}</Note>
    <TextInput label="비교할 응답 URL" value={input} onChange={setInput} placeholder="https://example.com/private/resource" />
    {input.trim() && !base && <Note>HTTP 또는 HTTPS의 경로 URL을 입력하세요. 계정정보·쿼리·fragment가 포함된 주소는 허용하지 않습니다.</Note>}
    <div className="payload-readout-group">
      <strong className="payload-group-title">캐시 응답 비교 (HEAD만 요청)</strong>
      {variants.map(variant => <Readout key={variant.label} title={variant.label} value={headCommand(variant.url)} wrap="anywhere" />)}
      <Note>상태 코드, Cache-Control, Age, Cache-Status, X-Cache, Vary, ETag를 기준 경로와 비교하세요. HEAD만으로 본문 누출이나 Web Cache Deception 취약점을 확정할 수는 없습니다. 인증 상태·쿠키가 붙은 요청은 이 도구에 넣지 마세요.</Note>
    </div>
  </div>
}

export function StackFingerprintBuilder() {
  const [headers, setHeaders] = useState('')
  const findings = classifyStackHeaders(headers)

  return <div className="payload-builder">
    <Note>{DISCLAIMER}</Note>
    <label className="payload-builder-label" htmlFor="stack-header-observation">관측한 응답 헤더 붙여넣기</label>
    <textarea id="stack-header-observation" className="payload-builder-input" rows={8} value={headers} onChange={event => setHeaders(event.target.value)} placeholder={'HTTP/1.1 200 OK\nServer: nginx/1.24.0\nX-Powered-By: Express'}/>
    <div className="payload-readout-group">
      <strong className="payload-group-title">기술 단서</strong>
      {findings.length === 0 ? <Note>입력한 헤더에서 인식한 단서가 없습니다. 서비스가 헤더를 제거·변경했을 수 있으며, 결과 없음은 특정 기술 부재를 뜻하지 않습니다.</Note> : findings.map((finding, index) => <Readout key={`${finding.product}-${index}`} title={`${finding.product} · ${finding.confidence}`} value={`관측 위치: ${finding.evidence}\n관측값: ${finding.observed}${finding.version ? `\n버전 후보: ${finding.version}` : ''}`} wrap="pre"/>)}
      <Note>Server·X-Powered-By·쿠키 이름은 위장되거나 프록시에서 바뀔 수 있는 약한 단서입니다. 버전 문자열은 실제 실행 바이너리·패치 수준을 증명하지 않으며, 서비스 소유자 자료와 별도로 대조해야 합니다.</Note>
    </div>
  </div>
}

export function ReleaseArtifactCheckBuilder() {
  const [input, setInput] = useState('')
  const base = safeHttpUrl(input.trim())
  const batch = base ? buildHeadBatchProbe(base.toString(), RELEASE_ARTIFACT_PATHS) : ''

  return <div className="payload-builder">
    <Note>{DISCLAIMER}</Note>
    <TextInput label="승인된 웹 루트 URL" value={input} onChange={setInput} placeholder="https://example.com" />
    {input.trim() && !base && <Note>HTTP 또는 HTTPS의 웹 루트 경로를 입력하세요. 계정정보·쿼리·fragment가 포함된 주소는 허용하지 않습니다.</Note>}
    <div className="payload-readout-group">
      <strong className="payload-group-title">배포·빌드 산출물 후보 (HEAD 일괄 확인)</strong>
      {batch && <Readout title={`${RELEASE_ARTIFACT_PATHS.length}개 경로 · 본문 수신 없음`} value={batch} wrap="pre"/>}
      <Note>정적 파일·패키지·매니페스트·빌드 디렉터리 후보만 확인합니다. 응답 본문과 파일 크기는 가져오지 않습니다. 403·404·200은 서버의 사용자 정의 응답일 수 있으므로 없는 경로를 대조하고, 상태 코드 하나로 노출 여부를 판정하지 마세요.</Note>
    </div>
  </div>
}

const HOSTNAME_PATTERN = /^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(?:\.(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?))+$/

export function DnsDelegationAuditBuilder() {
  const [domain, setDomain] = useState('')
  const [authoritativeNs, setAuthoritativeNs] = useState('')
  const rawDomain = domain.trim()
  const validDomain = HOSTNAME_PATTERN.test(rawDomain)
  const name = validDomain ? rawDomain : ''
  const nsInput = authoritativeNs.trim()
  const validNs = !nsInput || HOSTNAME_PATTERN.test(nsInput)
  const checks = name && validNs ? DNS_DELEGATION_CHECKS.map(check => ({
    ...check,
    command: check.command.replaceAll('<DOMAIN>', name).replaceAll('<AUTHORITATIVE_NS>', nsInput || '<AUTHORITATIVE_NS>'),
  })) : []

  return <div className="payload-builder">
    <Note>{DISCLAIMER}</Note>
    <TextInput label="승인된 도메인" value={domain} onChange={setDomain} placeholder="example.com" />
    <TextInput label="권한 NS (선택)" value={authoritativeNs} onChange={setAuthoritativeNs} placeholder="ns1.example.com" />
    {(rawDomain && !validDomain) && <Note>완전한 도메인 형식이 아닙니다. 승인된 도메인만 입력하세요.</Note>}
    {nsInput && !validNs && <Note>NS는 호스트명 형식으로 입력하세요.</Note>}
    <div className="payload-readout-group">
      <strong className="payload-group-title">위임·DNSSEC 일관성 확인</strong>
      {checks.map(check => <Readout key={check.label} title={check.label} value={check.command} wrap="anywhere"/>)}
      <Note>부모·자식 NS, DS·DNSKEY, 여러 재귀 리졸버의 답을 대조하세요. NS별 응답은 NS 입력 전까지 자리표시자가 남습니다. 이 점검은 공개 DNS 질의만 하며 AXFR이나 하위 도메인 대량 추측은 하지 않습니다.</Note>
    </div>
  </div>
}

export function MsfPreconditionReviewBuilder() {
  const [cve, setCve] = useState('')
  const [modulePath, setModulePath] = useState('')
  const cveCommand = buildMsfCveSearch(cve)
  const moduleCommand = buildMsfModuleInfo(modulePath)

  return <div className="payload-builder">
    <Note>{DISCLAIMER}</Note>
    <TextInput label="CVE 식별자 (선택)" value={cve} onChange={setCve} placeholder="CVE-2024-12345" />
    <TextInput label="검토할 Metasploit 모듈 경로 (선택)" value={modulePath} onChange={setModulePath} placeholder="auxiliary/scanner/http/example" />
    {cve.trim() && !cveCommand && <Note>CVE 형식이 올바르지 않습니다. CVE-YYYY-NNNN 형식을 입력하세요.</Note>}
    {modulePath.trim() && !moduleCommand && <Note>모듈 경로 형식이 올바르지 않습니다. 콘솔 구문은 허용하지 않습니다.</Note>}
    <div className="payload-readout-group">
      <strong className="payload-group-title">모듈 정보 조회만 생성</strong>
      {cveCommand && <Readout title="CVE 기반 모듈 검색 (로컬 Metasploit 인덱스)" value={cveCommand} wrap="anywhere"/>}
      {moduleCommand && <Readout title="모듈 설명·요구 옵션 조회" value={moduleCommand} wrap="anywhere"/>}
      {!cveCommand && !moduleCommand && <Note>CVE 또는 모듈 경로를 입력하면 조회 명령이 표시됩니다.</Note>}
      <Note>사전조건 검토: 제품·정확한 버전·빌드와 공급자 패치 여부, 해당 기능의 실제 활성화, 외부 노출 여부, 모듈의 플랫폼·아키텍처·필수 옵션, 모듈 문서의 영향 범위를 각각 확인하세요. `info`와 `search`만 생성하며 `check`, `run`, `exploit` 명령은 만들지 않습니다. 대상에 요청을 보내는 검증은 별도 승인과 영향도 검토가 필요합니다.</Note>
    </div>
  </div>
}
