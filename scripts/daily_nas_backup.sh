#!/bin/bash
set -uo pipefail

PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
PYTHON_BIN="${PYTHON_BIN:-/opt/anaconda3/bin/python3}"
PERL_BIN="${PERL_BIN:-/usr/bin/perl}"
OPEN_BIN="${OPEN_BIN:-open}"
MOUNT_BIN="${MOUNT_BIN:-/sbin/mount}"
NAS_USER="${NAS_USER:-88motorcycle}"
NAS_SERVER="${NAS_SERVER:-noroot.local}"
NAS_FALLBACK_HOST="${NAS_FALLBACK_HOST:-192.168.0.12}"
NAS_SHARE="${NAS_SHARE:-HDD2TB}"
MOUNT_POINT="${MOUNT_POINT:-/Volumes/$NAS_SHARE}"
STATE_DIR="${STATE_DIR:-$HOME/Library/Application Support/ochestration-archive}"
LOG_FILE="${DAILY_BACKUP_LOG:-$HOME/Library/Logs/daily_nas_backup.log}"
TICK_BACKUP="${TICK_BACKUP_SCRIPT:-$PROJECT_ROOT/scripts/backup-tick-archive-to-nas.sh}"
ARCHIVE_SCRIPT="${ARCHIVE_SCRIPT:-$PROJECT_ROOT/trading/scripts/archive_to_nas.py}"
STALE_AFTER_SECONDS="${STALE_AFTER_SECONDS:-14400}"
NAS_RETRY_WINDOW_SECONDS="${NAS_RETRY_WINDOW_SECONDS:-10800}"
mkdir -p "$(dirname "$LOG_FILE")" "$STATE_DIR"
if [[ -f "$LOG_FILE" ]] && (( $(/usr/bin/stat -f %z "$LOG_FILE" 2>/dev/null || echo 0) > 5242880 )); then
  /bin/mv -f "$LOG_FILE" "${LOG_FILE}.1"
fi
exec >>"$LOG_FILE" 2>&1
log() { echo "[$(/bin/date -Iseconds)] $*"; }
with_timeout() { local seconds="$1" rc; shift; local grace="${TIMEOUT_GRACE_SECONDS:-2}"; "$PERL_BIN" -MPOSIX -e 'setpgrp(0,0); my $limit=shift; my $grace=shift; my $pid=fork(); die "fork failed" unless defined $pid; if (!$pid) { exec @ARGV; POSIX::_exit(127) } $SIG{ALRM}=sub { $SIG{TERM}="IGNORE"; kill "TERM", -getpgrp(); sleep $grace if $grace; kill "KILL", -getpgrp(); POSIX::_exit(124) }; alarm $limit; waitpid($pid,0); alarm 0; exit(($? & 127) ? 128+($? & 127) : ($? >> 8))' "$seconds" "$grace" "$@"; rc=$?; (( rc == 137 )) && return 124; return "$rc"; }

lock="$STATE_DIR/daily_nas_backup.lock"
take_lock() {
  /bin/mkdir "$lock" 2>/dev/null && return 0
  local old_pid age owner
  old_pid="$(cat "$lock/pid" 2>/dev/null || true)"
  age=$(( $(/bin/date +%s) - $(/usr/bin/stat -f %m "$lock" 2>/dev/null || echo 0) ))
  if [[ "$old_pid" =~ ^[0-9]+$ ]] && /bin/kill -0 "$old_pid" 2>/dev/null; then
    owner="$(/bin/ps -p "$old_pid" -o command= 2>/dev/null || true)"
    if [[ "$owner" == *daily_nas_backup.sh* ]]; then
      log "daily wrapper lock held by live pid=$old_pid age=${age}s"
      return 1
    fi
    if (( age < STALE_AFTER_SECONDS )); then log "lock pid is live but identity is uncertain; refusing takeover"; return 1; fi
  elif (( age < STALE_AFTER_SECONDS )); then
    log "dead or unreadable pid but lock age=${age}s is below stale threshold"
    return 1
  fi
  log "reclaiming stale lock pid=${old_pid:-unknown} age=${age}s"
  /bin/rm -rf "$lock" 2>/dev/null || return 1
  /bin/mkdir "$lock" 2>/dev/null
}
if ! take_lock; then log "ALERT daily wrapper lock unavailable; exiting"; exit 2; fi
echo "$$" > "$lock/pid"
trap 'rm -rf "$lock"' EXIT
rm -f "$STATE_DIR/daily_nas_backup.last_success.archive" "$STATE_DIR/daily_nas_backup.last_partial.archive" "$STATE_DIR/daily_nas_backup.last_success.state-db" "$STATE_DIR/daily_nas_backup.last_success"
log "===== DAILY NAS BACKUP START pid=$$ ====="
status=0
if [[ $# -gt 0 ]]; then log "daily wrapper does not accept mode arguments"; exit 2; fi
retry_started="$("$PERL_BIN" -MTime::HiRes=clock_gettime,CLOCK_MONOTONIC -e 'printf "%.6f", clock_gettime(CLOCK_MONOTONIC)')"
TIMEOUT_GRACE_SECONDS=0
retry_remaining() { "$PERL_BIN" -MTime::HiRes=clock_gettime,CLOCK_MONOTONIC -e 'my $start=shift; my $window=shift; my $r=int($start+$window-clock_gettime(CLOCK_MONOTONIC)); print($r > 0 ? $r : 0)' "$retry_started" "$NAS_RETRY_WINDOW_SECONDS"; }
bounded_timeout() { local requested="$1" remaining; remaining="$(retry_remaining)"; (( remaining < requested )) && requested="$remaining"; (( requested < 1 )) && return 1; echo "$requested"; }
mounted() { local mounts timeout; timeout="$(bounded_timeout 30)" || return 1; mounts="$(with_timeout "$timeout" "$MOUNT_BIN")" || return 1; /usr/bin/grep -F " on ${MOUNT_POINT} " <<<"$mounts" >/dev/null; }
ensure_mounted() {
  mounted && return 0
  local host attempt
  for host in "$NAS_SERVER" "$NAS_FALLBACK_HOST"; do
    local timeout; timeout="$(bounded_timeout 90)" || break
    log "mount request smb://${NAS_USER}@${host}/${NAS_SHARE}"
    with_timeout "$timeout" "$OPEN_BIN" -g -j "smb://${NAS_USER}@${host}/${NAS_SHARE}" || true
    for attempt in {1..5}; do
      (( $(retry_remaining) > 0 )) || break
      mounted && return 0
      local remaining; remaining="$(retry_remaining)"; (( remaining > 2 )) && /bin/sleep 2 || { (( remaining > 0 )) && /bin/sleep "$remaining"; }
    done
  done
  log "ALERT NAS mount unavailable"
  return 1
}
attempt=0
while ! ensure_mounted; do
  remaining="$(retry_remaining)"
  (( remaining > 0 )) || break
  attempt=$((attempt + 1))
  if (( attempt >= 18 )); then break; fi
  log "NAS retry $attempt/18; wait 600 seconds"
  (( remaining > 600 )) && /bin/sleep 600 || /bin/sleep "$remaining"
done
if mounted; then
  log "step 1 mount ready"
else
  status=1
fi
TIMEOUT_GRACE_SECONDS=2
if (( status == 0 )); then
  log "step 2 state/DB backup start"
  if with_timeout 7200 /bin/bash "$TICK_BACKUP" state-db-only; then /bin/date -Iseconds > "$STATE_DIR/daily_nas_backup.last_success.state-db"; else status=1; log "ALERT state/DB backup failed"; fi
  log "step 2 state/DB backup end"
  log "step 3 daily archive upload and deletion start"
  delete_args=(--no-delete)
  if [[ "${DAILY_NAS_ENABLE_DELETE:-0}" == 1 ]]; then delete_args=(--enable-delete); fi
  if with_timeout 9300 "$PYTHON_BIN" "$ARCHIVE_SCRIPT" "${delete_args[@]}" --max-minutes 150 --throttle-mbps 30 --keep-days 1 --close-margin-hours 6 --idle-seconds 5 --state-dir "$STATE_DIR" --mount "$MOUNT_POINT" --dest "$MOUNT_POINT/Trade/tick-archive" --nas-server "$NAS_SERVER" --nas-fallback-host "$NAS_FALLBACK_HOST" --nas-user "$NAS_USER" --nas-share "$NAS_SHARE"; then
    /bin/date -Iseconds > "$STATE_DIR/daily_nas_backup.last_success.archive"
  else
    archive_rc=$?
    if (( archive_rc == 10 )); then
      /bin/date -Iseconds > "$STATE_DIR/daily_nas_backup.last_partial.archive"
      (( status == 0 )) && status=10
      log "archive uploader deferred work; run is partial (exit 10)"
    else status=1; log "ALERT archive uploader failed (exit $archive_rc)"
    fi
  fi
  log "step 3 daily archive upload and deletion end"
fi
if (( status == 0 )); then
  /bin/date -Iseconds > "$STATE_DIR/daily_nas_backup.last_success"
  log "DAILY NAS BACKUP SUCCESS"
else
  if (( status == 10 )); then log "DAILY NAS BACKUP PARTIAL status=10"; else log "DAILY NAS BACKUP FAILURE status=$status"; fi
fi
log "===== DAILY NAS BACKUP END status=$status ====="
exit "$status"
