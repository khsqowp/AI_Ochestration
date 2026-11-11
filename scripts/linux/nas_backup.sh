#!/bin/bash
set -u
ROOT=${PROJECT_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}; HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd); . "$HERE/notify.sh"
NAS_MOUNT=${NAS_MOUNT:-/mnt/nas}; BASE=${NAS_BASE:-$NAS_MOUNT/Ochestration}; STATE_DIR=${STATE_DIR:-$HOME/.local/state/ochestration/nas-backup}; mkdir -p "$STATE_DIR"; LOG=${NAS_BACKUP_LOG:-$HOME/logs/host/nas-backup.log}; mkdir -p "$(dirname "$LOG")"; [ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 5242880 ] && mv "$LOG" "$LOG.1"
log(){ printf '[%s] %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*" >> "$LOG"; }; run(){ timeout -k 5 "$1" "${@:2}"; }
if ! run 10 findmnt -t nfs,nfs4 "$NAS_MOUNT" >/dev/null 2>&1 || ! run 10 test -f "$BASE/.nas-mounted" || ! run 10 stat "$BASE" >/dev/null 2>&1; then log 'NAS guard failed'; notify nas-backup 'NAS backup aborted' 'mount, sentinel, or stat check failed'; exit 1; fi
status=0
run 15 mkdir -p "$BASE/site/db" "$BASE/site/logs" "$BASE/coin/state" "$BASE/coin/logs" "$BASE/kr/state" "$BASE/kr/logs" "$BASE/us/state" "$BASE/us/logs" "$BASE/market-data/tick-archive" "$BASE/market-data/logs" || { log 'NAS backup directory create failed'; notify nas-backup 'NAS backup aborted' 'cannot create required backup directories on NAS'; exit 1; }
step(){ local name=$1; shift; if "$@"; then log "$name OK"; else log "$name FAILED"; notify "nas-backup-$name" 'NAS backup step failed' "$name"; status=1; fi; }
step db-rsync run 1800 rsync -rlt "$ROOT/backups/" "$BASE/site/db/"
step paper-rsync run 1800 rsync -rlt --checksum "$ROOT/trading-crypto-paper-state/" "$BASE/coin/state/paper/"
state_step(){ local c=$1 parent=$2 n=$3 tmp staged old; tmp=$(mktemp -d); if ! run 300 docker cp "$c:/app/data/." "$tmp/" || [ -z "$(find "$tmp" -type f -print -quit)" ]; then rm -rf "$tmp"; return 1; fi; staged="$parent/.$n.staged.$$"; old="$parent/.$n.previous.$$"; run 30 mkdir -p "$parent" "$staged" || return 1; run 1800 rsync -rlt "$tmp/" "$staged/" || return 1; rm -rf "$tmp"; [ ! -d "$parent/$n" ] || run 30 mv "$parent/$n" "$old" || return 1; if run 30 mv "$staged" "$parent/$n"; then run 30 rm -rf "$old" || true; else [ ! -d "$old" ] || run 30 mv "$old" "$parent/$n"; return 1; fi; }
step momentum-state state_step ochestration-trading-trading-momentum-rotation-1 "$BASE/coin/state" momentum-rotation
step kr-state state_step ochestration-trading-trading-kr-rotation-1 "$BASE/kr/state" kr-rotation
step us-state state_step ochestration-trading-trading-us-rotation-1 "$BASE/us/state" us-rotation
archive_args=(--no-auto-mount --source "$ROOT/trading-tick-archive" --mount "$NAS_MOUNT" --dest "$BASE/market-data/tick-archive" --state-dir "$STATE_DIR" --max-minutes 150 --throttle-mbps 30 --keep-days 1 --close-margin-hours 6 --idle-seconds 5 --no-delete); [[ ${NAS_BACKUP_ENABLE_DELETE:-0} == 1 ]] && archive_args=("${archive_args[@]/--no-delete/--enable-delete}")
step tick-archive run 9300 python3 "$ROOT/trading/scripts/archive_to_nas.py" "${archive_args[@]}"
step shadow-archive run 1800 python3 "$ROOT/trading/shadow_predictor/archive_store.py" --flush --db "$HOME/Library/Application Support/CoinTradeShadowArchive/shadow_archive.sqlite3" --nas-root "$BASE/coin" --volume-mount "$NAS_MOUNT"
log_bucket(){ case "$1" in *crypto*|*shadow*|*momentum-rotation*|*coin-swing*|*funding-arb*) printf coin;; *-kr-*) printf kr;; *-us-*) printf us;; *tick-stream*) printf market-data;; *) printf site;; esac; }
logs_rsync(){ local failed=0 d name bucket; run 1800 rsync -rlt "$HOME/logs/host/" "$BASE/site/logs/host/" || failed=1; if [ -d "$HOME/logs/migrate" ]; then run 1800 rsync -rlt "$HOME/logs/migrate/" "$BASE/site/logs/migrate/" || failed=1; fi; if [ -d "$HOME/logs/site" ]; then for d in "$HOME"/logs/site/*/; do [ -d "$d" ] || continue; name=${d%/}; name=${name##*/}; bucket=$(log_bucket "$name"); run 1800 rsync -rlt "$d" "$BASE/$bucket/logs/$name/" || failed=1; done; fi; for d in "$HOME"/logs/*; do [ -e "$d" ] || continue; name=${d##*/}; [[ "$name" == host || "$name" == migrate || "$name" == site ]] && continue; [ -d "$d" ] && d=$d/; run 1800 rsync -rlt "$d" "$BASE/site/logs/$name/" || failed=1; done; return "$failed"; }
step logs-rsync logs_rsync
step local-log-prune find "$HOME/logs" -type f -mtime +30 -delete
nas_log_prune(){ local d failed=0; for d in "$BASE"/*/logs; do [ -d "$d" ] || continue; run 300 find "$d" -type f -mtime +180 -delete || failed=1; done; return "$failed"; }
step nas-log-prune nas_log_prune
if ((status==0)); then date '+%Y-%m-%dT%H:%M:%S%z' > "$STATE_DIR/last_success.tmp" && mv -f "$STATE_DIR/last_success.tmp" "$STATE_DIR/last_success"; notify_recover nas-backup 'NAS backup recovered' 'all backup steps passed'; else notify nas-backup 'NAS backup failed' 'one or more independently reported steps failed'; fi
exit "$status"
