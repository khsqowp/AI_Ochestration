import { mkdir, writeFile } from 'node:fs/promises'

await mkdir('public', { recursive: true })
await writeFile('public/build-info.json', JSON.stringify({ buildId: Date.now().toString() }))
