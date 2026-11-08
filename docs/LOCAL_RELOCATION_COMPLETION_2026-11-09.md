# Local CODE relocation completion

완료 시각: 2026-11-09 KST 00시경
원본 경로: `/Users/user/Desktop/CODE`
운영 경로: `/Users/user/CODE`

## 결과

- Desktop/CODE의 프로젝트 디렉터리 15개를 `/Users/user/CODE`로 옮겼다. `/Users/user/CODE/oracle_server` 등 대상에만 있던 디렉터리는 보존했다.
- Desktop의 기존 프로젝트 경로는 `/Users/user/CODE` 아래의 대응 디렉터리를 가리키는 심볼릭 링크로 남겼다. 기존 경로를 사용하는 도구도 새 경로에 기록한다.
- `/Users/user/Desktop/CODE/.SynologyWorkingDirectory`는 위치를 바꾸지 않았다. NAS/iCloud 볼륨 및 그 안의 자료도 이동·삭제하지 않았다.
- Finder 보조 메타데이터(`.DS_Store`, `._*`)와 `AI/cache/flashrank/__MACOSX` 메타데이터 디렉터리는 애플리케이션 파일이 아니므로 동기화 대상에서 제외했다.
- 임시 롤백 사본은 검증 후 삭제했다. 원본 내용은 새 경로에 있고, 사전 동기화 이후 새 경로의 서비스가 생성한 런타임 상태가 최신본이다.

## 동기화와 무결성 확인

- 이동 직전 rsync 사전 검사는 324,713개 항목을 조사했고 125개 파일, 약 1.56GB의 갱신이 필요하다고 보고했다.
- 동기화 후 메타데이터 기준 재검사는 전송 파일 0개, 남은 차이 0개였다.
- 이후 전체 체크섬 비교에서 27개 항목이 달랐다. 차이는 ScopeSentry MongoDB/Redis 상태, 새 경로에서 갱신된 틱·예측 런타임 파일, 의도적으로 바꾼 `dolphin_ai/services/pipeline/src/index_owasp.py`, 그리고 서비스 실행 중 재기록된 Git 인덱스에 한정됐다. 이 항목은 이전 시점의 정지된 복사본과 새 경로에서 실행된 현재 상태의 차이다.
- Ochestration Git 작업 트리의 porcelain 상태는 이전 복사본과 새 경로가 정확히 같았고 수정·미추적 항목 수는 66개였다. 커밋이나 푸시는 하지 않았다.

## 서비스 전환과 검증

- 로컬 Docker 컨테이너를 유지보수 중 일시 정지하고, 기존 Compose 프로젝트 이름과 named volume을 유지한 채 새 경로의 Compose 파일로 재생성했다. Oracle 서버는 건드리지 않았다.
- Ochestration, 거래/크립토 및 ScopeSentry 컨테이너의 Compose 작업 경로와 실제 bind mount 경로를 검사했다. 프로젝트 경로는 `/Users/user/CODE/...` 아래이며 `/Users/user/Desktop/CODE` bind mount는 남아 있지 않다.
- 별도로 정지 상태인 ARTex 2개와 Dolphin 4개 컨테이너도 확인했다. 해당 컨테이너 정의에는 이전 Desktop 경로 문자열이 남아 있지만, 각 호스트 bind 경로를 `realpath`로 확인한 결과 `/Users/user/CODE/...`로 해석된다. 이 컨테이너들은 쓰기 레이어에 변경 데이터가 있어 재생성하지 않고 정지 상태를 보존했다. 다음에 재생성할 때는 새 `/Users/user/CODE` Compose 경로를 사용해야 한다.
- API, 웹, n8n, ScopeSentry의 로컬 HTTP 점검은 모두 200을 반환했다. MySQL 컨테이너는 healthy 상태였다.
- md-sync와 Docker watchdog LaunchAgent는 `/Users/user/CODE/Ochestration/scripts`의 스크립트를 사용하도록 바꾸고 재등록했다. 비활성 백업 plist의 코드 경로도 갱신했다.
- NAS 삭제 옵션이 켜진 일일 NAS 백업 LaunchAgent는 NAS 자료를 건드리지 않도록 재활성화하지 않았다. 따라서 해당 예약 백업은 현재 로드되지 않은 상태다.
- Ghidra MCP launcher와 Reversing Codex 설정 및 비활성 Claude-flow daemon 경로는 `/Users/user/CODE`로 정규화하고 쉘 구문·JSON 구문을 검사했다. Claude-flow 세션 기록과 날짜가 있는 보고서의 과거 경로는 이력으로 보존했다.
- `/Users/user/CODE/.SynologyWorkingDirectory`는 이전에 대상에 있던 별도 Synology 작업 폴더(286MB)로 확인했다. Desktop의 동명 폴더(64MB)와 내용·크기가 다르므로 어느 쪽도 이동·삭제하지 않았다.
- 독립 에이전트 2명이 파일시스템과 런타임을 따로 감사했다. Desktop의 링크 15개는 모두 정상이며, `/Users/user/CODE/oracle_server` 및 두 Synology 작업 폴더는 그대로 보존된 것을 확인했다.
- 후속 확인에서 Ochestration md-sync·Docker watchdog LaunchAgent의 출력 로그 세 개를 `logs/launchd/`로 옮기고 plist 경로를 새 CODE 경로로 변경했다. 두 plist 모두 `plutil -lint`를 통과했고, md-sync는 새 경로에서 실행 중이며 watchdog도 새 plist와 새 로그 경로로 등록돼 있다. NAS 백업 로그/예약은 이 변경에 포함하지 않았다.
- 후속 런타임 점검에서도 Desktop의 15개 호환 링크 모두 유효했고, 활성 컨테이너 20개 중 Desktop/CODE를 직접 bind mount하는 컨테이너는 없었다. 웹(5173), n8n(5678), ScopeSentry(8082)는 HTTP 200, MySQL은 healthy였다. API의 `/`는 HTTP 404를 반환했으므로 이를 API 장애나 정상 health 응답으로 간주하지 않았다.
- ARTex 2개와 Dolphin 4개의 정지 컨테이너는 Compose 설정 문자열에 과거 Desktop 경로가 남아 있다. 각 호스트 bind source는 `realpath`로 `/Users/user/CODE/...`에 해석된다. 이 컨테이너들은 비영 쓰기 레이어가 있어 재생성하지 않았고, Docker Desktop에서 실제 재시작 동작은 시험하지 않았다.

## Codex 작업공간

Codex GUI의 현재 스레드는 이전 Desktop 경로로 생성됐다. 해당 경로는 새 `/Users/user/CODE`로 이어지는 호환 링크이지만, 이 스레드의 파일 샌드박스는 이전 경로 권한을 유지한다. 다음 Codex 작업은 `/Users/user/CODE/Ochestration`을 작업공간으로 다시 열어 진행해야 한다.
