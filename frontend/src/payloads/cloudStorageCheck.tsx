import { useState } from 'react'
import { DISCLAIMER, Note, Pick, Readout, TextInput } from './shared'

type Provider = 'AWS S3' | 'GCP GCS' | 'Azure Blob'

export function CloudStorageCheckBuilder() {
  const [provider, setProvider] = useState<Provider>('AWS S3')
  const [bucket, setBucket] = useState('')
  const name = bucket.trim() || 'target-bucket'

  const getCommands = (): { label: string; code: string }[] => {
    switch (provider) {
      case 'AWS S3':
        return [
          { label: '익명 목록 조회', code: `aws s3 ls s3://${name} --no-sign-request` },
          { label: '익명 다운로드', code: `aws s3 sync s3://${name} ./dumped --no-sign-request` },
          { label: '퍼블릭 업로드(쓰기 권한) 테스트', code: `echo test > /tmp/poc.txt && aws s3 cp /tmp/poc.txt s3://${name}/poc.txt --no-sign-request` },
          { label: 'HTTP로 직접 목록 조회 (CLI 없이)', code: `curl -s "https://${name}.s3.amazonaws.com/?list-type=2"` },
          { label: 'ACL 조회', code: `aws s3api get-bucket-acl --bucket ${name} --no-sign-request` },
        ]
      case 'GCP GCS':
        return [
          { label: '익명 목록 조회', code: `gsutil ls -r gs://${name}` },
          { label: '익명 다운로드', code: `gsutil -m cp -r gs://${name} ./dumped` },
          { label: 'IAM 정책 조회', code: `gsutil iam get gs://${name}` },
          { label: 'HTTP로 직접 목록 조회', code: `curl -s "https://storage.googleapis.com/storage/v1/b/${name}/o"` },
        ]
      case 'Azure Blob':
        return [
          { label: '컨테이너 목록 조회 (익명)', code: `az storage blob list --container-name ${name} --account-name <ACCOUNT> --auth-mode login` },
          { label: 'HTTP로 직접 목록 조회', code: `curl -s "https://<ACCOUNT>.blob.core.windows.net/${name}?restype=container&comp=list"` },
          { label: '퍼블릭 액세스 레벨 확인', code: `az storage container show-permission --name ${name} --account-name <ACCOUNT>` },
        ]
      default:
        return []
    }
  }

  return (
    <div className="payload-builder">
      <Note>{DISCLAIMER}</Note>
      <Pick label="클라우드 제공자" value={provider} onChange={setProvider} options={[
        { id: 'AWS S3', label: 'AWS S3' },
        { id: 'GCP GCS', label: 'GCP GCS' },
        { id: 'Azure Blob', label: 'Azure Blob' },
      ]} />
      <TextInput label="버킷/컨테이너 이름" value={bucket} onChange={setBucket} placeholder="target-bucket" />

      <div className="payload-readout-group">
        <strong className="payload-group-title">익명 접근 권한 점검</strong>
        {getCommands().map((command, index) => (
          <Readout key={index} title={command.label} value={command.code} wrap="anywhere" />
        ))}
      </div>

      <div className="payload-readout-group">
        <strong className="payload-group-title">버킷 이름 추정 (일반 패턴)</strong>
        <Readout title="흔한 네이밍 패턴" value="<company>, <company>-backup, <company>-dev, <company>-staging, <company>-assets, <company>-logs, <company>-media, backup-<company>" wrap="anywhere" />
        <Note>회사명/도메인명 기반 치환 리스트로 무차별 조회하되, 요청 속도와 과금(요청당 비용 발생 가능)에 주의하십시오.</Note>
      </div>
    </div>
  )
}

export default CloudStorageCheckBuilder
