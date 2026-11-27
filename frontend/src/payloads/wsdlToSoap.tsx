import { useMemo, useState } from 'react'
import { Note } from './shared'

function templates(input: string) {
  if (!input.trim()) return ''
  const doc = new DOMParser().parseFromString(input, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('WSDL XML 파싱에 실패했습니다.')
  const ops = Array.from(doc.getElementsByTagNameNS('*', 'operation')).filter(el => el.hasAttribute('name'))
  if (!ops.length) throw new Error('WSDL operation을 찾지 못했습니다.')
  const messages = Array.from(doc.getElementsByTagNameNS('*', 'message'))
  const actions: string[] = []
  for (const op of ops) {
    const name = op.getAttribute('name')!
    const inputName = op.getElementsByTagNameNS('*', 'input')[0]?.getAttribute('message')?.split(':').pop()
    const msg = messages.find(item => item.getAttribute('name') === inputName)
    const params = msg ? Array.from(msg.getElementsByTagNameNS('*', 'part')).map(part => part.getAttribute('name')).filter(Boolean) as string[] : []
    const body = params.length ? params.map(param => `      <${param}>${param}Value</${param}>`).join('\n') : '      <!-- parameters unavailable in WSDL; fill request fields manually -->'
    for (const version of ['1.1', '1.2']) {
      const ns = version === '1.1' ? 'http://schemas.xmlsoap.org/soap/envelope/' : 'http://www.w3.org/2003/05/soap-envelope'
      actions.push(`${name} · SOAP ${version}\n<soap:Envelope xmlns:soap="${ns}">\n  <soap:Header/>\n  <soap:Body>\n    <${name}>\n${body}\n    </${name}>\n  </soap:Body>\n</soap:Envelope>`)
    }
  }
  return actions.join('\n\n')
}
export function WsdlToSoapBuilder() {
  const [input, setInput] = useState('')
  const result = useMemo(() => { try { return templates(input) } catch (error) { return `오류: ${error instanceof Error ? error.message : 'WSDL 파싱 실패'}` } }, [input])
  return <div className="payload-builder fmt-builder"><Note>WSDL은 브라우저 안에서만 처리됩니다. operation과 최상위 message part를 기준으로 샘플 envelope를 생성합니다.</Note><div className="fmt-workspace"><section className="fmt-input-pane"><label className="payload-builder-label">WSDL XML</label><div className="fmt-box"><textarea className="fmt-textarea wsdl-input" value={input} onChange={e => setInput(e.target.value)} spellCheck={false}/></div></section><section className="fmt-output-pane"><label className="payload-builder-label">SOAP 1.1 / 1.2 Envelopes</label><div className="fmt-box"><textarea className="fmt-textarea" value={result} readOnly spellCheck={false}/></div></section></div></div>
}
