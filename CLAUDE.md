# Ochestration — 작업 허브 가이드

이 문서는 `/Users/user/CODE/` 아래 흩어진 여러 디렉터리를 어떤 Claude 세션이 열든 전체 그림을 바로 파악하도록 쓴 지침서다. 같은 목적의 문서가 `oracle_server/CLAUDE.md`, `ochestration_finance/CLAUDE.md`에도 있고, 서로를 가리킨다.

## 이 저장소는 무엇인가

개인용 AI 오케스트레이션 플랫폼. 2D 오피스 대시보드 + 보안/경제 정보 수집 파이프라인 + 트레이딩 대시보드. 전체 아키텍처/기능 설명은 `README.md`를 먼저 읽을 것 — 여기서는 중복하지 않는다.

스택: Spring Boot(`backend/`) + React(`frontend/`) + MySQL + n8n + cloudflared. `trading/` 하위에 Coin_Trade 트레이딩 봇(펀딩비 차익거래 실거래, TRX 스윙 실거래, 모멘텀 로테이션 백테스트)이 같은 git 저장소 안에 들어있다 — README는 "자매 저장소"라 적어뒀지만 실제로는 `git remote -v` 기준 별도 저장소가 아니라 이 repo 안의 하위 디렉터리다.

## 인프라 현황 (2026-11-11 기준, 확인 필요시 재검증)

- **운영 서버가 Mac에서 `linuxserver`(192.168.0.12, LAN, SSH alias `linuxserver`)로 이전 완료됨.** `docs/LINUX_MIGRATION_PLAN_2026-11-10.md`와 `docs/LINUX_CUTOVER_RUNBOOK.md`가 그 계획/런북. 지금 linuxserver에 컨테이너 17개(compose 프로젝트 이름 `ochestration`) 떠 있고, Mac에는 Ochestration 관련 컨테이너 없음 — Mac에 남은 건 ScopeSentry(별개 보안 스캔 툴) 4개뿐.
- **앞으로 실제 운영 작업(컨테이너 재시작, 로그 확인, 배포)은 `ssh linuxserver`로 들어가서 해야 한다.** Mac의 `docker compose` 명령은 더 이상 운영 컨테이너에 영향 안 줌.
- `/Users/user/Desktop/CODE/*`는 `/Users/user/CODE/*`를 가리키는 심볼릭 링크(2026-11-09 이전 경로 호환용, `docs/LOCAL_RELOCATION_COMPLETION_2026-11-09.md` 참고). 실제 작업은 `/Users/user/CODE` 쪽 경로로 하면 된다.
- 리눅스 서버 재부팅 후 올라오는 데 시간 좀 걸림 — ARP incomplete/ping 실패 떠도 1~2분 후 재시도.

## Cloudflare / 도메인 (khsqowp1.my)

- Cloudflare 계정: `Kknd03255@naver...`(대시보드 표시 기준), zone ID `c78c04d4128f3768b1a7b193c897ae7f`, 무료 플랜, DNS 레코드 200개 중 몇 개만 사용 중.
- Tunnel 이름 **Ochestration** (Tunnel ID `cc985378-6620-4fc0-a7b2-876083169cd4`), `TUNNEL_TOKEN` 방식(리모트 관리형) — ingress 라우팅은 로컬 `config.yml`이 아니라 **Cloudflare 대시보드 → Networking → Tunnels → Ochestration → Routes** 탭에서 "Add route → Published application"으로 관리한다.
- 현재 라우트:
  - `lab.khsqowp1.my` — Published application, 메인 오피스/트레이딩 대시보드 (`web` 컨테이너, nginx:80, docker-compose 상 `5173:80`)
  - `artex.khsqowp1.my` — Published application, ARTex 프로젝트용(해당 컨테이너는 현재 정지 상태)
  - `lab.khsqowp1.my` — Private hostname 라우트도 별도로 하나 더 있음(WARP 사설망 접근용, published application 라우트와 다른 용도)
  - `finance.khsqowp1.my` — Published application, **새로 추가됨**, `ochestration_finance` 저장소용, 포트 5555
- cloudflared 컨테이너는 docker-compose의 `app` 네트워크 안에서 돈다(호스트 네트워킹 아님). **"Service URL"에 `localhost:포트`를 쓰면 cloudflared 컨테이너 자기 자신을 가리키는 것** — 같은 `app` 네트워크에 붙은 다른 컨테이너를 가리키려면 서비스명으로 접근해야 한다(`http://<서비스명>:<포트>`). `app` 네트워크의 실제 Docker 네트워크 이름은 compose 프로젝트명 기준 `ochestration_app`.

## 인증 쿠키 (다른 서비스와 로그인 연동할 때 필요)

- 쿠키명: `orchestration_session` (`backend/src/main/java/com/orchestration/auth/AuthController.java`)
- HttpOnly, `SameSite=Lax`, `Secure`(=`AUTH_COOKIE_SECURE`), `Path=/`, **Domain 속성 미설정** → 발급한 정확한 호스트(`lab.khsqowp1.my`)에만 스코프됨. 다른 서브도메인(`finance.khsqowp1.my` 등)에는 자동으로 안 보냄.
- 내용물은 HS256 JWT(`JwtService.java`), 서명 키는 env var `JWT_SECRET`. Claims: `sub`(userId), `email`, `role`, `jti`, 7일 만료.
- 서브도메인 간 SSO가 필요하면: (1) `AuthController.cookie()`의 `ResponseCookie.from(...)`에 `.domain(".khsqowp1.my")` 추가, (2) 연동할 서비스가 같은 `JWT_SECRET`으로 HS256 서명을 검증. 아직 안 돼 있음 — `ochestration_finance/CLAUDE.md`에 상태 적어둠.

## 자동 배포 (`scripts/linux/auto_deploy.sh`, 2026-11-12 fable-claude-session 구현)

GitHub Actions 셀프호스트 러너 대신 **pull 방식 cron 배포**로 감(fork PR이 셀프호스트 러너에서 임의 코드 실행하는 보안 리스크 회피 — 원래 러너 제안을 fable이 이 이유로 반대해서 교체됨).

- linuxserver crontab에 `*/5 * * * * auto_deploy.sh` 등록됨. `origin main` fetch → `local_sha == remote_sha`면 아무것도 안 함.
- 체크아웃이 `main` 브랜치가 아니거나 tracked 파일에 수정사항 있으면(dirty) **머지 안 하고 Slack 알림만 내고 중단**. `merge --ff-only`만 씀 — fast-forward 안 되면(diverged) 역시 알림 내고 중단, 강제 머지 없음.
- **`trading/*`, `docker-compose.trading.yml`만 바뀐 커밋은 배포 자체를 스킵**한다(trading-only 변경 감지는 `git diff --name-only`로 판단). 빌드/업 대상은 `-f docker-compose.yml -f docker-compose.crypto-data.yml`뿐이고 `docker-compose.trading.yml`은 **절대 compose args에 안 들어감** — 실거래 코인 봇(현재 `trading-momentum-rotation`, [[project-live-bot-status-correction]])은 항상 SSH 수동 배포만, 자동배포 경로에서 의도적으로 제외됨.
- 실패하면 해당 `remote_sha`를 `failed-sha` 파일에 적어서 다음 실행에서 같은 실패를 반복 재시도하지 않음(새 커밋 와야 재시도). fetch가 3회 연속 실패하면 Slack 알림. 빌드/업 실패, 복구, 배포 성공 시에도 각각 Slack 알림(`scripts/linux/notify.sh`, env `SLACK_WEBHOOK_URL`, 중복 알림은 기본 6시간 억제).
- `~/.local/state/ochestration/deploy/PAUSE` 파일을 만들어두면 자동배포 전체가 통째로 스킵됨(수동 비상정지용, 파일 지우면 재개). 같은 디렉터리의 `lock/`으로 중복 실행 방지(1시간 넘은 lock은 stale로 보고 자동 해제).
- 로그: `~/logs/host/auto-deploy.log`(1MB 넘으면 `.1`로 롤오버), cron 실행 자체 로그는 `~/logs/host/auto-deploy-cron.log`.
- **결과적으로: Mac에서 `git push origin main`만 하면 5분 안에 linuxserver에 반영됨** (trading 전용 변경은 제외). `ochestration_finance`는 이 자동배포 대상이 아님(별도 디렉터리, git repo 아님) — 그쪽은 여전히 수동 rsync+`docker compose up -d --build`로 배포(`ochestration_finance/CLAUDE.md` 참고).

## 관련 디렉터리

- `/Users/user/CODE/ochestration_finance` — 새로 만든 개인 금융 관리 페이지. 별도 repo, `finance.khsqowp1.my` 라우트 연결됨, 포트 5555. 자세한 건 그쪽 `CLAUDE.md` 참고.
- `/Users/user/CODE/oracle_server` — **이것과 무관한 별개 인프라.** Oracle Cloud VPS(원격) 작업용 로컬 스테이징 폴더. linuxserver/Ochestration 도커 스택과 네트워크·인증 전혀 공유 안 함. 자세한 건 그쪽 `CLAUDE.md` 참고.
- `docs/` 안에 마이그레이션/런북/과거 스냅샷 문서 다수 — 날짜별 파일명이라 최신이 뭔지는 파일명의 날짜로 판단.
