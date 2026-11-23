import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const html = readFileSync(new URL('../public/diagnostics-fixtures/route-tree-tools/common-path-checklist.html', import.meta.url), 'utf8')
const categoryMatch = html.match(/const CATEGORIES = (\[[\s\S]*?\n\]);\n\nconst \$ =/)
const categories = categoryMatch ? new Function(`return ${categoryMatch[1]}`)() as { title: string; paths: string[] }[] : []
const collectMatch = html.match(/function collectSelectedPaths\([\s\S]*?\n\}/)
const collectSelectedPaths = collectMatch ? new Function(`${collectMatch[0]}; return collectSelectedPaths;`)() as (categories: { paths: string[] }[], selected: boolean[]) => string[] : null

describe('common path checklist presets', () => {
  it.each([
    '운영체제 · Linux/Unix 웹 서버', '운영체제 · Windows/IIS',
    '프런트엔드 · React/CRA', '프런트엔드 · Vue/Vite', '프런트엔드 · Angular', '프런트엔드 · Next.js',
    '백엔드 · Node.js/Express', '백엔드 · Node.js/NestJS', '백엔드 · Python/Django·FastAPI',
    '백엔드 · Go', '백엔드 · .NET/ASP.NET Core',
  ])('includes a selectable %s preset', title => {
    expect(categories.find(category => category.title === title)?.paths.length).toBeGreaterThan(0)
  })

  it('keeps each preset as a list of unique non-empty paths', () => {
    expect(categories.length).toBeGreaterThan(0)
    for (const category of categories) {
      expect(category.paths.every(path => typeof path === 'string' && path.trim().length > 0), category.title).toBe(true)
      expect(new Set(category.paths).size, category.title).toBe(category.paths.length)
    }
  })

  it('keeps the standalone browser script syntactically valid', () => {
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1]
    expect(script).toBeTruthy()
    expect(() => new Function(script ?? '')).not.toThrow()
  })

  it('deduplicates selected paths while retaining category order', () => {
    expect(collectSelectedPaths).not.toBeNull()
    expect(collectSelectedPaths?.([{ paths: ['api/', 'health'] }, { paths: ['health', 'metrics'] }], [true, true]))
      .toEqual(['api/', 'health', 'metrics'])
  })
})
