export type HttpObservation = {
  id: string
  url: string
  status: string
  location: string
  body: string
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
