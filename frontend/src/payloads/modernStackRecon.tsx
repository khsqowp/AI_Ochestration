import { useState } from 'react'
import { DISCLAIMER, Note, TextInput, Readout } from './shared'

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
  const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`

  const cloudBackend = [
    { label: 'Firebase RTDB 읽기 권한 상태 (읽기 전용 카나리 경로)', cmd: `curl -sS -o /dev/null -w "HTTP %{http_code}\\n" ${shellQuote(`https://${firebaseProject}.firebaseio.com/.__permission_probe__.json`)}` },
    { label: 'Supabase REST 스키마 응답 확인', cmd: `curl -sS -i ${shellQuote(`${target}/rest/v1/`)} -H ${shellQuote(`apikey: ${anonKey}`)} -H ${shellQuote(`Authorization: Bearer ${anonKey}`)}` },
    { label: 'Supabase RLS 확인 (합성 데이터만 둔 테스트 테이블)', cmd: `curl -sS -i ${shellQuote(`${target}/rest/v1/${testTable}?select=id&limit=1`)} -H ${shellQuote(`apikey: ${anonKey}`)} -H ${shellQuote(`Authorization: Bearer ${anonKey}`)}` },
  ]

  return (
    <div className="payload-builder">
      <Note>{DISCLAIMER}</Note>
      <Note>이 도구는 공통 경로 체크리스트에 있는 Actuator·API 문서·프런트엔드 경로를 반복하지 않습니다. BaaS 권한 확인은 본인이 승인받은 프로젝트에서만 수행하고, Supabase RLS는 합성 데이터만 둔 전용 테스트 테이블로 확인하세요. 키는 화면에 입력해도 서버로 전송되지 않습니다.</Note>

      <div className="payload-readout-group">
        <strong className="payload-group-title">Firebase / Supabase 프로젝트 입력</strong>
        <TextInput label="Supabase Project URL" value={url} onChange={setUrl} placeholder="https://<PROJECT>.supabase.co" />
        <TextInput label="Firebase RTDB Project ID" value={firebaseProjectId} onChange={setFirebaseProjectId} placeholder="<PROJECT-ID>" />
        <TextInput label="Supabase anon key" value={supabaseAnonKey} onChange={setSupabaseAnonKey} placeholder="<ANON_KEY>" />
        <TextInput label="합성 데이터 전용 테스트 테이블" value={supabaseTestTable} onChange={setSupabaseTestTable} placeholder="<TEST_TABLE>" />
      </div>

      <div className="payload-readout-group">
        <strong className="payload-group-title">BaaS 권한 점검 명령</strong>
        {cloudBackend.map((c, i) => <Readout key={i} title={c.label} value={c.cmd} wrap="anywhere"/>)}
      </div>

      <div className="payload-readout-group">
        <strong className="payload-group-title">기술 스택 지문 단서 (헤더·쿠키)</strong>
        <Readout title="Server / X-Powered-By / Set-Cookie 헤더 확인 (GET)" value={`curl -sS -D - -o /dev/null ${target}`} wrap="anywhere" />
        <Readout title="프레임워크별 쿠키 이름" value={'PHPSESSID → PHP\nJSESSIONID → Java\nlaravel_session → Laravel\nconnect.sid → Express'} wrap="pre" />
        <Note>헤더와 쿠키 이름은 단서일 뿐이며 프레임워크를 확정하지 않습니다. 프록시·커스텀 설정·쿠키명 변경으로 달라질 수 있습니다.</Note>
      </div>
    </div>
  )
}

export default ModernStackReconBuilder
