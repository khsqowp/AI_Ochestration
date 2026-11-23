import { describe, expect, it } from 'vitest'
import {
  CDN_CACHE_VARIANTS,
  CDN_IDENTITY_HEADERS,
  CDN_NORMALIZATION_VARIANTS,
  CLOUD_STORAGE_CHECKS,
  MODERN_RECON_PATHS,
  MODERN_BACKEND_PROBES,
  GIT_EXPOSURE_PATHS,
  buildGitExposureProbe,
  DNS_PROVIDER_FINGERPRINTS,
  CORS_ORIGIN_CASES,
  shellQuote,
} from './reconCatalog'

describe('diagnostic recon catalogs', () => {
  it('covers CDN cache, identity and normalization variants without sensitive file targets', () => {
    expect(CDN_CACHE_VARIANTS.length).toBeGreaterThanOrEqual(8)
    expect(CDN_IDENTITY_HEADERS.length).toBeGreaterThanOrEqual(10)
    expect(CDN_NORMALIZATION_VARIANTS.length).toBeGreaterThanOrEqual(8)
    expect(CDN_NORMALIZATION_VARIANTS.join(' ')).not.toContain('/etc/passwd')
  })

  it('keeps all cloud storage checks read-only and bounded', () => {
    expect(Object.keys(CLOUD_STORAGE_CHECKS)).toHaveLength(3)
    for (const checks of Object.values(CLOUD_STORAGE_CHECKS)) {
      expect(checks.length).toBeGreaterThanOrEqual(8)
      for (const check of checks) {
        expect(check.command).not.toMatch(/\b(sync|cp|put|upload|rm|delete)\b/i)
        expect(check.command).not.toMatch(/select=\*/i)
      }
    }
  })

  it('includes modern stack fingerprints without dump or write probes', () => {
    expect(MODERN_RECON_PATHS.length).toBeGreaterThanOrEqual(20)
    expect(MODERN_RECON_PATHS.join(' ')).not.toMatch(/heapdump|dump|\.json"\s*\)/i)
    expect(MODERN_BACKEND_PROBES.every(probe => /-I/.test(probe.command))).toBe(true)
    expect(MODERN_BACKEND_PROBES.join(' ')).not.toMatch(/-X\s+(PUT|POST|DELETE)|select=\*/i)
  })

  it('uses HEAD-only git exposure probes and avoids claiming a status code proves exposure', () => {
    expect(GIT_EXPOSURE_PATHS.length).toBeGreaterThanOrEqual(40)
    expect(buildGitExposureProbe('https://example.com')).toMatch(/-I/)
    expect(buildGitExposureProbe('https://example.com')).not.toMatch(/-o\s+[^ ]+\s+https?:/)
  })

  it('includes a broad DNS provider fingerprint set without claim instructions', () => {
    expect(DNS_PROVIDER_FINGERPRINTS.length).toBeGreaterThanOrEqual(20)
    expect(JSON.stringify(DNS_PROVIDER_FINGERPRINTS)).not.toMatch(/claim|create|생성|클레임/i)
  })

  it('covers CORS Origin parsing boundaries and baselines', () => {
    expect(CORS_ORIGIN_CASES.length).toBeGreaterThanOrEqual(9)
    expect(CORS_ORIGIN_CASES.map(item => item.origin).join(' ')).toMatch(/null/)
    expect(CORS_ORIGIN_CASES.map(item => item.label).join(' ')).toMatch(/기준|없음/)
  })

  it('shell-quotes user-provided command values', () => {
    expect(shellQuote("https://example.test/'$(id)")).toBe("'https://example.test/'\\''$(id)'")
  })
})
