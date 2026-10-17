type UpdateGroup = {
  date: string
  items: string[]
}

// Public-facing product updates, kept separate from private task execution history.
const updates: UpdateGroup[] = [
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
    date: '2026-10-13',
    items: [
      '모멘텀 로테이션 설정과 대시보드 표시 개선',
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
      '역량 강화 대시보드에 분야별 변화와 반복 취약점 분석 추가',
      '점심 룰렛 후보 등록과 추첨 화면 추가',
    ],
  },
  {
    date: '2026-09-20',
    items: [
      '블랙박스 진단 엔진을 요청 처리와 가상 대상 구성요소로 분리',
      '역량 진단 결과 검토를 위한 기준 도구와 명세 추가',
    ],
  },
  {
    date: '2026-09-19',
    items: [
      '블랙박스 진단 과거 기록 페이지 나누기와 대화 복구 개선',
      '진단 사례·평가 기준을 세션 시작 시점에 보존하도록 개선',
      '외부 수집 주소 검증과 중복 수집 방지 보강',
    ],
  },
  {
    date: '2026-09-12',
    items: [
      '블랙박스 진단을 자연어 추리 대화와 저장형 세션으로 전환',
      '증거 중심 진단 작업대와 도구 명령어 안내 페이지 추가',
      '상황형 역량 훈련 사례 확대',
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
      '투자 대시보드에 자산·포지션 차트와 손익 요약 화면 추가',
      '차트 확대·이동과 종목별 포지션 표 개선',
      '보안 뉴스 수집 결과를 날짜별 자료로 정리하도록 개선',
    ],
  },
  {
    date: '2026-08-28',
    items: [
      'AI 찬반·자유 토론 기능 추가',
      '토론 화면을 큰 모달 기반의 문서 탐색 형태로 개선',
    ],
  },
  {
    date: '2026-08-27',
    items: [
      'Orchestration Lab 초기 버전 공개: 대시보드, 자료 수집·보관, 에이전트 작업 흐름의 기반 구성',
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
