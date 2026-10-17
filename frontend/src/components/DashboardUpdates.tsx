type UpdateGroup = {
  date: string
  items: string[]
}

// Public-facing product updates, kept separate from private task execution history.
const updates: UpdateGroup[] = [
  {
    date: '2026-10-17',
    items: [
      '접근 기록 지도 확대 시 위치 포인트 테두리 크기 유지',
      '관리 페이지에 카드 혜택 관리 기능 추가',
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
]

export function DashboardUpdates() {
  return <section id="dash-updates" className="dashboard-updates" aria-labelledby="dashboard-updates-title">
    <header className="dashboard-updates-header">
      <div>
        <span className="dashboard-updates-eyebrow">PRODUCT UPDATES</span>
        <h2 id="dashboard-updates-title">업데이트 기록</h2>
      </div>
      <span className="dashboard-updates-caption">최신 변경 사항</span>
    </header>
    <div className="dashboard-updates-list">
      {updates.map(group => <section className="dashboard-update-group" key={group.date}>
        <h3><time dateTime={group.date}>{group.date.replaceAll('-', '.')}</time></h3>
        <ul>
          {group.items.map(item => <li key={item}>{item}</li>)}
        </ul>
      </section>)}
    </div>
  </section>
}
