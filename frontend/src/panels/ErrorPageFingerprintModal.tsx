import { useState } from 'react'
import { Lock, ServerCrash, X } from 'lucide-react'
import { PanelShell } from '../components/shared'
import { useModalA11y } from '../hooks/useModalA11y'
import { DISCLAIMER, Note, Readout, TextInput } from '../payloads/shared'

type MethodProbe = { id: string; method: string; checkpoint: string }
type PathProbe = { id: string; title: string; checkpoint: string; suffix: string }
type HeaderProbe = { id: string; title: string; checkpoint: string; method?: string; usesRedirectTarget?: boolean; redirectNote?: string; extraHeaderLines: (redirectTarget: string) => string[] }

const METHODS: MethodProbe[] = [
  { id: 'options', method: 'OPTIONS', checkpoint: '가장 직접적인 1차 지표. 응답 `Allow:` 헤더에 서버가 실제로 매핑한 메서드가 그대로 나열됨 — PUT/DELETE 등 숨은 위험 메서드 존재 여부를 추측 없이 바로 확인.' },
  { id: 'trace', method: 'TRACE', checkpoint: 'Apache TraceEnable(기본값 on)이면 응답 본문에 보낸 헤더가 그대로 반사됨(XST). 거부돼도 ServerSignature On(기본값)이면 405 본문 하단에 정확히 `<address>Apache/2.4.x (OS) Server at HOST Port 443</address>` 형태로 버전이 그대로 찍힘.' },
  { id: 'track', method: 'TRACK', checkpoint: 'TRACE의 IIS 전용 변형. 404.0으로 처리돼도 응답 Server 헤더에 `Microsoft-IIS/10.0` 류 배너가 그대로 남음 — IIS/Apache 구분 신호.' },
  { id: 'connect', method: 'CONNECT', checkpoint: '리버스 프록시 뒤 일반 웹서버는 400/501. nginx는 server_tokens on(기본값)이면 바디에 정확히 `<hr><center>nginx/1.x.x</center>` 형태로 버전이 그대로 노출.' },
  { id: 'patch', method: 'PATCH', checkpoint: '라우트에 PATCH 미매핑 시 Spring Boot면 JSON 바디가 `{"timestamp":...,"status":405,"error":"Method Not Allowed","path":"..."}` 형태 — error/path 필드와 Allow 헤더를 대조해 실제 매핑된 메서드를 역산 가능.' },
  { id: 'propfind', method: 'PROPFIND', checkpoint: 'WebDAV 모듈 미설치 Tomcat은 `HTTP Status 405 – Method Not Allowed` 화면 바닥에 showServerInfo(기본 true)로 `Apache Tomcat/9.0.xx` 버전이 그대로 노출.' },
  { id: 'debug', method: 'DEBUG', checkpoint: '레거시 ASP.NET(IIS6~구버전 프레임워크)에서만 의미 있음. customErrors가 꺼져 있으면 `Server Error in \'/\' Application` 화면에 어셈블리 버전까지 노출 — 최신 .NET Core 대상은 영향 없음(레거시 전용 점검).' },
  { id: 'foobar', method: 'FOOBAR', checkpoint: '등록되지 않은 임의 동사. 501 Not Implemented여도 Server/X-Powered-By 헤더는 메서드와 무관하게 항상 찍히므로 이 응답에서 그 두 헤더부터 먼저 확인.' },
  { id: 'lowercase-get', method: 'get', checkpoint: 'HTTP/1.1 스펙상 메서드는 대소문자 구분. 최신 서버 대부분 영향 없으나, 일부 구형 WAS 파서는 400 Bad Request 기본 화면으로 떨어지며 제품명 노출(사전 점검용, 낮은 적중률).' },
  { id: 'long-method', method: 'A'.repeat(2000), checkpoint: 'Apache 기본 LimitRequestLine(8190byte) 초과로 414/400 — ServerSignature On 조건이면 TRACE와 동일한 `<address>Apache/...</address>` 바디 노출.' },
]

const PATHS: PathProbe[] = [
  { id: 'null-byte', title: '%00 널 바이트', suffix: '%00', checkpoint: 'PHP 5.3.4 이전(2011년 패치 이전) null byte injection 전용 기법 — 최신 PHP·WAS는 대부분 그대로 통과되거나 400. 레거시 시스템 식별용으로만 의미 있음.' },
  { id: 'null-extension', title: '%00.jpg 확장자 혼합', suffix: '%00.jpg', checkpoint: '널 바이트 뒤 허용 확장자를 붙여 업로드/정적 핸들러의 확장자 화이트리스트를 우회하는 변형. 위와 동일하게 패치된 PHP 5.3.4+ 에는 통하지 않음.' },
  { id: 'traversal', title: '상위 경로 카나리', suffix: '/../../../../../../etc/passwd', checkpoint: '정상 차단되면 403/404. 응답 바디에 실제 `root:x:0:0:`이 보이면 탐지가 아니라 confirmed traversal — 즉시 중단하고 바로 보고 대상.' },
  { id: 'overlong-utf8-traversal', title: 'Tomcat 오버롱 UTF-8 순회 (CVE-2008-2938 계열)', suffix: '/%c0%ae%c0%ae/%c0%ae%c0%ae/etc/passwd', checkpoint: '`..`을 2바이트 오버롱 UTF-8(%c0%ae)로 인코딩해 구버전 Tomcat의 경로 정규화를 우회하는 기법. 패치된 최신 Tomcat 9.0.x엔 안 통하지만, 응답이 일반 traversal과 다르면 구버전/임베디드 WAS 잔존 여부를 바로 구분.' },
  { id: 'long-segment', title: '8,000자 경로 세그먼트', suffix: '/' + 'A'.repeat(8000), checkpoint: 'Apache LimitRequestLine(기본 8190byte) 초과 시 414 Request-URI Too Long. 기본 에러 바디에 ServerSignature 노출 조건은 TRACE 항목과 동일.' },
  { id: 'double-encoded-traversal', title: '이중 URL 인코딩 (%252e%252e%252f)', suffix: '%252e%252e%252f', checkpoint: '프록시/WAF가 1회만 디코딩하고 백엔드가 2회 디코딩할 때 생기는 불일치 탐지용. Tomcat 대상은 위 오버롱 UTF-8 변형이 더 신뢰도 높음.' },
  { id: 'crlf', title: '경로 CRLF 삽입', suffix: '%0d%0aX-Injected: 1', checkpoint: '최신 WAS 대부분 경로 내 CRLF를 애초에 거부. 통과되면 응답 헤더 목록에 `X-Injected`가 실제로 추가됐는지 Burp Repeater raw 응답에서 확인 — 통과 시 헤더 스플리팅/캐시 포이즈닝급 심각도.' },
  { id: 'invalid-utf8', title: '잘못된 UTF-8 바이트 (%ff%fe)', suffix: '%ff%fe', checkpoint: 'Django는 DEBUG=True일 때만 `UnicodeDecodeError` traceback 노출 — 운영 기본값 DEBUG=False면 노출 안 됨에 유의. 다른 스택은 보통 400으로 조용히 처리.' },
  { id: 'web-inf', title: '이중 슬래시 WEB-INF 노출', suffix: '//WEB-INF/web.xml', checkpoint: '정상은 403. 역방향 프록시 매핑 실수가 있으면 web.xml 원문이 그대로 응답됨 — 서블릿 매핑·DB 커넥션 문자열까지 노출되는 최고 위험군이므로 응답이 200이면 즉시 중단·보고.' },
  { id: 'semicolon', title: '세미콜론 경로 매개변수', suffix: '/.;/admin', checkpoint: '세미콜론 이후를 경로 매개변수로 해석해 접근 제어 필터를 우회하는 구형 Tomcat/일부 WAF 사례. 최신 Tomcat 9.0.x 기본 설정은 세미콜론을 정규화하므로 실효성 낮음(레거시 전용).' },
  { id: 'php-array-type-juggle', title: 'PHP 배열 타입 혼동 (?id[]=1&id[]=2)', suffix: '?id[]=1&id[]=2', checkpoint: 'PHP에서 `$_GET[\'id\']`를 문자열로 가정한 코드에 배열이 들어가면 `Warning: Array to string conversion in /var/www/html/실제파일.php on line 12` 형태로 서버 절대경로가 그대로 노출. display_errors On인 개발/스테이징에서 특히 잘 터짐.' },
  { id: 'max-input-vars', title: '중복 쿼리 매개변수 1,500개', suffix: '?' + Array.from({ length: 1500 }, (_, i) => `a${i}=1`).join('&'), checkpoint: 'PHP 기본 `max_input_vars=1000` 초과 — 초과분은 조용히 버려지거나 일부 구성에서 `Warning: Unknown: Input variables exceeded 1000 ... in Unknown on line 0`처럼 php.ini 설정값 자체가 노출됨.' },
  { id: 'node-malformed-uri', title: 'Node/Express 잘못된 퍼센트 인코딩 (%)', suffix: '%', checkpoint: 'Express 라우터가 경로 디코딩에 decodeURIComponent를 쓰는데, 짝이 안 맞는 `%` 하나만 있으면 `URIError: Failed to decode param`이 발생해 에러 핸들러로 전달됨. NODE_ENV를 명시적으로 production으로 설정하지 않으면 `app.get(\'env\')`가 기본값 development로 동작해 기본 에러 핸들러가 HTML 스택트레이스를 그대로 반환 — `/node_modules/express/lib/router/...` 절대 경로 노출. NODE_ENV=production 명시 시엔 스택 숨겨짐.' },
  { id: 'rails-routing-error', title: 'Rails 라우팅 에러 유도 (존재하지 않는 세그먼트)', suffix: '/__nonexistent_route_zz__', checkpoint: 'RAILS_ENV를 명시적으로 지정하지 않으면 Rails 기본값은 development — 매칭되는 라우트가 없으면 `ActionController::RoutingError (No route matches [GET] "...")` 전체 백트레이스가 HTML로 그대로 노출되며 Rails/Ruby 버전, gem 설치 경로까지 드러남. RAILS_ENV=production(표준 배포 관행)이면 대신 일반 404 페이지로 대체되어 노출 안 됨.' },
  { id: 'werkzeug-debugger-probe', title: 'Werkzeug 디버거 콘솔 활성 여부 핑거프린트', suffix: '?__debugger__=yes&cmd=resource&f=style.css', checkpoint: 'Flask/Werkzeug가 debug=True(use_debugger 활성)로 뜬 상태면 DebuggedApplication 미들웨어가 이 특정 쿼리스트링을 가로채 디버거 정적 리소스를 조건 없이 그대로 반환 — 응답 Content-Type이 text/css이고 본문에 디버거 전용 CSS가 보이면 디버그 모드 활성 확정. 이 상태면 추가로 cmd=resource&f=debugger.js, 혹은 PIN 추정을 통해 콘솔 직접 접근(임의 코드 실행)까지 이어질 수 있는 매우 높은 심각도 — 본 도구는 탐지용 페이로드만 제공.' },
  { id: 'iis-handler-mapping-404', title: 'IIS 핸들러 매핑 실패 유도 (.aspx 미존재 파일)', suffix: '/__nonexistent__.aspx', checkpoint: 'IIS httpErrors 기본 errorMode는 DetailedLocalOnly — 원칙적으로 원격 요청에는 상세 에러 대신 친화적 페이지만 노출되어야 함. 하지만 운영 중 디버깅 목적으로 errorMode="Detailed"로 바꾼 뒤 되돌리지 않은 서버가 드물지 않음. 그 경우 `HTTP Error 404.0 - Not Found` 화면에 물리 경로(C:\\inetpub\\wwwroot\\...), 요청 URL, 처리 모듈/핸들러명까지 그대로 노출됨 — errorMode가 기본값 그대로라면 이 항목은 신호 없음에 유의.' },
]

const HEADERS: HeaderProbe[] = [
  { id: 'forwarded-host', title: 'X-Forwarded-Host', usesRedirectTarget: true, extraHeaderLines: target => [`X-Forwarded-Host: ${target}`], checkpoint: '백엔드가 이 값을 신뢰해 절대 URL(Location 헤더, 비밀번호 재설정 링크 등)을 생성하면 응답 본문·헤더에 스푸핑 대상이 그대로 반영됨 — 이게 가장 직접적인 confirm 신호.' },
  { id: 'forwarded-host-proto', title: 'X-Forwarded-Host + X-Forwarded-Proto', usesRedirectTarget: true, extraHeaderLines: target => [`X-Forwarded-Host: ${target}`, 'X-Forwarded-Proto: http'], checkpoint: 'HTTPS 강제 리다이렉트 로직이 프록시 헤더를 신뢰하면 평문 http로의 리다이렉트 체인이 열릴 수 있음 — 302 응답의 Location 스킴을 확인.' },
  { id: 'forwarded-server', title: 'X-Forwarded-Server', usesRedirectTarget: true, extraHeaderLines: target => [`X-Forwarded-Server: ${target}`], checkpoint: '프록시 서버명 신뢰 여부 확인용. Apache mod_proxy 일부 구성에서 이 값을 그대로 로그/헤더에 반영 — 반영되면 로그 인젝션 벡터로도 활용 가능.' },
  { id: 'original-url', title: 'X-Original-URL', extraHeaderLines: () => ['X-Original-URL: /admin'], checkpoint: '일부 프레임워크(과거 Rails, 일부 WAF 뒤 구성)가 실제 라우팅 경로로 이 헤더를 덮어씀 — 원래 경로로는 막혔던 /admin이 200으로 열리면 접근 제어 우회 확정.' },
  { id: 'rewrite-url', title: 'X-Rewrite-URL', extraHeaderLines: () => ['X-Rewrite-URL: /admin'], checkpoint: 'X-Original-URL과 동일 계열의 다른 헤더명. 둘 다 시도해 어느 쪽이 실제로 라우팅에 영향을 주는지 비교.' },
  { id: 'empty-json-body', title: 'Content-Type: application/json + 빈 본문 (POST)', method: 'POST', extraHeaderLines: () => ['Content-Type: application/json'], checkpoint: 'Spring Boot(Jackson)에서 자주 재현되는 실제 결함 — 본문이 완전히 비어 있으면 `JsonMappingException: No content to map due to end-of-input` 스택이 Whitelabel Error Page trace 필드에 그대로 노출.' },
  { id: 'empty-boundary', title: '빈 multipart boundary (POST)', method: 'POST', extraHeaderLines: () => ['Content-Type: multipart/form-data; boundary='], checkpoint: 'multipart 파서가 빈 boundary를 못 찾으면 예외 발생 — Spring/Commons-FileUpload 계열은 스택 트레이스에 라이브러리 버전(클래스 패키지 경로)까지 노출되는 경우가 많음.' },
  { id: 'negative-length', title: '음수 Content-Length', extraHeaderLines: () => ['Content-Length: -1'], checkpoint: '대부분 400으로 조용히 처리돼 신호가 약함 — 그래도 응답 바디가 서버 기본 400 화면이면 Server 헤더와 함께 1차 지표로는 활용.' },
  { id: 'expect', title: 'Expect: 100-continue', extraHeaderLines: () => ['Expect: 100-continue'], checkpoint: '최신 서버는 대부분 정상 처리해 신호가 약함. 다만 리버스 프록시 체인에서 100-continue 처리 방식이 레이어마다 다르면 응답 지연 차이로 프록시/WAS 구성 단수·다단 여부를 추정 가능.' },
  { id: 'range', title: '과도한 Range (bytes=0-99999999999999)', extraHeaderLines: () => ['Range: bytes=0-99999999999999'], checkpoint: '정적 파일 응답 시 416 Range Not Satisfiable — Apache/nginx 기본 바디는 정확히 `<title>416 Requested Range Not Satisfiable</title>` 형태로 떨어지며 서버명이 함께 노출.' },
  { id: 'long-language', title: '초장문 Accept-Language', extraHeaderLines: () => ['Accept-Language: ' + 'x,'.repeat(500)], checkpoint: 'nginx는 large_client_header_buffers 기본값 초과 시 정확히 `400 Bad Request` 바디에 `Request Header Or Cookie Too Large`라는 고정 문구와 nginx 버전이 함께 노출.' },
  { id: 'many-headers', title: '더미 헤더 110개 (Apache LimitRequestFields 기본값 초과)', extraHeaderLines: () => Array.from({ length: 110 }, (_, i) => `X-Pad-${i}: x`), checkpoint: 'Apache 기본 `LimitRequestFields=100`을 넘기도록 110개로 설정 — 초과 시 400 Bad Request. 본문이 Apache 기본 에러 화면이면 ServerSignature 노출 조건도 함께 확인.' },
  { id: 'missing-host', title: 'Host 헤더 누락', extraHeaderLines: () => [], checkpoint: 'HTTP/1.1은 Host 헤더를 필수로 요구(RFC 7230) — 생략하면 엄격한 파서는 400 Bad Request. 이 기본 400 화면의 바디·Server 헤더만으로도 WAS 식별 가능.' },
  { id: 'duplicate-host', title: '중복 Host 헤더', usesRedirectTarget: true, redirectNote: '캐시/CDN이 뒤쪽 Host를, 오리진이 앞쪽 Host를 채택하는 등 계층 간 불일치가 있으면 캐시 포이즈닝·요청 스머글링 변형으로 이어질 수 있습니다. 응답의 캐시 키·절대 URL이 어느 Host 값을 기준으로 생성됐는지 확인하세요.', extraHeaderLines: target => [`Host: ${target}`], checkpoint: 'RFC 7230이 금지하는 조합 — 엄격한 파서는 400, 느슨한 파서(일부 캐시·로드밸런서)는 둘 중 하나만 채택. 캐시가 뒤쪽 Host를 채택하고 오리진이 앞쪽을 채택하면 캐시 포이즈닝(request smuggling 변형)으로 이어질 수 있음.' },
  { id: 'forwarded-for-ip-bypass', title: 'X-Forwarded-For IP 스푸핑 (접근 제어 우회)', usesRedirectTarget: true, redirectNote: '응답이 200으로 바뀌거나 평소 막혀 있던 내부망 전용 콘텐츠가 노출되면, 입력한 IP가 그대로 신뢰됐다는 뜻으로 접근 제어 우회가 확정됩니다. (Location/링크 반영과는 무관한 신호입니다.)', extraHeaderLines: target => [`X-Forwarded-For: ${target}`], checkpoint: '신뢰 가능한 프록시 체인 검증 없이 X-Forwarded-For의 첫 값을 그대로 클라이언트 IP로 신뢰하는 앱이 있음 — 127.0.0.1이나 10.0.0.1 같은 내부 IP를 스푸핑 대상 입력란에 넣고 보내면, IP 기반 allowlist로 막혀 있던 관리자 전용/내부망 전용 엔드포인트가 열리는지 확인. 동일 계열로 X-Real-IP, X-Client-IP, True-Client-IP 헤더명도 앱에 따라 대신 신뢰될 수 있어 함께 시도할 가치가 있음.' },
  { id: 'transfer-encoding-cl-conflict', title: 'Transfer-Encoding: chunked + Content-Length 동시 전송 (요청 스머글링 지표)', method: 'POST', extraHeaderLines: () => ['Transfer-Encoding: chunked', 'Content-Length: 4'], checkpoint: 'RFC 7230 §3.3.3은 두 헤더가 동시에 있으면 Transfer-Encoding을 우선하고 메시지를 거부하거나 Content-Length를 무시하도록 요구 — 프록시와 백엔드가 서로 다르게 해석하면 TE.CL/CL.TE 요청 스머글링으로 이어짐. curl/libcurl은 이 조합을 자동으로 정규화해버리므로 반드시 Burp Repeater raw 탭이나 nc/openssl s_client로 직접 전송해야 의미가 있음 — 전송 즉시 400으로 거부되면 스머글링에 대해 보수적인 서버, 200으로 통과되면 추가 조사 대상.' },
  { id: 'accept-unsupported-media', title: '지원하지 않는 Accept 헤더 (콘텐츠 협상 406 유도)', extraHeaderLines: () => ['Accept: application/this-type-does-not-exist'], checkpoint: '엔드포인트가 특정 produces 타입만 지원하도록 선언된 경우(예: Spring MVC @RequestMapping(produces=...)), 클라이언트가 그 타입을 전혀 받아들이지 않겠다고 선언하면 기본적으로 406 Not Acceptable 에러 페이지가 떨어짐 — 커스텀 에러 핸들러가 없으면 Spring Boot는 Whitelabel Error Page(JSON/HTML)로 프레임워크·버전 정보가 노출될 수 있음. 프레임워크별 폴백 동작(406을 내는지, 임의 포맷으터로 폴백하는지)이 달라 비교 포인트로도 활용.' },
]

export function ErrorPageFingerprintModal({ onClose, embedded }: { onClose?: () => void; embedded?: boolean }) {
  const modalRef = useModalA11y(!embedded, onClose ?? (() => {}))
  const [host, setHost] = useState('')
  const [path, setPath] = useState('')
  const [spoofTarget, setSpoofTarget] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const targetHost = host.trim() || 'example.com'
  const trimmedPath = path.trim()
  const targetPath = trimmedPath ? trimmedPath.startsWith('/') ? trimmedPath : `/${trimmedPath}` : '/'
  const redirectTarget = spoofTarget.trim() || 'attacker.com'
  const selectedMethod = METHODS.find(item => `method-${item.id}` === selectedId)
  const selectedPath = PATHS.find(item => `path-${item.id}` === selectedId)
  const selectedHeader = HEADERS.find(item => `header-${item.id}` === selectedId)
  const extraHeaderLines = selectedHeader?.extraHeaderLines(redirectTarget) ?? []

  const headerPayload = (item: HeaderProbe) => {
    const method = item.method ?? 'GET'
    const lines = item.extraHeaderLines(redirectTarget)
    if (item.id === 'missing-host') return `${method} ${targetPath} HTTP/1.1\n\n`
    if (item.id === 'duplicate-host') return `${method} ${targetPath} HTTP/1.1\nHost: ${targetHost}\nHost: ${redirectTarget}\n\n`
    return `${method} ${targetPath} HTTP/1.1\nHost: ${targetHost}\n${lines.join('\n')}\n\n`
  }

  return <PanelShell embedded={embedded} className="file-explorer tool-modal diag-modal" modalRef={modalRef}>
    <div className="sheet-header"><div><p className="eyebrow">진단 · 정찰</p><h2><ServerCrash size={18} style={{ verticalAlign: '-3px', marginRight: 6 }}/>기본 에러 페이지 탐지</h2></div>{onClose && <button className="sheet-close" onClick={onClose}><X size={18}/></button>}</div>
    <div className="explorer-preview tool-modal-body">
      <div className="explorer-preview-body cheatsheet-options-body">
        <Note>{DISCLAIMER}</Note>
        <Note>메서드·경로·헤더 조작으로 커스텀 에러 페이지가 아닌 서버/프레임워크 기본 에러 페이지를 유도해 인프라 정보(서버명·버전·스택트레이스)를 노출시키는지 점검합니다.</Note>
        <div className="error-fp-inputs">
          <div className="error-fp-input"><TextInput label="대상 Host" value={host} onChange={setHost} placeholder="example.com"/></div>
          <div className="error-fp-input"><TextInput label="대상 경로" value={path} onChange={setPath} placeholder="/api/v1/resource"/></div>
          <div className="error-fp-input"><TextInput label="리다이렉트/스푸핑 대상" value={spoofTarget} onChange={setSpoofTarget} placeholder="attacker.com, webhook.site 주소, 또는 127.0.0.1 같은 내부 IP(XFF 우회 테스트용)"/></div>
        </div>
        <div className="error-fp-layout">
          <div className="error-fp-list-pane">
            <section className="error-fp-group">
              <h3 className="payload-group-title">메서드로 유발 (Method)</h3>
              {METHODS.map(item => <div key={item.id} className={`error-fp-item${selectedId === `method-${item.id}` ? ' error-fp-item--selected' : ''}`} onClick={() => setSelectedId(`method-${item.id}`)}>
                <Readout title={item.method.length > 30 ? '긴 메서드 토큰 (2,000자)' : item.method} value={`curl -i -X ${item.method} https://${targetHost}${targetPath}`} wrap="anywhere"/>
                <p className="error-fp-hint">점검 포인트: {item.checkpoint}</p>
              </div>)}
            </section>
            <section className="error-fp-group">
              <h3 className="payload-group-title">경로로 유발 (Path)</h3>
              {PATHS.map(item => <div key={item.id} className={`error-fp-item${selectedId === `path-${item.id}` ? ' error-fp-item--selected' : ''}`} onClick={() => setSelectedId(`path-${item.id}`)}>
                <Readout title={item.title} value={`curl -i "https://${targetHost}${targetPath}${item.suffix}"`} wrap="anywhere"/>
                <p className="error-fp-hint">점검 포인트: {item.checkpoint}</p>
              </div>)}
            </section>
            <section className="error-fp-group">
              <h3 className="payload-group-title">헤더로 유발 (Header)</h3>
              {HEADERS.map(item => <div key={item.id} className={`error-fp-item${selectedId === `header-${item.id}` ? ' error-fp-item--selected' : ''}`} onClick={() => setSelectedId(`header-${item.id}`)}>
                <Readout title={item.title} value={headerPayload(item)} wrap="anywhere"/>
                <p className="error-fp-hint">점검 포인트: {item.checkpoint}</p>
              </div>)}
              <Note>curl 사용 시 각 줄을 `-H '...'` 플래그로 변환하세요. 이 블록은 Burp Repeater나 `nc`에 그대로 붙여넣는 용도입니다.</Note>
            </section>
          </div>
          <div className="error-fp-preview-pane">
            <h3 className="payload-group-title">입력 위치 미리보기</h3>
            {!selectedId && <div className="error-fp-preview-empty">왼쪽에서 항목을 선택하면 입력 위치 예시를 보여줍니다.</div>}
            {selectedMethod && <>
              <div className="error-fp-term">
                <div className="error-fp-term-header"><span className="error-fp-term-dot"/><span className="error-fp-term-dot"/><span className="error-fp-term-dot"/><span>터미널</span></div>
                <pre>$ curl -i -X <span className="error-fp-highlight">{selectedMethod.method}</span> https://{targetHost}{targetPath}</pre>
              </div>
              <p className="error-fp-hint">점검 포인트: {selectedMethod.checkpoint}</p>
            </>}
            {selectedPath && <>
              <div className="error-fp-urlbar"><Lock size={13}/><span>https://{targetHost}{targetPath}<span className="error-fp-highlight">{selectedPath.suffix}</span></span></div>
              <p className="error-fp-hint">점검 포인트: {selectedPath.checkpoint}</p>
            </>}
            {selectedHeader && <>
              <div className="error-fp-repeater">
                <div className="error-fp-repeater-header">Repeater — Request</div>
                <pre>{selectedHeader.method ?? 'GET'} {targetPath} HTTP/1.1{'\n'}{selectedHeader.id === 'missing-host' ? <span className="error-fp-highlight">(Host 헤더 의도적으로 생략){'\n'}</span> : selectedHeader.id === 'duplicate-host' ? <><span className="error-fp-highlight">Host: {targetHost}{'\n'}</span><span className="error-fp-highlight">Host: {redirectTarget}{'\n'}</span></> : <>Host: {targetHost}{'\n'}{extraHeaderLines.map((line, index) => <span className="error-fp-highlight" key={index}>{line}{'\n'}</span>)}</>}{'\n'}</pre>
              </div>
              <p className="error-fp-hint">점검 포인트: {selectedHeader.checkpoint}</p>
              {selectedHeader.usesRedirectTarget && <Note>{selectedHeader.redirectNote ?? `응답 Location 헤더나 본문 링크에 ${redirectTarget}이 그대로 반영되면 취약 가능성이 있습니다.`}</Note>}
            </>}
          </div>
        </div>
      </div>
    </div>
  </PanelShell>
}
