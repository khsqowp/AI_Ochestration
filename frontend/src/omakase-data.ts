import rawTopics from './omakase-topics.json'

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
// 데이터 본문은 omakase-topics.json에 있다 — 빌드 시 scripts/generate-omakase-pages.mjs가 같은
// JSON을 순수 Node에서 그대로 읽어 /omakase/<topic>/<file>/ 정적 SEO 페이지를 생성하기 때문에,
// TS 전용 문법(함수·주석 등) 없는 순수 JSON으로 분리해 두 쪽이 같은 데이터를 보게 한다.
export const OMAKASE_TOPICS: OmakaseTopic[] = rawTopics as OmakaseTopic[]
