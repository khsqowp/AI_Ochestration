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
SRC_CRYPTO_PAPER_DIR="$PROJECT_ROOT/trading-crypto-paper-state"
SRC_DB_DIR="$PROJECT_ROOT/backups"
LOG_FILE="${BACKUP_LOG_FILE:-$HOME/Library/Logs/tick-archive-backup.log}"
BACKUP_MODE="${1:-all}"
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
  log "[tick] 압축 백업 시작: $SRC_TICK_DIR -> $dest"
  # 현재 UTC 날짜 폴더는 계속 append 중일 수 있으므로 로컬에 남긴다. 닫힌 날짜만 파일별
  # gzip으로 NAS에 원자적으로 저장하고, 압축 해제 SHA-256이 원본과 일치할 때 로컬을 지운다.
  local today_utc deleted=0 verify_failed=0
  today_utc=$(date -u +%Y-%m-%d)
  while IFS= read -r day_dir; do
    local day_date yyyy mm dd relative dest_day source_file dest_file source_hash dest_hash day_ok
    dd="$(basename "$day_dir")"; mm="$(basename "$(dirname "$day_dir")")"; yyyy="$(basename "$(dirname "$(dirname "$day_dir")")")"
    day_date="${yyyy}-${mm}-${dd}"
    date -j -f "%Y-%m-%d" "$day_date" +%Y-%m-%d >/dev/null 2>&1 || continue
    if [[ "$day_date" < "$today_utc" ]]; then
      relative="${day_dir#"$SRC_TICK_DIR"/}"
      dest_day="$dest/$relative"
      day_ok=1
      mkdir -p "$dest_day"
      if [ ! -d "$dest_day" ]; then
        day_ok=0
      else
        while IFS= read -r -d '' source_file; do
          relative="${source_file#"$day_dir"/}"
          dest_file="$dest_day/$relative.gz"
          mkdir -p "$(dirname "$dest_file")"
          source_hash=$(shasum -a 256 "$source_file" | awk '{print $1}')
          if [ ! -f "$dest_file" ] || ! gzip -t "$dest_file" >/dev/null 2>&1; then
            local tmp_file="${dest_file}.tmp.$$"
            if ! gzip -c "$source_file" > "$tmp_file" || ! mv -f "$tmp_file" "$dest_file"; then
              rm -f "$tmp_file"
              day_ok=0
              break
            fi
          fi
          dest_hash=$(gzip -dc "$dest_file" | shasum -a 256 | awk '{print $1}') || dest_hash=""
          if [ -z "$source_hash" ] || [ "$source_hash" != "$dest_hash" ]; then
            day_ok=0
            break
          fi
        done < <(find "$day_dir" -type f -print0)
      fi
      if [ "$day_ok" -eq 1 ]; then
        rm -rf "$day_dir"
        deleted=$((deleted + 1))
        log "[tick] 압축 해제 SHA-256 일치 — 로컬 날짜폴더 삭제: ${yyyy}/${mm}/${dd}"
      else
        verify_failed=1
        log "[tick] NAS 검증 실패 — 로컬 원본 유지: ${yyyy}/${mm}/${dd}"
      fi
    fi
  done < <(find "$SRC_TICK_DIR" -mindepth 3 -maxdepth 3 -type d)
  find "$SRC_TICK_DIR" -mindepth 1 -type d -empty -delete
  log "[tick] 로컬 정리: NAS 압축본 SHA-256 검증을 통과한 닫힌 UTC 날짜폴더 ${deleted}개 삭제"
  [ "$verify_failed" -eq 0 ]
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

backup_crypto_paper_state() {
  local dest="$DEST_ROOT/crypto-paper-state"
  if [ ! -d "$SRC_CRYPTO_PAPER_DIR" ]; then
    log "[crypto-paper] 상태 디렉토리 없음: $SRC_CRYPTO_PAPER_DIR — 건너뜀"
    return 0
  fi
  mkdir -p "$dest"
  log "[crypto-paper] 상태 백업 시작: $SRC_CRYPTO_PAPER_DIR -> $dest"
  if ! rsync -a --checksum "$SRC_CRYPTO_PAPER_DIR"/ "$dest"/ >>"$LOG_FILE" 2>&1; then
    log "[crypto-paper] 백업 실패 — 로컬 상태 유지"
    return 1
  fi
  log "[crypto-paper] 상태 백업 완료 — 운영 중인 로컬 상태는 삭제하지 않음"
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
case "$BACKUP_MODE" in
  all)
    backup_tick_archive || status=1
    backup_crypto_paper_state || status=1
    backup_db_dumps || status=1
    backup_trading_state || status=1
    ;;
  tick-only)
    backup_tick_archive || status=1
    backup_crypto_paper_state || status=1
    ;;
  state-db-only)
    backup_db_dumps || status=1
    backup_trading_state || status=1
    ;;
  *)
    log "알 수 없는 백업 모드: $BACKUP_MODE (all|tick-only|state-db-only)"
    exit 2
    ;;
esac
exit $status
