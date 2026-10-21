import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// 오마카세 콘텐츠 git 이력을 로컬(git 사용 가능한 호스트)에서 미리 수집해
// omakase-dates.json 스냅샷으로 저장한다. generate-omakase-pages.mjs가 Docker 빌드처럼
// git이 없는 환경에서 돌 때 이 스냅샷을 날짜 출처로 대체 사용한다.
// 콘텐츠를 커밋한 뒤 다시 실행해서 스냅샷을 갱신할 것: node scripts/update-omakase-dates.mjs

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const topics = JSON.parse(readFileSync(new URL('../src/omakase-topics.json', import.meta.url), 'utf8'))

const snapshot = {}
for (const topic of topics) {
  for (const file of topic.files) {
    const relativePath = `frontend/public/omakase-content/${topic.id}/${file.id}.md`
    const history = execSync('git log --follow --format=%aI -- "$OMAKASE_GIT_PATH"', {
      cwd: REPO_ROOT,
      env: { ...process.env, OMAKASE_GIT_PATH: relativePath },
      encoding: 'utf8',
    }).trim().split('\n').filter(Boolean)
    if (history.length) snapshot[`${topic.id}/${file.id}`] = { datePublished: history.at(-1), dateModified: history[0] }
  }
}

writeFileSync(new URL('./omakase-dates.json', import.meta.url), JSON.stringify(snapshot, null, 2) + '\n')
console.log(`Wrote dates for ${Object.keys(snapshot).length} files`)
