export type HttpObservation = {
  id: string
  url: string
  status: string
  location: string
  body: string
}

export type ScopeRule = { origin: string; pathPrefix: string; label: string }
export type HarFinding = {
  requestUrl: string
  status: number
  kind: 'request' | 'redirect'
  destination: string
  reason: string
}

export function newObservation(label = ''): HttpObservation {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, url: label, status: '404', location: '', body: '' }
}

function normalizedLocation(value: string, baseUrl: string): string {
  if (!value.trim()) return ''
  try {
    const url = new URL(value, baseUrl)
    return `${url.origin.toLowerCase()}${url.pathname.replace(/\/+$/, '') || '/'}${url.search}`
  } catch { return value.trim().toLowerCase() }
}

export function normalizeResponseBody(body: string): string {
  return body
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, '<uuid>')
    .replace(/\b\d{4}-\d{2}-\d{2}(?:[T ][\d:.+-]+Z?)?\b/g, '<date>')
    .replace(/\b\d{7,}\b/g, '<number>')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase()
}

function titleOf(body: string): string {
  return (body.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] ?? '')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
}

function bigramSimilarity(a: string, b: string): number | null {
  if (!a || !b) return null
  const grams = (text: string) => {
    const chars = Array.from(text.slice(0, 8000))
    if (chars.length < 2) return new Set(chars)
    const result = new Set<string>()
    for (let i = 0; i < chars.length - 1; i++) result.add(chars[i] + chars[i + 1])
    return result
  }
  const aa = grams(a), bb = grams(b)
  let intersection = 0
  for (const item of aa) if (bb.has(item)) intersection++
  return intersection / Math.max(1, aa.size + bb.size - intersection)
}

export function hasSoft404Evidence(baseline: HttpObservation, candidate: HttpObservation): boolean {
  const hasLocation = Boolean(baseline.location.trim() || candidate.location.trim())
  const hasTitle = Boolean(titleOf(baseline.body) || titleOf(candidate.body))
  const hasBody = Boolean(normalizeResponseBody(baseline.body) && normalizeResponseBody(candidate.body))
  return hasLocation || hasTitle || hasBody
}

export function soft404Similarity(baseline: HttpObservation, candidate: HttpObservation): number {
  const baseUrl = baseline.url || 'https://invalid.local/'
  let score = 0
  let weight = 0
  const add = (similarity: number | null, featureWeight: number) => {
    if (similarity === null) return
    score += similarity * featureWeight
    weight += featureWeight
  }
  const baseStatus = Number(baseline.status)
  const candidateStatus = Number(candidate.status)
  if (Number.isFinite(baseStatus) && Number.isFinite(candidateStatus)) add(baseStatus === candidateStatus ? 1 : 0, 0.15)
  const baseLocation = normalizedLocation(baseline.location, baseUrl)
  const candidateLocation = normalizedLocation(candidate.location, candidate.url || baseUrl)
  if (baseLocation || candidateLocation) add(baseLocation === candidateLocation ? 1 : 0, 0.15)
  const baseTitle = titleOf(baseline.body)
  const candidateTitle = titleOf(candidate.body)
  if (baseTitle || candidateTitle) add(baseTitle === candidateTitle ? 1 : 0, 0.15)
  const baseBody = normalizeResponseBody(baseline.body)
  const candidateBody = normalizeResponseBody(candidate.body)
  const bodySimilarity = bigramSimilarity(baseBody, candidateBody)
  add(bodySimilarity, 0.55)
  // A matching 404 status alone is not evidence of a catch-all page. Require at least one
  // response-content signal so sparse captures do not become a misleading 100% match.
  if (!hasSoft404Evidence(baseline, candidate)) return 0
  return weight ? score / weight : 0
}

export function parseScopeRules(text: string): { rules: ScopeRule[]; errors: string[] } {
  const rules: ScopeRule[] = []
  const errors: string[] = []
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    try {
      if (line.includes('*')) throw new Error('와일드카드는 허용하지 않습니다. 호스트를 명시하세요.')
      const url = new URL(line)
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('http 또는 https 주소만 허용합니다.')
      if (url.username || url.password) throw new Error('URL에 사용자명·비밀번호를 넣지 마세요.')
      const pathPrefix = url.pathname.replace(/\/+$/, '') || '/'
      rules.push({ origin: url.origin.toLowerCase(), pathPrefix, label: `${url.origin}${pathPrefix === '/' ? '' : pathPrefix}` })
    } catch (error) {
      errors.push(`${index + 1}행: ${error instanceof Error ? error.message : '유효하지 않은 URL입니다.'}`)
    }
  }
  return { rules, errors }
}

export function isUrlInScope(value: string, rules: ScopeRule[]): boolean {
  try {
    const url = new URL(value)
    return rules.some(rule => url.origin.toLowerCase() === rule.origin &&
      (rule.pathPrefix === '/' || url.pathname === rule.pathPrefix || url.pathname.startsWith(`${rule.pathPrefix}/`)))
  } catch { return false }
}

function headerValue(headers: unknown, name: string): string {
  if (!Array.isArray(headers)) return ''
  const found = headers.find(item => item && typeof item.name === 'string' && item.name.toLowerCase() === name.toLowerCase())
  return found && typeof found.value === 'string' ? found.value : ''
}

export function analyzeHarScope(raw: string, rules: ScopeRule[]): { findings: HarFinding[]; ignored: number; error?: string } {
  let har: { log?: { entries?: unknown[] } }
  try { har = JSON.parse(raw) as typeof har } catch { return { findings: [], ignored: 0, error: 'JSON 파싱에 실패했습니다. HAR 파일을 확인하세요.' } }
  const entries = har?.log?.entries
  if (!Array.isArray(entries)) return { findings: [], ignored: 0, error: 'HAR 1.2 형식의 log.entries를 찾지 못했습니다.' }
  const findings: HarFinding[] = []
  let ignored = 0
  for (const item of entries) {
    if (!item || typeof item !== 'object') { ignored++; continue }
    const entry = item as { request?: { url?: unknown }; response?: { status?: unknown; headers?: unknown } }
    const requestUrl = typeof entry.request?.url === 'string' ? entry.request.url : ''
    if (!requestUrl) { ignored++; continue }
    let parsedRequest: URL
    try { parsedRequest = new URL(requestUrl) } catch { ignored++; continue }
    if (!isUrlInScope(requestUrl, rules)) findings.push({ requestUrl, status: Number(entry.response?.status) || 0, kind: 'request', destination: requestUrl, reason: '요청 URL이 허용된 Origin·경로 규칙 밖입니다.' })
    const status = Number(entry.response?.status) || 0
    const location = headerValue(entry.response?.headers, 'location')
    if (status >= 300 && status < 400 && location) {
      let destination: string
      try { destination = new URL(location, parsedRequest).href } catch { ignored++; continue }
      if (!isUrlInScope(destination, rules)) findings.push({ requestUrl, status, kind: 'redirect', destination, reason: '리다이렉트 목적지가 허용된 Origin·경로 규칙 밖입니다.' })
    }
  }
  return { findings, ignored }
}
