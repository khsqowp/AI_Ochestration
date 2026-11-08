# Ochestration 로컬 경로 이전 준비 스냅샷

기록 시각: 2026-11-08 13:42 KST (UTC 2026-11-08 04:42)
기록 범위: `/Users/user/Desktop/CODE/Ochestration`에서 `/Users/user/CODE/Ochestration`로 이전할 가능성 조사
실행 범위: 상태는 읽기 전용으로 조사. 사용자 요청에 따라 Data 볼륨의 로컬 APFS/Time Machine 스냅샷을 생성함. 저장소 이동, 컨테이너 중지, LaunchAgent 변경, 데이터 삭제는 하지 않음.

복구 지점: `com.apple.TimeMachine.2026-11-08-134728.local` (2026-11-08 13:47:28 KST). `tmutil listlocalsnapshots /System/Volumes/Data`에서 생성 여부를 확인했다. 로컬 스냅샷은 purgeable이며 시스템이 공간 확보를 위해 제거할 수 있고, 디스크 고장에 대비한 별도 장치 백업은 아니다.

## 판단

**이사는 기술적으로 가능하며, Desktop 폴더에 대한 macOS 파일 접근 제한을 분리해 시험할 가치가 높다.** 원본과 대상은 같은 데이터 볼륨에 있어 전체 40GiB를 다시 복사할 필요 없이, 서비스 정지 후 같은 파일시스템 안에서 경로 변경 방식으로 옮길 수 있다. 다만 현재 컨테이너가 원본을 직접 마운트하고 있으므로 실행 중 이동은 안전하지 않다. Codex 작업공간 권한과 Docker 바인드 마운트는 TCC와 별도이므로 이사가 이 두 권한 문제까지 자동으로 해결한다고 보장할 수는 없다.

## 파일·볼륨 상태

| 항목 | 스냅샷 |
|---|---|
| 원본 | `/Users/user/Desktop/CODE/Ochestration`, 약 40GiB (du 표시 40G) |
| 대상 경로 | `/Users/user/CODE/Ochestration`, 기존 시험 사본 약 656MiB |
| 원본·대상 장치 ID | 모두 `16777229`; 같은 데이터 볼륨 |
| 볼륨 여유 공간 | 약 61GiB; 전체 460GiB 중 약 360GiB 사용 |
| 현재 Git 브랜치 / HEAD | `main` / `9b9ff21dbe1b602f496a0727a9c0ea64e5384caf` |
| 스냅샷 생성 직전 작업 트리 | 변경·미추적 합계 71개: 변경 26개, 미추적 45개, 삭제 0개 |

APFS 스냅샷 생성 직후 `df`가 여유 공간 49GiB를 한 번 보고했고, 후속 재측정은 61GiB였다. 프로젝트 전체는 약 7MiB 증가했을 뿐이며 APFS는 로컬 스냅샷을 purgeable로 표시한다. 따라서 12GiB 감소가 지속되거나 스냅샷이 그만큼의 공간을 차지한다고 단정하지 않는다. 현재 재측정 기준 여유 공간은 61GiB다.

기존 대상 사본은 `.git`, `trading-tick-archive`, `inbox` 등이 빠진 불완전 사본이다. 실제 이전의 원본이나 롤백 기준으로 사용하면 안 된다. 대상 경로를 비우기 위해 이를 지우지 말고 별도 이름으로 보존한 뒤 원본을 이동해야 한다. 원본의 기존 변경·미추적 파일 71개도 모두 보존 대상이다. 이 스냅샷 문서가 추가된 뒤 현재 작업 트리는 변경 26개, 미추적 46개가 된다.

## 실행 중인 서비스와 경로 결합

조사 시점에 Docker 컨테이너 16개가 실행 중이었다. Compose 프로젝트는 `ochestration`, `ochestration-trading`, `shadow_predictor`이며 Compose 작업 디렉터리와 파일 경로는 원본 Desktop 경로를 가리킨다.

저장소 내부를 직접 마운트한 주요 경로는 `trading-tick-archive`, `trading-crypto-paper-state`, `.kis-cache`, `inbox/archive_ochestration`, `inbox/notebook-images`, `inbox/game-leaderboards`, `obsidian`, `backups`, `scripts/db-backup.sh`, `trading/shadow_predictor/runtime`이다. 틱 수집기 두 개와 KR 장중 스캔을 포함한 컨테이너가 아카이브 디렉터리를 사용한다. 이름 있는 Docker 볼륨에 저장된 MySQL·n8n·거래 상태는 저장소 경로와 별개이며, Compose 프로젝트 이름을 유지해 재생성해야 기존 볼륨을 재사용할 수 있다.

현재 로드된 주요 사용자 LaunchAgent는 다음과 같다.

- `com.orchestration.md-sync`: 실행 중 프로세스 PID 1515, 스크립트가 Desktop 저장소를 가리킴
- `com.ochestration.daily-nas-backup`: 로드됨, 실행 중 PID 없음, Desktop 저장소 스크립트를 가리킴
- `com.ochestration.docker-watchdog`: 로드됨, 실행 중 PID 없음, Desktop 저장소 스크립트를 가리킴
- `com.cointrade.shadow-archive`: 로드됨. 실행 파일과 SQLite DB는 `~/Library/Application Support/CoinTradeShadowArchive` 아래라 저장소 이동과 독립적
- 이전 틱 아카이버 및 구형 주간/백업 작업은 `.plist.disabled`로 보존되어 있으나 경로는 Desktop을 가리킴. 재활성화 전에 갱신해야 함

Docker API, 프로세스 상태, LaunchAgent 상태를 읽어 확인했다. 비밀 환경변수는 출력하거나 수집하지 않았다.

## TCC 가설과 검증 한계

Apple 문서는 Desktop, Documents, Downloads 등 일부 보호 폴더의 앱별 접근 권한을 macOS 개인정보 보호 설정으로 관리한다고 설명한다: [Apple 지원 - Mac에서 파일 및 폴더 접근 제어](https://support.apple.com/guide/mac-help/control-access-to-files-and-folders-on-mac/mchld5a35146/mac).

`~/CODE`는 Desktop/Documents/Downloads/iCloud/NAS 아래가 아닌 일반 홈 디렉터리이므로, Desktop 경로에 특화된 TCC 접근 문제를 줄이는 실험으로 적절하다. 현재 Codex 실행 도구의 샌드박스가 새 경로를 허용하는지, Docker Desktop이 갱신한 바인드 경로를 허용하는지, 모든 사용자 앱의 접근이 정상인지 아직 같은 실행 주체로 검증하지 않았다. 따라서 이 판단은 “가능성 높음”이며, 실서비스 검증 전 100% 성공 주장 근거는 아니다.

## 안전한 이사 절차와 완료 판정

1. 이동 직전 Git 상태·파일 수·용량·중요 데이터 해시를 다시 기록한다. 기존 dirty/untracked 자료는 커밋이나 정리 없이 보존한다.
2. Compose 프로젝트 구성을 원본 경로에서 확인하고, 틱 쓰기 서비스를 먼저 정상 종료한다. 열린 파일 핸들이 사라지고 NAS 아카이브 검증이 끝났는지 확인한다.
3. 저장소 바인드 마운트를 사용하는 나머지 프로젝트 서비스와 Desktop 경로를 사용하는 LaunchAgent를 정지/해제한다. `docker compose down -v`는 금지한다. 이름 있는 볼륨은 삭제하지 않는다.
4. 기존 656MiB 시험 사본은 삭제하지 않고 날짜가 붙은 보존 경로로 이동한다. 원본 40GiB 트리를 같은 데이터 볼륨 안에서 새 위치로 이동한다. 이 단계에서 예상되는 추가 복사 용량은 거의 0이지만, 원본은 이동 완료와 검증 전까지 롤백 기준으로 보존한다.
5. 설치된 LaunchAgent를 새 경로로 다시 만들고, 같은 Compose 프로젝트 이름·서비스 파일로 컨테이너를 재생성한다. 바인드 마운트의 실제 원본 경로가 `/Users/user/CODE/Ochestration/...`인지 `docker inspect`로 확인한다.
6. Git HEAD 및 71개 작업 변경 상태, 핵심 디렉터리의 파일 수·크기·해시를 원본 스냅샷과 비교한다. API/Web 상태, MySQL/n8n 지속 데이터, 틱 파일 쓰기, Shadow Archive와 NAS 검증, md-sync 및 백업 로그를 확인한다.
7. Codex를 새 경로에서 다시 열어 실제 편집·테스트를 수행한다. 이것이 통과해야 Codex 샌드박스까지 포함한 경로 이전 성공으로 판정한다.
8. 검증 전에는 원본 데이터·기존 사본·NAS 백업을 삭제하지 않는다. 실패하면 서비스를 다시 정지한 뒤 원본 디렉터리를 Desktop 경로로 되돌리고 LaunchAgent와 Compose 프로젝트 경로를 복구한다.

완료 조건은 단순히 폴더가 새 위치에 존재하는 것이 아니다. 저장소 무결성, Docker 바인드 경로, 거래 데이터 기록, NAS 백업 검증, 자동 작업, Codex 작업공간 접근이 모두 새 경로에서 확인되어야 한다.

## 이후 작업 기록

2026-11-08 복사 준비 중 기존 `/Users/user/CODE/Ochestration` 시험 사본(656MiB)을 삭제하지 않고 `/Users/user/CODE_PREEXISTING_20261108/Ochestration`으로 같은 볼륨 내 이동해 보존했다. APFS clone 복사 기능은 저장소의 정적 1.14GiB Git pack 파일을 임시 복사해 바이트 비교했고 성공했으며, 임시 시험 파일은 제거했다. 사용자가 복사 실행을 중단해 `Desktop/CODE` 및 `Desktop/oracle_server`의 본 복사는 시작되지 않았고, 새 `/Users/user/CODE`는 비어 있다.

이후 읽기 전용으로 확인한 틱 아카이브는 로컬 1,086개 파일·33GiB, NAS 691개 파일·2.2GiB였다. NAS gzip 아카이브는 2026-10-26까지 확인됐고 로컬 원본은 2026-11-08까지 존재한다. 활성 일일 NAS LaunchAgent의 `DAILY_NAS_ENABLE_DELETE`는 `1`이다. 최근 2026-11-08 실행은 `uploaded=276`, `verified=303`, `deferred_days=12`, 종료 코드 10(부분 완료)였다. 따라서 NAS가 전체 틱 아카이브의 검증된 완전 사본이라고 간주하지 말고, 완전한 검증과 보존 범위 확인 전에는 로컬 원본을 제거하지 않는다.

이후 사용자의 복사 요청에 따라 `/Users/user/CODE`에 `Desktop/CODE`와 `Desktop/oracle_server`를 APFS clone 방식으로 복사했다. `ditto --clone`이 모든 복사 항목에서 성공했고, 대상의 CODE 최상위 이름 목록은 원본과 일치한다. 특수 파일명 `Icon\r`는 첫 복사에서 빠진 것을 발견해 별도로 복사하고 바이트 비교했다. 원본·대상 Ochestration의 Git HEAD는 모두 `9b9ff21dbe1b602f496a0727a9c0ea64e5384caf`다. Oracle SSH 개인 키는 내용을 출력하지 않고 크기·권한(0600)·바이트 일치만 검증했다. 대상의 논리 크기는 약 87GiB이며 현재 여유 공간은 약 59GiB다. same-volume clone은 블록을 공유하므로 이 복사본은 독립적인 전체 물리 백업이 아니다. 실행 중인 Docker 서비스와 LaunchAgent는 원본 Desktop 경로를 계속 사용하며, 새 경로에서의 서비스 cutover나 Codex GUI 쓰기/TCC 검증은 아직 하지 않았다.
