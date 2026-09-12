export type Finding = { code: string; severity: 'HIGH' | 'MEDIUM' | 'LOW'; title: string; detail: string; remediation: string }
export type CspAnalysis = { directives: Record<string, string[]>; findings: Finding[]; missing: string[] }
export type EvidenceInput = { baseline: string; variation: string; serverEvidence: string }
export type EvidenceAssessment = { status: 'NOT_STARTED' | 'NO_SIGNAL' | 'NEEDS_EVIDENCE' | 'CONFIRMED'; summary: string; nextStep: string }

export function analyzeCsp(raw: string): CspAnalysis {
  const directives: Record<string, string[]> = {}
  raw.split(';').forEach(part => { const [name, ...values] = part.trim().split(/\s+/); if (name) directives[name.toLowerCase()] = values })
  const effective = (name: string) => directives[name] ?? directives['default-src']
  const findings: Finding[] = []
  const add = (code: Finding['code'], severity: Finding['severity'], title: string, detail: string, remediation: string) => findings.push({ code, severity, title, detail, remediation })
  const script = effective('script-src')
  if (!script) add('CSP_NO_SCRIPT_POLICY', 'HIGH', '스크립트 출처 정책 없음', 'script-src와 default-src가 모두 없다.', "script-src를 명시하고 허용 출처를 최소화한다.")
  else {
    if (script.includes("'unsafe-inline'")) add('CSP_UNSAFE_INLINE', 'HIGH', '인라인 스크립트 허용', "script-src에 'unsafe-inline'이 있다. nonce 또는 hash 적용 여부를 별도로 검토해야 한다.", 'nonce 또는 hash 기반 정책으로 전환한다.')
    if (script.includes("'unsafe-eval'")) add('CSP_UNSAFE_EVAL', 'MEDIUM', '동적 코드 실행 허용', "script-src에 'unsafe-eval'이 있다.", 'eval 계열 의존성을 제거하거나 별도 격리한다.')
    if (script.some(value => value === '*' || value === 'http:' || value === 'https:')) add('CSP_BROAD_SCRIPT', 'HIGH', '넓은 스크립트 출처 허용', '와일드카드 또는 scheme-only 스크립트 허용이 있다.', '구체적인 HTTPS 호스트만 허용한다.')
  }
  if (!directives['object-src'] || !directives['object-src'].includes("'none'")) add('CSP_OBJECT_SRC', 'MEDIUM', 'object-src 제한 부족', '플러그인 리소스 출처가 명시적으로 차단되지 않았다.', "object-src 'none'을 설정한다.")
  if (!directives['frame-ancestors']) add('CSP_FRAME_ANCESTORS', 'MEDIUM', '프레임 삽입 제한 없음', 'CSP의 frame-ancestors가 없다.', "frame-ancestors 'none' 또는 승인된 출처를 설정한다.")
  if (!directives['base-uri']) add('CSP_BASE_URI', 'LOW', 'base-uri 제한 없음', '상대 URL 기준점 변경을 제한하지 않는다.', "base-uri 'self' 또는 'none'을 설정한다.")
  if (!directives['form-action']) add('CSP_FORM_ACTION', 'LOW', 'form-action 제한 없음', '폼 제출 대상에 대한 CSP 제한이 없다.', "form-action 'self'를 검토한다.")
  return { directives, findings, missing: ['script-src', 'object-src', 'frame-ancestors', 'base-uri', 'form-action'].filter(name => !directives[name]) }
}

export function assessEvidence(input: EvidenceInput): EvidenceAssessment {
  const hasBaseline = input.baseline.trim().length > 0
  const hasVariation = input.variation.trim().length > 0
  const hasServerEvidence = input.serverEvidence.trim().length > 0
  if (!hasBaseline && !hasVariation && !hasServerEvidence) return { status: 'NOT_STARTED', summary: '기준 응답과 변형 응답이 아직 기록되지 않았다.', nextStep: '승인된 범위에서 기준 요청부터 기록하세요.' }
  if (!hasVariation) return { status: 'NO_SIGNAL', summary: '변형 요청의 관측 결과가 없어 차이를 판정할 수 없다.', nextStep: '같은 조건에서 한 번에 하나의 값만 바꾼 결과를 기록하세요.' }
  if (!hasBaseline || !hasServerEvidence) return { status: 'NEEDS_EVIDENCE', summary: '응답 변화는 있지만 기준 비교 또는 서버 측 증거가 부족하다.', nextStep: '요청 ID, 애플리케이션 로그, 상태 변화 중 최소 하나를 연결하세요.' }
  return { status: 'CONFIRMED', summary: '기준·변형·서버 측 증거가 연결됐다. 영향 범위와 재현 조건을 검토해야 한다.', nextStep: '본인·타인·권한·정상 흐름을 포함한 재검증과 조치안을 기록하세요.' }
}
