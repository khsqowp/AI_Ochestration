import { useMemo, useState } from 'react'
import { Clipboard } from 'lucide-react'
import { Note } from './shared'

type RequestHeader = { name: string; value: string }
type ParseResult = { kind: 'success'; command: string } | { kind: 'error'; message: string } | { kind: 'empty' }

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\"'\"'")}'`
}

function parseRequest(raw: string, scheme: 'http' | 'https'): ParseResult {
  if (!raw.trim()) return { kind: 'empty' }
  const normalized = raw.replace(/\r\n/g, '\n')
  const separator = normalized.indexOf('\n\n')
  const head = separator === -1 ? normalized : normalized.slice(0, separator)
  const body = separator === -1 ? '' : normalized.slice(separator + 2)
  const lines = head.split('\n')
  const requestLine = lines.shift()?.trim().split(/\s+/) ?? []
  if (requestLine.length < 3 || !requestLine[0] || !requestLine[1] || !/^HTTP\/\S+$/i.test(requestLine[2])) {
    return { kind: 'error', message: '요청줄 형식이 올바르지 않습니다. METHOD path HTTP/버전 형식으로 입력하세요.' }
  }
  const headers: RequestHeader[] = []
  for (const line of lines) {
    const colon = line.indexOf(':')
    if (colon < 1) return { kind: 'error', message: `헤더 형식이 올바르지 않습니다: ${line}` }
    headers.push({ name: line.slice(0, colon).trim(), value: line.slice(colon + 1).trim() })
  }
  const host = headers.find(header => header.name.toLowerCase() === 'host')?.value
  if (!host) return { kind: 'error', message: 'Host 헤더가 없어 URL을 만들 수 없습니다.' }
  const method = requestLine[0].toUpperCase()
  const url = `${scheme}://${host}${requestLine[1]}`
  const parts = [`curl -X ${shellQuote(method)} ${shellQuote(url)}`]
  for (const header of headers) {
    if (['host', 'content-length'].includes(header.name.toLowerCase())) continue
    parts.push(`  -H ${shellQuote(`${header.name}: ${header.value}`)}`)
  }
  if (body) parts.push(`  --data-raw ${shellQuote(body)}`)
  return { kind: 'success', command: parts.join(' \\\n') }
}

export function RequestToCurlBuilder() {
  const [raw, setRaw] = useState('')
  const [scheme, setScheme] = useState<'http' | 'https'>('https')
  const [copied, setCopied] = useState<boolean | 'error'>(false)
  const result = useMemo(() => parseRequest(raw, scheme), [raw, scheme])
  const output = result.kind === 'success' ? result.command : result.kind === 'error' ? result.message : ''
  const copy = async () => {
    if (result.kind !== 'success') return
    try { await navigator.clipboard.writeText(result.command); setCopied(true) } catch { setCopied('error') }
    window.setTimeout(() => setCopied(false), 1500)
  }
  return <div className="payload-builder fmt-builder request-curl-builder">
    <Note>모든 처리는 이 브라우저 안에서만 일어납니다. Host와 Content-Length 헤더는 curl이 처리하므로 명령어에서 제외됩니다.</Note>
    <div className="request-curl-scheme" role="radiogroup" aria-label="URL 스킴">
      {(['https', 'http'] as const).map(value => <label key={value}>
        <input type="radio" name="request-curl-scheme" value={value} checked={scheme === value} onChange={() => setScheme(value)}/>
        {value}
      </label>)}
    </div>
    <div className="fmt-workspace">
      <section className="fmt-input-pane">
        <label className="payload-builder-label" htmlFor="request-curl-input">Burp request 원문</label>
        <div className="fmt-box"><textarea id="request-curl-input" className="fmt-textarea request-curl-input" value={raw} onChange={e => setRaw(e.target.value)} spellCheck={false}
          placeholder={'POST /api/login HTTP/1.1\nHost: example.com\nContent-Type: application/json\n\n{"user":"a"}'}/>
        </div>
      </section>
      <section className="fmt-output-wrap">
        <div className="fmt-output-pane">
          <label className="payload-builder-label">curl 명령어</label>
          <div className="fmt-box"><textarea className={`fmt-textarea${result.kind === 'error' ? ' request-curl-error' : ''}`} value={output} readOnly spellCheck={false}/></div>
        </div>
        <button className="cheatsheet-copy fmt-copy" onClick={() => void copy()} disabled={result.kind !== 'success'}>
          <Clipboard size={14}/>{copied === 'error' ? '복사 실패' : copied ? '복사됨' : '복사'}
        </button>
      </section>
    </div>
  </div>
}
