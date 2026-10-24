# Orchestration Lab 기술 SEO·크롤링/색인 인프라 진단

**결론:** 현재 사이트맵은 랜딩과 오마카세 정적 페이지를 포함하지만 `/tools`와 13개 도구 URL은 빠져 있다. 도구 URL과 랜딩은 공통 SPA 셸만 초기 HTML로 내려가므로 공개 검색 대상의 정적 렌더링 확대가 가장 큰 개선 과제다.

**범위와 검증 한계:** 2026-10-21 기준 저장소의 소스·설정과 이미 존재하는 `frontend/dist`만 읽었다. 서버 실행, 빌드, 배포, HTTP 응답, Search Console, PageSpeed, 실제 모바일 화면 측정은 하지 않았다. 아래의 파일 경로와 줄 번호는 이 시점의 저장소 근거다. `frontend/dist`는 기존 산출물의 상태이며 현재 배포 상태와 일치하는지는 **확인 필요**하다.

## 1. robots.txt/sitemap 정합성

- `frontend/public/robots.txt:1-8`은 `User-agent: *`, `Allow: /`, `Disallow: /dashboard`, `/order`, `/lunch`, `/webhook`, `Sitemap: https://lab.khsqowp1.my/sitemap.xml`을 선언한다. 따라서 `/dashboard`와 하위 경로는 크롤링 차단 대상이다. `/tools`와 `/omakase`는 차단하지 않는다.
- `frontend/package.json:8`은 Vite 빌드 후 `frontend/scripts/generate-omakase-pages.mjs`를 실행한다. 스크립트의 URL 배열은 `/`와 `/omakase`로 시작하며(`:74`), 각 주제·문서 URL을 추가하고(`:77-121`), `dist/sitemap.xml`을 쓴다(`:124-131`). 도구 URL을 추가하는 로직은 없다.
- 기존 `frontend/dist/sitemap.xml`에서 `<url>`은 **138개**다. 구성은 `/` 1개, `/omakase` 1개, 주제 5개, 문서 131개다. 정적 `frontend/dist/omakase/**/index.html`도 136개다. `/tools`와 `/tools/<slug>` 항목은 0개다. 도구 13개는 `frontend/src/pages/public/ToolsDirectoryPage.tsx:4-6`과 `frontend/src/features/public-tools/FeaturePage.tsx:6,22`에 정의돼 있다. 즉, 지정된 검색 대상 151개(랜딩 1 + 도구 디렉터리 1 + 도구 13 + 오마카세 상세 136) 중 **14개 누락**이다. `/omakase` 목차까지 포함한 목표는 152개다. `/login` 역시 사이트맵에 없지만 로그인 페이지는 검색 대상으로 추가하지 않는 편이 적절하다.
- `frontend/src/App.tsx:36-46`에는 `/order`, `/lunch`, `/webhook`도 비인증 라우트로 존재한다. 이 보고서는 요청된 SEO 범위에서 제외하되, 향후 이들의 색인 의도가 바뀌면 `robots.txt`와 사이트맵 정책을 함께 조정해야 한다.
- **수정안:** `frontend/scripts/generate-omakase-pages.mjs`의 `urls` 초기값 또는 생성 단계에 `/tools`와 13개 실제 슬러그를 단일 목록에서 추가한다. 정적 HTML을 도입한다면 그 생성 단계와 사이트맵 생성을 같은 URL 목록에 묶고 중복·누락을 검사한다. `robots.txt`의 Sitemap URL과 스크립트의 `BASE_URL`은 현재 일치한다.
- **주의:** `Disallow`는 접근 통제나 확실한 색인 제거 수단이 아니다. `/dashboard`는 nginx에서 SPA 셸로 응답하고 인증은 React `RequireAuth`가 수행한다(`frontend/nginx.conf:97-107`, `frontend/src/App.tsx:47-65`). 외부 링크 등으로 URL이 발견되었을 때 색인 상태가 어떻게 처리되는지는 **확인 필요**하다. 민감 정보 보호는 백엔드 인증에 계속 의존해야 한다.

## 2. 렌더링/색인 가능성

- `frontend/index.html:11-23`의 실제 본문은 빈 `#root`, 오마카세 주제 링크만 있는 `<noscript>`, 클라이언트 스크립트로 구성된다. `frontend/src/main.tsx:1-6`이 React를 그린다. `/`, `/tools`, `/tools/:slug`, `/login`, `/omakase`는 `frontend/src/App.tsx:31-46`의 SPA 라우트다. nginx는 이 경로들의 실제 파일이 없으면 `/index.html`로 폴백한다(`frontend/nginx.conf:97-107`). 검색 로봇이 JavaScript를 실행하기 전에는 랜딩·도구의 본문, H1, 도구 링크가 초기 HTML에 없다. `noscript`의 오마카세 링크는 도구 페이지를 보완하지 않는다.
- `/omakase/:topicId/`와 `/omakase/:topicId/:fileId/`는 React 라우트가 아니라 빌드 스크립트가 쓴 **136개 정적 HTML**이다(`frontend/scripts/generate-omakase-pages.mjs:92-120`). nginx의 `try_files $uri $uri/ /index.html`이 해당 파일을 먼저 찾는다(`frontend/nginx.conf:97-107`). 정적 페이지에는 제목, 설명, canonical, H1 또는 Markdown 본문이 들어간다(`frontend/scripts/generate-omakase-pages.mjs:38-69,92-120`). `/omakase` 목차는 nginx의 별도 규칙으로 SPA 셸을 서빙한다(`frontend/nginx.conf:79-95`).
- Google은 JavaScript를 처리할 수 있지만 렌더링 지연·실패 가능성이 있고, 다른 크롤러·공유 미리보기는 JS를 실행하지 않을 수 있다. 현재 구조에서 색인 성공 여부나 렌더링 예산 소진 여부는 **확인 필요**하다. 초기 HTML이 비어 있다는 코드 사실만으로 미색인을 단정할 수는 없다.
- **우선 개선:** 기존 오마카세 생성 방식에 맞춰 `/`, `/tools`, 13개 유효한 `/tools/<slug>` 각각에 고유한 정적 HTML을 생성한다. 본문에는 실제 페이지의 H1·설명·도구 연결 링크를 담고, React 상호작용이 필요한 도구는 별도 클라이언트 진입점으로 점진적으로 붙인다. 단순한 정적 소개 HTML과 기존 SPA를 함께 제공한다면 검색 로봇과 사용자가 보는 핵심 정보가 일치해야 한다. `/tools/<잘못된-slug>`는 현재 `FeaturePage`의 기본 도구로 표시되고(`frontend/src/features/public-tools/FeaturePage.tsx:23`), nginx가 200 셸을 내리므로 유효하지 않은 URL은 404 처리가 필요하다.
- **대안:** 전체 React SSR/SSG 체계로 공개 라우트를 옮길 수 있다. 범위가 큰 변경이므로 우선은 기존 생성 스크립트 확장이 현실적이다. React Helmet류의 라우트별 메타 관리만으로 초기 HTML의 빈 본문은 해결되지 않는다. 메타는 정적 HTML 생성 단계에서 제공하고, SPA 이동 시 클라이언트 측 동기화에도 쓴다.
- 백엔드 컨트롤러 목록과 `backend/src/main/java/com/orchestration`의 컨트롤러 내 검색에서 프리렌더링·사이트맵 컨트롤러는 발견되지 않았다. `docker-compose.yml:89-106`과 `frontend/Dockerfile:8-10`에 따라 공개 HTML은 nginx가 `dist`에서 제공하며 Spring Boot는 `/api/`를 처리한다(`frontend/nginx.conf:56-69`). 기존 아키텍처에서 백엔드가 렌더링에 관여하지 않는다. 새 서버 렌더링 기능을 만들 수는 있지만 현재 코드가 수행하는 기능은 아니다.

## 3. 구조화 데이터

`frontend/index.html`, `frontend/scripts/generate-omakase-pages.mjs`, 공개 React 페이지에서 `application/ld+json` 또는 `schema.org` 출력은 확인되지 않았다. 사이트 전체 정체성을 명시하려면 홈 정적 HTML에 아래 JSON-LD를 넣을 수 있다. `Organization`을 실제 운영 주체로 표시해도 되는지와 법적 명칭은 게시 전에 **확인 필요**하다. 확인 전에는 `WebSite`만 게시하는 것이 정확하다. 검색 결과의 특수 표시를 보장하는 설정은 아니다.

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": "https://lab.khsqowp1.my/#website",
      "url": "https://lab.khsqowp1.my/",
      "name": "Orchestration Lab",
      "inLanguage": "ko-KR"
    },
    {
      "@type": "Organization",
      "@id": "https://lab.khsqowp1.my/#organization",
      "url": "https://lab.khsqowp1.my/",
      "name": "Orchestration Lab"
    }
  ]
}
</script>
```

실제 운영 주체가 확인되면 `WebSite.publisher`로 해당 `Organization`의 `@id`를 연결하고 공식 로고·프로필이 있을 때만 `logo`·`sameAs`를 추가한다. 구조화 데이터 값은 페이지에서 확인 가능한 정보와 일치시켜야 한다.

## 4. 메타 태그 완성도

| 대상 | 코드로 확인한 상태 | 조치 |
| --- | --- | --- |
| 공통 SPA 셸 | `frontend/index.html:4-9`에 `lang="ko"`, viewport, 공통 제목, Google 소유권 확인 메타가 있다. `description`, canonical, `og:image`, `twitter:card`, `theme-color`, `rel="icon"`은 없다. | 홈과 도구 URL별 정적 HTML에 고유 제목·설명·절대 canonical·OG URL/제목/설명·공유 이미지를 출력한다. 홈 셸에 `theme-color`와 실제 존재하는 favicon 경로를 선언한다. |
| 도구 디렉터리·상세 | `ToolsDirectoryPage.tsx:7`과 `FeaturePage.tsx:23`의 `useEffect`가 브라우저에서 제목을 바꾸며 상세 페이지만 description을 동적으로 삽입한다. 초기 응답의 메타는 공통 셸 그대로다. | URL별 정적 메타를 생성한다. SPA 내비게이션 뒤에도 제목·description·canonical·OG 값을 현재 URL로 갱신한다. |
| 오마카세 정적 페이지 | 생성 스크립트 `:44-52`에 제목, description, canonical, `og:title`, `og:description`, `og:type`, `og:url`이 있다. `og:image`, `twitter:card`, `theme-color`, favicon은 없다. | 실제 공유 이미지 제작 후 절대 URL을 넣고 Twitter 카드·아이콘·색상 메타를 추가한다. |

`frontend/public`에서 favicon·manifest 파일은 확인되지 않았고 `frontend/dist`에서도 확인되지 않았다. 브라우저의 기본 `/favicon.ico` 요청이 성공하는지, CDN 또는 외부 설정이 이미지를 제공하는지는 **확인 필요**하다. 로그인 페이지는 사이트맵 대상에서 제외하고 색인 의도를 정한 뒤 `noindex`를 검토한다. 공통 SPA 셸에 전역 `noindex`를 넣으면 검색 대상까지 막히므로 피해야 한다.

## 5. 성능(Core Web Vitals)·모바일 대응

- `frontend/vite.config.ts:1-5`는 React·WGSL 플러그인만 설정하며 `manualChunks` 등 명시적 코드 분할 규칙은 없다. `App.tsx:21-29`는 대시보드 일부만 `lazy()`로 분리하고 랜딩·도구 목록·13개 도구 구현이 들어 있는 `FeaturePage`는 정적으로 가져온다(`App.tsx:8-19`). `FeaturePage.tsx:2,6-22`의 OCR용 `tesseract.js`도 정적 import다. 따라서 도구를 쓰지 않는 방문자의 초기 JS 경로에 공개 도구 코드가 실릴 가능성이 높다.
- 기존 `dist`의 압축 전 파일 크기는 `index-DbJUIIcR.js` **607,017바이트**, `chunk-KEIR6QF5-Dj-OpFgW.js` **662,684바이트**다. 사용자가 전달한 빌드 경고인 500 kB 초과와 일치한다. 개별 파일 크기는 전송 크기나 실제 LCP·INP·CLS 점수가 아니다. 두 번째 청크가 홈의 초기 로드에 포함되는지도 네트워크 확인 전에는 단정할 수 없다.
- **수정안:** `App.tsx`에서 `/tools`와 `/tools/:slug`를 라우트 단위 `lazy()`로 분리하고, `FeaturePage.tsx`의 13개 구현을 슬러그별 동적 import로 나눈다. OCR의 `tesseract.js`는 `/tools/image-ocr`에서 OCR 실행 직전에만 import한다. `vite.config.ts`의 `build.rollupOptions.output.manualChunks`(사용 중인 Vite 8 빌더에서 지원하는 설정 확인 필요)는 실제 분석 결과를 보고 공통 대형 라이브러리 분리에 제한적으로 사용한다. 단순히 500 kB 경고만 없애려고 무조건 청크를 나누면 요청 수·초기 비용이 개선되지 않을 수 있다.
- 랜딩은 `LandingPage.tsx:27-46`에서 `HolographicCard` 캔버스와 날씨를 초기 화면에 놓고, `frontend/index.html:8-9`는 외부 CDN 폰트 스타일시트를 받는다. 캔버스를 지연 초기화하거나 가벼운 정적 대체 화면을 먼저 그리며, 외부 폰트 의존·렌더 차단 영향은 실제 요청 타이밍으로 점검한다. LCP 요소와 사용자에게 보이는 레이아웃 이동 원인은 **확인 필요**하다.
- 모바일 규칙은 `frontend/src/styles.css:417-422,579-633,1135-1138` 및 `frontend/src/features/public-tools/public-tools.css:1-3`에서 확인했다. 공개 도구는 600px 이하 패딩 축소와 유동 그리드·`aspect-ratio` 보드가 있다. 코드만으로 명백한 공개 도구 모바일 크롤링 차단이나 CLS 결함은 확인되지 않았다. 대시보드 진단 도구용 1000px/640px 브레이크포인트는 있으나 로그인 영역이므로 SEO 우선순위에서 제외한다. 실제 좁은 화면 오버플로·터치 영역·CLS는 모바일 브라우저 측정이 **확인 필요**하다.

## 6. 보안 헤더/HTTPS 등 신뢰 신호

- `docker-compose.yml:89-106`은 nginx 웹 서비스를 컨테이너 포트 80으로 띄우고 Cloudflare Tunnel(`cloudflared`)을 연결한다. `frontend/nginx.conf:17-21` 역시 `listen 80`이다. 공개 URL은 코드에서 `https://lab.khsqowp1.my`로 선언하지만, 엣지의 HTTPS 강제 리다이렉트·인증서·HSTS 설정과 실제 HTTP 응답은 이 저장소만으로 **확인 필요**하다. 컨테이너 내부 HTTP만 보고 공개 사이트가 HTTP라고 단정할 수 없다.
- `frontend/nginx.conf:75-107`의 `add_header`는 캐시 제어만 설정한다. 이 파일에 `Strict-Transport-Security`, `X-Content-Type-Options`, `Content-Security-Policy`, `Referrer-Policy`, `X-Frame-Options` 또는 `frame-ancestors`는 없다. Cloudflare 엣지나 Spring Security가 일부 헤더를 추가할 가능성은 있으므로 공개 응답의 부재는 **확인 필요**하다. nginx의 `add_header`는 위치 블록에서 재정의될 때 상위 설정이 자동 상속되지 않을 수 있으니 각 응답 유형에서 헤더가 유지되는지 검증해야 한다.
- **수정안:** HTTPS 강제 정책은 Cloudflare 엣지에서 확인하고, 확인된 HTTPS 응답에만 HSTS를 적용한다. nginx 또는 엣지에서 `X-Content-Type-Options: nosniff`, 적절한 `Referrer-Policy`, 프레이밍 제한을 추가한다. CSP는 현재 CDN 폰트·WebGL·WASM·API 요청을 조사해 보고 모니터링 모드부터 설계한다. 보안 헤더가 직접 검색 순위를 올린다고 단정하지 않는다. HTTPS 제공 여부가 핵심 신뢰·접근성 전제다.

## 7. 우선순위

**CRITICAL: 확인된 항목 없음.** 현재 코드만으로 전체 공개 사이트가 크롤링 불가, 전면 `noindex`, HTTP 전용이라고 판정할 근거는 없다.

| 우선 | 발견사항 | 실행 파일과 구체적 방법 | 완료 검증 기준 |
| --- | --- | --- | --- |
| **HIGH 1** | 랜딩·도구 15개 URL의 초기 HTML에 고유 본문이 없다. | `frontend/scripts/generate-omakase-pages.mjs`의 정적 HTML 생성 패턴을 공개 랜딩·도구에 확장하고 `frontend/Dockerfile`의 기존 빌드 산출물 복사 경로를 사용한다. 각 URL에 H1·설명·내부 링크·고유 메타를 출력한다. `/tools/:slug`의 잘못된 슬러그는 404로 처리한다. | JS 비활성 HTML 응답에서 15개 URL마다 고유 본문과 메타가 보이고 잘못된 슬러그는 404다. |
| **HIGH 2** | 사이트맵에서 도구 URL 14개가 빠졌다. | `frontend/scripts/generate-omakase-pages.mjs`의 URL 목록에 `/tools`와 `ToolsDirectoryPage.tsx:4-5`의 13개 슬러그를 추가한다. 가능하면 목록을 공유 데이터로 통합한다. | 생성된 사이트맵은 루트 1 + `/omakase` 1 + 오마카세 136 + 도구 14 = **152개** 고유 URL이며 robots의 Sitemap과 호스트가 일치한다. |
| **HIGH 3** | 공개 페이지별 정적 메타·canonical이 부족하다. | `frontend/index.html`과 공개 정적 HTML 생성부에 페이지별 title, description, self canonical, OG URL·이미지를 넣는다. `FeaturePage.tsx:23`의 브라우저 메타 변경은 SPA 이동 시에도 값이 일치하도록 조정한다. | `/`, `/tools`, 13개 도구의 응답 원문에 해당 URL의 메타가 있으며 오마카세와 호스트·슬래시 규칙이 일치한다. |
| **HIGH 4** | 초기 JS가 크고 공개 도구 구현이 정적 import다. | `frontend/src/App.tsx`에서 공개 도구 라우트를 `lazy()`로, `frontend/src/features/public-tools/FeaturePage.tsx`에서 기능·OCR 의존성을 동적 import로 분리한다. `frontend/vite.config.ts` 청크 설정은 실제 번들 분석 뒤 적용한다. | 재빌드 분석에서 초기 경로의 JS가 줄고, 실측 모바일 LCP·INP가 악화되지 않는다. 현재 수치는 **확인 필요**다. |
| **MEDIUM 5** | 저장소 nginx에 기본 보안 헤더가 없고 공개 HTTPS 설정은 미확인이다. | Cloudflare 엣지의 HTTPS 강제·헤더 정책을 확인한다. 필요한 항목은 `frontend/nginx.conf`의 server/각 location 또는 엣지에서 설정하고 캐시 위치별 헤더 상속을 검증한다. HSTS는 HTTPS 동작 확인 뒤 활성화한다. | 공개 `/`, `/tools`, 정적 오마카세, `/assets/`의 HTTP 응답에서 HTTPS 리다이렉트와 의도한 헤더가 확인된다. |
| **MEDIUM** | Organization/WebSite JSON-LD가 없다. | 운영 주체를 확인한 뒤 홈 정적 HTML 생성부에 3절의 JSON-LD를 넣는다. | 구조화 데이터 파싱이 성공하고 페이지의 실제 정보와 일치한다. |
| **MEDIUM** | `/dashboard`는 robots 차단이지만 nginx가 SPA 셸을 응답한다. | `frontend/nginx.conf`와 인증 경계를 검토해 검색 엔진에 확실한 비색인 신호를 줄 방법을 정한다. `robots.txt` 차단 상태에서는 로봇이 `noindex` 헤더를 읽지 못할 수 있으므로 정책을 함께 설계한다. | 외부에서 발견된 대시보드 URL의 실제 크롤링·색인 상태 확인. |
| **LOW** | favicon, `theme-color`, Twitter 카드 및 오마카세 `og:image`가 없다. | 실제 자산을 마련해 `frontend/index.html`과 오마카세 HTML 생성부에 선언한다. | URL 자산이 200으로 응답하고 공유 미리보기에 표시된다. |

**확인 필요 목록:** 공개 응답의 상태 코드·robots/사이트맵 접근성·정적 페이지와 배포물의 일치 여부, Cloudflare HTTPS/헤더 정책, Search Console 색인 상태, 모바일 LCP·INP·CLS 및 오버플로 실측. 이 항목은 코드만으로 판정하지 않았다.
