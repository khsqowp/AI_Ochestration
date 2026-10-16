import { useState } from 'react'
import { DISCLAIMER, Note, Readout, TextInput } from './shared'

export function CorsMisconfigBuilder() {
  const [url, setUrl] = useState('')
  const trimmed = url.trim()
  const base = trimmed || 'https://TARGET.example.com'

  const getDomain = (u: string) => {
    try {
      const parsed = new URL(u)
      return parsed.hostname
    } catch {
      return 'TARGET.example.com'
    }
  }
  const domain = getDomain(base)

  const tests = [
    { 
      label: '임의 Origin 반사 확인', 
      cmd: `curl -s -I -H "Origin: https://evil.com" ${base}`, 
      note: '응답 헤더에 Access-Control-Allow-Origin: https://evil.com이 그대로 반사되면 취약. Allow-Origin 반사와 Access-Control-Allow-Credentials: true가 동시에 뜨면 치명적'
    },
    { 
      label: 'null Origin 테스트', 
      cmd: `curl -s -I -H "Origin: null" ${base}`, 
      note: 'Access-Control-Allow-Origin: null 반사 시 특정 상황에서 취약 가능' 
    },
    { 
      label: '서브도메인 우회 (evil-domain)', 
      cmd: `curl -s -I -H "Origin: https://evil-${domain}" ${base}`, 
      note: '단순 문자열 포함 여부만 체크하는 설정인 경우 우회 가능'
    },
    {
      label: '서브도메인 우회 (domain-evil)',
      cmd: `curl -s -I -H "Origin: https://${domain}.evil.com" ${base}`,
      note: '도메인 접두사/접미사 검증 미흡 시 우회 가능'
    },
  ]

  return (
    <div className="payload-builder">
      <Note>{DISCLAIMER}</Note>
      <TextInput label="대상 URL" value={url} onChange={setUrl} placeholder="https://api.example.com" />
      
      <div className="payload-readout-group">
        <strong className="payload-group-title">CORS 취약점 테스트 커맨드 (curl)</strong>
        {tests.map((t, i) => (
          <div key={i} style={{ marginBottom: '16px' }}>
            <Readout title={t.label} value={t.cmd} wrap="anywhere" />
            <Note>{t.note}</Note>
          </div>
        ))}
      </div>
    </div>
  )
}

export default CorsMisconfigBuilder
