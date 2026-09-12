import { CHEATSHEET_CATEGORIES } from '../cheatsheet-data'

type QuickStart = { id: string; command: string; expected: string; caution: string }
type ToolWithQuickStarts = { id: string; quickStarts?: QuickStart[] }

function tool(id: string): ToolWithQuickStarts {
  for (const category of CHEATSHEET_CATEGORIES) {
    const found = category.tools.find(candidate => candidate.id === id)
    if (found) return found as ToolWithQuickStarts
  }
  throw new Error(`도구를 찾지 못했습니다: ${id}`)
}

for (const id of ['nmap', 'curl', 'find', 'whoami', 'tcpdump']) {
  const quickStarts = tool(id).quickStarts
  if (!quickStarts || quickStarts.length === 0) throw new Error(`${id}에 목적별 권장 명령이 없습니다.`)
  for (const quickStart of quickStarts) {
    if (!quickStart.command || !quickStart.expected || !quickStart.caution) {
      throw new Error(`${id}/${quickStart.id}의 명령·해석·주의사항이 완전하지 않습니다.`)
    }
  }
}

console.log('cheatsheet quick-start contract passed')
