# MacBook → Linux 서버 전체 마이그레이션 계획 (승인 대기)

작성: 2026-11-10 KST · 상태: **계획만 작성됨. 파일 이동·컨테이너 중지·설정 변경은 하나도 하지 않았다.**
조사 방식: Mac과 `linuxserver`에서 읽기 전용 명령만 실행(`docker ps/inspect/exec ls·cat`, `du`, `findmnt`, 로그 tail 등).
참고: `docs/LOCAL_RELOCATION_COMPLETION_2026-11-09.md`

원칙: 데이터 손실 0 · 실거래 봇 이중 가동 0 · 번인 없이 1회 전환 · Mac은 서비스만 내리고 그대로 보존 · Oracle 서버 무접촉.

---

## 0. 먼저 결정이 필요한 것 (조사 중 발견)

아래는 계획을 좌우하는 사실들이다. 번호는 9장 "승인 요청 항목"과 대응한다.

| # | 발견 | 근거 | 영향 |
|---|------|------|------|
| F1 | **Mac→NAS 백업이 현재 깨져 있다.** 백업 스크립트의 NAS 주소 기본값이 `noroot.local` / `192.168.0.12`인데, 지금 그 이름·IP는 리눅스 서버다(리눅스 hostname=`noroot`, smbd inactive). 실제 NAS는 `192.168.0.75`. | `daily_nas_backup.sh:10-11`, `backup-tick-archive-to-nas.sh:16-17`, `archive_to_nas.py:467-468`; `ping noroot.local` → 192.168.0.12; 11-10 04:29 로그 `mount lost; aborting`, `DAILY NAS BACKUP FAILURE status=1`; shadow-archive 로그 `NAS volume is not mounted at /Volumes/HDD2TB`; Mac `/Volumes`에 HDD2TB 없음 | 11-10 03:00 state/DB 백업까지만 NAS에 있다. 그 이후 Mac 데이터는 NAS 사본이 없다. 다음 03:00 실행도 마운트 실패할 가능성이 높다 |
| F2 | **CPU 아키텍처가 다르다.** Mac 이미지는 전부 `arm64`, 리눅스는 `amd64`. | `docker image inspect`, `dpkg --print-architecture` | 이미지 복사 불가 → 리눅스에서 전부 재빌드. 볼륨 데이터(JSON, MySQL 8.4.4 InnoDB, n8n sqlite)는 아키텍처 독립이라 그대로 복원 가능. MySQL은 그래도 논리 덤프를 병행 |
| F3 | **실제 돈이 걸린 컨테이너는 `trading-momentum-rotation` 하나다.** `MOMENTUM_ROTATION_LIVE=true`, mainnet, 상태 `mode=live`, 보유 포지션 16개, `halted=False`. 마지막 리밸런스 11-08 09:44 UTC, 주기 3일 → 다음 리밸런스는 **11-11 18:44 KST 전후**(컷오버 직전 상태 파일 `next_rebalance_ts`로 재확인). | compose 환경변수, 상태 파일 키 조회 | 컷오버 시각은 리밸런스 ±2시간을 피한다. 나머지 봇(kr/us-rotation=KIS 모의, paper-funding-arb, coin-swing6)은 페이퍼지만 상태 연속성은 동일하게 보존 |
| F4 | **trx-swing 컨테이너가 떠 있지 않다.** 볼륨 `ochestration_trading_trx_swing_state`(427kB)만 있고 api가 :ro로 읽는다. | `docker ps -a` | 의도된 상태인지 확인 필요. 계획상으로는 "볼륨만 이전, 컨테이너는 기동하지 않음"으로 둔다 |
| F5 | **봇에 SIGTERM 핸들러가 없다.** 상태 저장은 원자적(`state_io.py` tmp→`os.replace`)이라 `docker stop`으로 파일이 깨지지는 않지만, 정지 중에는 포지션 16개가 거래소에 무관리 상태로 남는다. | `grep SIGTERM` 결과 없음, `state_io.py:19` | 실거래 봇 공백을 10~15분으로 최소화하는 순서로 설계(6장 Stage A) |
| F6 | **권한(UID) 문제는 리눅스에서만 드러난다.** Docker Desktop은 bind mount 소유권을 가려주지만 리눅스는 아니다. trading 이미지 `app`=uid 100:gid 101, crypto-tick-stream·shadow-predictor는 `LOCAL_UID:-501`/`LOCAL_GID:-20`, 리눅스 계정 noroot=1000:1000. `trading-tick-archive`는 uid 100과 uid 501이 **둘 다** 쓴다. | `docker exec id`, compose `user:` | 리눅스 `.env`에 `LOCAL_UID=1000`/`LOCAL_GID=1000`, bind 디렉터리에 uid 100용 ACL 필요(`setfacl` 설치 확인됨). 리허설에서 쓰기 테스트 |
| F7 | **Mac 호스트에 묶인 의존성 6개.** (a) LinkCollect용 autossh 터널(Oracle Oracle 서버, 로컬 18787, 키는 `~/Desktop/oracle_server/`) — api가 `host.docker.internal:18787`로 호출 (b) Cloudflare 터널 ingress rule 1 → `http://host.docker.internal:8787` (현재 Mac 8787에 리스너 없음, 로그상 connection refused) (c) md-sync: fswatch → **iCloud** Obsidian vault (d) `docker_watchdog.sh`: osascript·Docker Desktop 전용 (e) shadow-archive LaunchAgent + `~/Library/Application Support/CoinTradeShadowArchive` bind (f) NAS 백업 3종: SMB·`open`·`/Volumes`·BSD `stat` 전용 | plist 6개, compose, 스크립트, cloudflared 로그 | 전부 리눅스용 대체물이 필요(7장). (a)는 Oracle 키를 리눅스에 두는 결정 필요, (c)는 리눅스에 iCloud가 없어 구조 결정 필요 |
| F8 | **Mac의 일일 백업은 삭제 옵션이 켜져 있다**(`DAILY_NAS_ENABLE_DELETE=1`, 검증 후 로컬 원본 틱 삭제). 문서(11-09)에는 "재활성화 안 함"이라 돼 있으나 `launchctl list`에는 로드돼 있다(마지막 종료코드 1). | plist, `launchctl list` | 동기화 기간에 원본이 바뀌면 "차이 0" 검증이 흔들린다. 동기화 시작 전에 이 에이전트를 내려야 한다(승인 필요) |
| F9 | **리눅스에서 sudo는 비밀번호가 필요하다.** | `sudo -n true` 실패 | fstab·systemd 유닛·apt 설치는 내가 못 한다. 9장에 root 명령 목록을 따로 뽑아 사용자가 직접 실행 |
| F10 | **Mac rsync가 openrsync(2.6.9 호환, 프로토콜 29)다.** | `rsync --version` | `--info`, `--append-verify` 등 미지원. Mac에 `brew install rsync`(3.x) 필요. 리눅스는 3.2.7 |
| F11 | 리눅스는 Ubuntu **Desktop** 설치로 보인다(홈에 바탕화면·문서 디렉터리). `unattended-upgrades` enabled. | `ls ~`, `systemctl is-enabled` | 자동 절전과 Docker 패키지 자동 업그레이드가 실거래 봇을 끊을 수 있다. 절전 타깃 mask, docker 패키지 자동 업그레이드 제외 또는 `live-restore` 설정 제안 |
| F12 | 공인 IP는 Mac·리눅스 동일, 리눅스에서 `fapi.binance.com` 200. | `curl ipify` 양쪽 | 거래소 API 키 IP 화이트리스트가 있어도 영향 없음 |
| F13 | NAS `tick-archive`(3.9G, 10/09~11/05)는 로컬 원본을 압축·변환한 사본이다(로컬 10/29 4.1G ↔ NAS 270M). 로컬 원본 틱은 34G(10/18~23, 10/28~11/10). | `du` 양쪽 | NAS 사본으로 로컬을 대체할 수 없다. 로컬 34G를 그대로 리눅스로 옮긴다. NAS 기존 자료는 건드리지 않는다 |

---

## 1. 인벤토리

### 1.1 Compose 프로젝트 (이전 대상)

| 프로젝트 | Compose 파일 | 실행 중 서비스 |
|----------|--------------|----------------|
| `ochestration` | `docker-compose.yml` + `docker-compose.crypto-data.yml` | mysql, db-backup, api, games, web, cloudflared, n8n, crypto-tick-stream(`cointrade-crypto-tick-stream`) |
| `ochestration-trading` | `docker-compose.trading.yml` (profiles) | momentum-rotation **(실거래)**, kr-rotation, us-rotation, paper-funding-arb, coin-swing6, tick-stream, kr-opening-scan |
| `shadow_predictor` | `trading/shadow_predictor/docker-compose.shadow.yml` | crypto-shadow-predictor |

이전 대상 아님(요청 범위 밖, 확인 필요 Q1): `scopesentry`(4개 실행 중), `artex-docker`, `dolphin_ai`(Created 상태), `88motorcycle-web`·`supply-chain-lab` 볼륨.

### 1.2 Named volume

| 볼륨 | 크기 | 쓰는 컨테이너 | 등급 |
|------|------|---------------|------|
| `ochestration_trading_momentum_rotation_state` | 2.5MB | momentum-rotation(rw), api(ro) | **실거래 상태** |
| `ochestration_trading_control` | 200B | api(rw), 로테이션 봇 3개(rw) | **실거래 제어** |
| `ochestration_mysql_data` | 874MB | mysql | 핵심 |
| `ochestration_n8n_data` | 18MB | n8n (sqlite + 자격증명, `N8N_ENCRYPTION_KEY`와 짝) | 핵심 |
| `ochestration_trading_kr_rotation_state` | 19MB | kr-rotation, api | 페이퍼 상태 |
| `ochestration_trading_us_rotation_state` | 2.7MB | us-rotation, api | 페이퍼 상태 |
| `ochestration_trading_paper_state` | 2.1MB | paper-funding-arb, api | 페이퍼 상태 |
| `ochestration-trading_trading_coin_swing6_state` | 774kB | coin-swing6, api (이름이 관례와 다름 — 그대로 유지) | 페이퍼 상태 |
| `ochestration_trading_tick_state` | 1.8MB | tick-stream | 런타임 |
| `ochestration_trading_kr_swing_state` | 234kB | tick-stream(ro), api(ro) | 보존 |
| `ochestration_trading_us_swing_state` | 461kB | tick-stream(ro), api(ro) | 보존 |
| `ochestration_trading_trx_swing_state` | 427kB | api(ro) — 봇 미기동(F4) | 보존 |

참조하는 컨테이너가 없는 볼륨(`ochestration-trading_mysql_data` 223MB, `ochestration_trading_tick_archive` 217MB, `trading_kr_swing_state`, `shadow_predictor_shadow-output`)은 리눅스에 복원하지 않고, tar만 떠서 NAS `Trade/mac-final-snapshot/`에 보관한다. Mac에서도 지우지 않는다.

모든 trading 볼륨은 compose에서 `external: true`다. 리눅스에서 **같은 이름으로 미리 생성**해야 compose가 뜬다.

### 1.3 Bind mount / git 미추적 데이터

| 경로 (repo 기준) | 크기 | 파일 수 | 쓰는 주체 | 방식 |
|------------------|------|---------|-----------|------|
| `trading-tick-archive/` | 34G | 1,126 | tick-stream·kr-opening-scan(uid 100), crypto-tick-stream(uid 501) | 증분 rsync (대용량, 유실 금지) |
| `inbox/` (archive_ochestration, notebook-images, game-leaderboards) | 2.9G | 21,761 | api, games | 증분 rsync |
| `backups/` (mysqldump 7일치 + 수동 백업) | 221MB | 15 | db-backup | 증분 rsync |
| `obsidian/` | 12MB | 604 | api, n8n | 증분 rsync |
| `.kis-cache/` | 16MB | 118 | kr/us-rotation | 증분 rsync (KIS 토큰 캐시 포함) |
| `trading-crypto-paper-state/` | 1MB | 2 | crypto-tick-stream(rw), api·shadow(ro) | 컷오버 시 최종 복사 |
| `trading/shadow_predictor/runtime/` | 8.9MB | — | shadow-predictor | 컷오버 시 최종 복사 |
| `~/Library/Application Support/CoinTradeShadowArchive/` | 704MB | sqlite 300MB + corrupt 사본 437MB | shadow-predictor, LaunchAgent | 컨테이너 정지 후 `sqlite3 .backup` → 복사 (실행 중 sqlite는 rsync 금지) |
| `backup-obsidian-migration/`, `logs/`, `trading/.rs_cache/`, `trading/docs/research/**` 대용량(pkl/npz) | 소량~수백MB | — | 없음(정적) | 1회 rsync |
| `.env` (600, 38개 키) | 2.7kB | 1 | — | **scp 별도 전달, git 금지** |

코드·compose·n8n 워크플로는 git(`origin/main`, 작업 트리 clean)으로 옮긴다. 리눅스에서 `git clone` 후 위 미추적 데이터만 rsync로 얹는다.

### 1.4 Mac 호스트 작업 (LaunchAgent) → 리눅스 대응

| Mac | 현재 상태 | 리눅스 대체 |
|-----|-----------|-------------|
| `com.ochestration.docker-watchdog` (120초) | 동작 | systemd timer `ochestration-watchdog` — Docker Desktop 재시작 로직 제거, heartbeat·RestartCount·OOM 검사 유지, 알림은 Slack |
| `com.ochestration.daily-nas-backup` (03:00, 삭제 켜짐) | **실패 중(F1)** | systemd timer — `/mnt/nas` 직접 사용, SMB 마운트 로직 제거, `archive_to_nas.py --no-auto-mount --mount /mnt/nas` |
| `com.orchestration.md-sync` (fswatch→iCloud) | 동작 | Q3 결정에 따름 |
| `com.ochestration.linkcollect-tunnel` (autossh→Oracle) | 동작 | Q2 결정에 따름 (systemd `autossh` 서비스) |
| `com.cointrade.shadow-archive` (900초) | 실패 중(NAS 미마운트) | systemd timer, 경로는 `~/CODE/Ochestration/…` 또는 `~/shadow-archive/` |
| `*.disabled` 3개 | 비활성 | 이전 안 함 |

---

## 2. 리눅스 서버 배치

- 실행 데이터는 전부 **로컬 디스크**(`/dev/sda2`, 423G 여유)에 둔다: `/home/noroot/CODE/Ochestration` (sudo 불필요, Mac과 같은 상대 구조).
- **NAS는 백업·아카이브 전용**이다. 컨테이너가 `/mnt/nas`를 직접 bind mount하지 않는다. 이유: 현재 NFS가 `hard` 마운트라 NAS가 끊기면 그 경로에 쓰는 프로세스가 무기한 멈춘다. 봇 상태나 틱 수집기가 NAS에 직접 쓰면 NAS 장애가 곧 봇 정지가 된다.
- 리눅스 전용 설정은 compose 원본을 고치지 않고 `.env`(`LOCAL_UID=1000`, `LOCAL_GID=1000`)와 override 파일 하나(`docker-compose.linux.yml`: shadow-archive bind 경로 교체)로 처리한다.
- 볼륨 이름·Compose 프로젝트 이름·컨테이너 이름은 Mac과 동일하게 유지한다(watchdog·백업 스크립트가 이름에 의존).

---

## 3. 증분 동기화 스크립트 설계 (cron, 끊겨도 이어짐)

### 3.1 방향과 실행 위치

Mac → 리눅스 **push**. 리눅스에서 Mac으로 들어오는 SSH는 열려 있지 않고, 소스가 Mac이므로 Mac의 cron에서 돈다. 스크립트는 `scripts/migrate/sync_to_linux.sh`, 상태·로그는 `~/Library/Application Support/ochestration-migrate/`.

사전 조건: `brew install rsync`(F10), F8의 삭제형 백업 에이전트 unload.

### 3.2 작업 단위(job)

| job | 소스 → 대상 | 주기 | 비고 |
|-----|-------------|------|------|
| `tick` | `trading-tick-archive/` | 15분 | 시간 단위 디렉터리 구조. 닫힌 시간대는 불변, 현재 시간대 파일만 계속 자람 |
| `inbox` | `inbox/` | 15분 | 파일 2만여 개 |
| `small` | `obsidian/ backups/ .kis-cache/ backup-obsidian-migration/ logs/ trading/.rs_cache/` + research 대용량 | 15분 | |
| `volsnap` | named volume 12개 → tar → `staging/volumes/` | 6시간 | 실행 중 스냅샷. **리허설·보험용**이며 최종본은 컷오버 때 정지 후 다시 뜬다 |
| `dbdump` | `mysqldump --single-transaction` → `staging/db/` | 6시간 | 위와 동일 |

`trading-crypto-paper-state/`, shadow runtime·sqlite, `.env`는 주기 동기화에서 제외하고 컷오버 절차에서 직접 다룬다.

### 3.3 한 번의 실행 흐름

```
1. 잠금: mkdir lock (기존 스크립트와 같은 방식, macOS에 flock 없음). 살아있는 pid면 즉시 종료, 4시간 넘은 죽은 lock은 회수.
2. 사전 점검: ssh linuxserver true (10초 타임아웃), 대상 디스크 여유 > 60G. 실패하면 "연결 실패"로 기록하고 5로 간다.
3. 재시도 큐 먼저: jobs/<job>/retry.list 가 있으면
      rsync -a --partial-dir=.rsync-partial --timeout=120 --files-from=retry.list SRC/ linuxserver:DST/
   성공한 항목은 큐에서 제거, 실패한 항목은 시도 횟수 +1 해서 남긴다.
4. 증분 본 실행:
      rsync -a --partial-dir=.rsync-partial --timeout=120 --itemize-changes \
            --exclude='.DS_Store' --exclude='._*' --log-file=run.log SRC/ linuxserver:DST/
   --delete 는 쓰지 않는다(대상에서 아무것도 지우지 않음).
   종료코드 23/24/30/35/12 → stderr에서 실패 경로를 추출해 retry.list 에 추가(중복 제거).
5. 결과 기록: jobs/<job>/state.json = {last_run, last_ok, consecutive_failures, queued, bytes_sent, files_sent}
   성공이면 consecutive_failures=0, 아니면 +1.
6. 알림: consecutive_failures >= 3 이거나 같은 파일이 5회 연속 실패하면 Slack 알림 1회
   (같은 사유는 6시간 억제). 복구되면 복구 알림 1회.
7. 로그: logs/sync-YYYYMMDD.log 에 append, 14일 지나면 gzip, 5MB 초과 시 회전.
```

중단 내성: 전송 중 끊긴 파일은 `.rsync-partial`에 남아 다음 주기에 이어받는다. rsync 자체가 증분이므로 큐가 비어 있어도 본 실행이 누락분을 다시 잡는다. 큐는 "어떤 파일이 계속 실패하는가"를 추적하고 알림 기준으로 쓰기 위한 것이다.

cron 등록(Mac, `crontab -e`):
```
*/15 * * * * /bin/bash /Users/user/CODE/Ochestration/scripts/migrate/sync_to_linux.sh tick inbox small
17 */6 * * * /bin/bash /Users/user/CODE/Ochestration/scripts/migrate/sync_to_linux.sh volsnap dbdump
```
macOS cron이 TCC 권한으로 막히면 같은 스크립트를 LaunchAgent `StartInterval`로 돌린다(스크립트는 동일).

### 3.4 "남은 차이 0" 판정 (컷오버 게이트)

쓰는 컨테이너를 정지한 **뒤에** 실행한다. 실행 중에는 현재 시간대 틱 파일이 계속 자라므로 0이 될 수 없다.

```
rsync -rcn --delete --itemize-changes --exclude='.DS_Store' --exclude='._*' SRC/ linuxserver:DST/
```
- `-c` 전체 체크섬, `-n` dry-run, `--delete`는 dry-run에서 "대상에만 있는 파일"을 보여주는 용도.
- **출력이 0줄**이어야 통과. 한 줄이라도 있으면 원본 서비스를 내린 상태를 유지한 채 재동기화 후 재검사.
- 보조 검증: 양쪽에서 `find -type f | wc -l`, `du -sb` 합계 비교, 무작위 50개 파일 `sha256sum` 대조.
- 34G 체크섬은 디스크 읽기 속도에 좌우된다. 리허설에서 실측한다. 닫힌 날짜 디렉터리는 컷오버 전날 미리 체크섬 검증해 두고, 컷오버 순간에는 마지막 이틀 치만 다시 본다.

---

## 4. NAS 마운트 안정성 검증·강화

### 4.1 현재 상태

- fstab: `192.168.0.75:/volume2/HDD2TB /mnt/nas nfs defaults,_netdev,x-systemd.automount 0 0`
- 실제 옵션: NFSv3, `hard`, `proto=tcp`, `timeo=600`, `retrans=2`, automount idle timeout 0(자동 해제 안 함).
- `hard`이므로 NAS 순단 시 "끊김"이 아니라 **I/O가 멈췄다가 NAS 복귀 시 자동 재개**된다. 위험은 (a) 그동안 접근한 프로세스가 무기한 대기 (b) NAS 재부팅 후 stale file handle (c) NAS가 꺼진 채 부팅하면 `nofail`이 없어 부팅 지연 가능 (d) 마운트가 풀린 상태에서 빈 `/mnt/nas`에 써버리는 사고.

### 4.2 실제로 돌릴 테스트 (승인 후, sudo 필요 항목은 사용자 실행)

| 테스트 | 방법 | 통과 기준 |
|--------|------|-----------|
| T1 재부팅 | `sudo reboot` 후 `ls /mnt/nas/Trade` | 첫 접근에서 자동 마운트 (1차 확인됨, 재확인) |
| T2 네트워크 순단 3분 | `sudo iptables -I OUTPUT -d 192.168.0.75 -j DROP` → 3분 → 규칙 삭제. 그동안 `timeout 10 stat /mnt/nas/Trade` 반복 | 차단 중에는 timeout 124, 해제 후 60초 안에 정상. 수동 개입 없음 |
| T3 강제 언마운트 | `sudo umount -l /mnt/nas` 후 `ls /mnt/nas/Trade` | automount가 재마운트 |
| T4 NAS 재부팅 | DSM에서 NAS 재시작(사용자) | 복귀 후 기존 경로 접근 정상, `Stale file handle` 없음. 있으면 헬스체크가 재마운트하는지 확인 |
| T5 NAS 꺼진 채 부팅 | T2 규칙을 건 상태로 재부팅 | 부팅이 지연 없이 완료, docker·컨테이너 정상 기동, 차단 해제 후 자동 마운트 |
| T6 전송 중 순단 | 1GB 파일 rsync 중 T2 차단 | rsync가 `--timeout`으로 실패 종료, 재실행 시 이어받기, 최종 체크섬 일치 |

T2·T5의 iptables 규칙은 재부팅하면 사라지므로 서버를 잠글 위험이 없다.

### 4.3 강화안

1. fstab 옵션 교체(사용자 실행):
   `nfs _netdev,nofail,noatime,hard,timeo=150,retrans=3,x-systemd.automount,x-systemd.mount-timeout=30,x-systemd.idle-timeout=0 0 0`
   - `nofail`: NAS 없이도 부팅. `timeo=150`(15초): 재시도 주기를 60초에서 줄임. `soft`는 쓰지 않는다(쓰기 중 조용한 손상 위험).
   - NFSv4.1 전환은 Synology에서 활성화 여부를 확인하지 못했으므로 제안에서 제외.
2. **센티널 파일**: `/mnt/nas/Trade/.nas-mounted` 를 만들어 두고, NAS에 쓰는 모든 스크립트가 시작 시 `findmnt -t nfs /mnt/nas` + 센티널 존재를 확인한다. 실패하면 쓰지 않고 종료(빈 마운트 포인트에 쓰는 사고 차단 — Mac 스크립트의 mount 검사와 같은 목적).
3. **헬스체크 timer** `nas-health.timer`(1분): `timeout 10 stat` + 센티널 확인 + 1kB 쓰기·읽기·삭제.
   - 2회 연속 실패 → Slack 알림 "NAS 마운트 이상".
   - 5회 연속 실패 → `umount -f -l /mnt/nas` 후 `systemctl restart mnt-nas.automount` 시도, 결과 알림.
   - 복구 시 복구 알림. 상태는 `/var/lib/ochestration/nas-health/`.
4. NAS에 쓰는 모든 호스트 작업은 `timeout`으로 감싼다(멈춘 NFS가 cron 작업을 쌓지 않게).
5. `autofs` 전환은 제안하지 않는다. systemd automount가 같은 기능(요청 시 마운트)을 이미 하고 있고, 부족한 부분(감지·알림·강제 재마운트)은 3번이 메운다.

---

## 5. 로그 수집 설계

### 5.1 비교

| 방식 | 장점 | 단점 | 판정 |
|------|------|------|------|
| cron + rsync (로컬 파일 → NAS) | 단순, 추가 구성요소 없음, NAS 장애에 강함(다음 주기에 따라잡음) | 파일로 남는 로그만 가능. 컨테이너 stdout은 json-file 10MB×3 회전이라 주기 사이에 밀려날 수 있음 | 파일형 데이터(틱)에 적합 |
| Docker 로그 드라이버를 NAS 경로로 직접 | 구성 최소 | NFS `hard` 정지 시 컨테이너 stdout 쓰기가 막혀 **앱이 멈춘다**. 실거래 봇에 치명적 | **기각** |
| Promtail | 라벨링·검색 좋음 | Loki 서버가 추가로 필요. 단일 서버·트러블슈팅 용도에 과함 | 기각 |
| Vector (단일 바이너리/컨테이너) | docker 로그 소스 내장, 디스크 버퍼, 파일 sink, 컨테이너별·날짜별 분리 | 구성요소 1개 추가 | 사이트 로그에 적합 |

### 5.2 추천안: "로컬 먼저, NAS는 검증 후 복제"

**틱 로그 (유실 금지)**
- 수집기는 지금처럼 로컬 `trading-tick-archive/`에 쓴다(`tick_archive.py`가 fsync).
- NAS 복제는 기존 `archive_to_nas.py`를 리눅스로 포팅해 그대로 쓴다: 업로드 → 검증 → day-complete 마커 → (옵션) 로컬 삭제, `deleted.jsonl` 감사 로그.
- 추가: 1시간마다 닫힌 시간대 원본을 `/mnt/nas/Trade/tick-raw/`로 rsync(3장과 같은 큐·재시도·알림 구조). NAS 사본이 일 1회에서 시 1회로 촘촘해진다.
- **로컬 삭제는 컷오버 후 2주간 끈다**(`--no-delete`). 423G 여유에 하루 1~4G라 충분하다. 리눅스 쪽 검증 이력이 쌓인 뒤 켠다.
- 디스크 사용률 80% 알림.

**사이트 로그 (트러블슈팅용)**
- Vector가 api/web/games/n8n/mysql/cloudflared 및 trading 컨테이너 stdout을 읽어 로컬 `~/logs/site/<컨테이너>/<날짜>.log`로 쓴다.
- md-sync·watchdog·백업·동기화 스크립트 로그도 같은 `~/logs/host/`로 모은다.
- 1시간마다 cron rsync → `/mnt/nas/Logs/`. 로컬 30일, NAS 180일 보관(gzip).
- 유실 허용: NAS 장애 시 로컬에 쌓였다가 따라잡는다. 재시도 큐·연속 실패 알림은 틱과 같은 스크립트를 쓰되 알림 임계만 느슨하게(연속 6회).

Vector 도입이 부담되면 대안은 `docker logs --since`를 1시간마다 파일로 떠서 같은 경로에 쌓는 cron이다. 컨테이너 재생성 시 로그가 끊기는 약점이 있다.

---

## 6. 컷오버 절차

### 6.1 Phase 0 — 사전 준비 (서비스 영향 없음, 1~2일)

1. 0장·9장 결정 사항 확정. 사용자가 root 명령 실행(9.2).
2. Mac: `brew install rsync`, F8 에이전트 unload(승인 항목), `sync_to_linux.sh` 설치·cron 등록 → 초기 전송 시작(34G+2.9G. LAN 속도 미측정 — 첫 실행 로그로 실측).
3. 리눅스: `git clone` → `.env`를 scp로 전달, 즉시 `chmod 600` 및 `stat -c %a` 확인, 양쪽 `sha256sum` 대조. `LOCAL_UID/GID=1000` 추가.
4. 리눅스: 세 프로젝트 `docker compose build`(amd64). **`up`은 하지 않는다.** trading compose는 모든 서비스가 profile에 묶여 있어 profile 없이 `up`해도 아무것도 뜨지 않는다 — 리허설 중 봇이 실수로 뜨는 것을 막는 1차 안전장치.
5. 리눅스: external 볼륨 12개를 같은 이름으로 생성, bind 디렉터리 ACL 설정.
6. **리허설(봇 미기동)**: `volsnap`/`dbdump` 스냅샷을 **이름에 `rehearsal_` 접두어를 붙인 임시 볼륨**에 복원 → mysql·api·web만 임시 프로젝트명으로 기동 → 복원 검증·스모크 테스트 → 임시 프로젝트·볼륨 삭제. trading 이미지에서 `pytest` 실행(amd64 동작 확인), uid 100/1000 쓰기 테스트.
7. NAS 테스트 T1~T6, 헬스체크·로그 수집·watchdog·백업 timer 설치(봇 관련 검사는 컨테이너가 없어 "미기동" 상태로 대기).
8. 리눅스 전원 설정: 절전 타깃 mask, docker 패키지 자동 업그레이드 제외(F11).

### 6.2 Go/No-Go (컷오버 당일 T-60분)

전부 충족해야 진행한다.
- 동기화 job 전부 최근 1시간 내 성공, 재시도 큐 0, 닫힌 날짜 체크섬 검증 완료.
- NAS 헬스 정상, 리눅스 디스크 여유 > 100G, 리눅스 시간 동기화 정상.
- 리허설 통과 기록, amd64 이미지 빌드 해시 기록.
- 다음 리밸런스까지 2시간 이상, 직전 리밸런스 후 2시간 이상 경과. momentum 로그에 진행 중인 주문 없음.
- KR 장중(09:00~15:30)과 opening-scan 시간대(09:00~11:00)를 피한 시각. 권장: 평일 16:00~18:00 KST 또는 주말.
- 사용자가 자리에 있고 거래소 앱으로 포지션을 직접 볼 수 있음.

### 6.3 Stage A — 트레이딩 전환 (실거래 봇 공백 목표 10~15분)

> **승인 게이트 ① — 실거래 봇을 Mac에서 정지**. 아래 절차와 직전 점검 결과를 보여주고 승인받은 뒤 진행.

| 단계 | 작업 | 검증 |
|------|------|------|
| A1 | Mac: heartbeat 신선도, `state_seq`, 포지션 수, 상태 파일 sha256 기록. 거래소 포지션 스냅샷(사용자 확인) | 기록 남김 |
| A2 | Mac: `docker compose -f docker-compose.trading.yml stop trading-momentum-rotation` | `State.Running=false`, 종료코드 확인 |
| A3 | Mac: `docker update --restart=no ochestration-trading-trading-momentum-rotation-1` + docker-watchdog에 `PAUSE` 파일 | Docker Desktop이나 Mac이 재시작돼도 봇이 되살아나지 않음 — **이중 가동 차단의 핵심** |
| A4 | Mac: momentum 볼륨·control 볼륨을 `docker run --rm -v VOL:/v:ro alpine tar` 로 추출, 볼륨 내부 `sha256sum` 매니페스트 생성 → scp | tar sha256 양쪽 일치 |
| A5 | 리눅스: 같은 이름 볼륨에 `tar --numeric-owner -xpf` 복원 | 매니페스트(파일별 sha256·파일 수·uid:gid 100:101) 일치, `state_seq`·포지션 수 = A1 |
| A6 | **재확인**: Mac에서 `docker inspect` → Running=false, RestartPolicy=no | 통과해야 A7 |
| A7 | 리눅스: `docker compose -f docker-compose.trading.yml --profile momentum-rotation up -d` | 첫 사이클 로그: 거래소 포지션 16개 인식, 신규 주문 없음, heartbeat 갱신, `state_seq` 이어짐 |
| A8 | 나머지 trading 컨테이너(kr/us-rotation, funding-arb, coin-swing6, tick-stream, kr-opening-scan)와 crypto-tick-stream, shadow-predictor를 같은 방식으로: Mac 정지 → restart=no → 볼륨 tar·bind 최종 rsync(`trading-tick-archive`, `.kis-cache`, `trading-crypto-paper-state`, shadow runtime, sqlite `.backup`) → 3.4의 차이 0 확인 → 리눅스 기동 | 각 상태 파일 sha256 일치, 기동 후 mtime 갱신, 틱 파일이 리눅스에서 자람 |

A7이 실패하면(포지션 불일치·예외·주문 시도 이상) 즉시 리눅스 봇 정지 → 6.6 롤백 A.

틱 공백: A8에서 수집기가 내려가 있는 동안(수 분) 틱이 비는다. 공백을 0으로 만들려면 리눅스 수집기를 임시 경로로 먼저 띄워 겹쳐 수집한 뒤 합치는 방법이 있다(틱 수집기는 주문을 내지 않으므로 겹쳐도 안전. 단 crypto-tick-stream은 페이퍼 전략 상태도 쓰므로 임시 상태 경로 필요). 필요 여부는 Q8.

### 6.4 Stage B — 사이트 전환 (사이트 중단 목표 30~60분)

> **승인 게이트 ③ — Mac 서비스 완전 정지**. (시간순으로는 ②보다 먼저 온다.)

| 단계 | 작업 | 검증 |
|------|------|------|
| B1 | Mac: cloudflared 정지 → 공개 사이트 중단 시작. 이어서 api, n8n, games, db-backup 정지, 전부 `--restart=no` | `https://lab.khsqowp1.my` 가 Cloudflare 오류 페이지, 쓰는 주체 없음 |
| B2 | Mac: 테이블별 행 수와 `CHECKSUM TABLE` 기록 → root로 `mysqldump --single-transaction --routines --triggers --events --all-databases | gzip` (논리 백업) → sha256 | 덤프 끝에 `-- Dump completed` 존재, gzip -t 통과 |
| B3 | Mac: mysql 정지(정상 종료 로그 확인) → `mysql_data`, `n8n_data` 및 나머지 볼륨 tar + 매니페스트 | |
| B4 | bind 최종 rsync(`inbox`, `obsidian`, `backups`) → 3.4 차이 0 | 출력 0줄 |
| B5 | 리눅스: 볼륨 복원 → 매니페스트 일치. 덤프와 tar를 NAS `Trade/mac-final-snapshot/2026-11-XX/`에도 복사(이중 보존) | NAS 사본 sha256 일치 |
| B6 | 리눅스: mysql 기동 → healthy → 행 수·`CHECKSUM TABLE`을 B2 기록과 대조 | 전 테이블 일치. 불일치 시 물리 볼륨을 버리고 논리 덤프로 재적재 후 재대조 |
| B7 | 리눅스: n8n, api, games, web, db-backup 기동(cloudflared 제외) | 컨테이너 healthy/Up |
| B8 | 스모크 테스트(LAN, `http://192.168.0.12:5173`): `/actuator/health` 200, 웹 200, 로그인, 노트 목록·이미지 1건 열람, 파일 업로드 1건, 게임 리더보드 조회, 트레이딩 대시보드 9개 상태 탭 값이 봇 상태와 일치, control 채널 읽기, n8n 로그인·워크플로 4개 active·자격증명 복호화 정상, LinkCollect 프록시(Q2 결정 시) | 전부 통과해야 ②로 |

> **승인 게이트 ② — Cloudflare Tunnel 최종 전환**.

| 단계 | 작업 | 검증 |
|------|------|------|
| B9 | Mac cloudflared가 정지·restart=no 임을 재확인 후 리눅스에서 `docker compose up -d cloudflared` | 로그 `Registered tunnel connection` 4개, `https://lab.khsqowp1.my` 200, 공개 경로로 B8 핵심 항목 재실행 |

### 6.5 Cloudflare Tunnel 전환 방식

- 터널은 토큰 기반 원격 관리형이다(`TUNNEL_TOKEN`, ingress는 Cloudflare 쪽 설정). 로그로 확인한 ingress: rule 0 → `http://web:80`, rule 1 → `http://host.docker.internal:8787`.
- **DNS 변경은 필요 없다.** 호스트명은 터널 ID를 가리키고, 같은 토큰으로 리눅스에서 cloudflared를 띄우면 그쪽으로 연결된다. `web`은 compose 네트워크 이름이라 리눅스에서도 그대로 해석된다.
- 같은 토큰의 cloudflared가 두 곳에서 동시에 돌면 Cloudflare가 요청을 **양쪽에 나눠 보낸다.** 그래서 "Mac 정지 → 리눅스 기동" 순서를 지키고 겹치지 않게 한다.
- 되돌리기: 리눅스 cloudflared 정지 → Mac cloudflared 기동. 수십 초.
- rule 1(8787)은 무엇인지 확인하지 못했다(Q6). 현재도 Mac에서 응답하지 않는 상태다.

### 6.6 롤백

| 시점 | 절차 | 데이터 |
|------|------|--------|
| **A: Stage A 중/직후** | 리눅스 봇 정지 → 리눅스 볼륨에서 상태가 바뀌었으면(`state_seq` 증가) tar로 Mac 볼륨에 역복원 → Mac `docker update --restart=unless-stopped` → Mac 기동 | "마지막으로 돈 쪽의 상태가 정본" 규칙. 포지션의 최종 정본은 거래소 |
| **B: Stage B, 게이트 ② 이전** | 리눅스 컨테이너 정지 → Mac 컨테이너 restart 정책 복구 후 기동 | Mac 볼륨은 읽기만 했으므로 정지 시점 그대로. 손실 없음 |
| **C: 게이트 ② 이후 24시간 이내** | 리눅스 사이트 정지 → 리눅스에서 mysqldump·볼륨 tar → Mac에 역복원 → Mac 기동 → 터널 되돌리기 | 역방향 마이그레이션. 절차는 정방향과 대칭 |
| **D: 24시간 이후** | 롤백이 아니라 리눅스에서 수정. Mac은 정지 시점 스냅샷으로만 가치가 있다 | |

Mac 보존 상태: 컨테이너는 stopped + restart=no, 볼륨·bind 데이터·이미지 전부 유지, LaunchAgent는 unload만 하고 plist 유지, `PAUSE` 파일 유지. 삭제·초기화는 하지 않는다.

### 6.7 "이전 완료" 기준

- 볼륨 12개 매니페스트 일치, bind 차이 0, MySQL 행 수·체크섬 일치, 논리 덤프가 로컬·리눅스·NAS 3곳에 존재.
- 컨테이너 전부 Up/healthy, 스모크 테스트 통과(LAN + 공개).
- momentum 봇: 포지션 16개 일치, heartbeat 정상, 컷오버 후 첫 리밸런스를 리눅스에서 정상 수행.
- 리눅스 03:00 NAS 백업 1회 성공, 틱 시간별 복제 정상, NAS 헬스·watchdog 알림 테스트 1회씩 수신.
- Mac에 실행 중인 Ochestration/trading 컨테이너 0개.

---

## 7. Mac 전용 요소의 리눅스 대체 (구현 범위)

승인 후 작성할 파일. 메모리의 작업 방식대로 구현은 Codex에 위임하고 검증은 이쪽에서 한다.

| 파일 | 내용 |
|------|------|
| `scripts/migrate/sync_to_linux.sh` | 3장 |
| `scripts/migrate/volume_snapshot.sh`, `volume_restore.sh`, `verify_manifest.sh` | 볼륨 tar·복원·매니페스트 대조 |
| `scripts/linux/nas_health.sh` + systemd unit/timer | 4.3 |
| `scripts/linux/docker_watchdog.sh` + unit/timer | heartbeat·RestartCount·OOM 검사 유지, Docker Desktop 재시작 제거, Slack 알림 |
| `scripts/linux/daily_nas_backup.sh` + unit/timer | `/mnt/nas` 사용, GNU `stat`/`timeout`, 센티널 검사 |
| `trading/scripts/archive_to_nas.py` | 수정 최소화: `--no-auto-mount --mount /mnt/nas` 경로가 리눅스에서 동작하는지 검증, 마운트 identity 검사를 NFS에 맞춤 |
| `docker-compose.linux.yml` | shadow-archive bind 경로 |
| `ops/vector/vector.toml` | 5.2 |
| `scripts/linux/notify.sh` | Slack 알림 공통 함수(Q4) |

---

## 8. 예상 소요 시간과 위험 구간

| 구간 | 예상 | 서비스 영향 | 위험 |
|------|------|-------------|------|
| Phase 0 준비·리허설·NAS 테스트 | 1~2일 (초기 37G 전송은 LAN 실측 후 확정) | 없음 | 낮음 |
| Go/No-Go | 30분 | 없음 | — |
| **Stage A1~A7 실거래 봇** | **10~15분** | 포지션 16개 무관리 | **최고** — 급변 시 대응 불가, 기동 시 포지션 불일치 |
| Stage A8 나머지 봇·수집기 | 20~30분 (틱 최종 체크섬 포함) | 틱 수집 공백 수 분, 페이퍼 봇 정지 | 중 |
| **Stage B1~B8 사이트** | **30~60분** | 공개 사이트 중단 | 중 — MySQL 복원 불일치 시 논리 덤프 재적재로 +15분 |
| B9 터널 | 2분 | 복구 | 낮음 |
| 사후 관찰 | 72시간 (첫 리밸런스 11-11 18:44 KST 전후 포함 여부는 컷오버 시각에 따라) | — | 첫 리밸런스·첫 03:00 백업이 관문 |

위험 요약
1. 이중 가동 — A3/A6의 restart=no + 재확인, 리눅스 trading compose의 profile 구조로 차단.
2. UID 불일치로 리눅스에서 쓰기 실패 — 리허설 쓰기 테스트로 사전 검출.
3. NFS 정지가 호스트 작업을 멈춤 — 컨테이너는 NAS 미사용, 호스트 작업은 timeout.
4. 리눅스 자동 절전·자동 업그레이드 — Phase 0에서 차단.
5. amd64에서 numba/torch 동작 차이 — 리허설 pytest와 shadow-predictor 단독 기동으로 확인.
6. 현재 momentum 로그에 `NetworkError`/`RequestTimeout` 읽기 재시도가 반복되고 있다. 컷오버와 무관한 기존 현상이지만 A7 판정 때 같은 메시지가 보여도 실패로 오인하지 않도록 기록해 둔다.

---

## 9. 승인 요청 항목

### 9.1 결정이 필요한 질문

| # | 질문 | 제안 |
|---|------|------|
| Q0 | Mac NAS 백업이 깨져 있다(F1). 지금 고칠까, 마이그레이션에 맡길까? | 스크립트 수정 없이, 3장 `volsnap`/`dbdump` job의 리눅스 사본을 임시 백업으로 삼고 리눅스에서 NAS로 복제. Mac 백업 에이전트는 unload |
| Q1 | ScopeSentry·ARTEX·dolphin·88motorcycle·supply-chain-lab은 이번 범위 밖이 맞는가? | 범위 밖. Mac에 그대로 |
| Q2 | LinkCollect 터널용 Oracle SSH 키를 리눅스 서버에 복사해도 되는가? (Oracle 서버 자체는 변경 없음, SSH 클라이언트가 하나 느는 것) | 허용 시 systemd autossh. 불허 시 LinkCollect 프록시 기능만 비활성 |
| Q3 | md-sync의 iCloud Obsidian 동기화는 어떻게? 리눅스에는 iCloud가 없다 | Mac에 LaunchAgent를 남기되 소스를 "리눅스에서 rsync로 당겨온 사본"으로 변경 |
| Q4 | 호스트 스크립트 알림 채널. 현재 Slack은 n8n 워크플로 경유뿐이고 watchdog은 macOS 알림이다. n8n이 죽으면 알림도 죽는다 | Slack Incoming Webhook URL을 `/home/noroot/.config/ochestration/alert.env`(600)에 직접 두고 호스트 스크립트가 직접 호출 |
| Q5 | trx-swing이 미기동인 것이 의도인가(F4)? | 의도라면 볼륨만 이전 |
| Q6 | 터널 ingress rule 1(`host.docker.internal:8787`)은 무엇이고 옮겨야 하는가? | Cloudflare 대시보드에서 호스트명 확인 필요 |
| Q7 | 컷오버 일시 | 11-11 18:44 KST 리밸런스를 Mac에서 치른 뒤, 11-12(목) 이후 평일 16~18시 또는 11-14~15 주말 |
| Q8 | 틱 공백 수 분을 허용하는가, 겹침 수집으로 0을 만들 것인가? | 허용(단순). 0이 필요하면 겹침 수집 추가 |
| Q9 | 로그 수집에 Vector 도입 | 도입 |

### 9.2 사용자가 직접 실행할 root 명령 (리눅스, F9)

```
sudo apt install -y autossh acl          # autossh는 Q2 허용 시
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
# /etc/fstab 의 /mnt/nas 줄을 4.3-1 옵션으로 교체 후:
sudo systemctl daemon-reload && sudo systemctl restart mnt-nas.automount
# docker 패키지 자동 업그레이드 제외: /etc/apt/apt.conf.d/50unattended-upgrades 의 Package-Blacklist 에 "docker-ce", "docker-ce-cli", "containerd.io"
# systemd unit/timer 설치(파일은 승인 후 제공): nas-health, ochestration-watchdog, daily-nas-backup, tick-raw-sync, logs-sync
# NAS 테스트 T1~T5 의 reboot / iptables / umount
```

### 9.3 승인 게이트 요약 (실행 중 다시 묻는다)

1. Phase 0 착수(Mac `brew install rsync`, 백업 에이전트 unload, cron 등록, 리눅스 clone·build·`.env` 전달).
2. 게이트 ① 실거래 봇 Mac 정지 (Stage A).
3. 게이트 ③ Mac 서비스 완전 정지 (Stage B1).
4. 게이트 ② Cloudflare Tunnel 리눅스 전환 (Stage B9).

승인 전에는 아무것도 실행하지 않는다.

---

## 10. 사용자 결정 (2026-11-10 저녁) — 위 내용과 다르면 이 장이 우선

| 항목 | 결정 |
|------|------|
| Mac→NAS 백업 (F1, Q0) | 고치지 않는다. 리눅스로 넘어가므로 불필요. Mac의 `com.ochestration.daily-nas-backup`은 unload하고 plist를 `.disabled`로 변경함(완료) |
| 범위 (Q1) | ARTEX·ScopeSentry·dolphin 이전 안 함 |
| Oracle SSH 키 (Q2) | 리눅스에 복사해 사용(완료, 600). 이후 리눅스↔Oracle 서비스 추가 예정 |
| iCloud Obsidian (Q3) | iCloud vault 파일을 리눅스로 옮긴다(`~/obsidian-vault/Ochestration`). 리눅스 md 동기화는 그 경로로 |
| 알림 (Q4) | Slack webhook을 리눅스 호스트 스크립트(또는 사이트)에서 직접 호출 |
| trx-swing (Q5) | 미기동. 볼륨만 이전 |
| 터널 ingress :8787 (Q6) | ARTEX 잔재. 무시 |
| 컷오버 일시 (Q7) | 11-11 18:44 KST 리밸런스를 Mac에서 치른 뒤, 11-12 이후 평일 16~18시 또는 주말 |
| 틱 공백 (Q8) | 수 분 허용. 겹침 수집 안 함 |
| 로그 (Q9) | Vector 도입. NAS 이동은 리눅스 로컬에 쌓은 뒤 일 단위로(03:00 백업에 포함). 5.2의 "1시간마다 tick-raw 복제"는 하지 않는다 |
| root 명령 | 필요 시 멈추고 코드블록으로 제시, 사용자가 실행 |
| 마이그레이션 종료 후 | Mac에 이 사이트용으로 설정한 항목(LaunchAgent, cron, 동기화 상태 디렉터리 등)을 제거. 못 하는 것은 마지막에 명령으로 일괄 제시 |

3장의 cron 동기화는 **이전 기간에만** 쓰는 Mac→리눅스 전송 수단이다. 컷오버가 끝나면 cron 항목을 지운다.

---

## 11. Phase 0 진행 기록 (2026-11-11 06시 기준)

완료
- Mac: 삭제형 NAS 백업 에이전트 unload(plist는 `.disabled`), rsync 3.5.2 설치, 임시 cron 2줄 등록(`sync_to_linux.sh`).
- 리눅스: repo clone, `.env` 전달(sha256 일치·600), amd64 이미지 전체 빌드, trading external 볼륨 10개 생성, Oracle 키·Slack 설정 파일(600), Vector 로그 수집기 기동.
- 초기 전송 40.1G 완료(52분, 실패 0). 이후 15분 주기 증분 정상.
- sudo 1차: autossh, 절전 mask, docker 패키지 hold, fstab 옵션 교체, UFW 18787.

리허설에서 확인한 것
- 볼륨 스냅샷→복원→매니페스트 대조 통과(소유권 100:101 유지). 비어 있지 않은 볼륨에는 복원을 거부함.
- **실행 중에 뜬 arm64 MySQL 볼륨 tar가 amd64에서 crash recovery 후 정상 기동**, 테이블 45개, 앱 계정 접속 정상. 리허설 볼륨·컨테이너는 삭제함.
- trading 이미지 amd64에서 봇 모듈 전부 import 정상. 이미지에 pytest가 없어 테스트 스위트는 돌리지 못함.

계획 수정
- **MySQL root 비밀번호가 `.env`의 `MYSQL_ROOT_PASSWORD`와 다르다**(Mac 현행 DB에서 Access denied). 헬스체크의 `mysqladmin ping`은 인증 실패에도 성공으로 끝나 드러나지 않았다. 따라서 논리 백업은 `--all-databases`(root) 대신 기존 db-backup과 같은 **앱 계정으로 `orchestration` DB 덤프**를 쓴다. 사용자·권한 테이블은 물리 볼륨 복사로 넘어간다. 6.4 B2도 이 방식으로 한다.
- **rsync가 대상 디렉터리 권한을 다시 써서 ACL mask가 `r-x`로 돌아간다.** 컷오버의 최종 rsync 직후, 컨테이너 기동 전에 아래를 반드시 실행한다(리허설에서 uid 100·1000 쓰기 확인):
  `for d in .kis-cache trading-tick-archive inbox/archive_ochestration inbox/notebook-images obsidian; do setfacl -R -m u:100:rwX,u:1000:rwX,m::rwX "$d"; find "$d" -type d -exec setfacl -m d:u:100:rwX,d:u:1000:rwX,d:m::rwX {} +; done`
- `docker_watchdog.sh` cron과 `nas_backup.sh` cron은 컷오버 후에 등록한다(지금은 대상 컨테이너가 없어 오탐 알림이 난다).

---

## 12. 컷오버 결과 (2026-11-11 저녁)

| 구간 | 시각 (KST) | 결과 |
|------|-----------|------|
| 실거래 봇 Mac 정지 → 리눅스 기동 | 20:05:59 → 20:06:22 | 공백 23초. 상태 sha256·매니페스트 일치, 포지션 16개 동일, 기동 후 신규 주문 없음 |
| 나머지 봇·수집기 | 20:09:41 → 20:13:12 | 볼륨 8개 일치, 틱 37G·kis-cache·페이퍼 상태 체크섬 차이 0, 틱 공백 약 3.5분 |
| 사이트 중단 | 20:15:42 → 20:26:20 | 약 10.5분. MySQL 45개 테이블 행 수·CHECKSUM 일치, inbox/obsidian/backups 차이 0(알려진 NFC 파일명 1건 제외) |
| Cloudflare Tunnel | 20:26:20 | 리눅스 연결 4개, 공개 URL 200 |

- 최종 스냅샷(볼륨 tar 12개 + DB 덤프): 리눅스 `~/migrate-staging/final`, NAS `Trade/mac-final-snapshot/2026-11-11/`.
- Mac: 대상 컨테이너 전부 stopped + restart=no, LaunchAgent 4개 unload(plist는 `.disabled`), 임시 cron 제거. 볼륨·데이터·이미지는 롤백 사본으로 보존.
- 리눅스 cron: watchdog(2분), NAS 백업(03:00), md 동기화(5분). systemd: nas-health.timer, linkcollect-tunnel.
- 재부팅 사고: 11-11 12:15 `sudo reboot` 후 서버가 7시간 복귀하지 않았다(종료 로그는 정상, 이후 단계에서 멈춤). 같은 날 깨끗한 상태에서 2회 재부팅은 각 22초에 복귀. NAS 테스트의 지연 언마운트(`umount -l`) 잔여물이 유력하나 확정하지 못했다. 헬스체크의 강제 재마운트는 기본 꺼짐으로 변경.
- 미결: 서버 자체가 죽었을 때 알리는 외부 감시 없음. MySQL root 비밀번호가 `.env`와 다름. Mac 봇·MySQL이 정지 시 SIGKILL(exit 137)로 끝남(데이터는 검증으로 온전함 확인).

## 13. 자동 배포 (2026-11-11 추가)

- 방식: 서버가 당겨오는 pull 방식. linuxserver cron이 5분마다 `scripts/linux/auto_deploy.sh` 실행.
- self-hosted GitHub Actions runner는 쓰지 않는다. 저장소가 공개라 fork PR이 운영 호스트에서 코드를 실행할 수 있기 때문.
- 배포 대상: `docker-compose.yml` + `docker-compose.crypto-data.yml`. `docker-compose.trading.yml`(실거래 봇 포함)은 영구 수동 배포.
- `trading/**`, `docker-compose.trading.yml`만 바뀐 커밋은 소스만 받고 배포하지 않는다.
- 일시정지: `~/.local/state/ochestration/deploy/PAUSE`. 로그: `~/logs/host/auto-deploy.log`.
