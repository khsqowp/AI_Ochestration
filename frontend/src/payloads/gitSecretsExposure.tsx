import { useState } from 'react'
import { DISCLAIMER, Note, Readout, TextInput } from './shared'
import { buildGitExposureProbe } from './reconCatalog'

export function GitSecretsExposureBuilder() {
  const [target, setTarget] = useState('')
  const base = (target.trim() || 'https://example.com').replace(/\/+$/, '')

  const checkScript = buildGitExposureProbe(base)

  return (
    <div className="payload-builder">
      <Note>{DISCLAIMER}</Note>
      <TextInput label="대상 URL" value={target} onChange={setTarget} placeholder="https://example.com" />

      <div className="payload-readout-group">
        <strong className="payload-group-title">노출 후보 경로 일괄 확인 (HEAD만 전송)</strong>
        <Readout title="Bash 스크립트" value={checkScript} wrap="pre" />
        <Note>응답 본문은 저장하지 않습니다. 200도 접근 가능성의 후보일 뿐이고, 403은 존재 여부를 입증하지 않으며, 404도 안전을 보장하지 않습니다. 무작위 존재하지 않는 경로와 비교해 soft-404·WAF 응답을 구분하고 승인된 자산에서만 실행하세요.</Note>
      </div>

      <div className="payload-readout-group">
        <strong className="payload-group-title">응답 해석</strong>
        <Note>`.git/HEAD`와 설정 파일이 실제로 응답 가능한지는 HEAD만으로 확정할 수 없습니다. 소유자 로그·웹서버 설정·접근 통제 정책을 확인하고, 콘텐츠 검증이 필요하면 대상 소유자의 별도 승인 절차를 사용하세요. 이 도구는 파일을 내려받거나 저장소를 복원하지 않습니다.</Note>
      </div>
    </div>
  )
}

export default GitSecretsExposureBuilder
