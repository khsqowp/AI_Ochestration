import { useState } from 'react'
import { DISCLAIMER, Note, TextInput, Readout } from './shared'
import { MODERN_BACKEND_PROBES, MODERN_RECON_PATHS, shellQuote } from './reconCatalog'

export function ModernStackReconBuilder() {
  const [url, setUrl] = useState('')
  const trimmed = url.trim()
  const target = trimmed || 'https://TARGET'

  const groupedPaths = [
    { group: 'Spring Boot Actuator', paths: MODERN_RECON_PATHS.slice(0, 10) },
    { group: 'Swagger / OpenAPI / GraphQL', paths: MODERN_RECON_PATHS.slice(10, 20) },
    { group: 'Frontend / 정적 메타데이터', paths: MODERN_RECON_PATHS.slice(20) },
  ]

  return (
    <div className="payload-builder">
      <Note>{DISCLAIMER}</Note>
      <TextInput label="대상 URL" value={url} onChange={setUrl} placeholder="https://example.com" />

      <div className="payload-readout-group">
        {groupedPaths.map((g) => (
          <div key={g.group} className="recon-path-group">
            <strong className="payload-group-title">{g.group}</strong>
            {g.paths.map((path) => (
              <Readout key={path} title={path} value={`curl -sS -I --max-time 8 ${shellQuote(`${target.replace(/\/$/, '')}${path}`)}`} wrap="anywhere" />
            ))}
          </div>
        ))}
        <Note>HTTP HEAD 요청으로 상태·헤더만 확인합니다. 설정·환경변수·덤프·원본 소스맵 본문은 가져오지 않습니다. HEAD 미지원은 미확인으로 분류하고, 200/403/404만으로 취약 여부를 단정하지 마세요.</Note>
      </div>

      <div className="payload-readout-group">
        <strong className="payload-group-title">기술스택 핑거프린팅 (헤더/쿠키 시그니처)</strong>
        <Readout title="Server / X-Powered-By / Set-Cookie 헤더 확인 (HEAD)" value={`curl -sS -I --max-time 8 ${shellQuote(target)}`} wrap="anywhere" />
        <Readout title="프레임워크별 쿠키 이름" value={'PHPSESSID → PHP\nJSESSIONID → Java\nlaravel_session → Laravel\nconnect.sid → Express'} wrap="pre" />
      </div>

      <div className="payload-readout-group">
        <strong className="payload-group-title">관리형 백엔드 존재 여부 (본문 미수신)</strong>
        {MODERN_BACKEND_PROBES.map(probe => <Readout key={probe.label} title={probe.label} value={probe.command} wrap="anywhere" />)}
        <Note>프로젝트 ID를 알고 있고 점검 범위에 포함된 경우에만 사용합니다. Firebase/Supabase의 응답 코드는 프로젝트 존재나 보안 규칙 상태를 단독으로 증명하지 않습니다.</Note>
      </div>
    </div>
  )
}

export default ModernStackReconBuilder
