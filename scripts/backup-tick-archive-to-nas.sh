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

SMB_SERVER="${SMB_SERVER:-noroot.local}"
SMB_FALLBACK_HOST="${SMB_FALLBACK_HOST:-192.168.0.12}"
SMB_SHARE="${SMB_SHARE:-HDD2TB}"
SMB_USER="${SMB_USER:-88motorcycle}"
MOUNT_POINT="${MOUNT_POINT:-/Volumes/${SMB_SHARE}}"
DEST_ROOT="${MOUNT_POINT}/Trade"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
SRC_TICK_DIR="$PROJECT_ROOT/trading-tick-archive"
SRC_CRYPTO_PAPER_DIR="$PROJECT_ROOT/trading-crypto-paper-state"
SRC_DB_DIR="$PROJECT_ROOT/backups"
LOG_FILE="${BACKUP_LOG_FILE:-$HOME/Library/Logs/tick-archive-backup.log}"
if [ -f "$LOG_FILE" ] && [ "$(wc -c < "$LOG_FILE")" -gt 5242880 ]; then mv -f "$LOG_FILE" "${LOG_FILE}.1"; fi
BACKUP_MODE="${1:-}"
OPEN_BIN="${OPEN_BIN:-open}"
DOCKER_BIN="${DOCKER_BIN:-docker}"
RSYNC_BIN="${RSYNC_BIN:-rsync}"
PERL_BIN="${PERL_BIN:-/usr/bin/perl}"
MOUNT_BIN="${MOUNT_BIN:-/sbin/mount}"
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

# Perl alarm remains available on stock macOS and bounds the child across exec.
with_timeout() { local seconds="$1" rc; shift; "$PERL_BIN" -MPOSIX -e 'setpgrp(0,0); my $limit=shift; my $pid=fork(); die "fork failed" unless defined $pid; if (!$pid) { exec @ARGV; POSIX::_exit(127) } $SIG{ALRM}=sub { $SIG{TERM}="IGNORE"; kill "TERM", -getpgrp(); sleep 2; kill "KILL", -getpgrp(); POSIX::_exit(124) }; alarm $limit; waitpid($pid,0); alarm 0; exit(($? & 127) ? 128+($? & 127) : ($? >> 8))' "$seconds" "$@"; rc=$?; (( rc == 137 )) && return 124; return "$rc"; }

ensure_mounted() {
  if with_timeout 30 "$MOUNT_BIN" | grep -F " on ${MOUNT_POINT} " >/dev/null; then
    return 0
  fi
  local host
  for host in "$SMB_SERVER" "$SMB_FALLBACK_HOST"; do
    log "NAS 연결 요청: smb://${SMB_USER}@${host}/${SMB_SHARE}"
    with_timeout 90 "$OPEN_BIN" -g -j "smb://${SMB_USER}@${host}/${SMB_SHARE}" >>"$LOG_FILE" 2>&1 || true
    local attempt
    for attempt in {1..30}; do
      if with_timeout 30 "$MOUNT_BIN" | grep -F " on ${MOUNT_POINT} " >/dev/null; then log "NAS 마운트 성공"; return 0; fi
      sleep 2
    done
  done
  log "NAS 마운트 실패 — 백업 건너뜀(로컬에 잘못 쓰는 사고 방지)"
  return 1
}

backup_db_dumps() {
  local dest="$DEST_ROOT/db-backups"
  if [ ! -d "$SRC_DB_DIR" ]; then
    log "[db] 원본 디렉토리 없음: $SRC_DB_DIR — 건너뜀"
    return 0
  fi
  with_timeout 30 mkdir -p "$dest" || return 1
  log "[db] 백업 시작: $SRC_DB_DIR -> $dest"
  if ! with_timeout 1800 "$RSYNC_BIN" -a --stats "$SRC_DB_DIR"/ "$dest"/ >>"$LOG_FILE" 2>&1; then
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
  with_timeout 30 mkdir -p "$dest" || return 1
  log "[crypto-paper] 상태 백업 시작: $SRC_CRYPTO_PAPER_DIR -> $dest"
  if ! with_timeout 1800 "$RSYNC_BIN" -a --checksum "$SRC_CRYPTO_PAPER_DIR"/ "$dest"/ >>"$LOG_FILE" 2>&1; then
    log "[crypto-paper] 백업 실패 — 로컬 상태 유지"
    return 1
  fi
  log "[crypto-paper] 상태 백업 완료 — 운영 중인 로컬 상태는 삭제하지 않음"
}

backup_trading_state() {
  local dest_root="$DEST_ROOT/trading-state"
  local staging
  with_timeout 30 mkdir -p "$dest_root" || return 1
  staging="$(mktemp -d)"
  local ok=0
  for entry in "${ROTATION_CONTAINERS[@]}"; do
    local container="${entry%%:*}"
    local name="${entry##*:}"
    local container_list
    if ! container_list=$(with_timeout 60 "$DOCKER_BIN" ps --format '{{.Names}}'); then
      log "[trading-state] docker ps 실패 또는 타임아웃 — $name 상태를 확인할 수 없음"
      ok=1
      continue
    fi
    if ! printf '%s\n' "$container_list" | grep -Fqx "$container"; then
      log "[trading-state] $name 컨테이너 없음 — 백업 실패"
      ok=1
      continue
    fi
    local out="$staging/$name"
    mkdir -p "$out"
    if with_timeout 300 "$DOCKER_BIN" cp "$container:/app/data/." "$out/" >>"$LOG_FILE" 2>&1 && [ -n "$(find "$out" -type f -print -quit)" ]; then
      local staged="$dest_root/.${name}.staged.$$" previous="$dest_root/.${name}.previous.$$"
      with_timeout 30 mkdir -p "$staged" || { ok=1; continue; }
      if ! with_timeout 1800 "$RSYNC_BIN" -a "$out"/ "$staged"/ >>"$LOG_FILE" 2>&1; then
        log "[trading-state] $name staging rsync 실패"
        ok=1
        continue
      fi
      if [ -d "$dest_root/$name" ]; then
        if ! with_timeout 30 mv "$dest_root/$name" "$previous"; then log "[trading-state] $name 기존 snapshot 이동 실패"; ok=1; continue; fi
      fi
      if with_timeout 30 mv "$staged" "$dest_root/$name"; then
        with_timeout 30 rm -rf "$previous" || log "[trading-state] 이전 snapshot 정리는 다음 실행에서 재시도"
        log "[trading-state] $name 백업 완료"
      else
        [ ! -d "$previous" ] || with_timeout 30 mv "$previous" "$dest_root/$name"
        log "[trading-state] $name atomic stage swap 실패"
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
  state-db-only)
    backup_crypto_paper_state || status=1
    backup_db_dumps || status=1
    backup_trading_state || status=1
    ;;
  *)
    log "모드 인수 필수: state-db-only (state/DB 백업은 매일 03:00 실행; tick은 archive_to_nas.py 전용)"
    exit 2
    ;;
esac
exit $status
