/**
 * 정찰/취약점 스캐너 모음 -- 원본은 로컬 툴박스(security_toolkit 계열)에서 이미 만들어
 * 쓰던, 표준 라이브러리만으로 동작하는 단일 파일 스캐너들이다. 진단페이지에는 실행 화면을
 * 만들지 않는다 -- 대상이 사내망 IP·자기 노트북일 수도 있어서 서버가 대신 쏴줄 수 없고,
 * 다운로드해서 로컬에서 직접 돌리는 모델을 그대로 따른다(프롬프트 인젝션 진단과 달리 이쪽은
 * "화면에서 관찰"이 아니라 "터미널에서 실행하고 리포트 받기"가 핵심이라 별도 방식으로 둔다).
 *
 * 각 스캐너는 원본 그대로(또는 배포 경로만 맞춘 최소 수정) 다운로드 가능하고, 원본 제작 당시
 * 같이 쓰던 한국어 사용설명서(설명서.txt)를 그대로 첨부한다 -- 옵션이 많은 도구들이라 여기서
 * 요약을 다시 쓰는 대신 원본 설명서를 신뢰할 수 있는 출처로 그대로 넘긴다.
 */

import xssScoutV33 from './scanner-scripts/xssScoutV33.txt?raw'
import xssScoutV33ResultCheck from './scanner-scripts/xssScoutV33ResultCheck.txt?raw'
import clientRouteScoutV12 from './scanner-scripts/clientRouteScoutV12.txt?raw'

export interface ScannerFile { filename: string; note?: string }

// 브라우저 DevTools 콘솔에 직접 붙여넣는 스크립트 -- 파일 다운로드가 아니라 클립보드 복사가
// 핵심 동작이라 files와 별도 필드로 둔다.
export interface ScannerScript { label: string; content: string; note?: string }

export interface ScannerTool {
  id: string
  name: string
  tagline: string
  standalone: boolean // 외부 워드리스트/의존성 없이 바로 동작하는지 (false면 옵션 일부만 그럼)
  notes: string[]
  files: ScannerFile[]
  scripts?: ScannerScript[]
}

export const SCANNER_TOOLS: ScannerTool[] = [
  {
    id: 'default-content-scanner',
    name: '기본 콘텐츠/백업 파일 스캐너',
    tagline: 'Tomcat/Apache/nginx/IIS/Next.js/API/CMS 기본 파일 + 백업 확장자 변형 + 우회 인코딩 포함 경로순회(Traversal) 퍼징',
    standalone: true,
    notes: [
      '인자 없이 실행하면(더블클릭 포함) URL·쿠키·모드만 순서대로 묻는 대화형 간단 모드로 진입 -- 옵션 이름 외울 필요 없음.',
      '대상 기술 스택(--tech)을 더 이상 맨입으로 타이핑하지 않음 -- 번호 또는 이름을 쉼표로 구분해 입력하는 선택 메뉴(Nginx/Apache/Next.js/API/CMS 등 13종, all=전체 선택)로 바뀜.',
      '--cookies/--headers로 로그인 후에만 보이는 경로도 점검 가능.',
      '--tech에 axis/glassfish/iplanet/jrun/api/cms(wordpress·drupal·joomla)까지 추가됨, generic 목록도 SecLists quickhits.txt(2500여개) 병합으로 대폭 확대 -- "탐색 가짓수가 너무 적다"는 피드백 반영해 위 오프라인 올인원 패키지 자체를 훨씬 두껍게 채움. 해당 워드리스트 파일이 없으면(번들 없이 스크립트만 받은 경우) 그 항목만 자동으로 건너뜀(에러 아님).',
      '경로순회(traversal) 모드는 기본으로 우회 인코딩(단일/이중 URL인코딩, 오버롱 UTF-8, null byte)을 자동 적용함(--no-bypass-encodings로 끌 수 있음), 타겟 파일도 시그니처로 검증 가능한 7종(passwd/apache·nginx·php 설정/win.ini/boot.ini/web.config)으로 확대.',
      'robots.txt 준수 + 호스트별 최소 요청 간격 + 전체 요청 상한이 기본으로 항상 걸려 있음(끌 수 없음).',
    ],
    files: [
      { filename: 'default_content_scanner.py', note: '스캐너 본체 -- 표준 라이브러리만' },
      { filename: '설명서.txt', note: '3가지 모드(fingerprint/mutate/traversal) 전체 옵션 설명' },
    ],
  },
  {
    id: 'safe-http-audit',
    name: 'HTTP 설정 안전 점검',
    tagline: '보안헤더 누락 / 디렉터리 리스팅 / 위험 메서드 / 서버헤더 노출 / 서브도메인·vhost 격리',
    standalone: true,
    notes: [
      '인자 없이 실행하면 대상과 점검 종류(기본 전체)만 묻는 대화형 간단 모드로 진입.',
      'GET/HEAD/OPTIONS만 사용, 리다이렉트 안 따라감, 상태 변경 요청 없음 -- 쿠키/세션도 의도적으로 지원 안 함(서버 기본 설정만 보는 도구라 로그인 여부가 결과에 영향 없음).',
      '룰 파일(safe_http_checks/)이 SHA-256으로 검증됨 -- 폴더 구조를 바꾸지 말고 그대로 둘 것.',
    ],
    files: [
      { filename: 'safe_http_audit.py', note: '스캐너 본체' },
      { filename: 'safe_rule_bundle.py', note: '룰 파일 무결성 검증 로더 -- 같은 폴더에 필요' },
      { filename: 'safe_http_checks/manifest.json' },
      { filename: 'safe_http_checks/allowed-methods.json' },
      { filename: 'safe_http_checks/directory-listing.json' },
      { filename: 'safe_http_checks/error-page-signatures.json' },
      { filename: 'safe_http_checks/security-headers.json' },
      { filename: 'safe_http_checks/server-header-disclosure.json' },
      { filename: '설명서.txt', note: '--check 종류별 설명' },
    ],
  },
  {
    id: 'xss-reflected-scanner',
    name: 'Reflected XSS 스캐너',
    tagline: '마커+특수문자 반사 여부로 위험도 판정 -- 실제 alert() 등 실행 페이로드는 안 쏨',
    standalone: true,
    notes: [
      '대상 URL 하나에만 요청 -- 다른 페이지로 안 넘어감.',
      'HIGH여도 "확정 취약점"이 아니라 "유력 후보" -- 최종 검증은 수동/Burp로.',
    ],
    files: [
      { filename: 'xss_reflected_scanner.py' },
      { filename: '설명서.txt', note: '--bypass-variants 인코딩 종류, 컨텍스트별 판정 기준' },
    ],
  },
  {
    id: 'xss-stored-scanner',
    name: 'Stored XSS 스캐너',
    tagline: '입력 페이지 1개(주입) + 확인 페이지 1개(검사) 조합만 테스트 -- 크롤링 안 함',
    standalone: true,
    notes: [
      '실제 게시글/댓글/프로필 등에 테스트 값이 남을 수 있음 -- 자동 정리 안 됨, 테스트 후 직접 삭제.',
      '저장된 값이 --check-url 아닌 다른 페이지에만 나타나면 못 잡음(설계상 다중 페이지 크롤링 없음).',
    ],
    files: [
      { filename: 'xss_stored_scanner.py' },
      { filename: '설명서.txt' },
    ],
  },
  {
    id: 'xss-scout-console',
    name: 'XSS Scout v3.3 (콘솔)',
    tagline: '브라우저 DevTools 콘솔 붙여넣기형 -- DOM sink 관찰 + GET 파라미터 반사/인코딩 분석',
    standalone: true,
    notes: [
      '파일 다운로드 없이 콘솔에 붙여넣고 바로 실행 -- 페이지 새로고침하면 관찰기 전부 해제됨.',
      '1) 본 스크립트 붙여넣기 → 몇 초 대기(같은 오리진 GET 파라미터 mutation 진행) → 2) 결과 확인 스크립트로 시그니처 회귀 체크.',
      'innerHTML/document.write 등 HTML sink만 훅 -- payload 주입·네비게이션·요청 헤더 변조 없음, 관찰만 함.',
      'Active mutation은 기본적으로 같은 오리진 GET만 나감(CONFIG.TEST_CROSS_ORIGIN=false) -- 허가된 진단 범위에서만 사용.',
      '콘솔 표에 경로·파라미터·실제 주입한 페이로드·응답에서 발견된 조각(실제 반사 내용)까지 전부 한글로 표시됨 -- "위험해요"류 라벨만 보고 끝나지 않고 어디서 어떻게 반사됐는지 바로 확인 가능.',
      'GET <form> 필드값까지 실제 쿼리스트링으로 합성해서 테스트 대상에 포함(검색창·필터폼 같은 흔한 반사형 XSS 지점이 이전엔 누락됐었음).',
      'Burp Param Miner 방식 숨은 파라미터 탐지 내장: URL/폼 어디에도 안 보이는 파라미터 이름 후보(debug/callback/redirect/template 등 약 120개)를 청크로 묶어 보내보고 응답이 바뀌면 이분탐색으로 실제 쓰이는 이름을 정확히 찾아냄(대상당 추가 요청 상한 CONFIG.PARAM_MINE_MAX_REQUESTS=40) -- 찾은 숨은 파라미터는 기존 파라미터와 동일하게 반사/XSS 테스트까지 자동 진행되고 결과표에 파라미터출처=PARAM_MINED로 표시됨.',
    ],
    files: [],
    scripts: [
      { label: '본 스크립트', content: xssScoutV33, note: '콘솔에 먼저 붙여넣기 (DOM 관찰 + GET mutation 스캔)' },
      { label: '결과 확인 스크립트', content: xssScoutV33ResultCheck, note: '본 스크립트 완료 후 붙여넣기 (window.__XSS_SCOUT_V33__ 요약 + 픽스처 회귀 체크)' },
    ],
  },
  {
    id: 'client-route-scout',
    name: 'Client Route Scout (콘솔)',
    tagline: '브라우저 DevTools 콘솔 붙여넣기형 -- DOM/리소스/같은 오리진 스크립트에서 라우트·노출후보 수집',
    standalone: true,
    notes: [
      '같은 오리진 GET만 사용 -- 경로 추측·폼 제출·세션 값 변경 없음, 순수 관찰.',
      '노출 후보(API 키/JWT/자격증명 패턴)는 값 자체를 절대 안 담고 마스킹된 위치·근거만 기록 -- 실제 비밀 여부는 서버 코드에서 직접 확인 필요.',
      '결과는 window.__CLIENT_ROUTE_SCOUT_V12__에 저장됨.',
      '콘솔에 탐지 범위(스캔한 스크립트 수·경로 수 등) 요약이 먼저 뜨고, 이어서 수집된 전체 경로 표 + 노출 후보(종류/위험도/발견위치/근거)가 전부 한글로 표시됨.',
    ],
    files: [],
    scripts: [
      { label: '스캐너 스크립트', content: clientRouteScoutV12, note: '콘솔에 붙여넣으면 즉시 실행 후 라우트/노출후보 표를 출력' },
    ],
  },
  {
    id: 'jwt-analyzer',
    name: 'JWT 구조 분석기',
    tagline: 'JWS/JWE 자동 판별 -- alg=none·RSA1_5·CBC 패딩오라클 등 구조 분석 + 변조 PoC 토큰 생성',
    standalone: true,
    notes: [
      '분석/PoC 토큰 생성만 함 -- 실제 서버에 테스트하는 건 별도 행위, 권한 있는 대상에만.',
      '--crack-secret은 로컬 HMAC 재계산이라 네트워크 요청 없음 -- 워드리스트는 직접 지정 필요(기본 경로는 SecLists 전제라 없으면 --wordlist로 지정).',
      'JWS(3파트, 서명)뿐 아니라 JWE(5파트, 암호화)도 점(.) 개수로 자동 판별해 분석 -- JWE는 payload(ciphertext)가 암호화돼 있어 복호화는 안 하지만, protected header는 평문이라 alg(RSA1_5 패딩오라클/ECDH-ES invalid curve/PBES2 약한 반복횟수 등)·enc(CBC-HS 패딩오라클 표면/GCM)·zip(압축 오라클)·kid/jku/x5u 필드만으로 알려진 공격 표면을 구조적으로 짚어줌.',
      'JWE 전용 --gen-jwe-ivflip: IV 한 바이트를 비트플립한 변조 토큰 생성(CBC-HS 계열 padding-oracle 탐지용 1차 프로브) -- JWS 전용 --gen-none/--confusion-pubkey/--crack-secret과 서로 다른 토큰 타입에 쓰면 명확한 오류로 막힘.',
    ],
    files: [
      { filename: 'jwt_analyzer.py' },
      { filename: '설명서.txt' },
    ],
  },
  {
    id: 'crypto-identifier',
    name: '해시/인코딩 식별기',
    tagline: '정체불명 문자열 자동 디코드(base64/hex/base58/base85/JWT/XOR 등) + 해시 포맷 추정 + 로컬 사전 크랙',
    standalone: true,
    notes: [
      '무솔트 빠른 해시(md5/sha1/sha256 등)만 --crack으로 로컬 크랙 -- 워드리스트 직접 지정 필요.',
      'bcrypt 등 느린 포맷은 hashcat/john 명령어를 "출력만" 함(자동 실행 안 함, 로컬에 해당 도구 없으면 명령어만 참고).',
      '디코더에 base58/ascii85/base85/HTML엔티티/유니코드·JS 이스케이프/ROT47/gzip·zlib 압축해제(쿠키값 등)/단일 바이트 XOR 브루트포스(영어 평문 유사도로 상위 5개 정렬)/JWT 전용 구조 분석(header·payload를 그 자리에서 JSON으로) 추가.',
      'NTLM을 MD5와 별개 포맷으로 정확히 구분해 크랙(순수 파이썬 MD4 구현 내장 -- 예전엔 길이만 보고 MD5로만 크랙 시도해서 진짜 NTLM 값은 사전에 답이 있어도 못 찾던 버그, 수정됨). MySQL 4.1+ PASSWORD()(이중 SHA1, "*"+40자리hex)도 전용 처리로 추가(예전엔 일반 SHA1로만 시도해서 항상 실패했음).',
    ],
    files: [
      { filename: 'crypto_identifier.py' },
      { filename: '설명서.txt' },
    ],
  },
  {
    id: 'site-crawler',
    name: '사이트 깊이 크롤러',
    tagline: 'URL+깊이로 링크를 따라가며 수집 -- 다른 스캐너에 넣을 URL 목록 뽑을 때',
    standalone: true,
    notes: [
      '인자 없이 실행하면 URL·쿠키·깊이만 순서대로 묻는 대화형 간단 모드로 진입.',
      '--cookies/--headers로 로그인 후에만 보이는 페이지도 크롤링 가능(크롤링·워드리스트 탐색·SPA 보조 탐지 전부 적용).',
      '취약점 스캐너 아님(discovery 전용) -- 동시 요청 캡 + 호스트별 최소 간격이 항상 강제됨(끌 수 없음).',
      '--wordlist로 경로 존재 탐색도 같이 가능 -- 이제 파일 경로를 직접 타이핑하는 대신 번들 포함 목록(common.txt·raft-large/medium-directories·raft-large/medium-files)을 번호/이름 쉼표 선택으로 고르고, 번들에 없는 경로(Burp 변환기 결과물 등)는 추가로 직접 입력 가능.',
      '리포트 끝에 "수집 실패·건너뜀" 섹션이 추가됨 -- robots.txt 차단, 타임아웃/네트워크 오류, 범위 밖(다른 도메인) 스킵 건수를 전부 명시적으로 보여줘서 "경로를 다 구해왔는데도 뭐가 빠졌는지 모르겠다"는 상황을 없앰.',
    ],
    files: [
      { filename: 'crawler.py' },
      { filename: '설명서.txt' },
    ],
  },
  {
    id: 'burp-history-tool',
    name: 'Burp 히스토리 → 워드리스트 변환기',
    tagline: 'Burp Suite export(XML/텍스트)에서 URL 경로를 뽑아 중복 제거된 워드리스트 + 경로별 메서드 목록 생성',
    standalone: true,
    notes: [
      '네트워크 요청을 전혀 하지 않는 순수 로컬 파싱 도구 -- 다른 도구들의 속도 제한이 여기엔 없음(애초에 요청을 안 보냄).',
      'Burp Proxy > HTTP history에서 "Save items"로 내보낸 XML, 또는 URL/요청줄을 줄 단위로 붙여넣은 텍스트 파일 둘 다 지원, 여러 파일 합치기 가능.',
      '출력된 paths-wordlist.txt를 그대로 crawler.py --wordlist / default_content_scanner.py 대상 경로 선정에 바로 사용 가능. methods-by-path.txt는 경로별로 실제 관측된 HTTP 메서드를 모아줘서 OPTIONS 등 메서드 테스트 대상 고르는 데 씀.',
      '인자 없이 실행하면 파일 경로만 순서대로 물어보는 대화형 모드로 진입.',
    ],
    files: [
      { filename: 'burp_history_to_wordlist.py' },
      { filename: '설명서.txt' },
    ],
  },
]
