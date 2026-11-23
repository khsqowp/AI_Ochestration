import { useState } from 'react'
import { DISCLAIMER, Note, TextInput, Readout } from './shared'
import { MODERN_BACKEND_PROBES, MODERN_RECON_PATHS, shellQuote } from './reconCatalog'

export function ModernStackReconBuilder() {
  const [url, setUrl] = useState('')
  const [firebaseProjectId, setFirebaseProjectId] = useState('')
  const [supabaseAnonKey, setSupabaseAnonKey] = useState('')
  const [supabaseTestTable, setSupabaseTestTable] = useState('')
  const trimmed = url.trim().replace(/\/$/, '')
  const target = trimmed || 'https://<PROJECT>.supabase.co'
  const firebaseProject = firebaseProjectId.trim() || '<PROJECT-ID>'
  const anonKey = supabaseAnonKey.trim() || '<ANON_KEY>'
  const testTable = supabaseTestTable.trim() || '<TEST_TABLE>'

  const groupedPaths = [
    { group: 'Spring Boot Actuator', paths: MODERN_RECON_PATHS.slice(0, 10) },
    { group: 'Swagger / OpenAPI / GraphQL', paths: MODERN_RECON_PATHS.slice(10, 20) },
    { group: 'Frontend / 정적 메타데이터', paths: MODERN_RECON_PATHS.slice(20) },
  ]
  const cloudBackend = [
    { label: 'Firebase RTDB 읽기 권한 상태 (읽기 전용 카나리 경로)', cmd: `curl -sS -o /dev/null -w "HTTP %{http_code}\\n" ${shellQuote(`https://${firebaseProject}.firebaseio.com/.__permission_probe__.json`)}` },
    { label: 'Supabase REST 스키마 응답 확인', cmd: `curl -sS -i ${shellQuote(`${target}/rest/v1/`)} -H ${shellQuote(`apikey: ${anonKey}`)} -H ${shellQuote(`Authorization: Bearer ${anonKey}`)}` },
    { label: 'Supabase RLS 확인 (합성 데이터만 둔 테스트 테이블)', cmd: `curl -sS -i ${shellQuote(`${target}/rest/v1/${testTable}?select=id&limit=1`)} -H ${shellQuote(`apikey: ${anonKey}`)} -H ${shellQuote(`Authorization: Bearer ${anonKey}`)}` },
  ]

  return (
    <div className="payload-builder">
      <Note>{DISCLAIMER}</Note>
      <Note>경로 체크는 HEAD 요청만 사용하며 응답 본문을 가져오지 않습니다. BaaS 권한 확인은 승인받은 프로젝트에서만 수행하고, Supabase RLS는 합성 데이터만 둔 전용 테스트 테이블로 확인하세요. 키는 화면에 입력해도 서버로 전송되지 않습니다.</Note>

      <div className="payload-readout-group">
        {groupedPaths.map((g) => (
          <div key={g.group} className="recon-path-group">
            <strong className="payload-group-title">{g.group}</strong>
            {g.paths.map((path) => (
              <Readout key={path} title={path} value={`curl -sS -I --max-time 8 ${shellQuote(`${target}${path}`)}`} wrap="anywhere" />
            ))}
          </div>
        ))}
        <Note>HTTP HEAD 요청으로 상태·헤더만 확인합니다. 설정·환경변수·덤프·원본 소스맵 본문은 가져오지 않습니다. HEAD 미지원은 미확인으로 분류하고, 200/403/404만으로 취약 여부를 단정하지 마세요.</Note>
      </div>

      <div className="payload-readout-group">
        <strong className="payload-group-title">Firebase / Supabase 프로젝트 입력</strong>
        <TextInput label="Supabase Project URL" value={url} onChange={setUrl} placeholder="https://<PROJECT>.supabase.co" />
        <TextInput label="Firebase RTDB Project ID" value={firebaseProjectId} onChange={setFirebaseProjectId} placeholder="<PROJECT-ID>" />
        <TextInput label="Supabase anon key" value={supabaseAnonKey} onChange={setSupabaseAnonKey} placeholder="<ANON_KEY>" />
        <TextInput label="합성 데이터 전용 테스트 테이블" value={supabaseTestTable} onChange={setSupabaseTestTable} placeholder="<TEST_TABLE>" />
      </div>

      <div className="payload-readout-group">
        <strong className="payload-group-title">BaaS 권한 점검 명령</strong>
        {cloudBackend.map((c) => <Readout key={c.label} title={c.label} value={c.cmd} wrap="anywhere" />)}
      </div>

      <div className="payload-readout-group">
        <strong className="payload-group-title">기술스택 핑거프린팅 (헤더/쿠키 시그니처)</strong>
        <Readout title="Server / X-Powered-By / Set-Cookie 헤더 확인 (HEAD)" value={`curl -sS -I --max-time 8 ${shellQuote(target)}`} wrap="anywhere" />
        <Readout title="프레임워크별 쿠키 이름" value={'PHPSESSID → PHP\nJSESSIONID → Java\nlaravel_session → Laravel\nconnect.sid → Express'} wrap="pre" />
        <Note>헤더와 쿠키 이름은 단서일 뿐이며 프레임워크를 확정하지 않습니다. 프록시·커스텀 설정·쿠키명 변경으로 달라질 수 있습니다.</Note>
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
