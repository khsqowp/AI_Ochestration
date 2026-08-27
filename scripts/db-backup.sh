#!/bin/bash
# 매일 새벽 3시(TZ 기준)에 MySQL 전체를 mysqldump로 덤프해 로컬 ./backups에 저장하고,
# 지정한 보관 기간(기본 7일)보다 오래된 백업 파일은 자동으로 정리한다.
set -euo pipefail

RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
DB_HOST="${DB_HOST:-mysql}"
DB_NAME="${MYSQL_DATABASE:-orchestration}"
DB_USER="${DB_USER:-orchestrator}"

run_backup() {
  local stamp dump_file
  stamp=$(date +%Y-%m-%d_%H%M%S)
  dump_file="$BACKUP_DIR/${DB_NAME}-${stamp}.sql.gz"
  echo "[$(date -Iseconds)] 백업 시작: $dump_file"
  if mysqldump -h "$DB_HOST" -u"$DB_USER" --single-transaction --routines --triggers "$DB_NAME" | gzip > "$dump_file"; then
    echo "[$(date -Iseconds)] 백업 완료: $dump_file ($(du -h "$dump_file" | cut -f1))"
  else
    echo "[$(date -Iseconds)] 백업 실패 — 부분 파일 삭제: $dump_file" >&2
    rm -f "$dump_file"
    return 1
  fi
  find "$BACKUP_DIR" -maxdepth 1 -name "${DB_NAME}-*.sql.gz" -mtime "+${RETENTION_DAYS}" -print -delete
}

seconds_until_next_3am() {
  local now target
  now=$(date +%s)
  target=$(date -d "today 03:00" +%s)
  if [ "$now" -ge "$target" ]; then
    target=$(date -d "tomorrow 03:00" +%s)
  fi
  echo $((target - now))
}

# 스크립트가 소싱될 때(테스트용)는 루프를 돌리지 않고 함수만 정의한다.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "DB 백업 루프 시작 (매일 03:00, 보관기간 ${RETENTION_DAYS}일, 저장위치 ${BACKUP_DIR})"
  while true; do
    wait_seconds=$(seconds_until_next_3am)
    echo "다음 백업까지 대기: ${wait_seconds}초"
    sleep "$wait_seconds"
    run_backup || true
  done
fi
