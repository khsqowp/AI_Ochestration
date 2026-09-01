#!/bin/bash
# 틱 아카이브(./trading-tick-archive)를 NAS(SMB)로 주기적으로 백업한다.
# NAS 볼륨이 안 마운트돼있으면 로컬 /Volumes/HDD2TB/Trade 밑에 그냥 새 폴더가 생겨버리는
# macOS의 흔한 함정을 피하려고, 마운트 여부를 먼저 검사하고 아니면 즉시 실패시킨다.
set -euo pipefail

SMB_SERVER="${SMB_SERVER:-noroot}"
SMB_SHARE="${SMB_SHARE:-HDD2TB}"
SMB_USER="${SMB_USER:-guest}"
MOUNT_POINT="/Volumes/${SMB_SHARE}"
DEST_DIR="${MOUNT_POINT}/Trade/tick-archive"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/trading-tick-archive"
LOG_FILE="${BACKUP_LOG_FILE:-$HOME/Library/Logs/tick-archive-backup.log}"

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

if ! ensure_mounted; then
  exit 1
fi

if [ ! -d "$SRC_DIR" ]; then
  log "원본 디렉토리 없음: $SRC_DIR"
  exit 1
fi

mkdir -p "$DEST_DIR"
log "백업 시작: $SRC_DIR -> $DEST_DIR"
if rsync -a --stats "$SRC_DIR"/ "$DEST_DIR"/ >>"$LOG_FILE" 2>&1; then
  log "백업 완료"
else
  log "백업 실패(rsync 오류) — 위 로그 확인"
  exit 1
fi
