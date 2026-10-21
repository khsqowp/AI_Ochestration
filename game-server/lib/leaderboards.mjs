import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

const GAMES = new Set(['snake', 'minesweeper', 'reflex-test'])
export const MINESWEEPER_DIFFICULTIES = Object.freeze(['beginner', 'intermediate', 'expert'])
const MIN_MINESWEEPER_MS = Object.freeze({ beginner: 1_000, intermediate: 3_000, expert: 10_000 })
const MAX_SNAKE_SCORE = 1_597 // Maximum 40×40 grid minus the three starting cells.
const MAX_ROWS = 100
const cleanName = value => typeof value === 'string' ? value.trim().replace(/[<>\u0000-\u001f]/g, '').slice(0, 20) : ''
const emptyStore = () => ({ snake: [], minesweeper: Object.fromEntries(MINESWEEPER_DIFFICULTIES.map(level => [level, []])), 'reflex-test': [] })

export function createLeaderboards({ filePath }) {
  let writes = Promise.resolve()
  async function load() {
    try {
      const parsed = JSON.parse(await readFile(filePath, 'utf8'))
      const minesweeper = Array.isArray(parsed?.minesweeper)
        ? { ...emptyStore().minesweeper, beginner: parsed.minesweeper }
        : Object.fromEntries(MINESWEEPER_DIFFICULTIES.map(level => [level, Array.isArray(parsed?.minesweeper?.[level]) ? parsed.minesweeper[level] : []]))
      const validRows = rows => rows.filter(row => row && typeof row.nickname === 'string' && Number.isSafeInteger(row.score) && row.score >= 0)
      return { snake: validRows(Array.isArray(parsed?.snake) ? parsed.snake : []), minesweeper: Object.fromEntries(MINESWEEPER_DIFFICULTIES.map(level => [level, validRows(minesweeper[level])])), 'reflex-test': validRows(Array.isArray(parsed?.['reflex-test']) ? parsed['reflex-test'] : []) }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      return emptyStore()
    }
  }
  async function persist(data) {
    await mkdir(dirname(filePath), { recursive: true })
    const tempPath = `${filePath}.${randomUUID()}.tmp`
    await writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 })
    await rename(tempPath, filePath)
  }
  const lowerIsBetter = game => game === 'minesweeper' || game === 'reflex-test'
  const compare = game => lowerIsBetter(game) ? (a, b) => a.score - b.score || a.createdAt.localeCompare(b.createdAt) : (a, b) => b.score - a.score || a.createdAt.localeCompare(b.createdAt)
  const list = async (game, difficulty) => {
    if (!GAMES.has(game)) return null
    if (game === 'minesweeper' && !MINESWEEPER_DIFFICULTIES.includes(difficulty)) return { error: 'BAD_DIFFICULTY' }
    const data = await load()
    const entries = game === 'minesweeper' ? data.minesweeper[difficulty] : data[game]
    return { game, ...(game === 'minesweeper' ? { difficulty } : {}), direction: lowerIsBetter(game) ? 'ascending' : 'descending', entries: entries.sort(compare(game)).slice(0, MAX_ROWS) }
  }
  return {
    list,
    async submit(game, payload) {
      if (!GAMES.has(game)) return { error: 'UNKNOWN_GAME' }
      const difficulty = payload?.difficulty
      if (game === 'minesweeper' && !MINESWEEPER_DIFFICULTIES.includes(difficulty)) return { error: 'BAD_DIFFICULTY' }
      const nickname = cleanName(payload?.nickname)
      const score = payload?.score
      if (!nickname) return { error: 'BAD_NICKNAME' }
      if (!Number.isSafeInteger(score) || score < 0 || (game === 'snake' && score > MAX_SNAKE_SCORE) || (game === 'minesweeper' && score < MIN_MINESWEEPER_MS[difficulty]) || (game === 'reflex-test' && (score < 1 || score > 5_000))) return { error: 'BAD_SCORE' }
      let result, wasUpdated = false
      writes = writes.catch(() => {}).then(async () => {
        const data = await load()
        const rows = game === 'minesweeper' ? data.minesweeper[difficulty] : data[game]
        const existing = rows.find(row => row.nickname.toLocaleLowerCase() === nickname.toLocaleLowerCase())
        const better = !existing || (lowerIsBetter(game) ? score < existing.score : score > existing.score)
        if (better) {
          wasUpdated = true
          const row = { id: existing?.id || randomUUID(), nickname, score, createdAt: new Date().toISOString() }
          const sorted = [...rows.filter(item => item.id !== row.id), row].sort(compare(game)).slice(0, MAX_ROWS)
          if (game === 'minesweeper') data.minesweeper[difficulty] = sorted
          else data[game] = sorted
          await persist(data)
        }
        result = await list(game, difficulty)
      })
      await writes
      return { ...result, updated: wasUpdated }
    },
  }
}
