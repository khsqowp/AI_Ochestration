import { useState } from 'react'
import { DISCLAIMER, Note, Readout, TextInput } from './shared'
import { CORS_ORIGIN_CASES, shellQuote } from './reconCatalog'

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

  const tests = CORS_ORIGIN_CASES.map(test => {
    const origin = test.origin
      .replaceAll('TARGET.example.com', domain)
      .replaceAll('target.example.com', domain.toLowerCase())
      .replaceAll('target-example.com', domain.replace(/\./g, '-'))
    return {
      ...test,
      cmd: `curl -sS -I --max-time 8 ${origin ? `-H ${shellQuote(`Origin: ${origin}`)} ` : ''}${shellQuote(base)}`,
    }
  })

  return (
    <div className="payload-builder">
      <Note>{DISCLAIMER}</Note>
      <TextInput label="대상 URL" value={url} onChange={setUrl} placeholder="https://api.example.com" />
      
      <div className="payload-readout-group">
        <strong className="payload-group-title">CORS Origin 경계 테스트 (curl)</strong>
        {tests.map((t, i) => (
          <div key={i} style={{ marginBottom: '16px' }}>
            <Readout title={t.label} value={t.cmd} wrap="anywhere" />
            <Note>{t.note}</Note>
          </div>
        ))}
      </div>
      <Note>각 응답에서 Access-Control-Allow-Origin, Access-Control-Allow-Credentials, Vary를 비교하세요. 와일드카드·반사 한 가지로 즉시 취약 판정하지 말고 인증 응답에 대한 브라우저 동작과 허용 Origin 정책을 함께 확인하세요. 이 명령은 응답 헤더만 요청합니다.</Note>
    </div>
  )
}

export default CorsMisconfigBuilder
