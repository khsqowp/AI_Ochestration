import { useMemo, useState } from 'react'
import { Clipboard } from 'lucide-react'
import { ALL_DECODERS, identifyHash, HASH_PREFIX, jwtStep } from './decoder'
import { Note } from './shared'

// 탐색 비용과 화면 크기를 조정하려면 이 두 제한을 변경한다. 루트도 노드 수에 포함한다.
const MAX_DEPTH = 4
const MAX_NODES = 300

export interface DecodeNode {
  method: string
  value: string
  children: DecodeNode[]
  isLeaf: boolean
  looksReadable: boolean
  hashGuess?: { name: string; weak: boolean }[]
  isJwt?: boolean
  jwtParsed?: { header: unknown; payload: unknown }
}

const punctuation = new Set([...".,!?\"'-_:;()[]{}@#%&*+=/\\<>~`^|$"])
function looksReadable(value: string): boolean {
  const chars = [...value]
  if (!chars.length) return false
  const printable = chars.filter(c => /[\p{L}\p{N}]/u.test(c) || (c.codePointAt(0)! >= 32 && /\s/u.test(c)) || punctuation.has(c)).length
  return printable / chars.length >= 0.9
}

export function buildDecodeTree(input: string): { root: DecodeNode; truncated: boolean } {
  let count = 0
  let truncated = false
  function walk(value: string, method: string, depth: number, seen: Set<string>): DecodeNode {
    count++
    const node: DecodeNode = { method, value, children: [], isLeaf: true, looksReadable: looksReadable(value), hashGuess: identifyHash(value) }
    node.isJwt = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(value.trim())
    const jwt = jwtStep(value)
    if (jwt) node.jwtParsed = JSON.parse(jwt.decoded) as { header: unknown; payload: unknown }
    if (depth >= MAX_DEPTH) return node
    for (const [label, decode] of ALL_DECODERS) {
      if (truncated) break
      let decoded: string
      try { decoded = decode(value) } catch { continue }
      if (!decoded || decoded === value || seen.has(decoded)) continue
      if (count >= MAX_NODES) { truncated = true; break }
      const childSeen = new Set(seen)
      childSeen.add(decoded)
      node.children.push(walk(decoded, label, depth + 1, childSeen))
    }
    node.isLeaf = node.children.length === 0
    return node
  }
  const root = walk(input, '입력', 0, new Set([input]))
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

function TreeNode({ node, hide, readableLeaves }: { node: DecodeNode; hide: boolean; readableLeaves: Set<DecodeNode> }) {
  const [copied, setCopied] = useState<boolean | 'error'>(false)
  if (hide && !node.looksReadable && !readableLeaves.has(node)) return null
  return <details className={`dectree-node${node.looksReadable && node.isLeaf ? ' dectree-readable' : ''}`} open>
    <summary>
      <span className="dectree-method">{node.method}</span>
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
    {node.children.length > 0 && <div className="dectree-children">{node.children.map((child, i) => <TreeNode key={i} node={child} hide={hide} readableLeaves={readableLeaves}/>)}</div>}
  </details>
}

export function SmartDecoderTreeBuilder() {
  const [raw, setRaw] = useState('')
  const [hide, setHide] = useState(false)
  const result = useMemo(() => buildDecodeTree(raw), [raw])
  const readableLeaves = useMemo(() => indexReadableLeaves(result.root), [result.root])
  const count = useMemo(() => {
    const total = (node: DecodeNode): number => 1 + node.children.reduce((sum, child) => sum + total(child), 0)
    return total(result.root)
  }, [result.root])
  return <div className="payload-builder dectree-builder">
    <Note>가능한 디코딩 경로를 깊이 4, 최대 300개 노드까지 펼칩니다. 읽을 수 있는 리프는 초록색으로 강조합니다. 평문 판별과 해시 후보는 휴리스틱이며, 모든 처리는 이 브라우저 안에서만 일어납니다.</Note>
    <label className="payload-builder-label" htmlFor="dectree-input">입력</label>
    <textarea id="dectree-input" className="payload-builder-textarea" rows={3} value={raw} onChange={e => setRaw(e.target.value)} placeholder="Base64 / URL / Hex / HTML 엔티티 / JWT / 해시 …"/>
    <label className="dectree-filter"><input type="checkbox" checked={hide} onChange={e => setHide(e.target.checked)}/>읽을 수 있는 결과로 끝나지 않는 가지 숨기기</label>
    {raw && <>
      {result.truncated && <p className="dectree-warning" role="status">⚠ {count}개 노드에서 중단됨 (더 많은 디코딩 경로가 있을 수 있습니다)</p>}
      <TreeNode key={raw} node={result.root} hide={hide} readableLeaves={readableLeaves}/>
      {hide && !result.root.looksReadable && !readableLeaves.has(result.root) && <p>읽을 수 있는 결과가 없습니다.</p>}
    </>}
  </div>
}
