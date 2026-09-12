import { analyzeCsp, assessEvidence } from './diagnostic'

const csp = analyzeCsp("default-src 'self'; script-src 'self' 'unsafe-inline'")
if (!csp.findings.some(finding => finding.code === 'CSP_UNSAFE_INLINE')) throw new Error('unsafe-inline finding is required')

const assessment = assessEvidence({ baseline: '200 정상 응답', variation: '응답 본문이 변경됨', serverEvidence: '' })
if (assessment.status !== 'NEEDS_EVIDENCE') throw new Error('changed response without server evidence must not be confirmed')
