import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type UIEvent } from 'react'
import { Clipboard, X } from 'lucide-react'
import { Note } from './shared'

type FormatResult = { kind: 'json' | 'xml'; output: string } | { kind: 'error'; message: string } | { kind: 'empty' }

function prettyXml(xml: string, indent = '  '): string {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const err = doc.querySelector('parsererror')
  if (err) throw new Error('XML 파싱 실패: ' + (err.textContent ?? '구문 오류'))
  const serialize = (node: Node, depth: number): string => {
    const pad = indent.repeat(depth)
    if (node.nodeType === Node.COMMENT_NODE) return `${pad}<!--${node.textContent}-->\n`
    if (node.nodeType === Node.CDATA_SECTION_NODE) return `${pad}<![CDATA[${node.textContent}]]>\n`
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent?.trim()
      return t ? `${pad}${t}\n` : ''
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return ''
    const el = node as Element
    const attrs = Array.from(el.attributes).map(a => ` ${a.name}="${a.value}"`).join('')
    const kids = Array.from(el.childNodes).filter(c => !(c.nodeType === Node.TEXT_NODE && !c.textContent?.trim()))
    if (kids.length === 0) return `${pad}<${el.tagName}${attrs}/>\n`
    if (kids.length === 1 && kids[0].nodeType === Node.TEXT_NODE) return `${pad}<${el.tagName}${attrs}>${kids[0].textContent?.trim()}</${el.tagName}>\n`
    let out = `${pad}<${el.tagName}${attrs}>\n`
    for (const kid of kids) out += serialize(kid, depth + 1)
    return out + `${pad}</${el.tagName}>\n`
  }
  const declMatch = xml.match(/^\s*<\?xml[^?]*\?>/i)
  let out = declMatch ? declMatch[0] + '\n' : ''
  for (const child of Array.from(doc.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE || child.nodeType === Node.COMMENT_NODE) out += serialize(child, 0)
  }
  return out.trimEnd()
}

function useScopedFind(text: string) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const matches = useMemo(() => {
    if (!query) return [] as number[]
    const idx: number[] = []
    const lower = text.toLowerCase()
    const q = query.toLowerCase()
    let from = 0
    while (true) {
      const i = lower.indexOf(q, from)
      if (i === -1) break
      idx.push(i)
      from = i + q.length
    }
    return idx
  }, [text, query])
  useEffect(() => setActiveIndex(0), [text, query])
  useEffect(() => {
    if (matches.length) setActiveIndex(i => Math.min(i, matches.length - 1))
    else setActiveIndex(0)
  }, [matches.length])
  return { query, setQuery, open, setOpen, activeIndex, setActiveIndex, matches }
}

function FormatPane({ title, text, onChange, readOnly = false }: {
  title: string; text: string; onChange?: (value: string) => void; readOnly?: boolean
}) {
  const find = useScopedFind(text)
  const highlightsRef = useRef<HTMLDivElement>(null)
  const findInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (find.open) findInputRef.current?.focus() }, [find.open])
  const syncScroll = (event: UIEvent<HTMLTextAreaElement>) => {
    if (!highlightsRef.current) return
    highlightsRef.current.scrollTop = event.currentTarget.scrollTop
    highlightsRef.current.scrollLeft = event.currentTarget.scrollLeft
  }
  const move = (direction: number) => {
    if (find.matches.length) find.setActiveIndex(i => (i + direction + find.matches.length) % find.matches.length)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault()
      find.setOpen(true)
    } else if (e.key === 'Escape' && find.open) {
      e.preventDefault()
      find.setOpen(false)
    }
  }
  const matchNodes = useMemo(() => {
    const children = []
    let cursor = 0
    find.matches.forEach((start, i) => {
      if (start > cursor) children.push(<span key={`text-${cursor}`}>{text.slice(cursor, start)}</span>)
      children.push(<mark key={`match-${start}`} className={i === find.activeIndex ? 'fmt-match-active' : ''}>{text.slice(start, start + find.query.length)}</mark>)
      cursor = start + find.query.length
    })
    if (cursor < text.length || children.length === 0) children.push(<span key={`text-${cursor}`}>{text.slice(cursor)}</span>)
    return children
  }, [text, find.matches, find.activeIndex, find.query.length])
  return <section className={readOnly ? 'fmt-output-pane' : 'fmt-input-pane'}>
    <label className="payload-builder-label">{title}</label>
    {find.open && <div className="fmt-find-bar">
      <input ref={findInputRef} aria-label={`${title} 안에서 찾기`} value={find.query} onChange={e => find.setQuery(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); move(e.shiftKey ? -1 : 1) } else if (e.key === 'Escape') find.setOpen(false) }} placeholder="찾기" />
      <span>{find.matches.length ? `${find.activeIndex + 1} / ${find.matches.length} 일치` : '0 일치'}</span>
      <button type="button" aria-label="이전 일치 항목" onClick={() => move(-1)}>↑</button>
      <button type="button" aria-label="다음 일치 항목" onClick={() => move(1)}>↓</button>
      <button type="button" aria-label="찾기 닫기" onClick={() => find.setOpen(false)}><X size={13}/></button>
    </div>}
    <div className="fmt-box">
      <div className="fmt-highlights" aria-hidden="true" ref={highlightsRef}>{matchNodes}</div>
      <textarea className="fmt-textarea" value={text} readOnly={readOnly} onChange={e => onChange?.(e.target.value)}
        onScroll={syncScroll} onKeyDown={onKeyDown} spellCheck={false} placeholder={readOnly ? '' : '{"key": "value"} 또는 <root>...</root>'} />
    </div>
  </section>
}

export function JsonXmlFormatterBuilder() {
  const [raw, setRaw] = useState('')
  const [copied, setCopied] = useState<boolean | 'error'>(false)
  const result = useMemo<FormatResult>(() => {
    const trimmed = raw.trim()
    if (!trimmed) return { kind: 'empty' }
    const attempts: ('xml' | 'json')[] = trimmed.startsWith('<') ? ['xml', 'json'] : ['json', 'xml']
    let error: unknown
    for (const kind of attempts) {
      try {
        if (kind === 'json') return { kind, output: JSON.stringify(JSON.parse(trimmed), null, 2) }
        return { kind, output: prettyXml(trimmed) }
      } catch (e) { error = e }
    }
    return { kind: 'error', message: error instanceof Error ? error.message : String(error) }
  }, [raw])
  const output = result.kind === 'json' || result.kind === 'xml' ? result.output : result.kind === 'error' ? result.message : ''
  const copy = async () => {
    if (!output || result.kind === 'error') return
    try { await navigator.clipboard.writeText(output); setCopied(true) } catch { setCopied('error') }
    window.setTimeout(() => setCopied(false), 1500)
  }
  return <div className="payload-builder fmt-builder">
    <Note>JSON/XML을 붙여넣으면 자동 감지해 들여쓰기합니다. 모든 처리는 이 브라우저 안에서만 일어납니다.</Note>
    <div className="fmt-verdict"><span className="fmt-verdict-label">감지 결과</span>
      {result.kind === 'empty' ? <span className="fmt-badge">대기</span> : result.kind === 'error' ? <span className="fmt-badge error">{result.message}</span> : <span className="fmt-badge">{result.kind.toUpperCase()}</span>}
    </div>
    <div className="fmt-workspace">
      <FormatPane title="입력" text={raw} onChange={setRaw}/>
      <section className="fmt-output-wrap">
        <FormatPane title="포맷된 결과" text={output} readOnly />
        <button className="cheatsheet-copy fmt-copy" onClick={() => void copy()} disabled={!output || result.kind === 'error'}><Clipboard size={14}/>{copied === 'error' ? '복사 실패' : copied ? '복사됨' : '복사'}</button>
      </section>
    </div>
  </div>
}
