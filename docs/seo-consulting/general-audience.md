# 일반 사용자 대상 무료 게임·도구 SEO/UX 전략

## 결론과 범위

`/tools`와 13개 `/tools/:slug` 페이지는 일반 검색 유입의 출발점으로 쓸 수 있지만, 현재 검색엔진이 처음 받는 HTML에는 각 페이지의 제목·설명·본문이 없다. **최우선 과제는 14개 URL에 고유한 서버 응답 HTML을 제공하는 것**이다. 그다음 실제 기능에 맞는 검색어와 설명 문구를 붙이고, 디렉터리·사이트맵에서 각 URL을 발견할 수 있게 해야 한다. 검색 노출이나 색인 실패를 실제로 측정한 결과는 아니며, 배포 응답·Google Search Console·검색량은 **확인 필요**다.

- 분석 범위: `/tools`, 게임 7개, 도구 6개. 코드 읽기만 수행했으며 사이트 운영 상태와 검색 결과는 확인하지 않았다.
- 완료 기준: 13개 URL별 현재 메타데이터와 제안 문구, 렌더링·본문·내부 링크·구조화 데이터 평가, 우선순위와 상위 5개 실행 위치를 포함한다.
- 검색 의도 기준: 비보안 전문가가 기능 이름과 일상 문제로 찾는 검색어를 사용한다. 검색량·난도·순위·클릭률 수치는 없다. 우선 키워드의 실제 수요는 **확인 필요**다.

## 1. 페이지별 메타데이터 실태와 제안

`frontend/src/App.tsx:38-39`는 디렉터리를 `/tools`, 기능을 `/tools/:slug`로 연결한다. 13개 `frontend/src/features/public-tools/<slug>/index.tsx`는 **모두 `FeaturePage`를 재내보내는 한 줄**이다. 라우트는 이 파일들을 직접 가져오지 않으며, 실제 기능과 SEO 처리는 `frontend/src/features/public-tools/FeaturePage.tsx:6-23`에 있다.

현재 브라우저에서 JavaScript 실행 후 각 기능의 `<title>`은 **고유하다**. 형식은 `{현재 이름} | Orchestration Lab`이다. `<meta name="description">`도 생성되지만 내용은 `{현재 이름}를 광고 없이 브라우저에서 사용하는 무료 도구입니다.`라는 한 가지 템플릿에서 이름만 바뀐다. 따라서 “13개 페이지가 브라우저에서도 같은 제목”이라는 진단은 틀리다. 반대로 `frontend/index.html:6`의 원본 `<title>`은 모두 `Orchestration Lab`이고 원본에는 description 자체가 없다. JavaScript 실행 전 HTML만 읽는 크롤러·공유 미리보기에는 13개가 구분되지 않는다. Google은 JavaScript를 렌더링할 수 있으므로 **전부 색인되지 않는다거나 반드시 같은 제목으로 노출된다고 단정할 수 없다**. 다만 렌더링 지연·실패와 얇은 중복 문구 때문에 개별 검색 의도를 전달하는 신호가 약하다. 제목·설명 중복이나 카니발라이제이션은 **가능한 위험**이며 실제 발생 여부는 Search Console에서 확인해야 한다.

아래 표의 제안 설명은 실제 제공 기능만 약속한다. 각 소개 문구는 H1 바로 아래에 보이는 본문으로 넣고, 조작법·제한사항은 별도 소제목 아래에 확장한다. 현재 description의 전체 문장은 위 템플릿에 표의 현재 이름을 대입하면 된다.

| URL / 구분 | 현재 이름 = JavaScript 실행 후 제목 앞부분 | 권장 `<title>` | 권장 meta description | 페이지 소개 문구 예시 |
| --- | --- | --- | --- | --- |
| `/tools/snake` 게임 | 스네이크 | 스네이크 게임 - 방향키로 즐기는 무료 온라인 게임 · Orchestration Lab | 방향키로 뱀을 움직여 먹이를 먹는 스네이크 게임입니다. 점수를 확인하고 새 게임을 시작해 보세요. | 방향키로 뱀을 움직여 먹이를 먹으세요. 벽이나 몸에 닿으면 게임이 끝납니다. 점수를 올리며 다시 도전할 수 있습니다. |
| `/tools/minesweeper` 게임 | 지뢰찾기 | 지뢰찾기 온라인 - 8×8 무료 게임 · Orchestration Lab | 8×8 칸에서 지뢰 8개를 피해 칸을 여는 지뢰찾기 게임입니다. 의심되는 칸은 마우스 오른쪽 버튼으로 표시하세요. | 칸을 누르면 주변 지뢰 수를 확인할 수 있습니다. 지뢰가 있다고 생각하는 칸은 오른쪽 클릭으로 깃발을 표시하세요. 현재 자동 빈칸 확장과 승리 판정은 없습니다. |
| `/tools/roulette` 게임 | 룰렛 | 랜덤 룰렛 - 선택지에서 하나 뽑기 · Orchestration Lab | 점심 메뉴나 활동 후보를 입력하고 한 가지를 무작위로 선택하세요. 입력 후 버튼을 누르면 결과가 바로 표시됩니다. | 고르기 어려운 메뉴나 활동을 줄마다 입력하세요. 버튼을 누르면 입력한 선택지 중 하나를 보여줍니다. 회전하는 원판 화면은 제공하지 않습니다. |
| `/tools/ladder` 게임 | 사다리타기 | 사다리타기 대체 도구 - 참가자 번호 랜덤 배정 · Orchestration Lab | 참가자 이름을 쉼표로 입력해 무작위 순서와 번호를 배정하세요. 빠르게 역할이나 순서를 정할 때 사용할 수 있습니다. | 참가자 이름을 입력하면 순서를 섞어 1번부터 번호를 붙입니다. 현재 사다리 선을 그리거나 결과 항목과 연결하는 기능은 없습니다. |
| `/tools/gomoku` 게임 | 오목 | 온라인 오목판 - 두 사람이 번갈아 두는 무료 게임 · Orchestration Lab | 한 화면에서 흑돌과 백돌을 번갈아 놓는 오목판입니다. 새 게임으로 판을 비우고 다시 시작할 수 있습니다. | 두 사람이 번갈아 빈 칸을 눌러 돌을 놓으세요. 먼저 다섯 개를 잇는 방식으로 즐길 수 있지만, 현재 승패는 자동 판정되지 않습니다. |
| `/tools/rhythm` 게임 | 리듬 게임 | 반응속도 테스트 - 화면 색이 바뀌면 누르기 · Orchestration Lab | 시작 후 화면이 초록색으로 바뀌는 순간 누르세요. 반응 시간을 밀리초로 확인할 수 있습니다. | 시작을 누르고 초록색 신호를 기다리세요. 신호가 나온 뒤 누르기까지 걸린 시간을 보여줍니다. 음악 박자에 맞추는 게임은 아닙니다. |
| `/tools/typing-race` 게임 | 타자 연습 속도 측정 | 타자 연습 - 한글·영어 입력 속도와 정확도 확인 · Orchestration Lab | 한글 또는 영어 문장을 따라 입력하고 정확도와 입력 속도(WPM)를 확인하세요. 브라우저에서 바로 연습할 수 있습니다. | 언어를 고르고 화면의 문장을 그대로 입력하세요. 입력 중 정확도와 WPM이 표시됩니다. 현재 다른 사용자와 경쟁하는 경주는 없습니다. |
| `/tools/order-picker` 도구 | 순서 정하기 | 순서 정하기 - 이름을 섞는 무료 도구 · Orchestration Lab | 이름이나 항목을 줄마다 입력해 무작위 순서를 만드세요. 발표·게임·업무 순서를 빠르게 정할 수 있습니다. | 참가자 이름을 한 줄에 하나씩 적고 ‘순서 섞기’를 누르세요. 무작위 순서가 목록으로 표시됩니다. |
| `/tools/random-draw` 도구 | 랜덤 추첨기 | 랜덤 추첨기 - 이름 중 한 명 뽑기 · Orchestration Lab | 이름을 줄바꿈이나 쉼표로 입력하고 한 명을 무작위로 뽑으세요. 소규모 추첨에 바로 사용할 수 있습니다. | 추첨할 이름을 입력한 뒤 ‘한 명 추첨’을 누르세요. 입력한 대상 중 한 명이 화면에 표시됩니다. |
| `/tools/expense-split` 도구 | 회식·여행 비용 정산기 | N분의 1 계산기 - 회식·여행비 나누기 · Orchestration Lab | 참가자와 총 지출을 입력하면 1인당 금액을 원 단위로 올림해 보여줍니다. 간단한 공동 비용 분담에 쓰세요. | 참가자와 총 지출액을 입력하면 인원수로 나눈 1인당 금액을 확인할 수 있습니다. 금액은 원 단위로 올림하며 개인별 결제 내역이나 잔돈 정산은 계산하지 않습니다. |
| `/tools/date-calculator` 도구 | 날짜·영업일 계산기 | 날짜 계산기 - 두 날짜 사이 일수·주말 제외 일수 · Orchestration Lab | 시작일과 종료일을 선택해 양 끝 날짜를 포함한 총 일수와 주말을 제외한 일수를 계산하세요. 공휴일은 반영하지 않습니다. | 여행·일정 기간을 날짜로 선택하면 시작일과 종료일을 모두 포함한 일수를 보여줍니다. 주말 제외 수치도 확인할 수 있으며 공휴일은 반영하지 않습니다. |
| `/tools/unit-converter` 도구 | 단위 변환기 | 단위 변환기 - km·마일, 섭씨·화씨 등 · Orchestration Lab | km→마일, 섭씨→화씨, kg→파운드, cm→m 네 가지 변환을 입력과 동시에 확인하세요. | 숫자를 입력하고 변환 종류를 고르세요. 현재 길이·온도·무게의 네 가지 지정된 방향만 지원합니다. |
| `/tools/image-ocr` 도구 | 이미지 OCR | 이미지 글자 추출 - 한글·영어 OCR 도구 · Orchestration Lab | 이미지에서 한글·영어 문자를 인식해 텍스트로 보여줍니다. 언어 데이터는 처음 사용할 때 다운로드됩니다. | 이미지 파일을 선택하면 브라우저에서 한글·영어 글자를 인식합니다. 결과를 확인하고 복사할 수 있으며 첫 사용 때 언어 데이터를 내려받습니다. |

**기능과 검색 의도의 충돌:** `ladder`는 실제 사다리 그림이나 결과 연결이 없는 번호 섞기, `rhythm`은 음악 리듬 게임이 아닌 반응속도 측정, `typing-race`는 대결이 아닌 개인 타자 측정이다(`FeaturePage.tsx:14,18,21`). 이 URL을 각각 “사다리타기 게임”, “리듬 게임”, “타자 배틀”로 적극 홍보하면 검색 방문자의 기대를 어긴다. 위 문구는 현재 기능을 정확히 표현한다. 실제 사다리·리듬·대결 검색 의도를 노리려면 먼저 기능 보강이 필요하다.

## 2. 렌더링과 색인 가능성

`frontend/src/App.tsx:31-39`는 `BrowserRouter` 안에 `/tools`와 `/tools/:slug`를 선언한다. 두 페이지는 **정적 import**이며 `React.lazy`를 쓰는 쪽은 진단/대시보드 등 다른 페이지다(`App.tsx:21-29`). 따라서 이 두 경로의 주된 문제는 lazy 로딩 자체가 아니라 **클라이언트 렌더링**이다. `frontend/index.html:6,12,22`의 초기 HTML에는 공통 제목, 빈 `#root`, JavaScript 진입점만 있다. `frontend/vite.config.ts:1-5`에는 React/Vite 플러그인만 있고 SSR 또는 `/tools` 사전 렌더링 설정이 없다. 빌드 명령은 Vite 빌드 뒤 omakase 전용 생성 스크립트를 실행한다(`frontend/package.json:8`). 그 스크립트는 `/`와 `/omakase` 및 omakase 글만 HTML·사이트맵에 넣는다(`frontend/scripts/generate-omakase-pages.mjs:74-131`). 현재 스크립트 기준 `/tools`와 13개 기능 URL은 사이트맵에도 없다.

Google은 JavaScript를 실행해 React 본문과 동적으로 바뀐 제목을 발견할 수 있다. 하지만 렌더링이 별도 단계로 지연되거나 리소스 오류로 실패할 수 있고, 다른 크롤러·미리보기 서비스는 JavaScript를 실행하지 않을 수 있다. 코드만으로 실제 Google 색인 상태, 서버의 SPA fallback 응답, 배포 HTML 또는 미리보기 표시를 확인할 수 없다. **확인 필요:** 배포된 14개 URL의 HTTP 상태·원본 응답 HTML, Search Console의 ‘페이지 색인 생성’ 및 URL 검사에서 렌더링된 HTML, 실제 검색 결과의 제목과 스니펫.

권장 방식은 **14개 공개 URL의 HTML 사전 렌더링**이다. 최소한 각각의 정적 HTML에 고유 `<title>`, meta description, canonical, H1, 설명 본문, 일반 `<a href>`를 담고 React를 이어 붙인다. 현재 omakase 생성기가 별도 HTML을 만드는 패턴은 참고할 수 있으나, `/tools`의 실제 인터랙션과 일치하는 본문을 생성해야 한다. 서버 응답을 확인하기 전에는 기존 SPA fallback을 전제로 구현을 확정하지 않는다. `robots.txt`는 `/tools`를 차단하지 않는다(`frontend/public/robots.txt:1-8`).

## 3. 본문 콘텐츠와 UX

`FeaturePage.tsx:23`의 13개 페이지 공통 본문은 H1, “광고 없이 바로 사용하는 무료 도구”라는 짧은 문구, 기능 UI, 풋터뿐이다. 위 표의 **‘페이지 소개 문구 예시’ 13개**를 각 페이지에 추가하는 것이 첫 단계다. 현재 `snake`는 방향키 힌트, `minesweeper`는 보드 크기·우클릭, `rhythm`은 신호 설명, `image-ocr`은 처리·언어 데이터 안내 등 일부 사용법이 이미 있다(`FeaturePage.tsx:9,12,18,20`). 반면 기능을 언제 쓰는지, 입력·출력 예시, 제한사항을 설명하는 짧은 본문은 없다. 코드상 모든 페이지에 고유한 긴 설명 섹션도 없다.

설명은 검색어 반복용 문단이 아니라 첫 방문자가 바로 쓸 수 있는 정보여야 한다. H1 아래에 한두 문장, UI 아래에 `사용 방법`과 `알아둘 점`을 배치한다. 특히 날짜 계산기는 ‘양 끝 날짜 포함·공휴일 미반영’(`FeaturePage.tsx:17`), 비용 정산은 ‘1인당 원 단위 올림’(`FeaturePage.tsx:16`), 오목은 ‘승패 자동 판정 없음’(`FeaturePage.tsx:15`), OCR은 ‘언어 데이터 최초 다운로드’(`FeaturePage.tsx:20`)를 표시해야 한다. 설명과 실제 동작이 다르면 이탈을 늘리고 신뢰를 깎는다. 모바일에서 지뢰찾기의 오른쪽 클릭 안내와 대체 조작 가능 여부는 **확인 필요**다.

## 4. 구조화 데이터

`WebApplication`과 게임에 맞는 `VideoGame` JSON-LD는 각 URL의 유형과 기능을 기계가 이해하는 데 보조 신호가 될 수 있다. **구조화 데이터만으로 색인·상위 노출·리치 결과가 보장되지는 않는다.** 사전 렌더링 HTML에 해당 페이지의 실제 보이는 이름·설명·URL과 일치하게 넣는다. 사이트 주소는 현재 omakase 생성 스크립트의 `BASE_URL`을 사용한 예시이며, 배포의 정식 URL은 **확인 필요**다. `price`·평점·리뷰·지원 플랫폼 같은 확인되지 않은 속성은 넣지 않는다.

지뢰찾기 페이지 예시:

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "VideoGame",
  "name": "지뢰찾기 온라인",
  "description": "8×8 칸에서 지뢰 8개를 피해 칸을 여는 브라우저 게임",
  "url": "https://lab.khsqowp1.my/tools/minesweeper",
  "inLanguage": "ko"
}
</script>
```

날짜 계산기 페이지 예시:

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "날짜 계산기",
  "description": "두 날짜 사이의 총 일수와 주말을 제외한 일수를 계산하며 공휴일은 반영하지 않는 도구",
  "url": "https://lab.khsqowp1.my/tools/date-calculator",
  "inLanguage": "ko",
  "applicationCategory": "UtilitiesApplication"
}
</script>
```

구현 후에는 실제 배포 HTML에 JSON-LD가 포함되는지와 Schema.org 문법·Google 지원 여부를 각각 검증한다. `VideoGame`을 Google이 별도 검색 기능으로 표시할지는 **확인 필요**다.

## 5. 내부 링크와 탐색성

`ToolsDirectoryPage.tsx:4-7`는 7개 ‘게임’과 6개 ‘이외 기능’ 카드를 모두 `<Link to="/tools/<slug>">`로 감싼다. **링크 텍스트가 오직 “광고 없이 열기 ↗”인 것은 아니다.** 같은 앵커 안에 `<strong>{name}</strong>`가 있어 ‘지뢰찾기 광고 없이 열기 ↗’처럼 이름도 포함된다. 다만 공통 CTA가 13번 반복되고 카드에는 무슨 일을 하는지 설명이 없다. 카드마다 한 문장 요약을 넣고, CTA를 `지뢰찾기 시작하기`, `날짜 계산하기`, `이미지 글자 추출하기`처럼 목적에 맞게 바꾸면 사용자가 클릭 전 결과를 알 수 있다. 그룹 구분은 유지한다.

`LandingPage.tsx:46`의 ‘게임과 도구 둘러보기’ 링크는 `/tools`로 들어오는 경로 하나를 만든다. 랜딩에는 개별 기능으로 가는 링크가 없고, 디렉터리는 JavaScript 실행 전 원본 HTML에 없다. 사전 렌더링한 디렉터리에는 13개 일반 앵커를 포함하고, 중요 기능 일부를 랜딩의 짧은 목록에서도 직접 연결하면 탐색 깊이를 줄일 수 있다. 기능 페이지의 ‘모든 도구’/‘도구 목록’ 링크는 이미 있다(`FeaturePage.tsx:23`). 관련 기능끼리 이어 줄 때는 실제로 연관된 쌍만 사용한다. 예: `순서 정하기 ↔ 랜덤 추첨기`, `날짜 계산기 ↔ 단위 변환기`는 후자의 연관성이 약하므로 강제하지 않는다.

## 6. 우선순위와 상위 5개 실행 방법

| 우선순위 | 발견 | 판단 근거 |
| --- | --- | --- |
| **CRITICAL** | `/tools`와 13개 기능의 원본 HTML에 페이지별 제목·설명·본문·링크가 없음 | `index.html:6,12,22`, `App.tsx:38-39`, `vite.config.ts:5`. JavaScript 렌더링에 전적으로 의존한다. 실제 색인 실패는 미확인. |
| **HIGH** | 13개 기능 설명이 이름만 치환한 공통 템플릿 | `FeaturePage.tsx:23`. 검색 의도별 구분이 약하고 스니펫으로서 쓸모가 적다. |
| **HIGH** | 고유한 소개·사용법·제한사항 본문 부족 | `FeaturePage.tsx:9-23`. 기능 UI를 제외한 설명 텍스트가 적다. |
| **HIGH** | 기능 이름과 실제 동작 불일치 | `FeaturePage.tsx:14,18,21`. 사다리·리듬·타자 경주 검색 의도에 현재 동작이 맞지 않는다. |
| **HIGH** | 사이트맵에서 `/tools`와 13개 URL 누락 | `generate-omakase-pages.mjs:74-131`. 직접 링크는 있으나 사이트맵에는 생성되지 않는다. |
| **MEDIUM** | 디렉터리 카드의 반복 CTA와 기능 설명 부재 | `ToolsDirectoryPage.tsx:4-7`. 현재 앵커에는 이름이 있어 완전한 일반 앵커는 아니다. |
| **MEDIUM** | 정식 URL과 구조화 데이터 부재 | `FeaturePage.tsx:23`, `index.html:3-10`. canonical·JSON-LD 코드가 보이지 않는다. |
| **LOW** | 랜딩에서 개별 기능 직접 링크 없음 | `LandingPage.tsx:46`. 디렉터리 링크는 이미 존재한다. |

상위 5개 실행 순서:

1. **14개 HTML 응답 확보 — CRITICAL.** `frontend/scripts/generate-omakase-pages.mjs`의 산출 패턴과 `frontend/package.json`의 빌드 연결을 참고해 `/tools/index.html` 및 13개 `/tools/<slug>/index.html` 생성 경로를 설계한다. `frontend/src/App.tsx`의 React 라우트는 인터랙션 진입점으로 유지하되, 서버가 각 URL에서 고유한 HTML을 반환하도록 배포 라우팅을 맞춘다. 생성 HTML에 H1·본문·13개 디렉터리 앵커·메타데이터를 포함한다. 배포 서버 설정 위치와 fallback 동작은 먼저 확인한다. 검증: JavaScript를 끈 원본 HTML에서 각 페이지의 제목·설명·핵심 문구가 구별되는지 확인한다.
2. **메타데이터를 URL별로 고정 — HIGH.** `frontend/src/features/public-tools/FeaturePage.tsx:6,23`의 이름 사전을 표의 제목·설명 데이터로 확장하고, `frontend/src/pages/public/ToolsDirectoryPage.tsx:7`에도 디렉터리 전용 설명을 둔다. 이 데이터를 1번의 정적 HTML 생성에도 공유해 서버 응답과 브라우저 DOM의 제목·설명이 일치하게 한다. `frontend/index.html:6`의 공통 제목은 SPA fallback용으로만 남는다. 검증: 13개 URL의 원본/렌더링 제목과 description이 각각 고유하며 기능과 일치하는지 비교한다.
3. **13개 본문·도움말 추가 — HIGH.** `frontend/src/features/public-tools/FeaturePage.tsx:9-23`에서 slug별 소개·조작법·제한사항을 화면에 표시하고, 정적 HTML에도 같은 내용을 제공한다. 현재 13개 `index.tsx`는 재내보내기이므로 그 파일에만 텍스트를 추가해도 현재 라우트에는 반영되지 않는다. 검증: 13개 페이지 각각에서 UI만 보지 않아도 사용법과 제한을 이해할 수 있는지 확인한다.
4. **기능과 검색어를 일치 — HIGH.** `FeaturePage.tsx:14`는 참가자 번호 배정으로 소개하거나 실제 사다리 진행·결과 연결 기능을 구현한다. `FeaturePage.tsx:18`은 현재 반응속도 테스트로 명명한다. `FeaturePage.tsx:21`은 개인 타자 연습으로 설명한다. SEO 문구가 실제 기능보다 앞서가면 안 된다. 검증: 검색 결과의 약속과 첫 화면의 인터랙션이 일치하는지 비전문 사용자 관점에서 확인한다.
5. **발견 경로 확장 — HIGH.** `frontend/scripts/generate-omakase-pages.mjs:74-131`의 사이트맵 URL 목록에 `/tools`와 13개 공개 기능 URL을 반영하고, `frontend/src/pages/public/ToolsDirectoryPage.tsx:4-7`에 기능별 한 문장 요약과 목적형 CTA를 넣는다. `frontend/src/pages/public/LandingPage.tsx:46`의 디렉터리 링크는 유지하고 사용 빈도가 높은 기능을 고르면 직접 링크를 추가한다. 검증: 사이트맵에 14개 URL이 들어가고 링크 목적지·원본 HTML의 앵커·실제 기능이 일치하는지 확인한다. 어떤 기능의 수요가 높은지는 Search Console·실제 키워드 데이터로 **확인 필요**다.

이후 `FeaturePage.tsx`의 페이지 데이터와 정적 HTML에 1개 canonical 및 해당 기능의 JSON-LD를 넣고, 중복 URL·구조화 데이터 문법·배포 응답을 확인한다. 작업 착수 전 검색량과 현재 색인 상태를 수집해 우선 적용 URL을 결정한다. 이 문서는 코드 분석에 따른 제안이며, 검색 순위 개선을 검증한 결과는 아니다.

## 코드 근거

- `frontend/src/App.tsx:13-14,31-39`: 공개 경로와 정적 import.
- `frontend/src/features/public-tools/FeaturePage.tsx:6-23`: 13개 이름, 구현, 제목·description, 공통 헤딩·풋터.
- `frontend/src/features/public-tools/{snake,minesweeper,roulette,ladder,gomoku,rhythm,typing-race,order-picker,random-draw,expense-split,date-calculator,unit-converter,image-ocr}/index.tsx:1`: 각 파일의 재내보내기.
- `frontend/src/pages/public/ToolsDirectoryPage.tsx:4-7`: 7개/6개 그룹, 카드 앵커, 디렉터리 제목.
- `frontend/src/pages/public/LandingPage.tsx:27-46`: `/tools` 프로모션 링크.
- `frontend/vite.config.ts:1-5`, `frontend/index.html:1-23`, `frontend/package.json:6-9`: 렌더링·기본 HTML·빌드 연결.
- `frontend/scripts/generate-omakase-pages.mjs:74-131`, `frontend/public/robots.txt:1-8`: 생성 HTML·사이트맵·크롤링 허용 범위.
