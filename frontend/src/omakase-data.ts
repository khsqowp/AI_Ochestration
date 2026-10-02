export type OmakaseFile = { id: string; title: string; path: string }
export type OmakaseSection = { title: string; fileIds: string[] }
export type OmakaseTopic = {
  id: string
  title: string
  subtitle: string
  accent: string
  files: OmakaseFile[]
  sections: OmakaseSection[]
}

// 각 토픽은 /public/omakase-content/<id>/ 밑에 정적 마크다운 파일로 존재 — 런타임에 fetch() 로 읽어온다.
// (폴더명을 /omakase 로 두면 SPA 라우트 /omakase 와 겹쳐서 nginx가 디렉터리로 보고 301→403 내버린다.)
// 파일명은 ASCII 숫자(01.md..)로 고정해 인코딩/URL 이슈를 피하고, 실제 표시 제목은 여기 title 로 따로 관리.
export const OMAKASE_TOPICS: OmakaseTopic[] = [
  {
    id: 'pentest-server-to-cloud',
    title: '서버 한 대로 시작하는 실전 모의해킹',
    subtitle: '셸 접속부터 Apache·Tomcat·Oracle DB, AWS·CDN 공격 경로, 최종 보고서까지 — 22강',
    accent: '#58a6ff',
    sections: [
      { title: '섹션 1. 리눅스 서버 한 대 완전정복', fileIds: ['01', '02', '03', '04', '05', '06'] },
      { title: '섹션 2. 웹 서버와 애플리케이션', fileIds: ['07', '08'] },
      { title: '섹션 3. 데이터베이스와 전체 흐름', fileIds: ['09', '10'] },
      { title: '섹션 4. 공격 경로 조립과 증명', fileIds: ['11', '12', '13', '14', '15'] },
      { title: '섹션 5. 클라우드로 확장하기', fileIds: ['16', '17', '18', '19', '20'] },
      { title: '섹션 6. 독립 진단과 마무리', fileIds: ['21', '22'] },
    ],
    files: [
      { id: '01', title: '01. 서버 진입과 셸: 진단자의 사고방식 세우기', path: '/omakase-content/pentest-server-to-cloud/01.md' },
      { id: '02', title: '02. 파일과 경로 탐색: 서비스로부터 설정을 역추적하기', path: '/omakase-content/pentest-server-to-cloud/02.md' },
      { id: '03', title: '03. 계정과 파일 권한: effective 권한과 신뢰 매트릭스', path: '/omakase-content/pentest-server-to-cloud/03.md' },
      { id: '04', title: '04. 프로세스와 서비스: 실행 상태의 증거 잡기', path: '/omakase-content/pentest-server-to-cloud/04.md' },
      { id: '05', title: '05. 네트워크와 방화벽', path: '/omakase-content/pentest-server-to-cloud/05.md' },
      { id: '06', title: '06. 로그, 패키지와 SELinux', path: '/omakase-content/pentest-server-to-cloud/06.md' },
      { id: '07', title: '07. Apache 요청 경로: URL에서 실제 파일 또는 WAS까지 추적하기', path: '/omakase-content/pentest-server-to-cloud/07.md' },
      { id: '08', title: '08. Tomcat과 앱 배포: 공통 실습 앱 labapp의 구조 확정', path: '/omakase-content/pentest-server-to-cloud/08.md' },
      { id: '09', title: '09. Oracle DB 최소 조작', path: '/omakase-content/pentest-server-to-cloud/09.md' },
      { id: '10', title: '10. 전체 서비스 연결 진단', path: '/omakase-content/pentest-server-to-cloud/10.md' },
      { id: '11', title: '11. 자산과 신뢰 경계: 지금까지의 조각을 하나의 지도로 조립하기', path: '/omakase-content/pentest-server-to-cloud/11.md' },
      { id: '12', title: '12. 파일 읽기 영향 범위: 필터는 왜, 어떻게 뚫리는가', path: '/omakase-content/pentest-server-to-cloud/12.md' },
      { id: '13', title: '13. 노출 정보와 다음 단계', path: '/omakase-content/pentest-server-to-cloud/13.md' },
      { id: '14', title: '14. 접근 경로와 권한 검증', path: '/omakase-content/pentest-server-to-cloud/14.md' },
      { id: '15', title: '15. 영향 입증과 수정', path: '/omakase-content/pentest-server-to-cloud/15.md' },
      { id: '16', title: '16. AWS 최소망과 EC2: 클라우드 네트워크를 진단자의 눈으로 읽기', path: '/omakase-content/pentest-server-to-cloud/16.md' },
      { id: '17', title: '17. IAM 역할과 S3 권한: 메타데이터 탈취 패턴을 실무 깊이로 이해하기', path: '/omakase-content/pentest-server-to-cloud/17.md' },
      { id: '18', title: '18. AWS 공격 경로 검증: 리눅스 파일 노출을 클라우드 맥락으로 확장하기', path: '/omakase-content/pentest-server-to-cloud/18.md' },
      { id: '19', title: '19. CloudFront 오리진과 캐시: CDN이 숨기는 것과 드러내는 것', path: '/omakase-content/pentest-server-to-cloud/19.md' },
      { id: '20', title: '20. Cloudflare 진단 관점 비교: 같은 질문, 다른 화면', path: '/omakase-content/pentest-server-to-cloud/20.md' },
      { id: '21', title: '21. 독립 인프라 진단', path: '/omakase-content/pentest-server-to-cloud/21.md' },
      { id: '22', title: '22. 최종 보고와 재검증', path: '/omakase-content/pentest-server-to-cloud/22.md' },
    ],
  },
]
