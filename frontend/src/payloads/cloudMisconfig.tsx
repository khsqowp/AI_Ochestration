import { useState } from 'react'
import { DISCLAIMER, Note, Pick, TextInput, Readout } from './shared'
import { TARGETS } from './ssrf'

export function CloudMisconfigBuilder() {
  const [targetId, setTargetId] = useState('aws-imds')
  const [customHost, setCustomHost] = useState('')
  
  const target = TARGETS.find(t => t.id === targetId)!

  const ecsMetadata = [
    { label: 'ECS 컨테이너 메타데이터 (V4)', cmd: 'curl -s "$ECS_CONTAINER_METADATA_URI_V4" | jq .' },
    { label: 'ECS 태스크 메타데이터 (V4)', cmd: 'curl -s "$ECS_CONTAINER_METADATA_URI_V4/task" | jq .' },
    { label: 'ECS 메타데이터 (레거시 V3)', cmd: 'curl -s "$ECS_CONTAINER_METADATA_URI" | jq .' },
  ]

  const s3AclTests = [
    { label: 'S3 Bucket ACL 확인', cmd: `aws s3api get-bucket-acl --bucket <BUCKET_NAME>` },
    { label: 'S3 Public Access Block 확인', cmd: `aws s3api get-public-access-block --bucket <BUCKET_NAME>` },
    { label: 'S3 익명 접근 테스트 (curl)', cmd: `curl -I https://<BUCKET_NAME>.s3.amazonaws.com` },
  ]

  return (
    <div className="payload-builder">
      <Note>{DISCLAIMER}</Note>
      
      <Pick label="IMDS 타겟" value={targetId} onChange={setTargetId} options={TARGETS.map(t => ({ id: t.id, label: t.label }))}/>
      <Readout title={target.label} value={customHost ? target.url.replace(target.host, customHost) : target.url} wrap="anywhere"/>
      <TextInput label="커스텀 호스트 (선택, SSRF로 접근한 내부 IP 등)" value={customHost} onChange={setCustomHost} placeholder={target.host}/>

      <div className="payload-readout-group">
        <strong className="payload-group-title">ECS 컨테이너 메타데이터 탈취 (컨테이너 내부에서 실행)</strong>
        {ecsMetadata.map((m, i) => (
          <Readout key={i} title={m.label} value={m.cmd} wrap="anywhere" />
        ))}
      </div>

      <div className="payload-readout-group">
        <strong className="payload-group-title">S3 권한/ACL 점검 (AWS CLI)</strong>
        {s3AclTests.map((t, i) => (
          <Readout key={i} title={t.label} value={t.cmd} wrap="anywhere" />
        ))}
      </div>
    </div>
  )
}

export default CloudMisconfigBuilder
