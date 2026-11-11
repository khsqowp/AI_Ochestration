#!/bin/bash
set -euo pipefail
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
setup(){ local case_dir=$1; mkdir -p "$case_dir/bin" "$case_dir/home/logs/host" "$case_dir/home/logs/site" "$case_dir/nas/Ochestration" "$case_dir/project/backups" "$case_dir/project/trading-crypto-paper-state" "$case_dir/project/trading-tick-archive" "$case_dir/state" "$case_dir/notify"; touch "$case_dir/nas/Ochestration/.nas-mounted" "$case_dir/home/logs/host/a.log" "$case_dir/project/backups/f.sql.gz" "$case_dir/project/trading-crypto-paper-state/p.json"; for n in ochestration-trading-trading-momentum-rotation-1 cointrade-crypto-tick-stream ochestration-trading-trading-kr-opening-scan-1 ochestration-trading-trading-us-rotation-1 ochestration-trading-trading-tick-stream-1 ochestration-web-1; do mkdir -p "$case_dir/home/logs/site/$n"; touch "$case_dir/home/logs/site/$n/x.log"; done
cat > "$case_dir/bin/findmnt" <<'STUB'
#!/bin/bash
exit 0
STUB
cat > "$case_dir/bin/docker" <<'STUB'
#!/bin/bash
[ "$1" = cp ] || exit 1; mkdir -p "$3"; printf state > "$3/state.json"
STUB
cat > "$case_dir/bin/python3" <<'STUB'
#!/bin/bash
printf '%s\n' "$*" >> "$PYTHON_ARGS"
exit 0
STUB
cat > "$case_dir/bin/timeout" <<'STUB'
#!/bin/bash
[ "$1" = -k ] && shift 2; shift; exec "$@"
STUB
cat > "$case_dir/bin/curl" <<'STUB'
#!/bin/bash
exit 0
STUB
chmod +x "$case_dir/bin"/*; }
export PYTHON_ARGS="$T/python-args"
setup "$T/ok"
export PATH="$T/ok/bin:$PATH" HOME="$T/ok/home" NAS_MOUNT="$T/ok/nas" NAS_BASE="$T/ok/nas/Ochestration" PROJECT_ROOT="$T/ok/project" STATE_DIR="$T/ok/state" NOTIFY_STATE_DIR="$T/ok/notify" NOTIFY_LOG="$T/ok/alerts.log" NAS_BACKUP_LOG="$T/ok/backup.log"
bash scripts/linux/nas_backup.sh
for pair in 'ochestration-trading-trading-momentum-rotation-1 coin/logs' 'cointrade-crypto-tick-stream coin/logs' 'ochestration-trading-trading-kr-opening-scan-1 kr/logs' 'ochestration-trading-trading-us-rotation-1 us/logs' 'ochestration-trading-trading-tick-stream-1 market-data/logs' 'ochestration-web-1 site/logs'; do set -- $pair; test -f "$NAS_BASE/$2/$1/x.log"; done
for p in coin/state/momentum-rotation/state.json kr/state/kr-rotation/state.json us/state/us-rotation/state.json site/db/f.sql.gz coin/state/paper/p.json; do test -f "$NAS_BASE/$p"; done
grep -F -- "--dest $NAS_BASE/market-data/tick-archive" "$PYTHON_ARGS" >/dev/null
grep -F -- "--nas-root $NAS_BASE/coin" "$PYTHON_ARGS" >/dev/null
test ! -e "$T/ok/nas/Trade"; test ! -e "$T/ok/nas/Logs"
echo 'nas_backup layout: PASS'
setup "$T/missing"; rm "$T/missing/nas/Ochestration/.nas-mounted"
export PATH="$T/missing/bin:$PATH" HOME="$T/missing/home" NAS_MOUNT="$T/missing/nas" NAS_BASE="$T/missing/nas/Ochestration" PROJECT_ROOT="$T/missing/project" STATE_DIR="$T/missing/state" NOTIFY_STATE_DIR="$T/missing/notify" NOTIFY_LOG="$T/missing/alerts.log" NAS_BACKUP_LOG="$T/missing/backup.log"
if bash scripts/linux/nas_backup.sh; then echo 'missing sentinel expected failure'; exit 1; fi
test -z "$(find "$T/missing/nas/Ochestration" -mindepth 1 -print -quit)"
echo 'nas_backup missing sentinel guard: PASS'
