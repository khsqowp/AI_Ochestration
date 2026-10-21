type UpdateGroup = {
  date: string
  items: string[]
}

// Public-facing product updates, kept separate from private task execution history.
const updates: UpdateGroup[] = [
  {
    date: '2026-10-18',
    items: [
      '진단 페이지 카테고리 재구성: 클라우드를 클라우드 설정/CDN·프록시/기술스택/Git·시크릿/DNS·서브도메인 5개로 분리',
      '카테고리마다 전용 아이콘·색상 적용해 한눈에 구분되도록 개선, 작은 글씨 가독성 개선',
      '웹쉘 레퍼런스에 업로드 필터 우회용 위장 포맷(HTML/PDF/DOCX/TXT/MD/JPG/JPEG/MKV/MP4) 추가',
      '역쉘, Git·시크릿 노출 점검, 클라우드 스토리지 버킷 권한 점검, OS Command Injection, DNS 테이크오버 점검 도구 추가',
      '펜테스트 도구 카테고리를 네트워크 정찰/웹 공격·퍼징/인증·크리덴셜 공격/내부망(AD·SMB)/익스플로잇 프레임워크 5개로 분리',
      '표준 도구(TOOL)·OS 명령어(OS) 섹션 구분 라벨 추가, Burp Comparer·History 뷰어를 상단 분석 도구로 재배치',
      '오마카세 131개 문서를 검색엔진이 읽을 수 있는 정적 페이지(/omakase/문서별 URL)로 전환, sitemap.xml·robots.txt·검색엔진 소유권 인증 추가',
    ],
  },
  {
    date: '2026-10-21',
    items: [
      '진단 기록판 사이드바에 상태별 필터·건수와 항목별 상태 표시 추가',
      '넓은 화면에서 진단 도구가 가로·세로 공간을 채우도록 표시 개선',
      '오마카세 문서에 구조화 데이터·수정일·앞뒤 글 이동 추가, 사이트 보안 헤더 보강',
      '게임 7종과 무료 도구 5종을 모은 공개 페이지 추가, 게임 타일 배치 오류 수정',
      '오목 온라인 대국·타자 레이스와 스네이크·지뢰찾기·반응속도 순위표 추가',
    ],
  },
  {
    date: '2026-10-20',
    items: [
      '사용자별 진단 기록판 추가: 기록 작성·수정·삭제, 이미지 첨부와 상태 관리 지원',
      '진단 기록판 이미지 보관 및 업로드 형식 제한 개선, 저장 실패 시 이동 방지',
      '진단 기록판에서 저장하지 못한 초안을 다시 열었을 때 복구하도록 개선',
      'JavaScript 파서에서 aes-256-cbc 등 암호 알고리즘·모드 문자열 전체를 탐지하도록 개선',
    ],
  },
  {
    date: '2026-10-19',
    items: [
      'JavaScript 파서에 보안 키워드 탐지와 코드 문법·탐지 결과 강조 표시 추가',
      '폐쇄망에서 사용하는 해시 분석 도구 추가: 사전·브루트포스 대조와 일괄 처리 지원',
      'HAR 엔드포인트·JavaScript 경로 트리·공통 경로 체크리스트를 각각 독립 도구로 분리',
      '공통 경로 체크리스트에 카테고리별 일괄 선택과 Intruder용 목록 생성 추가, 경로 트리에 제외 키워드 필터 추가',
      '사용량 화면에서 저장된 비용과 미산정 사용량을 함께 계산하도록 비용 집계 오류 수정',
    ],
  },
  {
    date: '2026-10-17',
    items: [
      '개선함 페이지 추가 및 권한별 열람 범위 적용',
    ],
  },
  {
    date: '2026-10-16',
    items: [
      '진단 페이지에 HTTP 스머글링, CORS, 파일 업로드, JWT, OAuth·SSO, 웹쉘 점검 도구 추가',
      '진단 페이지에 JavaScript 파서, SSTI·XXE·역직렬화, LFI, Nuclei, CDN 우회, 클라우드 노출 점검 도구 추가',
      'OAuth 리다이렉트, JWT 검증, 클라우드 점검 및 JavaScript 파서 오류 수정',
      '웹쉘 레퍼런스에 Security_Test 다운로드와 실행 안내 추가',
    ],
  },
  {
    date: '2026-10-09',
    items: [
      '정찰 도구의 기본 파일 탐색 예산 배분 수정 및 수동 탐지 기능 보강',
    ],
  },
  {
    date: '2026-10-08',
    items: [
      '복합 인코딩을 단계별로 확인하는 트리형 디코더 추가',
      '여러 해시 일괄 처리와 Burp History 분석 도구 추가',
      'Burp Comparer의 JSON·XML 자동 포맷 및 비교 오류 수정',
    ],
  },
  {
    date: '2026-10-07',
    items: [
      '정찰 도구의 요청 진행 상황 표시와 여러 세션 쿠키 지원 추가',
    ],
  },
  {
    date: '2026-10-06',
    items: [
      '진단 도구를 독립 페이지로 분리하고 Burp Comparer 추가',
      '경로 트리 분석기의 확대·축소와 화면 표시 개선',
    ],
  },
  {
    date: '2026-10-05',
    items: [
      'HAR 엔드포인트 트리와 JavaScript URL·API 경로 트리 추가',
      '정찰·백업 파일 탐색 기능을 통합 도구로 정리',
      '학습 자료에서 파일별 마지막 위치와 스크롤 위치 기억',
    ],
  },
  {
    date: '2026-10-03',
    items: [
      'Obsidian 스타일의 마크다운 학습 자료 뷰어 추가',
      '웹 취약점 진단 체크리스트와 KISA 주요정보통신기반시설 주제 추가',
      '로컬 LLM 대화 모달을 실제 대화 모드와 스트리밍 응답에 맞게 개선',
    ],
  },
  {
    date: '2026-10-01',
    items: [
      '정찰 스캐너의 XSS·경로 탐색 기능과 입력 자료 확장',
      '취약점 판정에 실제 관측 근거를 우선하도록 진단 결과 표현 개선',
      'JWT 분석기에 JWE 구조 분석 지원 추가',
    ],
  },
  {
    date: '2026-09-30',
    items: [
      'Next.js 기술 식별과 여러 워드리스트 결합 기능 추가',
      '진단 스크립트와 워드리스트를 오프라인 번들로 제공',
    ],
  },
  {
    date: '2026-09-28',
    items: [
      'XSS Scout와 Client Route Scout를 진단 도구에 추가',
      '웹훅 수신 테스트 도구와 Clickjacking PoC 작성 도구 추가',
      'Nmap TLS 암호군 점검 시작 안내와 Burp Suite 치트시트 보강',
    ],
  },
  {
    date: '2026-09-26',
    items: [
      '정찰·취약점 스캐너 모음과 경로·백업 파일 탐색 모듈 추가',
      '프롬프트 인젝션 진단에 단계형 가이드 추가',
      '랜딩 화면의 3D 배경과 대시보드 시각 요소 개선',
    ],
  },
  {
    date: '2026-09-23',
    items: [
      '프롬프트 인젝션 테스트에 표현별 시나리오 비교 기능 추가',
      '점심 룰렛을 실제 추첨·시각화 방식으로 개선',
      '대화·노트 화면의 사용성과 보관 자료 오류 안내 개선',
    ],
  },
  {
    date: '2026-09-22',
    items: [
      '점심 룰렛 후보 등록과 추첨 화면 추가',
    ],
  },
  {
    date: '2026-09-12',
    items: [
      '증거 중심 진단 작업대와 도구 명령어 안내 페이지 추가',
    ],
  },
  {
    date: '2026-09-11',
    items: [
      '자동 판별과 재인코딩을 지원하는 스마트 디코더 추가',
    ],
  },
  {
    date: '2026-09-10',
    items: [
      'XSS·SQLi·SSRF·CSRF 요청 작성을 돕는 페이로드 빌더 확장',
      '대시보드와 노트 화면의 구역 크기 조절 기능 추가',
      '3D 배경과 실시간 날씨를 포함한 랜딩 화면 개편',
    ],
  },
  {
    date: '2026-09-03',
    items: [
      '로컬 LLM 연결과 대화 모달의 연결 오류 복구 개선',
    ],
  },
  {
    date: '2026-09-02',
    items: [
      '로컬 LLM 대화에 모델명 표시와 마크다운 응답 렌더링 추가',
      '대시보드에서 사용자별 로컬 LLM 세션을 구분하도록 개선',
    ],
  },
  {
    date: '2026-08-30',
    items: [
      '보안 뉴스 수집 결과를 날짜별 자료로 정리하도록 개선',
    ],
  },
  {
    date: '2026-08-27',
    items: [
      'Orchestration Lab 초기 버전 공개: 대시보드, 보안 진단 도구, 자료 보관 화면 제공',
    ],
  },
]

export function DashboardUpdates() {
  const orderedUpdates = [...updates].sort((a, b) => b.date.localeCompare(a.date))

  return <section id="dash-updates" className="dashboard-updates" aria-labelledby="dashboard-updates-title">
    <header className="dashboard-updates-header">
      <div>
        <span className="dashboard-updates-eyebrow">PRODUCT UPDATES</span>
        <h2 id="dashboard-updates-title">업데이트 기록</h2>
      </div>
      <span className="dashboard-updates-caption">최신 변경 사항</span>
    </header>
    <div className="dashboard-updates-list">
      {orderedUpdates.map(group => <section className="dashboard-update-group" key={group.date}>
        <h3><time dateTime={group.date}>{group.date.replaceAll('-', '.')}</time></h3>
        <ul>
          {group.items.map(item => <li key={item}>{item}</li>)}
        </ul>
      </section>)}
    </div>
  </section>
}
