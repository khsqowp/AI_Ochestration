import { Component, lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Clipboard, X } from 'lucide-react'
import type { MarkdownDoc, Notice } from '../lib/types'
import { NOTE_PROMPT_TEMPLATE, PIXEL_INK, PIXEL_SKIN, documentTitle, domainLabel } from '../lib/util'

// 2초 주기 폴링(작업 진행표 등)이 이 뷰어를 포함한 상위 컴포넌트를 다시 마운트시킬 수 있는데, 그때마다
// mermaid.render()를 처음부터 다시 돌리면 빈 화면 -> SVG로 매번 깜빡인다. 같은 코드는 캐시에서 즉시 채워
// 넣어 깜빡임을 없애고, mermaid.initialize()도 전역에서 한 번만 실행해 동시 렌더링 시 상태 충돌을 막는다.
const mermaidSvgCache = new Map<string, string>()
let mermaidInitialized: Promise<typeof import('mermaid').default> | null = null
function loadMermaid() {
  if (!mermaidInitialized) {
    mermaidInitialized = import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'strict' })
      return mermaid
    })
  }
  return mermaidInitialized
}
let mermaidIdCounter = 0
function MermaidBlock({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const cached = mermaidSvgCache.get(code)
    if (cached) { if (ref.current) ref.current.innerHTML = cached; return }
    loadMermaid().then(async mermaid => {
      try {
        const { svg } = await mermaid.render(`mermaid-${mermaidIdCounter++}`, code)
        mermaidSvgCache.set(code, svg)
        if (!cancelled && ref.current) ref.current.innerHTML = svg
      } catch (renderError) {
        if (!cancelled) setError(renderError instanceof Error ? renderError.message : String(renderError))
      }
    })
    return () => { cancelled = true }
  }, [code])

  if (error) return <pre className="mermaid-error">다이어그램 렌더링 실패: {error}{'\n\n'}{code}</pre>
  return <div className="mermaid-diagram" ref={ref}/>
}

export const MarkdownBody = lazy(() =>
  // rehype-raw makes react-markdown actually render embedded HTML tags (e.g. a bare <br> inside a table
  // cell) instead of showing them as literal text -- react-markdown ignores raw HTML by default. Some
  // archived notes are built from COLLECTION-origin scraped web content, so raw HTML can't just be trusted;
  // rehype-sanitize runs right after to strip anything dangerous (script tags, event handler attributes,
  // etc.) while keeping safe formatting tags like <br>/<table>.
  Promise.all([import('react-markdown'), import('remark-gfm'), import('rehype-raw'), import('rehype-sanitize')]).then(([reactMarkdown, remarkGfmModule, rehypeRawModule, rehypeSanitizeModule]) => ({
    default: ({ children }: { children: string }) => {
      const ReactMarkdown = reactMarkdown.default
      return <ReactMarkdown remarkPlugins={[remarkGfmModule.default]} rehypePlugins={[rehypeRawModule.default, rehypeSanitizeModule.default]} components={{
        code({ className, children: codeChildren }) {
          if (className === 'language-mermaid') return <MermaidBlock code={String(codeChildren).replace(/\n$/, '')}/>
          return <code className={className}>{codeChildren}</code>
        },
      }}>{children}</ReactMarkdown>
    },
  }))
)

export function DocumentCard({ doc }: { doc: MarkdownDoc }) {
  const fm = doc.frontMatter
  return <article className="markdown-document">
    <header className="doc-properties">
      <h1>{documentTitle(doc)}</h1>
      <div className="doc-pills">
        {fm.domain && <span className={`pill domain-pill domain-${fm.domain.toLowerCase()}`}>{domainLabel(fm.domain)}</span>}
        {fm.topic && <span className="pill topic-pill">{fm.topic}</span>}
        {fm.date && <span className="pill date-pill">{fm.date}</span>}
        {fm.tags.filter(tag => tag !== 'orchestration').map(tag => <span className="pill tag-pill" key={tag}>#{tag}</span>)}
      </div>
    </header>
    <Suspense fallback={null}><MarkdownBody>{doc.body}</MarkdownBody></Suspense>
  </article>
}

export function PixelAgent({ id, color, size = 26 }: { id: string; color: string; size?: number }) {
  const accessory = (() => {
    switch (id) {
      case 'pm': return <>
        <polygon points="4.5,5 5.5,5 5,7.2" fill={PIXEL_INK}/>
        <rect x="7.8" y="7" width="1.8" height="1.8" fill="#5c4a2e"/>
      </>
      case 'security-lead': return <>
        <rect x="3" y="3" width="4" height="1" fill="#222"/>
        <polygon points="4,6 6,6 6,7.4 5,8.4 4,7.4" fill="#f4d35e"/>
      </>
      case 'economy-lead': return <>
        <polygon points="4,4.7 5,5 4,5.3" fill={PIXEL_INK}/>
        <polygon points="6,4.7 5,5 6,5.3" fill={PIXEL_INK}/>
        <circle cx="8.3" cy="7.8" r="0.7" fill="#f4d35e" stroke="#b8860b" strokeWidth="0.1"/>
      </>
      case 'security-scout': return <>
        <rect x="2.5" y="0.5" width="5" height="1" fill="#4a4a4a"/>
        <circle cx="4" cy="2.3" r="0.6" fill="#333"/>
        <circle cx="6" cy="2.3" r="0.6" fill="#333"/>
      </>
      case 'economy-scout': return <>
        <rect x="3" y="0.7" width="4" height="0.6" fill="#333"/>
        <rect x="7.3" y="7" width="1.8" height="1.8" fill="#5c4a2e"/>
      </>
      case 'general-scout': return <>
        <rect x="1" y="5.5" width="1.4" height="3" fill="#6b4f2a"/>
        <circle cx="8.3" cy="6" r="0.7" fill="#e8e8e8" stroke="#333" strokeWidth="0.1"/>
      </>
      case 'general-lead': return <>
        <rect x="3" y="1.8" width="4" height="0.6" fill="#fff"/>
        <polygon points="8.2,5.6 8.5,6.2 9.1,6.3 8.6,6.7 8.7,7.3 8.2,7 7.7,7.3 7.8,6.7 7.3,6.3 7.9,6.2" fill="#ffd23f"/>
      </>
      case 'review-a': return <>
        <rect x="3.7" y="2.7" width="1.2" height="1.2" fill="none" stroke={PIXEL_INK} strokeWidth="0.15"/>
        <rect x="5.1" y="2.7" width="1.2" height="1.2" fill="none" stroke={PIXEL_INK} strokeWidth="0.15"/>
        <line x1="4.9" y1="3.3" x2="5.1" y2="3.3" stroke={PIXEL_INK} strokeWidth="0.15"/>
      </>
      case 'review-b': return <>
        <circle cx="5.8" cy="3.3" r="0.75" fill="none" stroke={PIXEL_INK} strokeWidth="0.15"/>
        <line x1="6.3" y1="3.9" x2="7" y2="6" stroke={PIXEL_INK} strokeWidth="0.1"/>
      </>
      case 'archivist': return <>
        <rect x="3.5" y="6.5" width="1.6" height="1.4" fill="#8a5a44"/>
        <rect x="5" y="6.5" width="1.6" height="1.4" fill="#a8735a"/>
        <line x1="5" y1="6.5" x2="5" y2="7.9" stroke="#4a2f22" strokeWidth="0.1"/>
      </>
      default: return null
    }
  })()
  return <svg width={size} height={size * 1.2} viewBox="0 0 10 12" shapeRendering="crispEdges" aria-hidden="true">
    <rect x="1" y="5" width="1" height="2" fill={color}/>
    <rect x="8" y="5" width="1" height="2" fill={color}/>
    <rect x="2" y="5" width="6" height="4" fill={color}/>
    <rect x="3" y="9" width="2" height="3" fill={PIXEL_INK}/>
    <rect x="5" y="9" width="2" height="3" fill={PIXEL_INK}/>
    <rect x="3" y="1" width="4" height="4" fill={PIXEL_SKIN}/>
    <rect x="4" y="3" width="1" height="1" fill={PIXEL_INK}/>
    <rect x="5" y="3" width="1" height="1" fill={PIXEL_INK}/>
    {accessory}
  </svg>
}

export function NotificationStack({ notices, onDismiss }: { notices: Notice[]; onDismiss: (id: string) => void }) {
  if (notices.length === 0) return null
  return <div className="notification-stack">{notices.map(notice => <article key={notice.id} className={`notice notice-${notice.kind}`} onClick={() => onDismiss(notice.id)}><p>{notice.message}</p></article>)}</div>
}

export class ErrorBoundary extends Component<{ label: string; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: unknown) { console.error('panel_render_failed', this.props.label, error) }
  render() {
    if (this.state.failed) {
      return <div className="trading-status-card"><span className="status-pill deprecated">표시 오류</span>
        <p>{this.props.label} 화면을 그리는 중 오류가 났습니다. 데이터는 정상일 수 있으니 새로고침해 보세요.</p></div>
    }
    return this.props.children
  }
}

// 봇 운영 상태 → 색: 가동중=초록(live), 폐기=빨강(deprecated), 일시정지=회색(paused).
export type BotTone = 'live' | 'deprecated' | 'paused'
export function BotStatusPill({ tone, label }: { tone: BotTone; label: string }) {
  return <span className={`status-pill ${tone}`}>{label}</span>
}

/** 패널의 바깥 요소만 바꾸는 얇은 래퍼 — 헤더/내용은 각 패널이 그대로 그린다.
 * embedded=true 면 흐름 안 <div class="panel-embedded …">, 아니면 우측 고정 <aside …>. */
export function PanelShell({ embedded, className, children }: { embedded?: boolean; className?: string; children: React.ReactNode }) {
  if (embedded) return <div className={`panel-embedded ${className ?? ''}`}>{children}</div>
  return <aside className={className} role="dialog" aria-modal="true">{children}</aside>
}

/** 모달 패널을 페이지 본문으로도 쓸 수 있게 하는 래퍼. embedded=true 면 흐름 안 <div>,
 * 아니면 우측 고정 <aside side-modal>. 기존 trading `Wrap` 을 일반화한 것. */
export function PanelFrame({ embedded, onClose, eyebrow, title, className, children }: {
  embedded?: boolean; onClose?: () => void; eyebrow: string; title: string; className?: string; children: React.ReactNode
}) {
  if (embedded) return <div className={`panel-embedded ${className ?? ''}`}>{children}</div>
  return <aside className={`side-modal ${className ?? ''}`} role="dialog" aria-modal="true">
    <div className="sheet-header"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>
      {onClose && <button className="sheet-close" onClick={onClose}><X size={18}/></button>}</div>
    {children}
  </aside>
}

export function NotePromptBuilder() {
  const [topic, setTopic] = useState('')
  const [copied, setCopied] = useState(false)
  const prompt = NOTE_PROMPT_TEMPLATE(topic.trim())
  const copy = async () => { await navigator.clipboard.writeText(prompt); setCopied(true); window.setTimeout(() => setCopied(false), 1500) }
  return <div>
    <label className="cheatsheet-option">
      <span className="cheatsheet-option-body">
        <span className="cheatsheet-option-head"><b>주제</b></span>
        <input className="cheatsheet-option-value" value={topic} onChange={event => setTopic(event.target.value)} placeholder="예: SSRF 취약점"/>
      </span>
    </label>
    <div className="cheatsheet-command-bar">
      <pre className="cheatsheet-command">{prompt}</pre>
      <button className="cheatsheet-copy" onClick={copy}><Clipboard size={14}/>{copied ? '복사됨' : '복사'}</button>
    </div>
  </div>
}
