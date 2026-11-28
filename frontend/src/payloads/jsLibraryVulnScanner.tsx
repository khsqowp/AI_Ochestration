import { useMemo, useState } from 'react'
import { Note } from './shared'

type Finding = { library: string; version: string; advisory: string; summary: string; severity: string; fixed: string }
const DB: Finding[] = [
  { library: 'jquery', version: '0.0.0', fixed: '3.5.0', advisory: 'CVE-2020-11022 / CVE-2020-11023', summary: 'HTML 파싱 경로의 XSS 취약점', severity: 'High' },
  { library: 'lodash', version: '0.0.0', fixed: '4.17.12', advisory: 'CVE-2019-10744', summary: 'defaultsDeep의 프로토타입 오염', severity: 'High' },
  { library: 'handlebars', version: '0.0.0', fixed: '4.3.0', advisory: 'CVE-2019-19919', summary: '템플릿 실행 관련 취약점', severity: 'High' },
  { library: 'handlebars', version: '4.3.0', fixed: '4.5.3', advisory: 'CVE-2019-20920', summary: '템플릿 실행 관련 취약점', severity: 'High' },
  { library: 'moment', version: '0.0.0', fixed: '2.29.4', advisory: 'CVE-2022-24785 / CVE-2022-24784', summary: '경로 입력 처리의 ReDoS 위험', severity: 'High' },
  { library: 'bootstrap', version: '0.0.0', fixed: '4.3.1', advisory: 'CVE-2019-8331', summary: 'tooltip/popover의 XSS', severity: 'Medium' },
  { library: 'jquery-ui', version: '0.0.0', fixed: '1.13.0', advisory: 'CVE-2021-41182 / CVE-2021-41183 / CVE-2021-41184', summary: 'XSS 취약점', severity: 'High' },
]
function compare(a: string, b: string) { const x = a.split('.').map(Number); const y = b.split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0) } return 0 }
function scan(input: string): string[] {
  const candidates = new Map<string, string>()
  const add = (name: string, version: string) => { const key = name.toLowerCase().replace(/\.min$/, '').replace(/\.js$/, ''); candidates.set(`${key}@${version}`, `${key}@${version}`) }
  for (const m of input.matchAll(/\b([\w.-]+)@([0-9]+\.[0-9]+\.[0-9]+)\b/g)) add(m[1], m[2])
  for (const m of input.matchAll(/(?:^|[\s/])([\w.-]+?)[-_.]v?([0-9]+\.[0-9]+\.[0-9]+)(?:\.min)?\.js\b/gi)) add(m[1], m[2])
  for (const m of input.matchAll(/(?:\/\*!?\s*|\*\s*)(jQuery|jquery-ui|lodash|Handlebars|Moment(?:\.js)?|Bootstrap|AngularJS|Prototype(?:\.js)?|SheetJS)[^\n]*?v?([0-9]+\.[0-9]+\.[0-9]+)/gi)) add(m[1], m[2])
  return [...candidates.values()].map(value => {
    const [name, version] = value.split('@'); const matches = DB.filter(item => item.library === name && compare(version, item.fixed) < 0)
    if ((name === 'angularjs' || name === 'angular') && version.split('.')[0] === '1') return `${value}: AngularJS 1.x EOL · 유지보수 종료, 알려진 sandbox 우회 취약점 계열 존재`
    if (!matches.length) return `${value}: DB에 없음(최신이거나 미등록)`
    return `${value}: ${matches.map(item => `${item.advisory} · ${item.severity} · ${item.summary} (영향 버전 < ${item.fixed})`).join(' / ')}`
  })
}
export function JsLibraryVulnScannerBuilder() {
  const [input, setInput] = useState('')
  const result = useMemo(() => scan(input), [input])
  return <div className="payload-builder fmt-builder"><Note>파일명·배너·library@version을 휴리스틱으로 찾습니다. AngularJS는 1.x가 EOL입니다. 내장 DB 최종 업데이트: 2026-11-28 — 이후 공개된 CVE는 반영되지 않음, 참고용으로만 사용</Note><div className="fmt-workspace"><section className="fmt-input-pane"><label className="payload-builder-label">HTML, 스크립트 URL, 버전 또는 배너</label><div className="fmt-box"><textarea className="fmt-textarea js-library-vuln-input" value={input} onChange={e => setInput(e.target.value)} spellCheck={false} placeholder={'<script src="/js/jquery-1.11.3.min.js"></script>'}/></div></section><section className="fmt-output-pane"><label className="payload-builder-label">라이브러리 및 권고</label><div className="fmt-box"><textarea className="fmt-textarea" value={result.join('\n') || (input.trim() ? '라이브러리/버전 후보를 찾지 못했습니다.' : '')} readOnly spellCheck={false}/></div></section></div></div>
}
