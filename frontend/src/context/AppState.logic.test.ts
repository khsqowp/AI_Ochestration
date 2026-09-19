import { describe, expect, test } from 'vitest'
import { shouldDeferReload } from './AppState.logic'

// Medium #13 -- the local LLM streaming page already deferred an auto-reload to a banner (a hard reload
// mid-stream loses the conversation), but the competency training page has the exact same problem (a
// reload mid black-box session loses the in-progress chat) and was never added to the exemption.
describe('shouldDeferReload', () => {
  test('defers on the local LLM streaming page', () => {
    expect(shouldDeferReload('/dashboard/llm')).toBe(true)
    expect(shouldDeferReload('/dashboard/llm/chat/123')).toBe(true)
  })

  test('defers on the competency training page too', () => {
    expect(shouldDeferReload('/dashboard/역량강화')).toBe(true)
    expect(shouldDeferReload('/dashboard/역량강화/history')).toBe(true)
  })

  test('reloads immediately everywhere else', () => {
    expect(shouldDeferReload('/dashboard/tasks')).toBe(false)
    expect(shouldDeferReload('/')).toBe(false)
  })
})
