import { useState } from 'react'
import { DISCLAIMER, Note, Readout, TextInput } from './shared'

export function ErrorInducerBuilder() {
  const [host, setHost] = useState('')
  const [path, setPath] = useState('')
  const targetHost = host.trim() || 'example.com'
  const trimmedPath = path.trim()
  const targetPath = trimmedPath.startsWith('/') ? trimmedPath : '/'

  const methods = [
    { method: 'TRACE', desc: 'XST(Cross-Site Tracing) 가능성, 요청 헤더가 그대로 반사되는지 확인' },
    { method: 'TRACK', desc: 'IIS 전용 TRACE 변형, 동일 목적' },
    { method: 'CONNECT', desc: '프록시 터널링 메서드가 일반 웹 서버에서도 처리되는지' },
    { method: 'PATCH', desc: '구현 누락으로 500 스택트레이스가 노출되는지' },
    { method: 'PROPFIND', desc: 'WebDAV 메서드, 미설치 서버에서 디폴트 에러 페이지가 나오는지' },
    { method: 'DEBUG', desc: '레거시 ASP.NET 디버그 메서드 노출 확인' },
    { method: 'FOOBAR', desc: '프레임워크가 알 수 없는 메서드를 어떻게 처리하는지(405 vs 500 vs 커스텀 에러 페이지 유무)' },
    { method: 'get', desc: '메서드 대소문자 구분 여부로 인한 라우팅/에러 처리 차이' },
    { method: 'A'.repeat(2000), desc: '메서드 토큰 길이 제한 처리(버퍼/파서 오류 유도)' },
  ]

  const paths = [
    { title: '널바이트(%00) 트렁케이션', desc: '널바이트 트렁케이션으로 확장자 필터·파일 핸들러 오류 유도', suffix: '%00' },
    { title: '널바이트 + 허용 확장자', desc: '널바이트 뒤 허용 확장자를 붙여 업로드/정적 핸들러 우회 확인', suffix: '%00.jpg' },
    { title: '경로 순회 카나리(기능성 익스플로잇 아님)', desc: '경로 정규화 실패 시 스택트레이스·403/500 차이 확인', suffix: '/../../../../../../etc/passwd' },
    { title: '초장문 경로 세그먼트(8000자)', desc: 'URL/헤더 길이 제한 초과로 414/400/500 중 무엇이 나오는지, 커스텀 에러 페이지 유무 확인', suffix: `/${'A'.repeat(8000)}` },
    { title: '더블 URL 인코딩 트래버설', desc: '1차 디코딩만 하는 프록시와 2차 디코딩까지 하는 백엔드 간 불일치 확인', suffix: '%252e%252e%252f' },
    { title: '경로를 통한 CRLF 인젝션', desc: '경로를 통한 CRLF/헤더 인젝션 가능 여부', suffix: '%0d%0aX-Injected: 1' },
    { title: '잘못된 UTF-8 바이트 시퀀스', desc: '잘못된 인코딩 입력에 대한 파서 내구성 확인', suffix: '%ff%fe' },
  ]

  const headers = [
    { title: 'X-Forwarded-Host', desc: '백엔드가 이 값으로 리다이렉트/링크를 생성하는지(호스트 헤더 신뢰 확인)', values: ['X-Forwarded-Host: attacker.example'] },
    { title: 'X-Forwarded-Proto + X-Forwarded-Host', desc: 'HTTPS 강제 리다이렉트 로직 우회 가능성', values: ['X-Forwarded-Proto: http', 'X-Forwarded-Host: attacker.example'] },
    { title: 'X-Original-URL', desc: '일부 프레임워크(과거 Rails/일부 WAF 우회 벡터)가 경로 재작성에 쓰는 헤더, 접근 제어 우회 확인', values: ['X-Original-URL: /admin'] },
    { title: 'X-Rewrite-URL', desc: '위와 동일 계열의 다른 헤더명', values: ['X-Rewrite-URL: /admin'] },
    { title: 'GET + JSON Content-Type', desc: 'Content-Type 파서가 빈 값/불일치를 어떻게 처리하는지 (GET+JSON Content-Type)', values: ['Content-Type: application/json'] },
    { title: '빈 multipart boundary', desc: 'Content-Type 파서가 빈 값/불일치를 어떻게 처리하는지 (빈 boundary)', values: ['Content-Type: multipart/form-data; boundary='] },
    { title: '음수 Content-Length', desc: '음수 Content-Length 파싱 오류 유도', values: ['Content-Length: -1'] },
    { title: 'Expect: 100-continue', desc: '100-continue 처리 미지원 시 타임아웃/오류 확인', values: ['Expect: 100-continue'] },
    { title: '비정상 Range', desc: '범위 요청 정수 오버플로/비정상 범위 처리 확인', values: ['Range: bytes=0-99999999999999'] },
    { title: '초장문 Accept-Language', desc: '헤더 값 길이 제한 처리 확인', values: [`Accept-Language: ${'x,'.repeat(500)}`] },
  ]

  return (
    <div className="payload-builder">
      <Note>{DISCLAIMER}</Note>
      <TextInput label="Host" value={host} onChange={setHost} placeholder="example.com" />
      <TextInput label="대상 경로" value={path} onChange={setPath} placeholder="/api/v1/resource" />

      <div className="payload-readout-group">
        <strong className="payload-group-title">HTTP 메서드 (자주 빠뜨리는 메서드별 커스텀 에러 페이지 점검)</strong>
        {methods.map(({ method, desc }) => (
          <Readout key={method} title={`${method} — ${desc}`} value={`curl -i -X ${method} https://${targetHost}${targetPath}`} wrap="anywhere" />
        ))}
      </div>

      <div className="payload-readout-group">
        <strong className="payload-group-title">경로 변형 (에러 유발용 경로)</strong>
        {paths.map(({ title, desc, suffix }) => (
          <Readout key={title} title={`${title} — ${desc}`} value={`curl -i "https://${targetHost}${targetPath}${suffix}"`} wrap="anywhere" />
        ))}
      </div>

      <div className="payload-readout-group">
        <strong className="payload-group-title">헤더 (리다이렉트·파싱 오류 유도)</strong>
        {headers.map(({ title, desc, values }) => (
          <Readout key={title} title={`${title} — ${desc}`} value={`curl -i ${values.map(value => `-H '${value}'`).join(' ')} https://${targetHost}${targetPath}`} wrap="anywhere" />
        ))}
      </div>
    </div>
  )
}

export default ErrorInducerBuilder
