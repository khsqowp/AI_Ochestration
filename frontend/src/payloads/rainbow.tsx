import { useEffect, useMemo, useRef, useState } from 'react'
import { Clipboard, CheckCircle2, XCircle, Cpu } from 'lucide-react'
import { Note } from './shared'
import { HASH_PREFIX, identifyHash } from './decoder'
import {
  type AlgoId, ALGO_LABEL, ALL_ALGOS, HASH_LENGTH_TO_ALGOS, subtleAvailable,
  md5Hex, ntlmHex, crc32Hex, hashWith,
} from './hashCore'

/* 레인보우 테이블 해시 크랙 — 단일 해시 세 방향 + 여러 해시 순차 배치.
   1) 원본값 → 해시: 평문을 넣으면 MD5/NTLM/SHA1/SHA256/SHA384/SHA512/CRC32 를 즉시 계산한다
      (비교용 해시값을 같이 넣으면 일치하는 알고리즘을 표시 — "이 평문이 이 해시가 맞는지" 검증).
   2) 해시 → 원본값(사전): 해시값을 넣으면 길이로 알고리즘 후보를 좁히고, 내장 사전(흔한 취약
      비밀번호 + 대소문자·자릿수·연도·리트스피크 변형)과 대조해 일치하는 평문을 찾는다.
   3) 해시 → 원본값(브루트포스): 사전에도 없으면 문자셋·길이를 지정해 진짜 전수조사한다 — CPU 코어
      수만큼 Web Worker 를 띄워 키스페이스를 나눠 병렬로 돌린다(navigator.hardwareConcurrency).
   실제 레인보우 테이블은 축소함수(reduction function)로 체인을 저장해 저장공간을 아끼는 게 핵심이지만,
   브라우저 데모에서는 그 공간 절약이 의미 없어(디스크에 안 쌓아두니) 후보를 그때그때 해시해 대조한다
   — 크랙 결과는 동일하다. 전부 이 브라우저 안에서만 계산되고, 어떤 요청도 밖으로 나가지 않는다. */

/* ── 사전(=레인보우 테이블 대용): 흔한 취약 비밀번호/단어 기반 + 대소문자·자릿수·연도·리트스피크로 확장 ──
   실제 유출 데이터베이스를 담지 않는다 — 공개적으로 "가장 흔한 비밀번호"로 널리 알려진 패턴만 사용한다. */
const BASE_WORDS = [
  'password', 'passw0rd', 'p@ssword', 'p@ssw0rd', '123456', '12345678', '123456789', '1234567890', '1234', '12345',
  '111111', '000000', '654321', '121212', '112233', '1122334455',
  'qwerty', 'qwerty123', 'qwertyuiop', 'qazwsx', 'asdfgh', 'asdf1234', 'zxcvbn', 'zxcvbnm', '1qaz2wsx', 'zaq1zaq1', '1q2w3e4r', '1q2w3e', 'q1w2e3r4',
  'admin', 'administrator', 'root', 'toor', 'letmein', 'letmein123', 'welcome', 'welcome1', 'monkey', 'dragon', 'master', 'iloveyou',
  'football', 'baseball', 'basketball', 'soccer', 'superman', 'batman', 'trustno1', 'sunshine', 'starwars', 'skywalker',
  'princess', 'login', 'shadow', 'michael', 'jennifer', 'jordan', 'hunter', 'hunter2', 'freedom', 'ranger', 'buster',
  'whatever', 'summer', 'winter', 'spring', 'autumn', 'flower', 'orange', 'purple', 'ninja', 'pepper', 'cookie', 'chocolate',
  'abc123', 'abcd1234', 'a1b2c3', 'q1w2e3', 'changeme', 'default', 'guest', 'guest123', 'test', 'test123', 'test1234',
  'user', 'user123', 'demo', 'demo123', 'temp', 'temp123', 'secret', 'secret123', 'access', 'system', 'server', 'internet',
  'company', 'office', 'project', 'manager', 'service', 'support', 'backup', 'security', 'password1', 'password123',
  'love', 'lovely', 'money', 'family', 'friend', 'friends', 'happy', 'happiness', 'lucky', 'angel', 'baby', 'sweetie',
  'korea', 'seoul', 'busan', 'incheon', 'apple', 'google', 'naver', 'kakao', 'samsung', 'hyundai', 'lg', 'sk',
  'ilovegod', 'jesus', 'christ', 'buddha', 'peace', 'liberty', 'freedom1', 'america', 'newyork', 'london', 'tokyo',
  'iloveyou1', 'lovers', 'forever', 'always', 'destiny', 'phoenix', 'dragon1', 'tiger', 'eagle', 'wolf', 'lion',
  'computer', 'internet1', 'network', 'firewall', 'gateway', 'router', 'database', 'website', 'developer', 'engineer',
  'smith', 'johnson', 'williams', 'brown', 'jones', 'garcia', 'miller', 'davis', 'kim', 'lee', 'park', 'choi', 'jung',
]
const NUMERIC_SUFFIXES = ['', '1', '01', '007', '12', '21', '22', '23', '69', '77', '88', '99', '00', '0000', '123', '1234', '12345', '123456']
const YEAR_SUFFIXES = Array.from({ length: 2031 - 1980 }, (_, i) => String(1980 + i))
const SPECIAL_SUFFIXES = ['!', '!!', '@', '#', '$', '*', '1!', '!1', '#1', '@1']
const SUFFIXES = [...NUMERIC_SUFFIXES, ...YEAR_SUFFIXES, ...SPECIAL_SUFFIXES]
/** 흔한 리트스피크(leetspeak) 치환 — 모든 조합을 다 만들면 사전이 아니라 무차별대입이 돼버리니
 * 실사용 빈도가 높은 치환 한 세트만 적용한다. */
function leetVariant(word: string): string {
  return word.replace(/a/g, '@').replace(/e/g, '3').replace(/i/g, '1').replace(/o/g, '0').replace(/s/g, '$')
}
const WORDLIST: string[] = (() => {
  const out = new Set<string>()
  for (const w of BASE_WORDS) {
    const cap = w.charAt(0).toUpperCase() + w.slice(1)
    const leet = leetVariant(w)
    for (const base of [w, cap, w.toUpperCase(), leet]) {
      out.add(base)
      for (const suf of SUFFIXES) out.add(base + suf)
    }
  }
  return [...out]
})()
/** 선택 시에만 추가되는 숫자 PIN 전수조사 — 사전이 아니라 진짜 무차별대입이라 기본은 꺼둔다. */
function numericPins(maxDigits: 4 | 5 | 6): string[] {
  const out: string[] = []
  for (let len = 4; len <= maxDigits; len++) {
    const max = 10 ** len
    for (let i = 0; i < max; i++) out.push(String(i).padStart(len, '0'))
  }
  return out
}

/* ── UI 공용 ── */

function HashRow({ label, value, matched, pending }: { label: string; value: string; matched?: boolean; pending?: boolean }) {
  const [copied, setCopied] = useState<boolean | 'error'>(false)
  return <div className={`dec-row ${matched ? 'matched' : ''}`}>
    <span className="dec-row-name">{label}{matched && <CheckCircle2 size={12} className="dec-row-match-icon"/>}</span>
    <input className="dec-row-val" readOnly value={pending ? '계산 중…' : value} onFocus={e => e.currentTarget.select()}/>
    <button className="dec-row-copy" onClick={async () => { if (!value) return; try { await navigator.clipboard.writeText(value); setCopied(true) } catch { setCopied('error') } setTimeout(() => setCopied(false), 1200) }}>
      <Clipboard size={12}/>{copied === 'error' ? '실패' : copied ? '됨' : ''}
    </button>
  </div>
}

function fmtInt(n: number): string { return n.toLocaleString('ko-KR') }
function fmtBig(n: number): string {
  if (n < 1e6) return fmtInt(Math.round(n))
  if (n < 1e9) return `약 ${(n / 1e6).toFixed(1)}백만`
  if (n < 1e12) return `약 ${(n / 1e9).toFixed(1)}십억`
  return n.toExponential(2)
}
function fmtDuration(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '?'
  if (sec < 60) return `${sec.toFixed(0)}초`
  if (sec < 3600) return `${(sec / 60).toFixed(1)}분`
  if (sec < 86400) return `${(sec / 3600).toFixed(1)}시간`
  return `${(sec / 86400).toFixed(1)}일`
}

function GenerateMode() {
  const [plain, setPlain] = useState('')
  const [compareHash, setCompareHash] = useState('')
  const [hashes, setHashes] = useState<Partial<Record<AlgoId, string>>>({})
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!plain) { setHashes({}); return }
    let cancelled = false
    setPending(true)
    const sync: Partial<Record<AlgoId, string>> = { md5: md5Hex(plain), ntlm: ntlmHex(plain), crc32: crc32Hex(plain) }
    setHashes(sync)
    ;(async () => {
      const results: Partial<Record<AlgoId, string>> = { ...sync }
      if (subtleAvailable) {
        for (const algo of ['sha1', 'sha256', 'sha384', 'sha512'] as AlgoId[]) results[algo] = await hashWith(algo, plain)
      }
      if (!cancelled) { setHashes(results); setPending(false) }
    })()
    return () => { cancelled = true }
  }, [plain])

  const compareNorm = compareHash.trim().toLowerCase()
  const matchedAlgo = compareNorm ? (Object.entries(hashes).find(([, v]) => v?.toLowerCase() === compareNorm)?.[0] as AlgoId | undefined) : undefined

  return <>
    <label className="payload-builder-label">원본값(평문)</label>
    <input className="payload-builder-input" value={plain} onChange={e => setPlain(e.target.value)} placeholder="예: password123"/>
    <label className="payload-builder-label">비교할 해시값 <small>(선택 — 이 평문이 그 해시가 맞는지 검증)</small></label>
    <input className="payload-builder-input" value={compareHash} onChange={e => setCompareHash(e.target.value)} placeholder="여기에 해시를 넣으면 아래에서 일치하는 알고리즘을 표시합니다"/>
    {plain && <div className="dec-verdict" style={{ marginTop: 10 }}>
      {compareNorm && (matchedAlgo
        ? <span className="dec-hash-badge match">일치: {ALGO_LABEL[matchedAlgo]}</span>
        : <span className="dec-hash-badge weak">일치하는 알고리즘 없음</span>)}
    </div>}
    {plain && <div style={{ marginTop: 8 }}>
      {ALL_ALGOS.map(algo => <HashRow key={algo} label={ALGO_LABEL[algo]} value={hashes[algo] ?? ''} matched={matchedAlgo === algo}
        pending={pending && algo !== 'md5' && algo !== 'ntlm' && algo !== 'crc32' && !hashes[algo]}/>)}
    </div>}
    {!subtleAvailable && <p className="dec-hash-note">이 연결에서는 SHA 계열을 계산할 수 없습니다(HTTPS 또는 localhost 필요) — MD5/NTLM/CRC32만 표시됩니다.</p>}
  </>
}

/* ── 해시 입력 + 알고리즘 판별(사전/브루트포스 공용) ── */
function cryptFormat(input: string): string | undefined {
  const value = input.trim()
  if (!value.startsWith('$') && !HASH_PREFIX.some(([re]) => re.test(value))) return undefined
  return identifyHash(value).map(h => h.name).join(' / ') || '알 수 없는 $ 접두사 해시'
}

function NotFoundDiagnosis({ tried }: { tried: string }) {
  return <p className="dec-hash-note">{tried} 안에서 일치하는 값을 찾지 못했습니다. raw 해시(MD5/SHA1/SHA256/SHA384/SHA512/NTLM/CRC32)는 해시값 자체만 보고는 솔트가 걸렸는지 알 방법이 전혀 없습니다. bcrypt($2b$)/md5crypt($1$)/sha256crypt($5$)/sha512crypt($6$)/pbkdf2처럼 접두사로 포맷이 드러나는 해시는 포맷으로 식별할 수 있으며, 스마트 디코더에서 먼저 확인하세요. 사전+브루트포스 범위를 넓혀도 안 나오면 (1) 평문이 범위 밖이거나 (2) 솔트가 걸려 있을 가능성이 높다.</p>
}

function useHashTarget() {
  const [hash, setHash] = useState('')
  const [algo, setAlgo] = useState<AlgoId | ''>('')
  const trimmed = hash.trim()
  const isHex = /^[0-9a-fA-F]+$/.test(trimmed)
  const detected = isHex ? HASH_LENGTH_TO_ALGOS[trimmed.length] : undefined
  const candidateAlgos: AlgoId[] = algo ? [algo] : (detected ?? [])
  return { hash, setHash, algo, setAlgo, trimmed, detected, candidateAlgos, cryptFormatWarning: cryptFormat(trimmed) }
}

function HashTargetFields({ t, onHashChange, batch = false, disabled = false }: { t: ReturnType<typeof useHashTarget>; onHashChange?: () => void; batch?: boolean; disabled?: boolean }) {
  return <>
    <label className="payload-builder-label">{batch ? '여러 해시 (한 줄에 하나씩)' : '해시값'}</label>
    {batch ? <textarea className="payload-builder-textarea" rows={6} value={t.hash} disabled={disabled} onChange={e => t.setHash(e.target.value)} placeholder="해시를 한 줄에 하나씩 붙여넣으세요"/> : <input className="payload-builder-input" value={t.hash} onChange={e => { t.setHash(e.target.value); onHashChange?.() }} placeholder="예: 5f4dcc3b5aa765d61d8327deb882cf99"/>}
    {(batch ? t.hash.split(/\r?\n/).map((hash, i) => ({ format: cryptFormat(hash), line: i + 1 })).filter(x => x.format) : [{ format: t.cryptFormatWarning, line: 0 }]).map(({ format, line }) => format && <p key={line} role="alert" className="dec-hash-note">{batch && `${line}번째 줄: `}이 값은 raw 해시가 아니라 {format} 포맷으로 보입니다 — 레인보우 크랙이 아니라 스마트 디코더에서 먼저 확인하세요.</p>)}
    {!batch && t.trimmed && <div className="dec-verdict">
      <span className="dec-verdict-label">알고리즘</span>
      {t.detected
        ? t.detected.map(a => <span key={a} className="dec-hash-badge">{ALGO_LABEL[a]}</span>)
        : <span className="dec-hash-badge weak">길이({t.trimmed.length}자)로 판별 안 됨 — 아래에서 직접 선택</span>}
      {t.detected && t.detected.length > 1 && <span className="dec-hash-note">길이가 같아 후보가 여러 개입니다 — 자동판별 시 전부 시도합니다.</span>}
    </div>}
    <label className="payload-builder-label">알고리즘 <small>(자동판별 후보를 그대로 쓰려면 비워두세요)</small></label>
    <select className="payload-builder-select" value={t.algo} disabled={disabled} onChange={e => t.setAlgo(e.target.value as AlgoId | '')}>
      <option value="">{batch ? '자동판별(라인별 길이 기반)' : '자동판별 사용'}{!batch && t.detected ? ` (${t.detected.map(a => ALGO_LABEL[a]).join(' / ')})` : ''}</option>
      {ALL_ALGOS.map(a => <option key={a} value={a}>{ALGO_LABEL[a]}</option>)}
    </select>
  </>
}

type CrackStatus =
  | { state: 'idle' }
  | { state: 'running'; tried: number; total: number; startedAt: number }
  | { state: 'found'; plain: string; algo: AlgoId; tried: number }
  | { state: 'not-found'; tried: number }
  | { state: 'stopped'; tried: number }

const CHUNK_SIZE = 400 // 이 개수만큼 처리할 때마다 화면을 갱신하고 브라우저에 제어권을 한 번씩 넘긴다(멈춤 방지)

function ProgressBar({ status }: { status: Extract<CrackStatus, { state: 'running' }> }) {
  const pct = status.total > 0 ? (status.tried / status.total) * 100 : 0
  const elapsedSec = Math.max((performance.now() - status.startedAt) / 1000, 0.001)
  const perSec = status.tried / elapsedSec
  const remaining = perSec > 0 ? (status.total - status.tried) / perSec : 0
  return <div className="rainbow-progress">
    <div className="rainbow-progress-bar"><i style={{ width: `${Math.min(pct, 100).toFixed(2)}%` }}/></div>
    <p>{fmtInt(status.tried)} / {fmtBig(status.total)} ({pct.toFixed(2)}%) · 초당 {fmtInt(Math.round(perSec))}개 · 남은 시간 약 {fmtDuration(remaining)}</p>
  </div>
}

function CrackMode() {
  const t = useHashTarget()
  const [includePins, setIncludePins] = useState(false)
  const [pinDigits, setPinDigits] = useState<4 | 5 | 6>(6)
  const [status, setStatus] = useState<CrackStatus>({ state: 'idle' })
  const runId = useRef(0)

  const candidates = useMemo(() => includePins ? [...WORDLIST, ...numericPins(pinDigits)] : WORDLIST, [includePins, pinDigits])

  const crack = async () => {
    if (t.candidateAlgos.length === 0 || !t.trimmed) return
    const myRun = ++runId.current
    const total = candidates.length
    const startedAt = performance.now()
    setStatus({ state: 'running', tried: 0, total, startedAt })
    const target = t.trimmed.toLowerCase()
    for (let i = 0; i < total; i++) {
      if (runId.current !== myRun) return
      const candidate = candidates[i]
      for (const a of t.candidateAlgos) {
        const digest = await hashWith(a, candidate)
        if (digest.toLowerCase() === target) { setStatus({ state: 'found', plain: candidate, algo: a, tried: i + 1 }); return }
      }
      if (i % CHUNK_SIZE === 0) {
        setStatus({ state: 'running', tried: i, total, startedAt })
        await new Promise(resolve => setTimeout(resolve, 0))
      }
    }
    if (runId.current === myRun) setStatus({ state: 'not-found', tried: total })
  }
  const stop = () => { runId.current++; setStatus(current => current.state === 'running' ? { state: 'stopped', tried: current.tried } : current) }

  return <>
    <HashTargetFields t={t} onHashChange={() => setStatus({ state: 'idle' })}/>
    <label className="rainbow-checkbox-row">
      <input type="checkbox" checked={includePins} onChange={e => setIncludePins(e.target.checked)}/>
      숫자 PIN 전수조사 추가
      <select className="payload-builder-select rainbow-inline-select" value={pinDigits} onChange={e => setPinDigits(Number(e.target.value) as 4 | 5 | 6)} disabled={!includePins}>
        <option value={4}>4자리(1만개)</option>
        <option value={5}>5자리(11만개)</option>
        <option value={6}>6자리(111만개)</option>
      </select>
    </label>
    <div className="rainbow-actions">
      <button className="rainbow-btn primary" disabled={t.candidateAlgos.length === 0 || !t.trimmed || status.state === 'running'} onClick={crack}>
        사전으로 크랙 시도 ({fmtInt(candidates.length)}개 후보)
      </button>
      {status.state === 'running' && <button className="rainbow-btn stop" onClick={stop}><XCircle size={14}/>중단</button>}
    </div>
    {status.state === 'running' && <ProgressBar status={status}/>}
    {status.state === 'found' && <div className="rainbow-result found">
      <p><CheckCircle2 size={14}/> 크랙 성공 — {fmtInt(status.tried)}번째 후보에서 일치</p>
      <HashRow label={ALGO_LABEL[status.algo]} value={status.plain}/>
    </div>}
    {status.state === 'not-found' && <NotFoundDiagnosis tried={`사전 ${fmtInt(status.tried)}개`}/>}
    {status.state === 'stopped' && <p className="dec-hash-note">{fmtInt(status.tried)}개 시도 후 중단했습니다.</p>}
    <Note>이 사전은 실제 유출 데이터가 아니라 공개적으로 널리 알려진 "흔한 취약 비밀번호" 패턴(대소문자·자릿수·연도·리트스피크 변형 포함, 기본 {fmtInt(WORDLIST.length)}개)으로 만든 것입니다. bcrypt·argon2·scrypt·sha256crypt 같은 솔트+저속 해시는 사전이든 브루트포스든 이 방식으로 원천적으로 못 뚫습니다 — 그게 그 알고리즘들을 쓰는 이유입니다.</Note>
  </>
}

/* ── 브루트포스: Web Worker 병렬 전수조사 ── */

const CHARSET_PRESETS: { id: string; label: string; chars: string }[] = [
  { id: 'numeric', label: '숫자(0-9)', chars: '0123456789' },
  { id: 'lower', label: '영문 소문자', chars: 'abcdefghijklmnopqrstuvwxyz' },
  { id: 'upper', label: '영문 대문자', chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' },
  { id: 'lowerNum', label: '소문자+숫자', chars: 'abcdefghijklmnopqrstuvwxyz0123456789' },
  { id: 'alpha', label: '영문 대소문자', chars: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ' },
  { id: 'alphaNum', label: '영문 대소문자+숫자', chars: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' },
  { id: 'alphaNumSymbol', label: '영문+숫자+기호', chars: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{};:,.<>?/' },
  { id: 'custom', label: '직접 입력', chars: '' },
]
const MAX_SAFE_KEYSPACE = Number.MAX_SAFE_INTEGER // 이 값을 넘는 길이는 인덱스↔문자열 변환 정밀도가 깨져서 아예 막는다

type BruteStatus =
  | { state: 'idle' }
  | { state: 'running'; length: number; triedThisLength: number; totalThisLength: number; overallTried: number; overallTotal: number; startedAt: number; workers: number }
  | { state: 'found'; plain: string; algo: AlgoId; length: number }
  | { state: 'not-found' }
  | { state: 'stopped' }

function BruteForceMode() {
  const t = useHashTarget()
  const [presetId, setPresetId] = useState('lowerNum')
  const [customChars, setCustomChars] = useState('')
  const [minLen, setMinLen] = useState(1)
  const [maxLen, setMaxLen] = useState(4)
  const [status, setStatus] = useState<BruteStatus>({ state: 'idle' })
  const workersRef = useRef<Worker[]>([])
  const runIdRef = useRef(0)
  const progressRef = useRef<{ perWorkerTried: number[]; lengthDone: number }>({ perWorkerTried: [], lengthDone: 0 })

  const charset = useMemo(() => {
    const raw = presetId === 'custom' ? customChars : (CHARSET_PRESETS.find(p => p.id === presetId)?.chars ?? '')
    return [...new Set(raw.split(''))].join('') // 중복 문자 제거 — 있으면 같은 후보가 여러 인덱스에서 중복 생성됨
  }, [presetId, customChars])

  const lengths = useMemo(() => {
    const out: number[] = []
    for (let l = minLen; l <= maxLen; l++) out.push(l)
    return out
  }, [minLen, maxLen])

  const keyspaceByLength = useMemo(() => lengths.map(l => ({ length: l, size: charset.length ** l })), [lengths, charset])
  const totalKeyspace = keyspaceByLength.reduce((sum, k) => sum + k.size, 0)
  const oversizedLength = keyspaceByLength.find(k => k.size > MAX_SAFE_KEYSPACE)

  const stopAll = () => {
    for (const w of workersRef.current) w.terminate()
    workersRef.current = []
  }

  const runLength = (length: number, myRun: number, workerCount: number): Promise<{ found?: { plain: string; algo: AlgoId } }> => {
    return new Promise(resolve => {
      const total = charset.length ** length
      const perWorker = Math.ceil(total / workerCount)
      const workers: Worker[] = []
      progressRef.current.perWorkerTried = new Array(workerCount).fill(0)
      let doneCount = 0
      let settled = false
      const finish = (found?: { plain: string; algo: AlgoId }) => {
        if (settled) return
        settled = true
        for (const w of workers) w.terminate()
        workersRef.current = workersRef.current.filter(w => !workers.includes(w))
        resolve({ found })
      }
      for (let wi = 0; wi < workerCount; wi++) {
        const startIndex = wi * perWorker
        const endIndex = Math.min(total, startIndex + perWorker)
        if (startIndex >= endIndex) { doneCount++; continue }
        const worker = new Worker(new URL('./rainbowWorker.ts', import.meta.url), { type: 'module' })
        workers.push(worker)
        workersRef.current.push(worker)
        worker.onmessage = (e: MessageEvent<{ type: string; tried?: number; plain?: string; algo?: AlgoId }>) => {
          if (runIdRef.current !== myRun) return
          if (e.data.type === 'progress' && typeof e.data.tried === 'number') {
            progressRef.current.perWorkerTried[wi] = e.data.tried
            const overallTried = progressRef.current.perWorkerTried.reduce((a, b) => a + b, 0)
            setStatus(current => current.state === 'running'
              ? { ...current, triedThisLength: overallTried, overallTried: progressRef.current.lengthDone + overallTried }
              : current)
          } else if (e.data.type === 'found' && e.data.plain && e.data.algo) {
            finish({ plain: e.data.plain, algo: e.data.algo })
          } else if (e.data.type === 'done') {
            doneCount++
            if (doneCount >= workers.length) finish()
          }
        }
        worker.postMessage({ cmd: 'run', algos: t.candidateAlgos, charset, length, startIndex, endIndex, target: t.trimmed.toLowerCase(), reportEvery: 20000 })
      }
      if (workers.length === 0) finish() // 이 길이의 키스페이스가 0인 극단적 경우(빈 문자셋 등)
    })
  }

  const start = async () => {
    if (t.candidateAlgos.length === 0 || !t.trimmed || !charset || oversizedLength) return
    const myRun = ++runIdRef.current
    const workerCount = Math.min(navigator.hardwareConcurrency || 4, 16)
    progressRef.current.lengthDone = 0
    const startedAt = performance.now()
    for (const { length, size } of keyspaceByLength) {
      if (runIdRef.current !== myRun) return
      setStatus({ state: 'running', length, triedThisLength: 0, totalThisLength: size, overallTried: progressRef.current.lengthDone, overallTotal: totalKeyspace, startedAt, workers: workerCount })
      const { found } = await runLength(length, myRun, workerCount)
      if (runIdRef.current !== myRun) return
      if (found) { setStatus({ state: 'found', plain: found.plain, algo: found.algo, length }); return }
      progressRef.current.lengthDone += size
    }
    if (runIdRef.current === myRun) setStatus({ state: 'not-found' })
  }
  const stop = () => { runIdRef.current++; stopAll(); setStatus(current => current.state === 'running' ? { state: 'stopped' } : current) }

  useEffect(() => () => stopAll(), []) // 컴포넌트 언마운트 시 워커 정리

  const cores = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 4

  return <>
    <HashTargetFields t={t} onHashChange={() => setStatus({ state: 'idle' })}/>
    <label className="payload-builder-label">문자셋</label>
    <select className="payload-builder-select" value={presetId} onChange={e => setPresetId(e.target.value)}>
      {CHARSET_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
    </select>
    {presetId === 'custom' && <input className="payload-builder-input" value={customChars} onChange={e => setCustomChars(e.target.value)} placeholder="예: ab12!@ — 사용할 문자를 그대로 나열"/>}
    <label className="payload-builder-label">길이 범위 <small>(짧은 길이부터 순서대로 시도)</small></label>
    <div className="rainbow-length-range">
      <input type="number" className="payload-builder-input rainbow-num" min={1} max={12} value={minLen} onChange={e => setMinLen(Math.max(1, Math.min(Number(e.target.value) || 1, maxLen)))}/>
      <span>~</span>
      <input type="number" className="payload-builder-input rainbow-num" min={1} max={12} value={maxLen} onChange={e => setMaxLen(Math.max(minLen, Number(e.target.value) || minLen))}/>
      <span className="rainbow-keyspace-hint">문자셋 {charset.length}종 · 총 후보 {oversizedLength ? '계산 불가' : fmtBig(totalKeyspace)}개</span>
    </div>
    {oversizedLength && <p className="dec-hash-note">길이 {oversizedLength.length}자리는 후보 수({oversizedLength.size.toExponential(2)})가 너무 커서 인덱스 정밀도 한계를 넘습니다 — 문자셋이나 길이를 줄이세요.</p>}
    <p className="dec-hash-note"><Cpu size={12} style={{ verticalAlign: '-1px' }}/> 이 기기는 코어 {cores}개를 씁니다 — 워커 {Math.min(cores, 16)}개로 나눠 병렬 처리합니다.</p>
    <div className="rainbow-actions">
      <button className="rainbow-btn primary" disabled={t.candidateAlgos.length === 0 || !t.trimmed || !charset || !!oversizedLength || status.state === 'running'} onClick={start}>
        브루트포스 시작
      </button>
      {status.state === 'running' && <button className="rainbow-btn stop" onClick={stop}><XCircle size={14}/>중단</button>}
    </div>
    {status.state === 'running' && <>
      <ProgressBar status={{ state: 'running', tried: status.overallTried, total: status.overallTotal, startedAt: status.startedAt }}/>
      <p className="rainbow-sublabel">현재 길이 {status.length}자리 — {fmtInt(status.triedThisLength)} / {fmtBig(status.totalThisLength)}</p>
    </>}
    {status.state === 'found' && <div className="rainbow-result found">
      <p><CheckCircle2 size={14}/> 크랙 성공 — {status.length}자리에서 발견</p>
      <HashRow label={ALGO_LABEL[status.algo]} value={status.plain}/>
    </div>}
    {status.state === 'not-found' && <NotFoundDiagnosis tried="지정한 문자셋·길이 범위 전체"/>}
    {status.state === 'stopped' && <p className="dec-hash-note">중단했습니다.</p>}
    <Note>진짜 전수조사입니다 — 문자셋·길이를 넉넉히 잡으면 후보 수가 기하급수로 커집니다(예: 영문+숫자+기호 8자리 ≈ 6×10¹⁵개). CPU 코어를 최대한 씁니다만 브라우저 탭이 계속 열려 있어야 하고, 팬이 돌 수 있습니다. bcrypt·argon2 같은 솔트+저속 해시는 이 방식으로도 현실적 시간 안엔 못 뚫습니다.</Note>
  </>
}

/* ── 여러 해시 배치: 한 해시에만 워커를 집중하고 결과는 즉시 누적 ── */
type BatchResult = { hash: string; plain: string | null; algo: AlgoId | null; foundAt: number; status: 'found' | 'not-found' }

function BatchCrackMode() {
  const t = useHashTarget()
  const [results, setResults] = useState<BatchResult[]>([])
  const [presetId, setPresetId] = useState('lowerNum')
  const [customChars, setCustomChars] = useState('')
  const [minLen, setMinLen] = useState(1)
  const [maxLen, setMaxLen] = useState(4)
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState('')
  const [current, setCurrent] = useState(0)
  const [progress, setProgress] = useState<Extract<CrackStatus, { state: 'running' }> | null>(null)
  const runIdRef = useRef(0)
  const cancelLengthRef = useRef<(() => void) | null>(null)
  const hashes = t.hash.split(/\r?\n/).map(h => h.trim()).filter(Boolean)
  const rawChars = presetId === 'custom' ? customChars : CHARSET_PRESETS.find(p => p.id === presetId)?.chars ?? ''
  const charset = [...new Set(rawChars.split(''))].join('')
  const keyspaces = Array.from({ length: maxLen - minLen + 1 }, (_, i) => ({ length: minLen + i, size: charset.length ** (minLen + i) }))
  const totalKeyspace = keyspaces.reduce((sum, k) => sum + k.size, 0)
  const oversized = keyspaces.some(k => !Number.isSafeInteger(k.size)) || !Number.isSafeInteger(totalKeyspace)

  useEffect(() => () => { runIdRef.current++; cancelLengthRef.current?.() }, [])

  // 기존 워커의 구간 분할/메시지 프로토콜을 유지. 중단도 Promise를 해제한다.
  const runLength = (hash: string, algos: AlgoId[], length: number, myRun: number, done: number, startedAt: number): Promise<{ plain: string; algo: AlgoId; tried: number } | null> => new Promise((resolve, reject) => {
    const count = Math.min(navigator.hardwareConcurrency || 4, 16)
    const total = charset.length ** length
    const chunk = Math.ceil(total / count)
    const workers: Worker[] = []
    const tried = new Array<number>(count).fill(0)
    let completed = 0
    let settled = false
    const cleanup = () => { workers.forEach(w => w.terminate()); cancelLengthRef.current = null }
    const finish = (found: { plain: string; algo: AlgoId; tried: number } | null) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(found)
    }
    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }
    cancelLengthRef.current = () => finish(null)
    try {
      for (let wi = 0; wi < count; wi++) {
        const startIndex = wi * chunk
        const endIndex = Math.min(total, startIndex + chunk)
        if (startIndex >= endIndex) continue
        const worker = new Worker(new URL('./rainbowWorker.ts', import.meta.url), { type: 'module' })
        workers.push(worker)
        worker.onerror = () => fail(new Error('브루트포스 워커 실행 실패'))
        worker.onmessageerror = () => fail(new Error('브루트포스 워커 응답 해석 실패'))
        worker.onmessage = (e: MessageEvent<{ type: string; tried?: number; plain?: string; algo?: AlgoId }>) => {
          if (runIdRef.current !== myRun || settled) return
          if (e.data.type === 'progress' && typeof e.data.tried === 'number') {
            tried[wi] = e.data.tried
            setProgress({ state: 'running', tried: done + tried.reduce((a, b) => a + b, 0), total: totalKeyspace, startedAt })
          } else if (e.data.type === 'found' && e.data.plain !== undefined && e.data.algo) {
            finish({ plain: e.data.plain, algo: e.data.algo, tried: done + tried.reduce((a, b) => a + b, 0) + 1 })
          } else if (e.data.type === 'done' && ++completed === workers.length) finish(null)
        }
        worker.postMessage({ cmd: 'run', algos, charset, length, startIndex, endIndex, target: hash.toLowerCase(), reportEvery: 20000 })
      }
      if (!workers.length) finish(null)
    } catch (error) { fail(error) }
  })

  const start = async (kind: 'dictionary' | 'brute') => {
    if (running || !hashes.length || (kind === 'brute' && (!charset || oversized))) return
    const myRun = ++runIdRef.current
    setResults([])
    setRunning(true)
    setMessage('')
    try {
      for (let hi = 0; hi < hashes.length; hi++) {
        if (runIdRef.current !== myRun) return
        const hash = hashes[hi]
        const algos = cryptFormat(hash) ? [] : t.algo ? [t.algo] : /^[0-9a-fA-F]+$/.test(hash) ? HASH_LENGTH_TO_ALGOS[hash.length] ?? [] : []
        const startedAt = performance.now()
        const total = kind === 'dictionary' ? WORDLIST.length : totalKeyspace
        setCurrent(hi + 1)
        setProgress({ state: 'running', tried: 0, total, startedAt })
        let found: { plain: string; algo: AlgoId; tried: number } | null = null
        if (algos.length && kind === 'dictionary') {
          search: for (let i = 0; i < WORDLIST.length; i++) {
            for (const algo of algos) {
              if (runIdRef.current !== myRun) return
              const digest = await hashWith(algo, WORDLIST[i])
              if (runIdRef.current !== myRun) return
              if (digest.toLowerCase() === hash.toLowerCase()) { found = { plain: WORDLIST[i], algo, tried: i + 1 }; break search }
            }
            if (i % CHUNK_SIZE === 0) {
              setProgress({ state: 'running', tried: i + 1, total, startedAt })
              await new Promise(resolve => setTimeout(resolve, 0))
            }
          }
        } else if (algos.length) {
          let done = 0
          for (const { length, size } of keyspaces) {
            if (runIdRef.current !== myRun) return
            found = await runLength(hash, algos, length, myRun, done, startedAt)
            if (runIdRef.current !== myRun) return
            if (found) break
            done += size
            setProgress({ state: 'running', tried: done, total, startedAt })
          }
        }
        if (runIdRef.current !== myRun) return
        const result: BatchResult = { hash, plain: found?.plain ?? null, algo: found?.algo ?? null, foundAt: found ? performance.now() - startedAt : 0, status: found ? 'found' : 'not-found' }
        setResults(prev => [...prev, result])
        // 캐시 없이 즉시 결과를 그릴 기회를 주고 다음 해시로 이동한다.
        await new Promise(resolve => setTimeout(resolve, 0))
      }
      if (runIdRef.current === myRun) setMessage('전체 배치 처리가 끝났습니다.')
    } catch (error) {
      if (runIdRef.current === myRun) setMessage(`실행 실패: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      if (runIdRef.current === myRun) { setRunning(false); setProgress(null) }
    }
  }
  const stop = () => { runIdRef.current++; cancelLengthRef.current?.(); setRunning(false); setProgress(null); setMessage('중단했습니다. 처리된 결과는 유지됩니다.') }

  return <>
    <HashTargetFields t={t} batch disabled={running}/>
    <label className="payload-builder-label">브루트포스 문자셋</label>
    <select className="payload-builder-select" value={presetId} disabled={running} onChange={e => setPresetId(e.target.value)}>
      {CHARSET_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
    </select>
    {presetId === 'custom' && <input className="payload-builder-input" value={customChars} disabled={running} onChange={e => setCustomChars(e.target.value)} placeholder="예: ab12!@ — 사용할 문자를 그대로 나열"/>}
    <label className="payload-builder-label">길이 범위 <small>(짧은 길이부터 순서대로 시도)</small></label>
    <div className="rainbow-length-range">
      <input type="number" className="payload-builder-input rainbow-num" min={1} max={12} value={minLen} disabled={running} onChange={e => setMinLen(Math.max(1, Math.min(Number(e.target.value) || 1, maxLen)))}/>
      <span>~</span>
      <input type="number" className="payload-builder-input rainbow-num" min={1} max={12} value={maxLen} disabled={running} onChange={e => setMaxLen(Math.max(minLen, Math.min(12, Number(e.target.value) || minLen)))}/>
      <span className="rainbow-keyspace-hint">문자셋 {charset.length}종 · 해시당 총 후보 {oversized ? '계산 불가' : fmtBig(totalKeyspace)}개</span>
    </div>
    {oversized && <p className="dec-hash-note">후보 수가 인덱스 정밀도 한계를 넘습니다 — 문자셋이나 길이를 줄이세요.</p>}
    <Note>여러 해시를 동시에 브루트포스하면 워커가 과도하게 늘어나 전체 소요시간이 더 길어지므로, 한 해시씩 CPU 전체를 집중해 순차 처리합니다.</Note>
    <div className="rainbow-actions">
      <button className="rainbow-btn primary" disabled={running || !hashes.length} onClick={() => void start('dictionary')}>사전으로 전부 시도</button>
      <button className="rainbow-btn primary" disabled={running || !hashes.length || !charset || oversized} onClick={() => void start('brute')}>브루트포스로 전부 시도</button>
      {running && <button className="rainbow-btn stop" onClick={stop}><XCircle size={14}/>중단</button>}
    </div>
    {running && <p className="rainbow-sublabel">{current} / 총{hashes.length}번째 해시 처리 중</p>}
    {progress && <ProgressBar status={progress}/>}
    {message && <p className="dec-hash-note" role="status">{message}</p>}
    {results.map((result, i) => <div key={i} className={`rainbow-result ${result.status === 'found' ? 'found' : 'not-found'}`}>
      <p style={{ overflowWrap: 'anywhere' }}>{result.status === 'found' ? <CheckCircle2 size={14}/> : <XCircle size={14}/>}{i + 1}. {result.hash} — {result.status === 'found' ? `성공 (${fmtDuration(result.foundAt / 1000)})` : '못 찾음'}</p>
      {result.algo && <HashRow label={ALGO_LABEL[result.algo]} value={result.plain ?? ''}/>}
      {result.status === 'not-found' && !(t.algo || HASH_LENGTH_TO_ALGOS[result.hash.length]) && <p className="dec-hash-note">지원 알고리즘을 자동판별할 수 없습니다. 알고리즘을 직접 선택하거나 스마트 디코더에서 확인하세요.</p>}
    </div>)}
    {results.some(r => r.status === 'not-found') && <NotFoundDiagnosis tried="배치에서 지정한 검색 범위"/>}
  </>
}

export function RainbowTableBuilder() {
  const [mode, setMode] = useState<'crack' | 'brute' | 'generate' | 'batch'>('crack')
  const modeButtons = useMemo(() => [
    { id: 'crack' as const, label: '해시 → 원본값 (사전)' },
    { id: 'brute' as const, label: '해시 → 원본값 (브루트포스)' },
    { id: 'generate' as const, label: '원본값 → 해시 (생성·검증)' },
    { id: 'batch' as const, label: '여러 해시 일괄 크랙' },
  ], [])

  return <div className="payload-builder rainbow-table">
    <Note>MD5 / NTLM / SHA1 / SHA256 / SHA384 / SHA512 / CRC32 를 다룹니다. 모든 계산은 이 브라우저 안에서만 일어나고, 어떤 값도 서버로 전송되지 않습니다.</Note>
    <div className="explorer-category-filter" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
      {modeButtons.map(m => <button key={m.id} className={mode === m.id ? 'active' : ''} onClick={() => setMode(m.id)}>{m.label}</button>)}
    </div>
    {mode === 'crack' && <CrackMode/>}
    {mode === 'brute' && <BruteForceMode/>}
    {mode === 'generate' && <GenerateMode/>}
    {mode === 'batch' && <BatchCrackMode/>}
  </div>
}
