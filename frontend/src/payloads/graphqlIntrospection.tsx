import { useMemo, useState } from 'react'
import { Note } from './shared'

type Field = { name: string; args?: { name: string }[]; type?: { name?: string | null; kind?: string; ofType?: unknown } }
type TypeDef = { name: string; kind: string; fields?: Field[]; enumValues?: { name: string }[] }

function namedType(type: any): string { return type?.name || namedType(type?.ofType) }
function parseSchema(input: string): TypeDef[] {
  try {
    const data = JSON.parse(input)
    const schema = data.data?.__schema ?? data.__schema
    if (!schema) throw new Error('Introspection JSON에 __schema가 없습니다.')
    const roots = new Map([[schema.queryType?.name, 'Query'], [schema.mutationType?.name, 'Mutation']])
    return (schema.types ?? []).map((type: TypeDef) => roots.has(type.name) ? { ...type, name: roots.get(type.name)! } : type)
  } catch (error) {
    if (input.trim().startsWith('{')) throw error
    const types: TypeDef[] = []
    const pattern = /\b(type|input|enum)\s+(\w+)[^{]*\{([^}]*)\}/g
    for (const match of input.matchAll(pattern)) {
      const fields = match[3].split(/[\n,]/).map(line => line.trim()).filter(Boolean).map(line => {
        const field = line.match(/^(\w+)(?:\([^)]*\))?\s*:\s*([\w!\[\]]+)/)
        return field ? { name: field[1], type: { name: field[2].replace(/[!\[\]]/g, '') } } : null
      }).filter(Boolean) as Field[]
      types.push({ name: match[2], kind: match[1].toUpperCase(), fields })
    }
    if (!types.length) throw new Error('Introspection JSON 또는 파싱 가능한 SDL type 정의를 입력하세요.')
    return types
  }
}
function render(input: string): string {
  if (!input.trim()) return ''
  const types = parseSchema(input)
  const byName = new Map(types.map(type => [type.name, type]))
  const roots = types.filter(type => ['Query', 'Mutation'].includes(type.name))
  const output: string[] = []
  for (const root of roots) {
    for (const field of root.fields ?? []) {
      const sensitive = /password|token|secret|key|admin|credential/i.test(field.name)
      const args = (field.args ?? []).map(arg => `${arg.name}: "<${arg.name}>"`).join(', ')
      let body = ''
      const walk = (name: string, depth: number, seen: Set<string>): string => {
        const type = byName.get(name)
        const children = (type?.fields ?? []).filter(child => !child.name.startsWith('__'))
        if (!children.length || depth > 3 || seen.has(name)) return ''
        const nextSeen = new Set(seen).add(name)
        return `{\n${children.map(child => {
          const childType = namedType(child.type)
          const nested = walk(childType, depth + 1, nextSeen)
          const marker = /password|token|secret|key|admin|credential/i.test(child.name) ? ' [SENSITIVE]' : ''
          return `  ${child.name}${marker}${nested ? ` ${nested}` : ''}`
        }).join('\n')}\n}`
      }
      const nested = walk(namedType(field.type), 1, new Set([root.name]))
      body = nested ? ` ${nested}` : ''
      output.push(`# ${root.name === 'Mutation' ? 'mutation' : 'query'} ${field.name}${sensitive ? ' [SENSITIVE]' : ''}\n${root.name === 'Mutation' ? 'mutation' : 'query'} {\n  ${field.name}${args ? `(${args})` : ''}${body}\n}`)
    }
  }
  if (!output.length) throw new Error('Query 또는 Mutation 루트 타입/필드를 찾지 못했습니다.')
  return output.join('\n\n')
}
export function GraphqlIntrospectionBuilder() {
  const [input, setInput] = useState('')
  const result = useMemo(() => { try { return render(input) } catch (error) { return error instanceof Error ? `오류: ${error.message}` : '스키마 파싱 실패' } }, [input])
  return <div className="payload-builder fmt-builder"><Note>스키마는 브라우저 안에서만 처리됩니다. 민감 필드는 [SENSITIVE]로 표시됩니다.</Note><div className="fmt-workspace"><section className="fmt-input-pane"><label className="payload-builder-label">Introspection JSON 또는 SDL</label><div className="fmt-box"><textarea className="fmt-textarea graphql-input" value={input} onChange={e => setInput(e.target.value)} spellCheck={false} placeholder="GraphQL schema 입력"/></div></section><section className="fmt-output-pane"><label className="payload-builder-label">Query / Mutation 템플릿</label><div className="fmt-box"><textarea className="fmt-textarea" value={result} readOnly spellCheck={false}/></div></section></div></div>
}
