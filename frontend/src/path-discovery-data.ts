/**
 * 경로/백업 파일 탐색 진단 참고자료 -- 프롬프트 인젝션 진단(diagnostics-data.ts)과 같은 방식
 * (정적 TS 데이터, 백엔드 없음, 다운로드용 파일은 public/diagnostics-fixtures 아래)으로 관리한다.
 * 실제 스캔은 화면에서 실행하지 않는다 -- 다운로드한 파이썬 스크립트를 승인된 대상 앞에서
 * 로컬로 직접 돌린다(대상이 사내망 IP·자기 노트북일 수도 있어서 서버 쪽에서 대신 쏴줄 수 없음).
 */

export interface PathDiscoveryFixture { filename: string; note: string }

export const PATH_DISCOVERY_FIXTURES: PathDiscoveryFixture[] = [
  { filename: 'path_discovery_scan.py', note: '스캐너 본체 -- 표준 라이브러리만 사용, 설치 없이 python3로 바로 실행' },
  { filename: 'path-discovery-wordlist.txt', note: '기본 워드리스트 -- 줄 단위 경로, #으로 주석, 자유롭게 편집 가능' },
]

export const PATH_DISCOVERY_PRINCIPLES: string[] = [
  '소유하거나 명시적으로 허가받은 대상에서만 사용한다 -- 사내망 IP·자기 노트북도 포함해서 된다.',
  'GET/HEAD만 보낸다. 스크립트 자체가 다른 메서드는 거부한다 -- 상태를 바꾸는 요청은 하지 않는다.',
  '동시성·지연 기본값(동시 5, 요청당 0.1초)은 대상에 부담 안 주는 선에서 잡혀 있다 -- 필요해도 과하게 올리지 않는다.',
  '상태코드 하나만 보고 확정하지 않는다 -- 디렉터리 목록화는 본문 시그니처까지 맞아야 "노출"로 잡는다(오탐 방지).',
]

export const PATH_DISCOVERY_HOWTO: string[] = [
  '스캐너와 워드리스트 두 파일을 다운로드한다.',
  '터미널에서 python3 path_discovery_scan.py http://대상[:포트] 실행 -- 대상은 도메인/사설 IP/localhost 전부 가능하다.',
  '승인 확인 프롬프트에 yes 입력(자동화 스크립트에 넣을 땐 --yes로 생략 가능).',
  '진행률이 stderr로 찍히고, 끝나면 의심 항목(200/401/403 + 디렉터리 목록화)이 콘솔 표로 뜬다.',
  '같은 폴더에 path_discovery_findings.csv(--output으로 경로 변경 가능)로도 저장된다 -- 리포트에 그대로 첨부.',
]

export interface PathDiscoveryReading { status: string; meaning: string; severity: string }

export const PATH_DISCOVERY_READING: PathDiscoveryReading[] = [
  { status: '200 (일반 경로)', meaning: '경로가 실제로 공개 상태로 존재한다.', severity: 'Low' },
  { status: '200 + 백업/설정 확장자(.bak/.env/.sql/.git 등)', meaning: '민감할 수 있는 파일이 그대로 열람 가능하다.', severity: 'High' },
  { status: '200 + 디렉터리 목록화 시그니처', meaning: '내부 파일 구조가 노출된다 -- 다음 타겟 탐색의 단서가 된다.', severity: 'Medium' },
  { status: '401', meaning: '경로는 존재하나 인증이 필요하다 -- 엔드포인트 존재 자체가 정보 노출일 수 있다.', severity: 'Info' },
  { status: '403', meaning: '경로는 존재하나 접근이 차단된다 -- 우회 가능 여부는 별도 확인 필요.', severity: 'Info' },
  { status: '404 / 타임아웃', meaning: '워드리스트 범위 안에서는 존재하지 않음 -- 의심 목록에서 자동 제외된다.', severity: '-' },
]
