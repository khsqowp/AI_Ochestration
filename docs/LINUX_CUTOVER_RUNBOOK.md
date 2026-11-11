# 컷오버 런북 (Mac → linuxserver)

계획: `docs/LINUX_MIGRATION_PLAN_2026-11-10.md`. 이 문서는 컷오버 당일 그대로 실행할 명령 순서다.
표기: `[M]` = Mac에서, `[L]` = 리눅스에서(`ssh linuxserver`). 경로는 양쪽 모두 repo 루트(`~/CODE/Ochestration`) 기준.
**게이트 ①③②는 실행 직전에 사용자 승인을 받는다.** 각 단계는 "검증" 줄이 통과해야 다음으로 간다.

사전 준비 상태(2026-11-11): 리눅스에 이미지 빌드·볼륨 12개(빈 상태)·`.env`·터널·NAS 헬스·Vector 준비됨. 컨테이너는 Vector뿐.

```
SNAP_M="$HOME/Library/Application Support/ochestration-migrate/final"     # [M] 최종 스냅샷
SNAP_L=/home/noroot/migrate-staging/final                                  # [L]
TR="docker compose -f docker-compose.trading.yml"
MAIN="docker compose -f docker-compose.yml -f docker-compose.crypto-data.yml"
SHADOW="docker compose -f trading/shadow_predictor/docker-compose.shadow.yml"
MOM=ochestration-trading-trading-momentum-rotation-1
```

## 0. Go/No-Go (T-60분)

```
[M] for j in tick inbox small volsnap dbdump; do cat "$HOME/Library/Application Support/ochestration-migrate/jobs/$j/state.json"; done
      # 전부 consecutive_failures=0, queued=0, last_ok 최근
[M] docker exec $MOM python -c 'import json,time;s=json.load(open("/app/data/momentum_rotation_state.json"));h=json.load(open("/app/data/heartbeat.json"));print("next",s["next_rebalance_ts"],"last",s["last_rebalance_ts"],"seq",s["state_seq"],"pos",len(s["positions"]),"halted",s["halted"],"hb_age",int(time.time()-h["epoch"]))'
      # 다음 리밸런스까지 2시간 이상, 직전 리밸런스 후 2시간 이상, hb_age < 60
[M] docker logs --since 10m $MOM 2>&1 | tail -20          # 주문 진행 중 아님
[L] tail -2 ~/logs/host/nas-health.log; df -h / | tail -1; timedatectl | grep synchronized; docker ps -a
      # NAS OK, 여유 100G 이상, 시간 동기화 yes, 컨테이너는 vector뿐
[M] crontab -l | grep -v ochestration-migrate | grep -v sync_to_linux | crontab -      # 임시 cron 제거(이후 수동 실행)
[M] ls "$HOME/Library/Application Support/ochestration-migrate/lock" 2>/dev/null      # 없어야 함(도는 중이면 끝날 때까지 대기)
```
KR 장중(09:00~15:30)·opening-scan(09:00~11:00) 밖이어야 하고, 사용자가 거래소 앱으로 포지션을 볼 수 있어야 한다.

## Stage A — 트레이딩 (게이트 ① 실거래 봇 정지)

### A1~A7 실거래 봇 (공백 목표 10~15분)

```
[M] docker exec $MOM sha256sum /app/data/momentum_rotation_state.json          # 기록
    사용자: 거래소 앱에서 포지션 16개 스냅샷
── 게이트 ① 승인 ──
[M] $TR stop trading-momentum-rotation
[M] docker update --restart=no $MOM
[M] touch "$HOME/Library/Application Support/ochestration-watchdog/PAUSE"
[M] docker inspect $MOM --format '{{.State.Running}} {{.HostConfig.RestartPolicy.Name}} exit={{.State.ExitCode}}'      # false no
[M] mkdir -p "$SNAP_M" && bash scripts/migrate/volume_snapshot.sh "$SNAP_M" ochestration_trading_momentum_rotation_state
[M] bash scripts/migrate/volume_snapshot.sh --allow-running "$SNAP_M" ochestration_trading_control
      # control은 api·다른 로테이션 봇이 물고 있어 --allow-running. 쓰는 주체는 api의 수동 명령뿐이므로 이 구간에 대시보드에서 명령을 넣지 않는다
[M] /opt/homebrew/bin/rsync -a "$SNAP_M/" linuxserver:migrate-staging/final/
[L] bash scripts/migrate/volume_restore.sh $SNAP_L ochestration_trading_momentum_rotation_state ochestration_trading_control      # 매니페스트 diff 없음
[L] docker run --rm -v ochestration_trading_momentum_rotation_state:/v alpine sha256sum /v/momentum_rotation_state.json           # A1 기록과 일치
[M] docker inspect $MOM --format '{{.State.Running}} {{.HostConfig.RestartPolicy.Name}}'      # 재확인: false no
[L] $TR --profile momentum-rotation up -d trading-momentum-rotation
[L] sleep 45; docker logs $MOM 2>&1 | tail -30; docker exec $MOM cat /app/data/heartbeat.json
```
검증(A7): 포지션 16개 인식, 신규 주문 없음, heartbeat 갱신, `state_seq`가 A1 값에서 이어짐, 사용자가 거래소 앱에서 포지션 불변 확인.
`읽기 재시도 (NetworkError/RequestTimeout)` 메시지는 Mac에서도 평소 나오던 것이라 그것만으로 실패가 아니다.
실패 시 → 롤백 A.

### A8 나머지 봇·수집기

```
[M] $TR --profile "*" stop                           # profile 서비스는 --profile 없이는 선택되지 않는다. kr/us-rotation, paper-funding-arb, coin-swing6, tick-stream, kr-opening-scan
[M] $MAIN stop crypto-tick-stream
[M] $SHADOW stop
[M] launchctl bootout gui/$(id -u)/com.cointrade.shadow-archive
[M] docker ps -a --format '{{.Names}}' | grep -E 'ochestration-trading|cointrade' | xargs docker update --restart=no
[M] docker ps --format '{{.Names}}' | grep -E 'ochestration-trading|cointrade'      # 출력 없음
[M] bash scripts/migrate/volume_snapshot.sh --allow-running "$SNAP_M" \
      ochestration_trading_kr_rotation_state ochestration_trading_us_rotation_state ochestration_trading_paper_state \
      ochestration-trading_trading_coin_swing6_state ochestration_trading_tick_state ochestration_trading_kr_swing_state \
      ochestration_trading_us_swing_state ochestration_trading_trx_swing_state
      # 봇은 전부 정지 상태. api가 :ro로 물고 있어 --allow-running 이 필요할 뿐이다
[M] bash scripts/migrate/sync_to_linux.sh tick small
[M] /opt/homebrew/bin/rsync -a trading-crypto-paper-state/ linuxserver:CODE/Ochestration/trading-crypto-paper-state/
[M] /opt/homebrew/bin/rsync -a --exclude='*.log*' trading/shadow_predictor/runtime/ linuxserver:CODE/Ochestration/trading/shadow_predictor/runtime/
[M] A="$HOME/Library/Application Support/CoinTradeShadowArchive"; sqlite3 "$A/shadow_archive.sqlite3" ".backup '$A/shadow_archive.final.sqlite3'" && sqlite3 "$A/shadow_archive.final.sqlite3" 'pragma integrity_check'
[M] /opt/homebrew/bin/rsync -s "$A/shadow_archive.final.sqlite3" "linuxserver:Library/Application Support/CoinTradeShadowArchive/shadow_archive.sqlite3"
[M] /opt/homebrew/bin/rsync -a "$HOME/Library/Application Support/ochestration-archive/" linuxserver:.local/state/ochestration/nas-backup/      # day-complete 마커 승계
[M] /opt/homebrew/bin/rsync -a "$SNAP_M/" linuxserver:migrate-staging/final/
[M] for d in trading-tick-archive .kis-cache trading-crypto-paper-state; do bash scripts/migrate/verify_tree.sh "$d" "linuxserver:CODE/Ochestration/$d/" && echo "$d DIFF0"; done
[L] bash scripts/migrate/volume_restore.sh $SNAP_L ochestration_trading_kr_rotation_state ochestration_trading_us_rotation_state \
      ochestration_trading_paper_state ochestration-trading_trading_coin_swing6_state ochestration_trading_tick_state \
      ochestration_trading_kr_swing_state ochestration_trading_us_swing_state ochestration_trading_trx_swing_state
[L] for d in .kis-cache trading-tick-archive; do setfacl -R -m u:100:rwX,u:1000:rwX,m::rwX "$d"; find "$d" -type d -exec setfacl -m d:u:100:rwX,d:u:1000:rwX,d:m::rwX {} +; done
[L] $TR --profile kr-rotation --profile us-rotation --profile paper-trading --profile coin-swing6 --profile tick-stream --profile kr-opening-scan up -d
[L] $MAIN up -d --no-deps crypto-tick-stream
[L] $SHADOW up -d
[L] docker ps --format '{{.Names}} {{.Status}}'; sleep 60; find trading-tick-archive -mmin -2 -type f | head
```
검증: 세 트리 `DIFF0`, 볼륨 8개 매니페스트 일치, 컨테이너 전부 Up, 틱 파일이 리눅스에서 갱신됨. trx-swing은 기동하지 않는다.

## Stage B — 사이트 (게이트 ③ Mac 서비스 완전 정지)

```
── 게이트 ③ 승인 ──
[M] docker compose stop cloudflared                     # 공개 사이트 중단 시작
[M] docker compose stop api n8n games web db-backup
[M] docker exec ochestration-mysql-1 sh -c 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" -N -e "select table_name from information_schema.tables where table_schema=database() order by 1" "$MYSQL_DATABASE" 2>/dev/null' > "$SNAP_M/tables.txt"
[M] while read t; do docker exec ochestration-mysql-1 sh -c "mysql -u\"\$MYSQL_USER\" -p\"\$MYSQL_PASSWORD\" -N -e 'select \"$t\", count(*) from \`$t\`; checksum table \`$t\`' \"\$MYSQL_DATABASE\" 2>/dev/null"; done < "$SNAP_M/tables.txt" > "$SNAP_M/mysql-verify.mac.txt"
[M] bash scripts/migrate/sync_to_linux.sh dbdump          # 앱 계정 논리 덤프(Dump completed 검증 포함) → 리눅스 migrate-staging/db/
[M] docker compose stop mysql && docker logs --tail 5 ochestration-mysql-1 2>&1 | grep -i 'shutdown complete'
[M] docker ps -a --format '{{.Names}}' | grep -E '^ochestration-(api|web|games|n8n|mysql|db-backup|cloudflared)-1$' | xargs docker update --restart=no
[M] bash scripts/migrate/volume_snapshot.sh "$SNAP_M" ochestration_mysql_data ochestration_n8n_data
[M] bash scripts/migrate/sync_to_linux.sh inbox small
[M] for d in inbox obsidian backups; do bash scripts/migrate/verify_tree.sh "$d" "linuxserver:CODE/Ochestration/$d/" && echo "$d DIFF0"; done
[M] /opt/homebrew/bin/rsync -a "$SNAP_M/" linuxserver:migrate-staging/final/
[L] bash scripts/migrate/volume_restore.sh $SNAP_L ochestration_mysql_data ochestration_n8n_data
[L] D=/mnt/nas/Trade/mac-final-snapshot/$(date +%F); mkdir -p $D && rsync -rlt $SNAP_L/ ~/migrate-staging/db/ $D/ && (cd $SNAP_L && sha256sum *.tar | sort) | diff - <(cd $D && sha256sum *.tar | sort) && echo NAS_COPY_OK
[L] for d in inbox/archive_ochestration inbox/notebook-images obsidian; do setfacl -R -m u:100:rwX,u:1000:rwX,m::rwX "$d"; find "$d" -type d -exec setfacl -m d:u:100:rwX,d:u:1000:rwX,d:m::rwX {} +; done
[L] docker compose up -d mysql; until [ "$(docker inspect ochestration-mysql-1 --format '{{.State.Health.Status}}')" = healthy ]; do sleep 3; done
[L] (Mac과 같은 while 루프로) > ~/migrate-staging/final/mysql-verify.linux.txt; diff ~/migrate-staging/final/mysql-verify.mac.txt ~/migrate-staging/final/mysql-verify.linux.txt && echo DB_MATCH
[L] docker compose up -d n8n api games web db-backup       # cloudflared 제외
```
`verify_tree` 알려진 예외: `inbox/notebook-images/00e9d9f9-…_스크린샷_2025-11-08_23.07.02.png` 는 Mac에서는 파일명이 NFD, git에는 NFC로 들어 있어 리눅스에 두 이름이 다 있다(내용 sha256 동일). 이 한 줄(`*deleting` NFC 이름)과 clone에서 온 `.gitkeep`만 차이로 나오면 통과로 본다.
`DB_MATCH`가 안 나오면: mysql 정지 → 볼륨 비우고 빈 DB로 초기화 → `migrate-staging/db/` 최신 덤프 적재 → 다시 대조.

스모크 테스트(LAN, `http://192.168.0.12:5173`):
```
[L] curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/actuator/health      # 200
[L] curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5173/                     # 200
[L] docker ps --format '{{.Names}} {{.Status}}'; docker logs --tail 30 ochestration-api-1 2>&1 | grep -i -E 'error|exception' | head
```
브라우저(사용자): 로그인, 노트 목록·이미지 1건, 파일 업로드 1건, 게임 리더보드, 트레이딩 대시보드 각 탭, n8n(`ssh -L 5678:127.0.0.1:5678 linuxserver`) 로그인·워크플로 active, LinkCollect 아카이브 화면.

### 게이트 ② Cloudflare Tunnel

```
[M] docker inspect ochestration-cloudflared-1 --format '{{.State.Running}} {{.HostConfig.RestartPolicy.Name}}'      # false no
── 게이트 ② 승인 ──
[L] docker compose up -d cloudflared; sleep 10; docker logs ochestration-cloudflared-1 2>&1 | grep -c 'Registered tunnel connection'      # 4
[M] curl -s -o /dev/null -w '%{http_code}\n' https://lab.khsqowp1.my/      # 200
```

## 마무리

```
[L] crontab ops/linux/crontab.noroot && crontab -l
[L] bash scripts/linux/docker_watchdog.sh; tail -1 ~/logs/host/docker-watchdog.log
[L] bash scripts/linux/nas_backup.sh; tail -15 ~/logs/host/nas-backup.log          # 첫 NAS 백업 수동 1회
[M] launchctl bootout gui/$(id -u)/com.orchestration.md-sync; launchctl bootout gui/$(id -u)/com.ochestration.docker-watchdog; launchctl bootout gui/$(id -u)/com.ochestration.linkcollect-tunnel
[M] docker ps --format '{{.Names}}' | grep -E 'ochestration|cointrade'            # 출력 없음
```
Mac의 plist 파일·볼륨·데이터·이미지는 지우지 않는다(롤백 사본). 정리는 사용자가 지시할 때.

## 롤백

**A (Stage A 중/직후)**
```
[L] $TR stop trading-momentum-rotation
[L] docker run --rm -v ochestration_trading_momentum_rotation_state:/v alpine sha256sum /v/momentum_rotation_state.json
      # A1 기록과 다르면(리눅스에서 상태가 진행됨) 리눅스 볼륨을 volume_snapshot.sh 로 떠서 Mac 볼륨에 volume_restore.sh --force-nonempty 로 되돌린 뒤 진행
[M] docker update --restart=unless-stopped $MOM && $TR --profile momentum-rotation start trading-momentum-rotation
[M] rm "$HOME/Library/Application Support/ochestration-watchdog/PAUSE"
```
**B (게이트 ② 이전)**: `[L] docker compose stop` → `[M]` 해당 컨테이너 `docker update --restart=unless-stopped` 후 `docker compose start`. Mac 볼륨은 읽기만 했으므로 그대로다.
**C (게이트 ② 이후 24시간 이내)**: `[L] docker compose stop cloudflared` → 리눅스에서 덤프·볼륨 스냅샷 → Mac에 역복원 → Mac 기동 → Mac cloudflared 기동.
어느 경우든 **두 호스트에서 같은 봇이 동시에 Running이면 안 된다.** 기동 전에 반대편 `docker inspect … Running=false`를 먼저 확인한다.
