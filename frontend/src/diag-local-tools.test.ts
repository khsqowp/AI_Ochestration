import { describe, expect, it } from 'vitest'
import { analyzeHarScope, isUrlInScope, normalizeResponseBody, parseScopeRules, soft404Similarity, type HttpObservation } from './diag-local-tools'

const response = (overrides: Partial<HttpObservation> = {}): HttpObservation => ({ id: 'x', url: 'https://app.example/nope', status: '404', location: '', body: '<title>Not Found</title><p>Page missing</p>', ...overrides })

describe('Soft-404 response comparison', () => {
  it('normalizes timestamps, long numeric ids, markup, and whitespace', () => {
    expect(normalizeResponseBody('<p>Missing 2026-11-23 id 12345678</p>'))
      .toBe(normalizeResponseBody('<p>Missing 2025-01-01 id 98765432</p>'))
  })

  it('ranks a catch-all response much closer to a known missing-path response', () => {
    const baseline = response()
    const catchAll = response({ id: 'c', url: 'https://app.example/admin', body: '<title>Not Found</title><p>Page missing</p>' })
    const realPage = response({ id: 'r', url: 'https://app.example/orders', status: '200', body: '<title>Orders</title><p>Order list</p>' })
    expect(soft404Similarity(baseline, catchAll)).toBeGreaterThan(0.95)
    expect(soft404Similarity(baseline, realPage)).toBeLessThan(0.5)
  })

  it('does not infer a soft-404 match from matching status codes alone', () => {
    expect(soft404Similarity(response({ body: '' }), response({ id: 'empty', url: 'https://app.example/secret', body: '' }))).toBe(0)
  })
})

describe('scope and redirect analysis', () => {
  const parsed = parseScopeRules('https://app.example\nhttps://api.example/v1')

  it('requires explicit origins and respects path-segment boundaries', () => {
    expect(parsed.errors).toEqual([])
    expect(isUrlInScope('https://app.example/a', parsed.rules)).toBe(true)
    expect(isUrlInScope('https://api.example/v1/items', parsed.rules)).toBe(true)
    expect(isUrlInScope('https://api.example/v10/items', parsed.rules)).toBe(false)
    expect(isUrlInScope('https://app.example.attacker.test/a', parsed.rules)).toBe(false)
  })

  it('rejects wildcard and non-http scope rules', () => {
    expect(parseScopeRules('https://*.example.com').errors).toHaveLength(1)
    expect(parseScopeRules('file:///tmp/test').errors).toHaveLength(1)
  })

  it('flags out-of-scope requests and resolves relative redirect destinations', () => {
    const har = JSON.stringify({ log: { entries: [
      { request: { url: 'https://app.example/login' }, response: { status: 302, headers: [{ name: 'Location', value: 'https://evil.test/landing' }] } },
      { request: { url: 'https://app.example/next' }, response: { status: 302, headers: [{ name: 'location', value: '/account' }] } },
      { request: { url: 'https://other.test/private' }, response: { status: 200, headers: [] } },
    ] } })
    const result = analyzeHarScope(har, parsed.rules)
    expect(result.error).toBeUndefined()
    expect(result.findings.map(item => item.kind)).toEqual(['redirect', 'request'])
    expect(result.findings[0].destination).toBe('https://evil.test/landing')
  })

  it('returns an actionable error for invalid HAR JSON', () => {
    expect(analyzeHarScope('{', parsed.rules).error).toMatch(/JSON/)
  })
})
