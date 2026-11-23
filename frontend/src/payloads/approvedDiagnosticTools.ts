export const APPROVED_DIAGNOSTIC_TOOLS = [
  { categoryId: 'cdn', id: 'cdn-cache-behavior' },
  { categoryId: 'techstack', id: 'stack-fingerprint' },
  { categoryId: 'git-secrets', id: 'release-artifact-check' },
  { categoryId: 'dns-takeover', id: 'dns-delegation-audit' },
  { categoryId: 'exploitation', id: 'msf-precondition-review' },
] as const

export const CDN_CACHE_AUDIT_VARIANTS = [
  { label: '기준 경로', suffix: '' },
  { label: 'CSS 정적 확장자', suffix: '.css' },
  { label: 'JavaScript 정적 확장자', suffix: '.js' },
  { label: '이미지 정적 확장자', suffix: '.png' },
  { label: 'SVG 정적 확장자', suffix: '.svg' },
  { label: '폰트 정적 확장자', suffix: '.woff2' },
  { label: 'JSON 정적 확장자', suffix: '.json' },
  { label: 'source map 확장자', suffix: '.map' },
  { label: '캐시 키 쿼리 A', query: 'cache-audit=1' },
  { label: '캐시 키 쿼리 B', query: 'cache-audit=2' },
  { label: '대소문자 경로', pathTransform: 'upper' },
  { label: '후행 슬래시', suffix: '/' },
]

export const STACK_HEADER_SIGNATURES = [
  { product: 'nginx', pattern: /^server:\s*nginx(?:\/([\w.-]+))?/im, evidence: 'Server 응답 헤더' },
  { product: 'Apache HTTP Server', pattern: /^server:\s*Apache(?:\/([\w.-]+))?/im, evidence: 'Server 응답 헤더' },
  { product: 'Microsoft IIS', pattern: /^server:\s*Microsoft-IIS(?:\/([\w.-]+))?/im, evidence: 'Server 응답 헤더' },
  { product: 'Caddy', pattern: /^server:\s*Caddy\b/im, evidence: 'Server 응답 헤더' },
  { product: 'OpenResty', pattern: /^server:\s*openresty(?:\/([\w.-]+))?/im, evidence: 'Server 응답 헤더' },
  { product: 'PHP', pattern: /^x-powered-by:\s*PHP(?:\/([\w.-]+))?/im, evidence: 'X-Powered-By 헤더' },
  { product: 'Express', pattern: /^x-powered-by:\s*Express\b/im, evidence: 'X-Powered-By 헤더' },
  { product: 'ASP.NET', pattern: /^x-aspnet-version:\s*([\w.-]+)/im, evidence: 'X-AspNet-Version 헤더' },
  { product: 'ASP.NET MVC', pattern: /^x-aspnetmvc-version:\s*([\w.-]+)/im, evidence: 'X-AspNetMvc-Version 헤더' },
  { product: 'Laravel', pattern: /^set-cookie:.*\blaravel_session=/im, evidence: '세션 쿠키 이름' },
  { product: 'Java Servlet', pattern: /^set-cookie:.*\bJSESSIONID=/im, evidence: '세션 쿠키 이름' },
  { product: 'Express session', pattern: /^set-cookie:.*\bconnect\.sid=/im, evidence: '세션 쿠키 이름' },
  { product: 'Cloudflare proxy', pattern: /^server:\s*cloudflare\b/im, evidence: 'Server 응답 헤더' },
  { product: 'Proxy hop', pattern: /^(?:via|x-cache|cf-cache-status):/im, evidence: '중계·캐시 응답 헤더' },
]

export type StackHeaderFinding = {
  product: string
  evidence: string
  observed: string
  confidence: '약한 단서'
  version?: string
}

export function classifyStackHeaders(headerText: string): StackHeaderFinding[] {
  return STACK_HEADER_SIGNATURES.flatMap(signature => {
    const match = signature.pattern.exec(headerText)
    if (!match) return []
    const observed = match[0].trim()
    return [{
      product: signature.product,
      evidence: signature.evidence,
      observed,
      confidence: '약한 단서' as const,
      ...(match[1] ? { version: match[1] } : {}),
    }]
  })
}

export const RELEASE_ARTIFACT_PATHS = [
  '/artifacts/', '/artifact/', '/builds/', '/build/', '/releases/', '/release/',
  '/dist/', '/out/', '/target/', '/public/build/', '/static/build/',
  '/manifest.json', '/asset-manifest.json', '/build-manifest.json', '/version.json',
  '/version.txt', '/build-info.json', '/release.json', '/package.json',
  '/package-lock.json', '/composer.lock', '/poetry.lock', '/Cargo.lock',
  '/app.tar.gz', '/release.tar.gz', '/release.zip', '/source.zip', '/application.jar',
  '/application.war', '/frontend.tgz', '/debug.log', '/.map',
]

export const DNS_DELEGATION_CHECKS = [
  { label: '위임 경로 추적', command: 'dig +trace NS <DOMAIN>' },
  { label: 'DNS 응답 권한 섹션', command: 'dig NS <DOMAIN> +noall +authority' },
  { label: '자식 존 권한 NS', command: 'dig NS <DOMAIN> +noall +answer' },
  { label: 'DS 레코드', command: 'dig DS <DOMAIN> +dnssec +noall +answer' },
  { label: 'DNSKEY 레코드', command: 'dig DNSKEY <DOMAIN> +dnssec +noall +answer' },
  { label: 'DNSSEC 검증 결과', command: 'dig <DOMAIN> A +dnssec +comments' },
  { label: 'Cloudflare 재귀 응답 비교', command: 'dig @1.1.1.1 <DOMAIN> A +noall +answer' },
  { label: 'Google 재귀 응답 비교', command: 'dig @8.8.8.8 <DOMAIN> A +noall +answer' },
  { label: '권한 NS별 응답 비교', command: 'dig @<AUTHORITATIVE_NS> <DOMAIN> SOA +noall +answer' },
  { label: '와일드카드 대조', command: 'dig random-audit-name.<DOMAIN> A +noall +answer' },
]

export function buildHeadBatchProbe(base: string, paths: string[]): string {
  const safeBase = shellQuote(base.replace(/\/$/, ''))
  const pathLines = paths.map(path => `  ${shellQuote(path)}`).join('\n')
  return `base=${safeBase}\nfor path in \\\n${pathLines}; do\n  printf "\\n[%s]\\n" "$path"\n  curl -sS -I --connect-timeout 3 --max-time 8 "${'${base}'}${'${path}'}"\ndone`
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

export function buildMsfCveSearch(value: string): string | null {
  const cve = value.trim().toUpperCase()
  if (!/^CVE-\d{4}-\d{4,}$/.test(cve)) return null
  return `msfconsole -q -x "search cve:${cve.slice(4).toLowerCase()}; exit"`
}

export function buildMsfModuleInfo(value: string): string | null {
  const modulePath = value.trim()
  if (!/^(?:auxiliary|exploit|post|payload|encoder|nop|evasion)\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(modulePath)) return null
  if (modulePath.split('/').some(part => part === '.' || part === '..')) return null
  return `msfconsole -q -x "info ${modulePath}; exit"`
}
