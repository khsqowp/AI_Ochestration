#!/bin/bash
set -u
PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"; export PATH
ROOT="${PROJECT_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
STATE_DIR="${STATE_DIR:-$HOME/Library/Application Support/ochestration-migrate}"
RSYNC_BIN="${RSYNC_BIN:-/opt/homebrew/bin/rsync}"; SSH_BIN="${SSH_BIN:-ssh}"; DOCKER_BIN="${DOCKER_BIN:-docker}"
LOCK="$STATE_DIR/lock"; LOG_DIR="$STATE_DIR/logs"; mkdir -p "$LOG_DIR" "$STATE_DIR/jobs" || exit 1
TODAY=$(date '+%Y%m%d'); LOG="$LOG_DIR/sync-$TODAY.log"
[ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 5242880 ] && mv "$LOG" "$LOG.1"
log(){ printf '[%s] %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*" | tee -a "$LOG"; }
for old in "$LOG_DIR"/sync-*.log; do [ -f "$old" ] || continue; day=${old##*/sync-}; day=${day%.log}; if [[ $day =~ ^[0-9]{8}$ ]] && [ "$(date -j -f '%Y%m%d' "$day" '+%s' 2>/dev/null || echo 0)" -lt "$(($(date '+%s')-1209600))" ]; then gzip -f "$old"; fi; done
if ! mkdir "$LOCK" 2>/dev/null; then
  pid= stamp=; read -r pid stamp < "$LOCK/owner" 2>/dev/null || true; now=$(date '+%s'); age=; [[ $stamp =~ ^[0-9]+$ ]] && age=$((now-stamp));
  if [[ ! $age =~ ^[0-9]+$ ]]; then lock_mtime=$(stat -f '%m' "$LOCK" 2>/dev/null || stat -c '%Y' "$LOCK" 2>/dev/null || echo "$now"); age=$((now-lock_mtime)); fi
  alive=0; [[ $pid =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null && alive=1
  if ((alive==0 || age>14400)); then log "stale lock takeover pid=${pid:-?} age=$age"; rm -rf "$LOCK"; mkdir "$LOCK" || exit 1; else log "live lock held pid=$pid age=$age"; exit 0; fi
fi
printf '%s %s\n' "$$" "$(date '+%s')" > "$LOCK/owner"; trap 'rm -rf "$LOCK"' EXIT
(($#)) || { log 'usage: sync_to_linux.sh <tick|inbox|small|volsnap|dbdump>...'; exit 2; }
run_timeout(){ perl -e 'my $t=shift; my $p=fork(); die unless defined $p; if(!$p){exec @ARGV;exit 127} $SIG{ALRM}=sub{kill "TERM",$p; sleep 1; kill "KILL",$p; waitpid($p,0); exit 124}; alarm $t; waitpid($p,0); alarm 0; exit(($? & 127)?128+($? & 127):$?>>8)' "$@"; }
json_escape(){ local value=$1 nl; nl='
'; value=$(printf '%s' "$value" | sed 's/\\/\\\\/g;s/"/\\"/g'); value=${value//"$nl"/\\n}; printf '%s' "$value"; }
alert(){ local reason=$1 message=$2 now last escaped; local af="$STATE_DIR/alert-$reason"; if [ -f "$HOME/.config/ochestration/alert.env" ]; then . "$HOME/.config/ochestration/alert.env"; fi; now=$(date '+%s'); last=$(cat "$af" 2>/dev/null || echo 0); if [[ $last =~ ^[0-9]+$ ]] && ((now-last<21600)); then log "ALERT suppressed reason=$reason"; return 0; fi; printf '%s\n' "$now" > "$af.tmp" && mv -f "$af.tmp" "$af"; log "ALERT $message"; if [ -n "${SLACK_WEBHOOK_URL:-}" ]; then escaped=$(json_escape "$message"); "${CURL_BIN:-curl}" -m 10 -fsS -H 'Content-Type: application/json' --data "{\"text\":\"$escaped\"}" "$SLACK_WEBHOOK_URL" >/dev/null 2>&1 || true; else "${OSASCRIPT_BIN:-osascript}" -e "display notification \"$message\" with title \"Ochestration migration\"" >/dev/null 2>&1 || true; fi; }
state_write(){ local f=$1 tmp="$1.tmp.$$"; cat > "$tmp"; mv -f "$tmp" "$f"; }
queue_add(){ local jobdir=$1 path=$2; [ -n "$path" ] || return; local q="$jobdir/retry.list" t="$jobdir/retry.tmp.$$" found=0 oldp oldn; : > "$t"; if [ -f "$q" ]; then while IFS=$'\t' read -r oldp oldn; do [ -n "$oldp" ] || continue; if [ "$oldp" = "$path" ]; then oldn=$((oldn+1)); found=1; fi; printf '%s\t%s\n' "$oldp" "$oldn" >> "$t"; done < "$q"; fi; [ "$found" = 1 ] || printf '%s\t1\n' "$path" >> "$t"; mv -f "$t" "$q"; }
record_failures(){ local jd=$1 job=$2 src=$3 errfile=$4 seen=$5 line path attempts; while IFS= read -r line; do case $line in 'rsync error:'*|'rsync: connection'*) continue;; esac; case $line in *failed*|*error*|*vanished*) path=$(printf '%s\n' "$line" | sed -n 's/.*"\([^"]*\)".*/\1/p'); [ -n "$path" ] || path=${line##* }; case $path in "$src"/*) path=${path#"$src"/};; esac; [ -e "$src/$path" ] || continue; if grep -Fqx -- "$path" "$seen"; then continue; fi; printf '%s\n' "$path" >> "$seen"; queue_add "$jd" "$path"; attempts=$(awk -F '\t' -v p="$path" '$1==p {print $2}' "$jd/retry.list"); if [[ $attempts =~ ^[0-9]+$ ]] && ((attempts>=5)); then alert "path-$job-$(printf '%s' "$path" | cksum | awk '{print $1}')" "Migration path failed at least five times in $job: $path"; fi;; esac; done < "$errfile"; }
prune_queue(){ local jd=$1 src=$2 q="$1/retry.list" t="$1/retry.tmp.$$" p n; [ -f "$q" ] || return 0; : > "$t"; while IFS=$'\t' read -r p n; do [ -n "$p" ] && [ -e "$src/$p" ] && printf '%s\t%s\n' "$p" "$n" >> "$t"; done < "$q"; [ -s "$t" ] && mv -f "$t" "$q" || { rm -f "$t" "$q"; }; }
do_rsync(){ local limit=$1 out="$STATE_DIR/rsync.stdout.$$" rc=0 n b; shift; run_timeout "$limit" "$RSYNC_BIN" --stats "$@" >"$out" 2>"$stderr" || rc=$?; cat "$out" >>"$LOG"; n=$(sed -n 's/^Number of regular files transferred: *//p' "$out" | tail -n 1); b=$(sed -n 's/^Total transferred file size: *\([0-9][0-9]*\) bytes.*/\1/p' "$out" | tail -n 1); [[ $n =~ ^[0-9]+$ ]] || n=0; [[ $b =~ ^[0-9]+$ ]] || b=0; sent=$((sent+n)); bytes=$((bytes+b)); rm -f "$out"; return "$rc"; }
VOLS='ochestration_trading_momentum_rotation_state ochestration_trading_control ochestration_mysql_data ochestration_n8n_data ochestration_trading_kr_rotation_state ochestration_trading_us_rotation_state ochestration_trading_paper_state ochestration-trading_trading_coin_swing6_state ochestration_trading_tick_state ochestration_trading_kr_swing_state ochestration_trading_us_swing_state ochestration_trading_trx_swing_state'
job_run(){ local job=$1 jd="$STATE_DIR/jobs/$1" src dst rc=0 stderr="$STATE_DIR/rsync.err.$$"; mkdir -p "$jd"; case $job in tick) src="$ROOT/trading-tick-archive"; dst='linuxserver:CODE/Ochestration/trading-tick-archive/';; inbox) src="$ROOT/inbox"; dst='linuxserver:CODE/Ochestration/inbox/';; small) src="$ROOT"; dst='linuxserver:CODE/Ochestration/';; volsnap|dbdump) src=; dst=;; *) log "invalid job $job"; return 2;; esac
  local start sent bytes failed_this_run; failed_this_run="$jd/failed-this-run.$$"; : > "$failed_this_run"; start=$(date '+%Y-%m-%dT%H:%M:%S%z'); sent=0; bytes=0
  if [[ $job == volsnap ]]; then local stage="$STATE_DIR/staging/volumes" ts vol tarf; mkdir -p "$stage"; ts=$(date '+%Y%m%dT%H%M%S'); for vol in $VOLS; do tarf="$stage/${vol}-${ts}.tar"; if run_timeout 1800 "$DOCKER_BIN" run --rm -v "$vol:/v:ro" alpine tar -C /v -cf - . > "$tarf" 2>>"$LOG" && shasum -a 256 "$tarf" > "$tarf.sha256"; then if run_timeout 1800 "$RSYNC_BIN" -a --timeout=120 "$tarf" "$tarf.sha256" linuxserver:migrate-staging/volumes/ >>"$LOG" 2>"$stderr"; then sent=$((sent+2)); bytes=$((bytes+$(wc -c < "$tarf")+$(wc -c < "$tarf.sha256"))); else rc=1; fi; else rc=1; fi; done; for vol in $VOLS; do ls -1t "$stage/$vol-"*.tar 2>/dev/null | awk 'NR>3 {print}' | while IFS= read -r f; do rm -f "$f" "$f.sha256"; done; done; run_timeout 20 "$SSH_BIN" -o BatchMode=yes -o ConnectTimeout=10 linuxserver bash -s -- $VOLS >>"$LOG" 2>&1 <<'REMOTE' || true
for vol in "$@"; do find "$HOME/migrate-staging/volumes" -type f -name "$vol-*.tar" -printf "%T@ %p\n" 2>/dev/null | sort -nr | awk 'NR>3 {print $2}' | while IFS= read -r f; do rm -f "$f" "$f.sha256"; done; done
REMOTE
  elif [[ $job == dbdump ]]; then local stage="$STATE_DIR/staging/db" ts file; mkdir -p "$stage"; ts=$(date '+%Y%m%dT%H%M%S'); file="$stage/mysql-app-${ts}.sql.gz"; if run_timeout 1800 "$DOCKER_BIN" exec ochestration-mysql-1 sh -c 'exec mysqldump -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" --single-transaction --routines --triggers "$MYSQL_DATABASE"' 2>>"$LOG" | gzip > "$file"; then if gzip -t "$file" && gzip -cd "$file" | tail -n 1 | grep -q 'Dump completed'; then shasum -a 256 "$file" > "$file.sha256"; if run_timeout 1800 "$RSYNC_BIN" -a --timeout=120 "$file" "$file.sha256" linuxserver:migrate-staging/db/ >>"$LOG" 2>"$stderr"; then sent=2; bytes=$(($(wc -c < "$file")+$(wc -c < "$file.sha256"))); else rc=1; fi; else rc=1; fi; else rc=1; fi; ls -1t "$stage"/mysql-app-*.sql.gz 2>/dev/null | awk 'NR>3 {print}' | while IFS= read -r f; do rm -f "$f" "$f.sha256"; done; run_timeout 20 "$SSH_BIN" -o BatchMode=yes -o ConnectTimeout=10 linuxserver bash -s >>"$LOG" 2>&1 <<'REMOTE' || true
find "$HOME/migrate-staging/db" -type f -name "mysql-app-*.sql.gz" -printf "%T@ %p\n" 2>/dev/null | sort -nr | awk 'NR>3 {print $2}' | while IFS= read -r f; do rm -f "$f" "$f.sha256"; done
REMOTE
  else
    if [ ! -d "$src" ]; then log "missing source $src"; rc=1; else
      prune_queue "$jd" "$src"; if [ -s "$jd/retry.list" ]; then cut -f1 "$jd/retry.list" > "$jd/retry.paths"; local retry_rc=0; do_rsync 3600 -a --partial-dir=.rsync-partial --timeout=120 --files-from="$jd/retry.paths" "$src"/ "$dst" || retry_rc=$?; if ((retry_rc)); then rc=1; record_failures "$jd" "$job" "$src" "$stderr" "$failed_this_run"; fi; fi
      local paths='.' rel one_rc path line attempts; if [[ $job == small ]]; then paths='obsidian backups .kis-cache backup-obsidian-migration trading/.rs_cache'; fi
      for rel in $paths; do
        if [[ $rel == . ]]; then one_rc=0; do_rsync 14400 -a --partial-dir=.rsync-partial --timeout=120 --itemize-changes --exclude=.DS_Store --exclude='._*' "$src"/ "$dst" >>"$LOG" || { one_rc=$?; rc=1; }
        else one_rc=0; do_rsync 7200 -a --partial-dir=.rsync-partial --timeout=120 --itemize-changes --exclude=.DS_Store --exclude='._*' "$src/$rel"/ "linuxserver:CODE/Ochestration/$rel/" >>"$LOG" || { one_rc=$?; rc=1; }
        fi
        if ((one_rc)); then record_failures "$jd" "$job" "$src" "$stderr" "$failed_this_run"; fi
      done
    fi
  fi
  local oldfail=0; [ -f "$jd/state.json" ] && oldfail=$(sed -n 's/.*"consecutive_failures":\([0-9]*\).*/\1/p' "$jd/state.json"); [[ $oldfail =~ ^[0-9]+$ ]] || oldfail=0
  local qcount=0; [ -f "$jd/retry.list" ] && qcount=$(wc -l < "$jd/retry.list")
  if ((rc==0)); then [ -f "$jd/retry.list" ] && : > "$jd/retry.list"; [ -f "$jd/retry.list" ] && rm -f "$jd/retry.list"; [ "$oldfail" -gt 0 ] && alert "recovery-$job" "Recovered: migration job $job succeeded"; rm -f "$jd/alert.failure"; oldfail=0; qcount=0; else oldfail=$((oldfail+1)); if ((oldfail>=3)); then [ -f "$jd/alert.failure" ] || { alert "job-$job" "Migration job $job failed $oldfail consecutive times"; date '+%s' > "$jd/alert.failure"; }; fi; fi
  state_write "$jd/state.json" <<JSON
{"last_run":"$start","last_ok":"$([ $rc -eq 0 ] && echo "$start" || echo '')","consecutive_failures":$oldfail,"queued":$qcount,"files_sent":$sent,"bytes_sent":$bytes}
JSON
  log "job=$job rc=$rc queued=$qcount"; rm -f "$stderr" "$failed_this_run"; return "$rc"
}
if ! run_timeout 15 "$SSH_BIN" -o BatchMode=yes -o ConnectTimeout=10 linuxserver true || ! run_timeout 15 "$SSH_BIN" -o BatchMode=yes -o ConnectTimeout=10 linuxserver "df -Pk . | awk 'NR==2 {if (\$4>62914560) ok=1} END {if (!ok) exit 1}'"; then log 'preflight failed'; exit 1; fi
status=0; for job in "$@"; do job_run "$job" || status=1; done; exit "$status"
