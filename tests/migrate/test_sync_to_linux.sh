#!/bin/bash
set -euo pipefail
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/src" "$T/home" "$T/trading-tick-archive" "$T/home/.config/ochestration"; echo test > "$T/trading-tick-archive/a"
cat > "$T/bin/ssh" <<'STUB'
#!/bin/bash
printf '%s\n' "$*" >> "$SSH_LOG"; exit 0
STUB
cat > "$T/bin/rsync" <<'STUB'
#!/bin/bash
printf '%s\n' "$*" >> "$RSYNC_LOG"
if [ "${RSYNC_FAIL:-0}" = 1 ]; then echo 'rsync: send_files failed to open "a": Permission denied' >&2; exit 23; fi
if [ "${RSYNC_SUMMARY:-0}" = 1 ]; then echo 'rsync error: some files/attrs were not transferred (code 23) at main.c(1338) [sender=3.5.2]' >&2; echo 'rsync: send_files failed to open "a": Permission denied' >&2; exit 23; fi
exit 0
STUB
cat > "$T/bin/curl" <<'STUB'
#!/bin/bash
printf 'curl\n' >> "$ALERT_LOG"; exit 0
STUB
cat > "$T/bin/docker" <<'STUB'
#!/bin/bash
printf '%s\n' "$*" >> "$DOCKER_LOG"; exit 0
STUB
chmod +x "$T/bin"/*
export PATH="$T/bin:$PATH" HOME="$T/home" STATE_DIR="$T/state" PROJECT_ROOT="$T" RSYNC_BIN="$T/bin/rsync" SSH_BIN="$T/bin/ssh" SSH_LOG="$T/ssh.log" RSYNC_LOG="$T/rsync.log" ALERT_LOG="$T/alerts.log" DOCKER_LOG="$T/docker.log" OSASCRIPT_BIN="$T/bin/osascript" CURL_BIN="$T/bin/curl"; cat > "$T/bin/osascript" <<'STUB'
#!/bin/bash
printf 'alert\n' >> "$ALERT_LOG"
STUB
chmod +x "$T/bin/osascript"
# Replace preflight stub's df condition by a PATH df stub.
cat > "$T/bin/df" <<'STUB'
#!/bin/bash
printf 'Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/x 999999999 1 999999998 1%% /\n'
STUB
chmod +x "$T/bin/df"
bash scripts/migrate/sync_to_linux.sh tick
: > "$T/rsync.log"; export RSYNC_FAIL=1
for n in 1 2 3; do bash scripts/migrate/sync_to_linux.sh tick || true; done
[ -s "$STATE_DIR/jobs/tick/retry.list" ]; [ "$(grep -c alert "$ALERT_LOG")" -eq 1 ]; [ "$(grep -h -c 'ALERT Migration job tick failed' "$STATE_DIR"/logs/sync-*.log | awk '{s+=$1} END {print s+0}')" -eq 1 ]
unset RSYNC_FAIL; bash scripts/migrate/sync_to_linux.sh tick
[ ! -f "$STATE_DIR/jobs/tick/retry.list" ]; [ "$(grep -c alert "$ALERT_LOG")" -eq 2 ]
export RSYNC_SUMMARY=1; bash scripts/migrate/sync_to_linux.sh tick || true
[ "$(cut -f1 "$STATE_DIR/jobs/tick/retry.list")" = a ]; [ "$(wc -l < "$STATE_DIR/jobs/tick/retry.list" | tr -d ' ')" = 1 ]; unset RSYNC_SUMMARY
printf 'gone\t1\n' > "$STATE_DIR/jobs/tick/retry.list"; before=$(grep -c -- '--files-from=' "$RSYNC_LOG" || true); bash scripts/migrate/sync_to_linux.sh tick; after=$(grep -c -- '--files-from=' "$RSYNC_LOG" || true); [ "$before" = "$after" ]; [ ! -f "$STATE_DIR/jobs/tick/retry.list" ]
# stale lock takeover and live lock skip
mkdir "$STATE_DIR/lock"; printf '999999 1\n' > "$STATE_DIR/lock/owner"; bash scripts/migrate/sync_to_linux.sh tick
mkdir "$STATE_DIR/lock"; printf '%s %s\n' "$$" "$(date +%s)" > "$STATE_DIR/lock/owner"; before=$(wc -l < "$T/rsync.log"); bash scripts/migrate/sync_to_linux.sh tick; after=$(wc -l < "$T/rsync.log"); [ "$before" -eq "$after" ]; rm -rf "$STATE_DIR/lock"
if grep -E -- '(^|[[:space:]])--delete([[:space:]]|$)' "$T/rsync.log"; then echo 'sync invoked --delete' >&2; exit 1; fi
echo 'sync_to_linux scenarios: PASS'
