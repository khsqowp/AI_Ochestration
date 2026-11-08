# Local checkout relocation readiness

> **상태 갱신 (2026-11-09 KST): 이전 작업 완료.** 이 문서는 사전 준비 시점의 계획·검증 기준을 보존한다. 현재 경로와 서비스 상태는 [LOCAL_RELOCATION_COMPLETION_2026-11-09.md](LOCAL_RELOCATION_COMPLETION_2026-11-09.md)를 기준으로 확인한다. 아래의 “아직 수행하지 않았다” 및 “이동 전” 서술은 작성 당시의 기록이지 현재 상태가 아니다.

목표 위치는 `$HOME/CODE/Ochestration`이고, 현재 체크아웃은 `$HOME/Desktop/CODE/Ochestration`이다. 이 문서는 이전 절차와 검증 기준을 고정한다. **실제 저장소 이동, 컨테이너 중단, LaunchAgent 변경은 아직 수행하지 않았다.**

## 현재 상태와 이동 원칙

- `$HOME/CODE/Ochestration`은 경로 테스트용 복사본이다. `.git`, `.env`, 개인 저장자료, 대용량 거래 아카이브와 일부 캐시는 제외되어 있어 실제 저장소 대신 사용할 수 없다.
- 원본은 약 45GB이며, `trading-tick-archive` 약 39GB, `inbox` 약 2.9GB, Git 이력 약 1.1GB를 포함한다. 같은 볼륨에서 전체 복사하면 가용 공간을 크게 줄인다.
- 확인 당시 원본과 새 경로는 같은 파일시스템에 있다. 실제 이전은 `git archive`, 새 clone, `rsync --delete`가 아니라 전체 디렉터리 rename/move 방식으로 해야 `.git`, `.env`, 수정·미추적 파일, 무시된 사용자 자료를 함께 보존하고 중복 저장 공간을 피할 수 있다.
- 현재 원본 작업 트리에는 사용자 소유의 수정·미추적 변경이 있다. 전체 디렉터리 이동 전후에 그 상태를 비교하고, 파일을 골라 복사하거나 정리하지 않는다.

## 사전 차단 조건

아래 항목을 모두 확인하기 전에는 원본을 옮기지 않는다.

1. Docker Compose 사용 서비스를 유지보수 시간에 안전하게 정지할 수 있는지 확인한다. 경로 이동은 컨테이너의 bind mount 경로를 바꾼다. `mysql_data`, `n8n_data` 및 거래 관련 named/external volume은 삭제·재생성하지 않는다.
2. 새 위치에 이미 있는 테스트 복사본을 구분한다. 실제 이전 시 테스트 복사본은 삭제하지 말고 우선 별도 이름으로 보존한 뒤, 원본 전체를 `$HOME/CODE/Ochestration`로 이동한다. 두 트리를 병합하지 않는다.
3. 현재 활성 LaunchAgent와 비활성 보관 plist의 경로를 점검한다. 확인된 대상은 `com.ochestration.docker-watchdog`, `com.ochestration.daily-nas-backup`, `com.orchestration.md-sync`와 비활성 `com.ochestration.archive-to-nas`, `com.orchestration.tick-archive-weekly`, `com.orchestration.tick-backup`이다. 활성 작업은 새 경로로 다시 생성·검증·등록하고, 비활성 plist도 나중에 재활성화하기 전에 갱신한다.
4. `CODE` 복사본에는 `.env`가 없다. 원본 이동 방식에서는 `.env`가 함께 보존되는지 파일 존재·권한만 확인하고 내용을 출력하거나 로그에 남기지 않는다.

## 실제 이동 후 검증 게이트

1. Git 저장소 루트가 `$HOME/CODE/Ochestration`인지 확인하고, 이동 전후 `git status --short`의 수정·미추적 항목이 동일한지 비교한다. `.git`과 `.env`는 존재만 확인하며 값을 출력하지 않는다.
2. 원본 보유 데이터 디렉터리와 파일 수/용량이 유지되었는지 확인한다. 최소 확인 대상은 `trading-tick-archive`, `inbox`, `backups`, `backup-obsidian-migration`, `obsidian`, `.kis-cache`, `trading/.rs_cache`, `trading-crypto-paper-state`이다.
3. 새 위치에서 Python 경로·아카이브 안전 테스트, 프런트엔드 테스트/빌드, 백엔드 테스트를 실행한다. 백엔드는 이 작업 당시 Java 23에서 277개 중 2개 기존 테스트 실패가 별도 기준 복사본에서도 재현됐다. 이 두 실패는 경로 이동 통과로 계산하지 않는다.
4. 각 Compose 파일은 설정 검증까지만 수행한다. 서비스를 시작하거나 재생성하지 않는다. 볼륨 목록·이름이 유지되고, bind mount의 새 호스트 경로가 올바른지 확인한 뒤에만 별도 운영 승인 아래 서비스를 재개한다.
5. LaunchAgent 템플릿에서 `__REPO__`를 새 저장소 루트로 채운 plist를 생성하고 `plutil -lint`를 통과시킨다. 기존 job을 재등록할 때 `bootout`/`bootstrap`이 실제 상태를 바꾸므로, 유지보수 시간에만 수행한다.
6. Codex 작업공간도 새 경로로 다시 열어야 한다. 현재 세션의 파일 샌드박스 허용 경로는 이전 루트에 묶여 있어, 디렉터리만 옮겨도 이 세션의 쓰기 권한은 따라오지 않는다.

## 권한 판정 기준

`$HOME/CODE`는 macOS의 Desktop 폴더 자체가 아니므로 Desktop 폴더 접근 차단은 피할 가능성이 높다. 다만 iCloud Obsidian 목적지와 네트워크/이동식 볼륨은 별도 보호 대상일 수 있다. 실패 시 전체 디스크 접근 권한부터 주지 말고, 로그에서 거부한 프로세스와 대상 경로를 확인한 뒤 해당 폴더에 필요한 최소 권한만 검토한다. macOS TCC와 Codex의 작업공간 샌드박스는 별개의 통제다.

## 이전하지 않을 기록

날짜가 붙은 보고서·백테스트 산출물에 남은 이전 경로는 생성 당시의 근거로 보존한다. 실행 코드·운영 스크립트·재사용 설치 절차의 경로만 이식 가능하게 유지한다. 과거 로그와 기록을 일괄 치환하지 않는다.
