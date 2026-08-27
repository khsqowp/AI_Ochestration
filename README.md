# Orchestration Lab

개인용 AI 연구실의 초기 뼈대입니다. 2D 오피스 대시보드, 개발용 인증 우회, 원본 파일 감지 큐, 그리고 n8n 오케스트레이션 런타임을 포함합니다. AI 모델·에이전트 실행·실제 문서 변환은 아직 연결하지 않았습니다.

## 에이전트 모델 계획

- PM: DeepSeek V4-Pro
- 보안·경제 팀장: DeepSeek V4-Pro Thinking
- 보안·경제 수집 담당: Gemini 2.5 Flash
- 상호 재검토 담당 2명: GPT-4o mini
- 아카이브 담당: 원본 보존, Markdown·링크·폴더 구조 관리

기존 DeepSeek R1 API 별칭에는 의존하지 않습니다. 실제 모델 호출을 연결할 때에도 이 역할 구성을 환경 변수 기반 설정으로 연결하며, API 키는 `.env`에만 둡니다.

Gemini Flex 수집 호출은 기본 최대 15분(`GEMINI_TIMEOUT_SECONDS=900`)까지 대기합니다. GPT·DeepSeek의 검토·판단 호출은 기본 3분(`DECISION_TIMEOUT_SECONDS=180`)으로 별도 제한합니다.

## 시작하기

1. `.env.example`을 `.env`로 복사하고 비밀번호를 변경합니다.
2. `docker compose up --build`를 실행합니다.
3. `http://localhost:5173`을 엽니다.

개발 단계에서는 `AUTH_ENABLED=false`가 기본값입니다. 이 상태에서는 개발용 관리자 세션이 자동 생성됩니다. 정식 로그인 UI와 세션 API의 틀은 유지하지만, 실제 비밀번호 로그인은 의도적으로 비활성화되어 있습니다.

## 파일 저장소

- `originals/`: 맥에서 직접 넣거나 화면으로 올린 원본 파일. 원본은 수정하지 않습니다.
- `obsidian/`: AI가 가공한 Markdown, 링크 노트, 요약 기록을 보관할 Obsidian 호환 지식베이스입니다.

API 컨테이너는 `originals/`을 주기적으로 감지합니다. 새 파일은 변환 작업 큐에 등록되며, 향후 파일 관리 에이전트와 모델을 연결하면 이 큐를 통해 Markdown 가공을 실행합니다.

웹 화면의 **수집 사이트** 메뉴에서 보안·경제 출처를 등록할 수 있습니다. 공개 `http(s)` 주소만 허용하며, 수집기는 기본 30분마다 대상 여부를 확인해 각 사이트의 설정 주기(기본 6시간)에 맞춰 원문을 `originals/web/`에 보관합니다. 로컬·사설 네트워크 주소와 2MB를 초과하는 응답은 수집하지 않습니다.

## n8n

`http://localhost:5678`에서 n8n을 열 수 있습니다. n8n은 일정·웹훅·재시도 같은 실행 흐름만 담당하고, 작업·에이전트 상태의 기준 데이터는 계속 MySQL/Spring Boot에 둡니다.

`n8n/workflows/file-intake-webhook.json`은 파일 감지 이벤트를 받는 시작 템플릿입니다. n8n UI에서 import한 뒤 활성화하세요. 이후 `.env`의 `N8N_DISPATCH_ENABLED=true`로 바꾸고 API를 재시작하면 새 원본 파일의 메타데이터가 해당 웹훅으로 전송됩니다. 모델 연결 전에는 원본 내용을 외부로 보내지 않습니다.

## 보안 메모

- `.env`는 저장소에 넣지 않습니다.
- API 키는 서버 환경 변수에서만 읽도록 하고, 응답·로그·Markdown에 기록하지 않습니다.
- `N8N_ENCRYPTION_KEY`는 n8n 자격 증명 암호화 키이므로 실제 랜덤 문자열로 바꾼 뒤 유지합니다. 바꾸면 기존 n8n 자격 증명을 복호화할 수 없습니다.
- 운영 환경에서는 `AUTH_ENABLED=true`, HTTPS, `AUTH_COOKIE_SECURE=true`를 반드시 적용해야 합니다.
