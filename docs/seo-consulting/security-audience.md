# 보안 전문가 대상 SEO 전략 분석 보고서 (Security Audience Strategy)

본 보고서는 **Orchestration Lab** 사이트의 검색 가시성을 높여, 침투테스터, 보안 연구자, 진단 전문가들이 Google 검색을 통해 유입되고 신뢰를 기반으로 재방문하게 만드는 전략을 제안한다.

---

## 1. 콘텐츠 및 키워드 전략 분석

### 1.1 현재 커버리지 평가
현재 `omakase-content`는 보안 전문가가 검색할 법한 **고가치(High-Value) 핵심 도메인**을 매우 잘 커버하고 있다.

- **Cloud Pentesting**: AWS, Azure, GCP의 계정/권한/리소스 진단 체계 (매우 구체적)
- **Compliance/Standard**: KISA 기반시설 진단 표준 (국내 진단원에게 필수적인 롱테일 키워드)
- **Threat Intelligence**: 랜섬웨어 TTPs 및 실제 사고 분석 (연구자 및 분석가 유입 가능)
- **Web Vulnerability**: 8대 영역 28개 항목 체크리스트 (실무자용 Reference 키워드)
- **Server Pentesting**: 리눅스 서버 진입부터 보고서 작성까지의 워크플로우

### 1.2 키워드 갭(Gap) 및 확장 제안
현재 콘텐츠는 '표준'과 '가이드' 중심이다. 검색 유입을 극대화하려면 **'최신 트렌드'**와 **'특정 타겟'** 키워드를 보강해야 한다.

- **최신 취약점 Deep-dive**: 특정 CVE(예: 최근의 Log4j 수준의 영향력을 가진 CVE)에 대한 분석 및 PoC 검증 과정.
- **Modern API Security**: REST 외에 GraphQL, gRPC, WebSocket 취약점 진단 방법론.
- **AI/LLM Security**: OWASP Top 10 for LLM, Prompt Injection 진단 가이드 (현재 가장 검색량이 급증하는 분야).
- **Certification-based Keywords**: "OSCP", "OSEP", "CRT" 등 보안 자격증 준비생들이 검색하는 실전 팁과 연계된 콘텐츠.

---

## 2. E-E-A-T (전문성, 권위, 신뢰성) 신호 분석

보안 전문가는 출처가 불분명한 요약본보다 **근거가 명확한 기술 문서**를 신뢰한다.

### 2.1 발견된 문제점
- **저자 정보 부재**: 누가 썼는지(경력, 전문 분야) 알 수 없어 '개인 블로그' 수준의 신뢰도로 인식될 위험이 있음.
- **최신성 표시 부족**: 보안 취약점은 시간에 따라 변하는데, 문서의 "최종 수정일"이 표시되지 않음.
- **외부 레퍼런스 연결 미흡**: KISA 가이드 등을 언급하지만, 실제 공식 문서의 URL이나 RFC 표준 링크가 부족함.

### 2.2 개선 제안
- **Author Profile 도입**: 각 토픽 상단에 저자(또는 검수자)의 전문성(예: "10년차 모의해킹 전문가", "CISSP/OSCP 보유")을 명시.
- **Timestamp 추가**: `Last Updated: 2026-10-21` 형식의 날짜 표기를 통해 정보의 최신성을 증명.
- **Reference Section 의무화**: 각 챕터 하단에 참고한 공식 문서, CVE-ID, GitHub 저장소 링크를 명시적으로 제공.

---

## 3. 메타데이터 및 클릭률(CTR) 평가

### 3.1 `descriptionFromMarkdown` 로직 평가
현재 로직은 본문 앞부분 150자를 기계적으로 자른다.

- **평가**: 
    - **랜섬웨어 콘텐츠**: "랜섬웨어 그룹들의 평균 지속시간은 약 295일로..." → **매우 좋음**. 구체적인 숫자와 팩트가 포함되어 클릭을 유도함.
    - **AWS 콘텐츠**: "모든 AWS 리소스는 AWS 계정의 소유이고..." → **부족함**. 교과서적인 서술로 인해 검색 결과에서 매력이 떨어짐.
- **개선책**: 마크다운 상단에 `<!-- meta_description: [검색 결과에 노출될 요약문] -->` 형태의 커스텀 태그를 지원하고, 스크립트가 이를 최우선으로 읽도록 수정해야 함.

### 3.2 제목 패턴 평가
- **패턴**: `${title} | Orchestration Lab`
- **평가**: 간결하고 전문적이다. 다만, 검색어 노출을 위해 `[실전]`, `[체크리스트]`, `[분석]`과 같은 **말머리(Prefix)**를 제목에 추가하는 것이 클릭률 상승에 유리하다.

---

## 4. 구조화 데이터 (Schema.org) 분석

현재 사이트에는 `application/ld+json` 형태의 구조화 데이터가 전혀 없다. 이는 Google이 콘텐츠의 성격을 파악하는 데 불리하게 작용한다.

### 4.1 제안: `TechArticle` Schema 도입
보안 기술 문서는 `Article`보다 `TechArticle` 또는 `HowTo` 스키마가 적합하다.

**JSON-LD 예시 (AWS 진단 페이지 적용 시):**
```json
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "headline": "AWS 계정 관리 진단 (1) — IAM 사용자·Key Pair",
  "description": "AWS IAM 사용자 및 Key Pair 관리의 취약점 진단 방법과 양호/취약 판단 기준을 상세히 설명합니다.",
  "author": {
    "@type": "Person",
    "name": "Security Expert",
    "jobTitle": "Senior Penetration Tester"
  },
  "datePublished": "2026-10-01",
  "dateModified": "2026-10-21",
  "about": [
    { "@type": "Thing", "name": "AWS IAM" },
    { "@type": "Thing", "name": "Cloud Security" }
  ]
}
```

---

## 5. 내부 링크 및 사용자 여정 (User Journey)

### 5.1 내부 링크 구조 평가
- **긍정적**: 토픽 → 챕터의 계층 구조가 명확함.
- **부정적**: 챕터 간 **교차 링크(Cross-link)**가 거의 없음. (예: 1-1에서 1-4의 권한 관리 내용을 언급할 때 링크가 없음)

### 5.2 유입 전략: "Interactive Tools" 활용
현재 `/dashboard/diag/...`에 있는 강력한 도구들(Burp Comparer, Rainbow Crack 등)은 로그인 벽에 막혀 색인이 안 된다.

- **전략**: Omakase 콘텐츠(가이드) 내에서 **"이 단계의 진단을 돕는 [도구 이름]을 Lab 내에서 제공하고 있습니다 (로그인 필요)"**라는 텍스트와 링크를 삽입.
- **효과**: '정보 탐색(검색)' → '실습 욕구(가이드)' → '도구 사용(로그인/가입)'으로 이어지는 전환 경로(Conversion Path) 생성.

---

## 6. 우선순위 및 실행 로드맵

| 우선순위 | 항목 | 영향도 | 실행 방법 (구체적 파일/위치) |
| :--- | :--- | :--- | :--- |
| **CRITICAL** | **구조화 데이터 도입** | 상 | `frontend/scripts/generate-omakase-pages.mjs` 내 `htmlDocument` 함수에 JSON-LD 스크립트 삽입 로직 추가 |
| **HIGH** | **메타 설명 커스텀화** | 상 | `generate-omakase-pages.mjs`의 `descriptionFromMarkdown` 함수 수정 → 마크다운 내 커스텀 태그(`<!-- meta_description -->`) 우선 처리 |
| **HIGH** | **E-E-A-T 신호 강화** | 중 | 각 `.md` 파일 상단에 저자 정보, 날짜, 외부 레퍼런스 섹션 추가 |
| **MEDIUM** | **내부 교차 링크 구축** | 중 | `.md` 파일 내에서 관련 챕터로의 상대 경로 링크(`[참고: 1-4 권한 관리](../1-4)`) 추가 |
| **MEDIUM** | **Interactive Tool 연계** | 중 | Omakase 가이드 내에 `/dashboard/diag` 도구 언급 및 유도 문구 삽입 |
| **LOW** | **키워드 확장** | 중 | AI Security, Modern API 등 신규 토픽 폴더 생성 및 콘텐츠 작성 |

