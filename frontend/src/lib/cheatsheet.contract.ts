import { CHEATSHEET_QUICK_STARTS } from '../cheatsheet-data'

for (const id of ['nmap', 'curl', 'find', 'whoami', 'tcpdump']) {
  const quickStarts = CHEATSHEET_QUICK_STARTS[id]
  if (!quickStarts || quickStarts.length === 0) throw new Error(`${id}에 목적별 권장 명령이 없습니다.`)
  for (const quickStart of quickStarts) {
    if (!quickStart.command || !quickStart.expected || !quickStart.caution) {
      throw new Error(`${id}/${quickStart.id}의 명령·해석·주의사항이 완전하지 않습니다.`)
    }
  }
}

console.log('cheatsheet quick-start contract passed')
