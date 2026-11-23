import { describe, expect, it } from 'vitest'
import { CHEATSHEET_CATEGORIES } from '../cheatsheet-data'
import {
  APPROVED_DIAGNOSTIC_TOOLS,
  DNS_DELEGATION_CHECKS,
  RELEASE_ARTIFACT_PATHS,
  STACK_HEADER_SIGNATURES,
  buildHeadBatchProbe,
  buildMsfCveSearch,
  buildMsfModuleInfo,
  classifyStackHeaders,
} from './approvedDiagnosticTools'

const expectedIds = [
  'cdn-cache-behavior',
  'stack-fingerprint',
  'release-artifact-check',
  'dns-delegation-audit',
  'msf-precondition-review',
]

describe('approved diagnostic tools', () => {
  it('registers one distinct tool under each approved singleton topic', () => {
    const categoryIds = new Map(CHEATSHEET_CATEGORIES.map(category => [category.id, category.tools.map(tool => tool.id)]))
    expect(categoryIds.get('cdn')).toContain('cdn-cache-behavior')
    expect(categoryIds.get('techstack')).toContain('stack-fingerprint')
    expect(categoryIds.get('git-secrets')).toContain('release-artifact-check')
    expect(categoryIds.get('dns-takeover')).toContain('dns-delegation-audit')
    expect(categoryIds.get('exploitation')).toContain('msf-precondition-review')
    expect(APPROVED_DIAGNOSTIC_TOOLS.map(tool => tool.id)).toEqual(expectedIds)
  })

  it('uses only bounded HEAD requests for CDN and release artifact probes', () => {
    expect(buildHeadBatchProbe('https://example.test', ['/a', '/b'])).toMatch(/curl -sS -I/)
    expect(buildHeadBatchProbe('https://example.test', ['/a', '/b'])).not.toMatch(/-X\s+(GET|POST|PUT|DELETE)|-o\s+[^ ]+\s+https?:/i)
    expect(RELEASE_ARTIFACT_PATHS.length).toBeGreaterThanOrEqual(20)
    expect(RELEASE_ARTIFACT_PATHS.every(path => path.startsWith('/'))).toBe(true)
  })

  it('classifies stack observations as clues rather than confirmed versions', () => {
    expect(STACK_HEADER_SIGNATURES.length).toBeGreaterThanOrEqual(10)
    const findings = classifyStackHeaders('Server: nginx/1.24.0\nX-Powered-By: Express\nSet-Cookie: laravel_session=redacted')
    expect(findings.map(item => item.product)).toEqual(expect.arrayContaining(['nginx', 'Express', 'Laravel']))
    expect(findings.every(item => item.confidence !== '확정')).toBe(true)
  })

  it('covers DNS delegation and DNSSEC checks without zone transfer', () => {
    expect(DNS_DELEGATION_CHECKS.length).toBeGreaterThanOrEqual(8)
    expect(DNS_DELEGATION_CHECKS.map(item => item.command).join('\n')).toMatch(/\+trace/)
    expect(DNS_DELEGATION_CHECKS.map(item => item.command).join('\n')).toMatch(/DNSKEY|DS/)
    expect(DNS_DELEGATION_CHECKS.map(item => item.command).join('\n')).not.toMatch(/axfr/i)
  })

  it('builds read-only Metasploit lookup commands and rejects command injection', () => {
    expect(buildMsfCveSearch('CVE-2024-12345')).toContain('search cve:2024-12345')
    expect(buildMsfCveSearch('CVE-2024-12345; exploit')).toBeNull()
    expect(buildMsfModuleInfo('auxiliary/scanner/example')).toContain('info auxiliary/scanner/example')
    expect(buildMsfModuleInfo('auxiliary/example; run')).toBeNull()
    expect(buildMsfModuleInfo('auxiliary/scanner/example')).not.toMatch(/\b(run|exploit)\b/i)
  })
})
