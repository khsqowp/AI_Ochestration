import { getLiveApiBaseUrl } from './liveSocket'

export type LeaderboardGame = 'snake' | 'minesweeper' | 'reflex-test'
export type MinesweeperDifficulty = 'beginner' | 'intermediate' | 'expert'
export type LeaderboardEntry = { id: string; nickname: string; score: number; createdAt: string }
export type LeaderboardResult = { game: LeaderboardGame; difficulty?: MinesweeperDifficulty; direction: 'ascending' | 'descending'; entries: LeaderboardEntry[] }

function endpoint(game: LeaderboardGame, difficulty?: MinesweeperDifficulty) {
  const url = new URL(`/api/leaderboards/${game}`, getLiveApiBaseUrl())
  if (game === 'minesweeper' && difficulty) url.searchParams.set('difficulty', difficulty)
  return url
}

export async function fetchLeaderboard(game: LeaderboardGame, difficulty?: MinesweeperDifficulty): Promise<LeaderboardResult> {
  const response = await fetch(endpoint(game, difficulty), { cache: 'no-store' })
  const body = await response.json()
  if (!response.ok) throw new Error(body.message || body.error || `Leaderboard request failed (${response.status})`)
  return body as LeaderboardResult
}

export async function submitLeaderboardScore(game: LeaderboardGame, nickname: string, score: number, difficulty?: MinesweeperDifficulty): Promise<LeaderboardResult & { updated: boolean }> {
  const response = await fetch(endpoint(game, difficulty), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nickname, score, ...(game === 'minesweeper' ? { difficulty } : {}) }),
  })
  const body = await response.json()
  if (!response.ok) throw new Error(body.message || body.error || `Leaderboard request failed (${response.status})`)
  return body as LeaderboardResult & { updated: boolean }
}
