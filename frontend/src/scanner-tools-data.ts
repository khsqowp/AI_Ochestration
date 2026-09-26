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

export interface ScannerFile { filename: string; note?: string }

export interface ScannerTool {
  id: string
  name: string
  tagline: string
  standalone: boolean // 외부 워드리스트/의존성 없이 바로 동작하는지 (false면 옵션 일부만 그럼)
  notes: string[]
  files: ScannerFile[]
}

export const SCANNER_TOOLS: ScannerTool[] = [
  {
    id: 'default-content-scanner',
    name: '기본 콘텐츠/백업 파일 스캐너',
    tagline: 'Tomcat/Apache/nginx/IIS 기본 파일 + 백업 확장자 변형 + 경로순회(Traversal) 퍼징',
    standalone: true,
    notes: [
      '기본 동작(내장 generic 목록)은 추가 워드리스트 없이 바로 됨 -- --tech/--traversal용 SecLists·PayloadsAllTheThings 목록은 없으면 자동으로 건너뜀(에러 아님).',
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
      'GET/HEAD/OPTIONS만 사용, 리다이렉트 안 따라감, 상태 변경 요청 없음 -- 가장 가벼운 점검.',
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
    id: 'jwt-analyzer',
    name: 'JWT 구조 분석기',
    tagline: 'alg=none / kid·jku·x5u 인젝션 가능성 / 알고리즘 컨퓨전 PoC 토큰 생성',
    standalone: true,
    notes: [
      '분석/PoC 토큰 생성만 함 -- 실제 서버에 테스트하는 건 별도 행위, 권한 있는 대상에만.',
      '--crack-secret은 로컬 HMAC 재계산이라 네트워크 요청 없음 -- 워드리스트는 직접 지정 필요(기본 경로는 SecLists 전제라 없으면 --wordlist로 지정).',
    ],
    files: [
      { filename: 'jwt_analyzer.py' },
      { filename: '설명서.txt' },
    ],
  },
  {
    id: 'crypto-identifier',
    name: '해시/인코딩 식별기',
    tagline: '정체불명 문자열 자동 디코드(base64/hex/rot13 등) + 해시 포맷 추정 + 로컬 사전 크랙',
    standalone: true,
    notes: [
      '무솔트 빠른 해시(md5/sha1/sha256 등)만 --crack으로 로컬 크랙 -- 워드리스트 직접 지정 필요.',
      'bcrypt 등 느린 포맷은 hashcat/john 명령어를 "출력만" 함(자동 실행 안 함, 로컬에 해당 도구 없으면 명령어만 참고).',
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
      '취약점 스캐너 아님(discovery 전용) -- 동시 요청 캡 + 호스트별 최소 간격이 항상 강제됨(끌 수 없음).',
      '--wordlist로 경로 존재 탐색도 같이 가능(옵션, 직접 워드리스트 지정 필요).',
    ],
    files: [
      { filename: 'crawler.py' },
      { filename: '설명서.txt' },
    ],
  },
]
