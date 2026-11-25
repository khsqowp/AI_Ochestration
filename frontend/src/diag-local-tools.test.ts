import { describe, expect, it } from 'vitest'
import { normalizeResponseBody, soft404Similarity, type HttpObservation } from './diag-local-tools'

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
