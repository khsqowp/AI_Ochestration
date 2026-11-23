import { useState } from 'react'
import { DISCLAIMER, Note, Pick, Readout, TextInput } from './shared'
import { CLOUD_STORAGE_CHECKS } from './reconCatalog'

type Provider = 'AWS S3' | 'GCP GCS' | 'Azure Blob'

export function CloudStorageCheckBuilder() {
  const [provider, setProvider] = useState<Provider>('AWS S3')
  const [bucket, setBucket] = useState('')
  const rawName = bucket.trim()
  const nameIsValid = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/i.test(rawName)
  const name = nameIsValid ? rawName : '<BUCKET>'
  const commands = CLOUD_STORAGE_CHECKS[provider].map(check => ({
    ...check,
    command: check.command.replaceAll('<BUCKET>', name).replaceAll('<CONTAINER>', name),
  }))

  return (
    <div className="payload-builder">
      <Note>{DISCLAIMER}</Note>
      <Pick label="클라우드 제공자" value={provider} onChange={setProvider} options={[
        { id: 'AWS S3', label: 'AWS S3' },
        { id: 'GCP GCS', label: 'GCP GCS' },
        { id: 'Azure Blob', label: 'Azure Blob' },
      ]} />
      <TextInput label="버킷/컨테이너 이름" value={bucket} onChange={setBucket} placeholder="target-bucket" />
      {!nameIsValid && rawName.length > 0 && <Note>이름 형식이 맞지 않아 명령에 대상 자리표시자를 표시합니다. 명령을 실행하기 전에 승인된 버킷·컨테이너 값을 확인하세요.</Note>}

      <div className="payload-readout-group">
        <strong className="payload-group-title">읽기 전용 권한·구성 점검</strong>
        {commands.map(command => (
          <div key={command.label}>
            <Readout title={command.label} value={command.command} wrap="anywhere" />
            <Note>{command.purpose}</Note>
          </div>
        ))}
        <Note>목록 열람·객체 다운로드·업로드는 수행하지 않습니다. CLI 명령은 해당 클라우드에 로그인된 점검 계정 권한이 필요할 수 있으며, 익명 HTTP 검사는 헤더만 확인합니다.</Note>
      </div>

      <div className="payload-readout-group">
        <strong className="payload-group-title">버킷 이름 추정 (일반 패턴)</strong>
        <Readout title="흔한 네이밍 패턴" value="<company>, <company>-backup, <company>-dev, <company>-staging, <company>-assets, <company>-logs, <company>-media, backup-<company>" wrap="anywhere" />
        <Note>이름 패턴은 자산 인벤토리와 대조하기 위한 참고입니다. 후보 버킷을 자동·대량 조회하지 말고, 승인된 이름만 점검하세요.</Note>
      </div>
    </div>
  )
}

export default CloudStorageCheckBuilder
