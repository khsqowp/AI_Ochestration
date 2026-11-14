import { useMemo, useState } from 'react'
import { Clipboard } from 'lucide-react'
import { ALL_DECODERS, CharsetSwitch, identifyHash, HASH_PREFIX, jwtStep } from './decoder'
import { type Charset, codecForLabel, labelCharset, reinterpretWithCharset } from './decoderCore'
import { Note } from './shared'

// 탐색 비용과 화면 크기를 조정하려면 이 두 제한을 변경한다. 루트도 노드 수에 포함한다.
const MAX_DEPTH = 4
const MAX_NODES = 300

export interface DecodeNode {
  method: string
  value: string
  /** 노드를 유일하게 식별하는 경로(루트부터 메서드 라벨을 ':'로 이어붙인 문자열). 문자셋
   * 재해석 오버라이드를 이 키로 저장한다. */
  path: string
  children: DecodeNode[]
  isLeaf: boolean
  looksReadable: boolean
  hashGuess?: { name: string; weak: boolean }[]
  isJwt?: boolean
  jwtParsed?: { header: unknown; payload: unknown }
  /** 이 노드가 바이트→텍스트 변환(Base64/Hex/URL 인코딩/EUC-KR 원문 재해석)으로 만들어졌을 때만
   * 존재. 지금 적용 중인 문자셋을 나타내며, 드롭다운으로 바꿀 수 있다. */
  flexibleCharset?: Charset
}

const punctuation = new Set([...".,!?\"'-_:;()[]{}@#%&*+=/\\<>~`^|$"])
function looksReadable(value: string): boolean {
  const chars = [...value]
  if (!chars.length) return false
  const printable = chars.filter(c => /[\p{L}\p{N}]/u.test(c) || (c.codePointAt(0)! >= 32 && /\s/u.test(c)) || punctuation.has(c)).length
  return printable / chars.length >= 0.9
}

export function buildDecodeTree(input: string, overrides: Record<string, Charset> = {}): { root: DecodeNode; truncated: boolean } {
  let count = 0
  let truncated = false
  function walk(value: string, method: string, depth: number, seen: Set<string>, path: string): DecodeNode {
    count++
    const node: DecodeNode = {
      method, value, path, children: [], isLeaf: true,
      looksReadable: looksReadable(value), hashGuess: identifyHash(value),
      flexibleCharset: codecForLabel(method) ? (overrides[path] ?? labelCharset(method)) : undefined,
    }
    node.isJwt = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(value.trim())
    const jwt = jwtStep(value)
    if (jwt) node.jwtParsed = JSON.parse(jwt.decoded) as { header: unknown; payload: unknown }
    if (depth >= MAX_DEPTH) return node
    for (const [label, decode] of ALL_DECODERS) {
      if (truncated) break
      const childPath = `${path}:${label}`
      const override = overrides[childPath]
      let decoded: string
      if (override && codecForLabel(label)) {
        const alt = reinterpretWithCharset(label, value, override)
        if (alt === null) continue
        decoded = alt
      } else {
        try { decoded = decode(value) } catch { continue }
      }
      if (!decoded || decoded === value || seen.has(decoded)) continue
      if (count >= MAX_NODES) { truncated = true; break }
      const childSeen = new Set(seen)
      childSeen.add(decoded)
      node.children.push(walk(decoded, label, depth + 1, childSeen, childPath))
    }
    node.isLeaf = node.children.length === 0
    return node
  }
  const root = walk(input, '입력', 0, new Set([input]), 'root')
  return { root, truncated }
}

function indexReadableLeaves(root: DecodeNode): Set<DecodeNode> {
  const ancestors = new Set<DecodeNode>()
  function visit(node: DecodeNode): boolean {
    let hasLeaf = node.isLeaf && node.looksReadable
    for (const child of node.children) if (visit(child)) hasLeaf = true
    if (hasLeaf) ancestors.add(node)
    return hasLeaf
  }
  visit(root)
  return ancestors
}

function TreeNode({ node, hide, readableLeaves, onReinterpret }: {
  node: DecodeNode; hide: boolean; readableLeaves: Set<DecodeNode>; onReinterpret: (path: string, charset: Charset) => void
}) {
  const [copied, setCopied] = useState<boolean | 'error'>(false)
  if (hide && !node.looksReadable && !readableLeaves.has(node)) return null
  return <details className={`dectree-node${node.looksReadable && node.isLeaf ? ' dectree-readable' : ''}`} open>
    <summary>
      <span className="dectree-method">{node.method}</span>
      {node.flexibleCharset && <CharsetSwitch charset={node.flexibleCharset} onChange={cs => onReinterpret(node.path, cs)}/>}
      <span className="dectree-preview" title={node.value}>{node.value.length > 80 ? `${node.value.slice(0, 80)}...` : node.value}</span>
      <button type="button" className="dectree-copy" aria-label="값 복사" onClick={async e => {
        e.preventDefault(); e.stopPropagation()
        try { await navigator.clipboard.writeText(node.value); setCopied(true) } catch { setCopied('error') }
        setTimeout(() => setCopied(false), 1200)
      }}><Clipboard size={12}/>{copied === 'error' ? '실패' : copied ? '복사됨' : '복사'}</button>
      {node.hashGuess?.map((hash, i) => <span key={i} className={`dec-hash-badge${hash.weak ? ' weak' : ''}`}>{hash.name}{hash.weak ? ' · 취약' : ''}</span>)}
      {node.isJwt && <span className="dectree-method">JWT</span>}
    </summary>
    {HASH_PREFIX.some(([re]) => re.test(node.value.trim())) && <p className="dectree-hash-note">해시 접두사 후보입니다. 해시는 단방향이며, 아래 변환이 원문 복원을 의미하지는 않습니다.</p>}
    {node.isJwt && node.jwtParsed && <div className="dectree-jwt"><strong>header</strong><pre>{JSON.stringify(node.jwtParsed.header, null, 2)}</pre><strong>payload</strong><pre>{JSON.stringify(node.jwtParsed.payload, null, 2)}</pre></div>}
    {node.children.length > 0 && <div className="dectree-children">{node.children.map((child, i) => <TreeNode key={i} node={child} hide={hide} readableLeaves={readableLeaves} onReinterpret={onReinterpret}/>)}</div>}
  </details>
}

export function SmartDecoderTreeBuilder() {
  const [raw, setRaw] = useState('')
  const [hide, setHide] = useState(false)
  const [overrides, setOverrides] = useState<Record<string, Charset>>({})
  const result = useMemo(() => buildDecodeTree(raw, overrides), [raw, overrides])
  const readableLeaves = useMemo(() => indexReadableLeaves(result.root), [result.root])
  const count = useMemo(() => {
    const total = (node: DecodeNode): number => 1 + node.children.reduce((sum, child) => sum + total(child), 0)
    return total(result.root)
  }, [result.root])

  const onReinterpret = (path: string, charset: Charset) => {
    setOverrides(prev => {
      const next: Record<string, Charset> = {}
      for (const k of Object.keys(prev)) if (!k.startsWith(`${path}:`)) next[k] = prev[k]
      next[path] = charset
      return next
    })
  }

  return <div className="payload-builder dectree-builder">
    <Note>가능한 디코딩 경로를 깊이 4, 최대 300개 노드까지 펼칩니다. 읽을 수 있는 리프는 초록색으로 강조합니다.
      Base64/Hex/URL 인코딩/EUC-KR 처럼 바이트를 문자셋으로 해석하는 단계는 옆의 드롭다운으로 UTF-8/EUC-KR을
      직접 바꿔볼 수 있고, 바꾸면 그 아래 가지가 새 해석으로 다시 펼쳐집니다. 평문 판별과 해시 후보는
      휴리스틱이며, 모든 처리는 이 브라우저 안에서만 일어납니다.</Note>
    <div className="dectree-workspace"><div className="dectree-input-pane"><label className="payload-builder-label" htmlFor="dectree-input">입력</label>
    <textarea id="dectree-input" className="payload-builder-textarea" rows={3} value={raw} onChange={e => { setRaw(e.target.value); setOverrides({}) }} placeholder="Base64 / URL / Hex / HTML 엔티티 / JWT / 해시 …"/>
    <label className="dectree-filter"><input type="checkbox" checked={hide} onChange={e => setHide(e.target.checked)}/>읽을 수 있는 결과로 끝나지 않는 가지 숨기기</label>
    </div><div className="dectree-result-pane" aria-label="디코딩 경로 트리">
    {raw && <>
      {result.truncated && <p className="dectree-warning" role="status">⚠ {count}개 노드에서 중단됨 (더 많은 디코딩 경로가 있을 수 있습니다)</p>}
      <TreeNode key={raw} node={result.root} hide={hide} readableLeaves={readableLeaves} onReinterpret={onReinterpret}/>
      {hide && !result.root.looksReadable && !readableLeaves.has(result.root) && <p>읽을 수 있는 결과가 없습니다.</p>}
    </>}
    {!raw && <div className="diag-result-empty">값을 입력하면 가능한 변환 경로가 여기에 표시됩니다. 큰 트리는 이 창 안에서 스크롤합니다.</div>}
    </div></div>
  </div>
}
