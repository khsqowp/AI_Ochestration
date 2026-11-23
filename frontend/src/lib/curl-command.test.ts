import { describe, expect, it } from 'vitest'
import { formatCurlCommand } from './curl-command'

describe('formatCurlCommand', () => {
  it('switches a standalone curl command to curl.exe for Windows', () => {
    expect(formatCurlCommand('curl -I https://example.test/', 'windows'))
      .toBe('curl.exe -I https://example.test/')
  })

  it('switches curl invocations in command substitutions, chains, and multiline scripts', () => {
    const command = 'TOKEN=$(curl -s https://example.test/token)\ncurl -H "X-Token: $TOKEN" https://example.test/'
    expect(formatCurlCommand(command, 'windows'))
      .toBe('TOKEN=$(curl.exe -s https://example.test/token)\ncurl.exe -H "X-Token: $TOKEN" https://example.test/')
  })

  it('switches every curl command in pipes and shell command chains', () => {
    expect(formatCurlCommand('curl one && curl two | jq .; curl three', 'windows'))
      .toBe('curl.exe one && curl.exe two | jq .; curl.exe three')
  })

  it('does not modify prose, quoted text, or already selected curl.exe commands', () => {
    const command = 'echo "curl is the command name"\ncurl.exe -I https://example.test/'
    expect(formatCurlCommand(command, 'windows')).toBe(command)
  })

  it('leaves commands unchanged in the default shell mode', () => {
    expect(formatCurlCommand('curl -I https://example.test/', 'unix'))
      .toBe('curl -I https://example.test/')
  })
})
