#!/bin/bash
# 틱 아카이브 + DB 백업(./backups) + 트레이딩 봇 상태(JSON, trade_log/entry_log 포함)를
# NAS(SMB)로 같은 실행 안에서 같이 백업한다 — 단, NAS 위 저장 위치는 tick-archive / db-backups /
# trading-state 세 폴더로 분리해서 섞이지 않게 한다.
# NAS 볼륨이 안 마운트돼있으면 로컬 /Volumes/HDD2TB/Trade 밑에 그냥 새 폴더가 생겨버리는
# macOS의 흔한 함정을 피하려고, 마운트 여부를 먼저 검사하고 아니면 즉시 실패시킨다.
set -euo pipefail

# launchd 가 이 스크립트를 실행할 땐 PATH 가 /usr/bin:/bin:/usr/sbin:/sbin 뿐이라 Homebrew로
# 설치한 docker CLI 를 못 찾는다 — 실측 확인: "docker: command not found" 가 매 스케줄마다
# 조용히 나서 trading-state 백업(entry_log 포함)만 몇 주째 하나도 NAS에 안 올라가고 있었음.
# ensure_mounted 실패와 달리 이건 exit 1 로 안 죽고(if 안이라 set -e 도 안 걸림) "컨테이너 안
# 떠있음"으로 오해하기 쉬운 로그만 남기고 조용히 넘어가서 한동안 못 알아챘다.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

SMB_SERVER="${SMB_SERVER:-noroot}"
SMB_SHARE="${SMB_SHARE:-HDD2TB}"
SMB_USER="${SMB_USER:-guest}"
MOUNT_POINT="/Volumes/${SMB_SHARE}"
DEST_ROOT="${MOUNT_POINT}/Trade"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_TICK_DIR="$PROJECT_ROOT/trading-tick-archive"
SRC_DB_DIR="$PROJECT_ROOT/backups"
LOG_FILE="${BACKUP_LOG_FILE:-$HOME/Library/Logs/tick-archive-backup.log}"
RETENTION_DAYS="${TICK_ARCHIVE_RETENTION_DAYS:-7}"
# 컨테이너:NAS폴더명 — 로테이션 봇 3개의 상태(JSON, trade_log/entry_log 포함)를 백업한다.
# docker volume 자체는 Docker Desktop VM 안이라 macOS에서 경로로 못 읽어서 docker cp 로 꺼낸다.
ROTATION_CONTAINERS=(
  "ochestration-trading-trading-momentum-rotation-1:momentum-rotation"
  "ochestration-trading-trading-kr-rotation-1:kr-rotation"
  "ochestration-trading-trading-us-rotation-1:us-rotation"
)

log() {
  echo "[$(date -Iseconds)] $*" | tee -a "$LOG_FILE"
}

ensure_mounted() {
  if mount | grep -q " on ${MOUNT_POINT} "; then
    return 0
  fi
  log "NAS 마운트 안 됨 — 연결 시도: smb://${SMB_USER}@${SMB_SERVER}/${SMB_SHARE}"
  mkdir -p "$MOUNT_POINT"
  if ! mount_smbfs "//${SMB_USER}@${SMB_SERVER}/${SMB_SHARE}" "$MOUNT_POINT" 2>>"$LOG_FILE"; then
    log "NAS 마운트 실패 — 백업 건너뜀(로컬에 잘못 쓰는 사고 방지)"
    return 1
  fi
  log "NAS 마운트 성공"
}

backup_tick_archive() {
  local dest="$DEST_ROOT/tick-archive"
  if [ ! -d "$SRC_TICK_DIR" ]; then
    log "[tick] 원본 디렉토리 없음: $SRC_TICK_DIR — 건너뜀"
    return 0
  fi
  mkdir -p "$dest"
  log "[tick] 백업 시작: $SRC_TICK_DIR -> $dest"
  if ! rsync -a --stats "$SRC_TICK_DIR"/ "$dest"/ >>"$LOG_FILE" 2>&1; then
    log "[tick] 백업 실패(rsync 오류) — 로컬 정리는 건너뜀"
    return 1
  fi
  log "[tick] 백업 완료"
  # 백업이 이번 사이클에 실제로 성공했을 때만 정리한다 — NAS 마운트가 며칠 끊겨있었다면
  # 그동안 밀린 데이터는 다음 성공한 백업이 rsync로 전부 따라잡을때까지 로컬에 계속 남는다
  # (retention 지나도 백업 미확인 상태면 안 지운다).
  #
  # find -mtime 는 "파일의 마지막 쓰기 시각" 기준인데, 하루치 파일은 자정(UTC) 근처까지 계속
  # append되다가 마지막 쓰기가 다음날(KST 09:00 무렵)에 찍힌다 — 그래서 "7일 지난 파일"이 실제
  # 달력 기준 7일보다 하루 가까이 늦게 지워지고, 여기에 find -mtime +N 특유의 내림 처리까지
  # 겹쳐 이틀 가까이 밀린다(2026-09-26 실측 확인: 41GB, 9일치가 그대로 쌓여있었음 — retention이
  # "느슨하게 도는" 게 아니라 사실상 거의 안 지워지고 있었음). 폴더명(YYYY/MM/DD) 자체를 날짜로
  # 파싱해서 "오늘 기준 N일 전보다 이전 날짜"인 폴더만 통째로 지우는 방식으로 바꿔 이 오차를 없앤다.
  local cutoff_epoch deleted=0
  cutoff_epoch=$(date -v-"${RETENTION_DAYS}"d +%s)
  while IFS= read -r day_dir; do
    local dir_epoch yyyy mm dd
    dd="$(basename "$day_dir")"; mm="$(basename "$(dirname "$day_dir")")"; yyyy="$(basename "$(dirname "$(dirname "$day_dir")")")"
    dir_epoch=$(date -j -f "%Y-%m-%d" "${yyyy}-${mm}-${dd}" +%s 2>/dev/null) || continue
    if [ "$dir_epoch" -lt "$cutoff_epoch" ]; then
      rm -rf "$day_dir"
      deleted=$((deleted + 1))
    fi
  done < <(find "$SRC_TICK_DIR" -mindepth 3 -maxdepth 3 -type d)
  find "$SRC_TICK_DIR" -mindepth 1 -type d -empty -delete
  log "[tick] 로컬 정리: ${RETENTION_DAYS}일 지난 날짜폴더 ${deleted}개 삭제"
}

backup_db_dumps() {
  local dest="$DEST_ROOT/db-backups"
  if [ ! -d "$SRC_DB_DIR" ]; then
    log "[db] 원본 디렉토리 없음: $SRC_DB_DIR — 건너뜀"
    return 0
  fi
  mkdir -p "$dest"
  log "[db] 백업 시작: $SRC_DB_DIR -> $dest"
  if ! rsync -a --stats "$SRC_DB_DIR"/ "$dest"/ >>"$LOG_FILE" 2>&1; then
    log "[db] 백업 실패(rsync 오류)"
    return 1
  fi
  log "[db] 백업 완료"
}

backup_trading_state() {
  local dest_root="$DEST_ROOT/trading-state"
  local staging
  staging="$(mktemp -d)"
  local ok=0
  for entry in "${ROTATION_CONTAINERS[@]}"; do
    local container="${entry%%:*}"
    local name="${entry##*:}"
    if ! docker ps --format '{{.Names}}' | grep -qx "$container"; then
      log "[trading-state] $name 컨테이너 안 떠있음 — 건너뜀"
      continue
    fi
    local out="$staging/$name"
    mkdir -p "$out"
    if docker cp "$container:/app/data/." "$out/" >>"$LOG_FILE" 2>&1; then
      mkdir -p "$dest_root/$name"
      if rsync -a "$out"/ "$dest_root/$name"/ >>"$LOG_FILE" 2>&1; then
        log "[trading-state] $name 백업 완료"
      else
        log "[trading-state] $name rsync 실패"
        ok=1
      fi
    else
      log "[trading-state] $name docker cp 실패"
      ok=1
    fi
  done
  rm -rf "$staging"
  return $ok
}

if ! ensure_mounted; then
  exit 1
fi

status=0
backup_tick_archive || status=1
backup_db_dumps || status=1
backup_trading_state || status=1
exit $status
