#!/bin/bash
set -u
ROOT=${PROJECT_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}; HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd); . "$HERE/notify.sh"
NAS_MOUNT=${NAS_MOUNT:-/mnt/nas}; TRADE=${NAS_TRADE:-$NAS_MOUNT/Trade}; STATE_DIR=${STATE_DIR:-$HOME/.local/state/ochestration/nas-backup}; mkdir -p "$STATE_DIR"; LOG=${NAS_BACKUP_LOG:-$HOME/logs/host/nas-backup.log}; mkdir -p "$(dirname "$LOG")"; [ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 5242880 ] && mv "$LOG" "$LOG.1"
log(){ printf '[%s] %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*" >> "$LOG"; }; run(){ timeout -k 5 "$1" "${@:2}"; }
if ! run 10 findmnt -t nfs,nfs4 "$NAS_MOUNT" >/dev/null 2>&1 || ! run 10 test -f "$TRADE/.nas-mounted" || ! run 10 stat "$TRADE" >/dev/null 2>&1; then log 'NAS guard failed'; notify nas-backup 'NAS backup aborted' 'mount, sentinel, or stat check failed'; exit 1; fi
status=0
run 15 mkdir -p "$NAS_MOUNT/Logs/ochestration" || { log 'NAS log directory create failed'; notify nas-backup 'NAS backup aborted' 'cannot create Logs/ochestration on NAS'; exit 1; }
step(){ local name=$1; shift; if "$@"; then log "$name OK"; else log "$name FAILED"; notify "nas-backup-$name" 'NAS backup step failed' "$name"; status=1; fi; }
step db-rsync run 1800 rsync -rlt "$ROOT/backups/" "$TRADE/db-backups/"
step paper-rsync run 1800 rsync -rlt --checksum "$ROOT/trading-crypto-paper-state/" "$TRADE/crypto-paper-state/"
state_step(){ local c=$1 n=$2 tmp staged old; tmp=$(mktemp -d); if ! run 300 docker cp "$c:/app/data/." "$tmp/" || [ -z "$(find "$tmp" -type f -print -quit)" ]; then rm -rf "$tmp"; return 1; fi; staged="$TRADE/trading-state/.$n.staged.$$"; old="$TRADE/trading-state/.$n.previous.$$"; run 30 mkdir -p "$TRADE/trading-state" "$staged" || return 1; run 1800 rsync -rlt "$tmp/" "$staged/" || return 1; rm -rf "$tmp"; [ ! -d "$TRADE/trading-state/$n" ] || run 30 mv "$TRADE/trading-state/$n" "$old" || return 1; if run 30 mv "$staged" "$TRADE/trading-state/$n"; then run 30 rm -rf "$old" || true; else [ ! -d "$old" ] || run 30 mv "$old" "$TRADE/trading-state/$n"; return 1; fi; }
step momentum-state state_step ochestration-trading-trading-momentum-rotation-1 momentum-rotation
step kr-state state_step ochestration-trading-trading-kr-rotation-1 kr-rotation
step us-state state_step ochestration-trading-trading-us-rotation-1 us-rotation
archive_args=(--no-auto-mount --source "$ROOT/trading-tick-archive" --mount "$NAS_MOUNT" --dest "$TRADE/tick-archive" --state-dir "$STATE_DIR" --max-minutes 150 --throttle-mbps 30 --keep-days 1 --close-margin-hours 6 --idle-seconds 5 --no-delete); [[ ${NAS_BACKUP_ENABLE_DELETE:-0} == 1 ]] && archive_args=("${archive_args[@]/--no-delete/--enable-delete}")
step tick-archive run 9300 python3 "$ROOT/trading/scripts/archive_to_nas.py" "${archive_args[@]}"
step shadow-archive run 1800 python3 "$ROOT/trading/shadow_predictor/archive_store.py" --flush --db "$HOME/Library/Application Support/CoinTradeShadowArchive/shadow_archive.sqlite3" --nas-root "$TRADE" --volume-mount "$NAS_MOUNT"
step logs-rsync run 1800 rsync -rlt "$HOME/logs/" "$NAS_MOUNT/Logs/ochestration/"
step local-log-prune find "$HOME/logs" -type f -mtime +30 -delete
step nas-log-prune run 300 find "$NAS_MOUNT/Logs/ochestration" -type f -mtime +180 -delete
if ((status==0)); then date '+%Y-%m-%dT%H:%M:%S%z' > "$STATE_DIR/last_success.tmp" && mv -f "$STATE_DIR/last_success.tmp" "$STATE_DIR/last_success"; notify_recover nas-backup 'NAS backup recovered' 'all backup steps passed'; else notify nas-backup 'NAS backup failed' 'one or more independently reported steps failed'; fi
exit "$status"
