#!/bin/bash
set -u

# launchd does not inherit an interactive shell's PATH.
PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
export PATH

CONTAINER=${MOMENTUM_CONTAINER:-ochestration-trading-trading-momentum-rotation-1}
FALLBACK_HOME=${HOME:-$(/usr/bin/dscl . -read "/Users/$(/usr/bin/id -un)" NFSHomeDirectory 2>/dev/null | /usr/bin/awk '{print $2}')}
[[ -n $FALLBACK_HOME ]] || FALLBACK_HOME=$(/bin/sh -c 'eval echo ~' 2>/dev/null)
[[ -n $FALLBACK_HOME ]] || FALLBACK_HOME=/var/tmp
STATE_DIR=${WATCHDOG_STATE_DIR:-"$FALLBACK_HOME/Library/Application Support/ochestration-watchdog"}
DRY_RUN=0
DRY_RUN_STATE_SOURCE=""
while (($#)); do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --dry-run-from-state|--read-state)
      (($# >= 2)) || { printf 'Usage: %s [--dry-run] [--dry-run-from-state DIR] [--check-once]\n' "$0" >&2; exit 2; }
      DRY_RUN=1; DRY_RUN_STATE_SOURCE=$2; shift ;;
    --check-once) : ;;
    -h|--help) printf 'Usage: %s [--dry-run] [--dry-run-from-state DIR] [--check-once]\n' "$0"; exit 0 ;;
    *) printf 'Usage: %s [--dry-run] [--dry-run-from-state DIR] [--check-once]\n' "$0" >&2; exit 2 ;;
  esac
  shift
done

if ((DRY_RUN)); then
  STATE_DIR=$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/ochestration-watchdog-dryrun.XXXXXX") || exit 1
  if [[ -n $DRY_RUN_STATE_SOURCE ]]; then
    [[ -d $DRY_RUN_STATE_SOURCE ]] || { printf 'State directory not found: %s\n' "$DRY_RUN_STATE_SOURCE" >&2; /bin/rm -rf "$STATE_DIR"; exit 2; }
    for state_name in engine_failure_count engine_failure_since_epoch restart_epochs last_restart_epoch last_swap_alert_epoch last_run_epoch previous_restart_count previous_oom_killed heartbeat_seen heartbeat_notice_sent PAUSE; do
      [[ -f $DRY_RUN_STATE_SOURCE/$state_name ]] && /bin/cp -p "$DRY_RUN_STATE_SOURCE/$state_name" "$STATE_DIR/$state_name"
    done
  fi
fi
LOCK_DIR=""
cleanup() {
  [[ -n $LOCK_DIR ]] && /bin/rm -rf "$LOCK_DIR"
  if ((DRY_RUN)); then
    [[ -r $LOG_FILE ]] && /bin/cat "$LOG_FILE" >&2
    /bin/rm -rf "$STATE_DIR"
  fi
}
trap cleanup EXIT
LOG_FILE=${WATCHDOG_LOG_FILE:-"$STATE_DIR/watchdog.log"}
((DRY_RUN)) && LOG_FILE="$STATE_DIR/watchdog.log"
run_timeout() {
  local seconds=$1
  shift
  "${WATCHDOG_PERL_BIN:-/usr/bin/perl}" -e '
    use strict; use warnings;
    my $limit = shift @ARGV;
    my $pid = fork();
    defined $pid or exit 125;
    if (!$pid) { setpgrp(0, 0) or exit 125; exec @ARGV; exit 127; }
    $SIG{ALRM} = sub { kill "TERM", -$pid; select undef, undef, undef, 0.5; kill "KILL", -$pid; waitpid($pid, 0); exit 124; };
    alarm $limit; waitpid($pid, 0); alarm 0;
    my $status = $?;
    exit(($status & 127) ? 128 + ($status & 127) : ($status >> 8));
  ' "$seconds" "$@"
}
log() {
  local ts
  ts=$(run_timeout 2 "${WATCHDOG_DATE_BIN:-/bin/date}" -u '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null) || ts=unknown-time
  if [[ -f $LOG_FILE ]] && (( $(/usr/bin/stat -f %z "$LOG_FILE" 2>/dev/null || printf 0) > 1048576 )); then
    /bin/mv -f "$LOG_FILE" "$LOG_FILE.1"
  fi
  printf '%s %s\n' "$ts" "$*" >> "$LOG_FILE"
}
write_state() {
  local target=$1 value=$2 temporary="$1.tmp.$$"
  printf '%s\n' "$value" > "$temporary" && /bin/mv -f "$temporary" "$target"
}
refresh_lock() {
  local temporary="$LOCK_DIR/owner.tmp.$$" stamp
  stamp=$(/usr/bin/perl -e 'print time')
  printf '%s %s\n' "$$" "$stamp" > "$temporary" && /bin/mv -f "$temporary" "$LOCK_DIR/owner"
}
notify() {
  local message=$1
  if ((DRY_RUN)); then log "DRY-RUN notification: $message"; return; fi
  run_timeout 8 "${WATCHDOG_OSASCRIPT_BIN:-/usr/bin/osascript}" -e "display notification \"$message\" with title \"Ochestration Docker watchdog\"" >/dev/null 2>&1 || true
}

DOCKER_BIN=${WATCHDOG_DOCKER_BIN:-$(command -v docker 2>/dev/null || true)}
if [[ -z $DOCKER_BIN || ! -x $DOCKER_BIN ]]; then
  run_timeout 5 /bin/mkdir -p "$STATE_DIR" 2>/dev/null || true
  log "CONFIG ERROR docker CLI not found or not executable in PATH=$PATH; Docker Desktop will not be restarted"
  notify 'Watchdog configuration error: docker CLI not found'
  exit 0
fi

run_timeout 5 /bin/mkdir -p "$STATE_DIR" || exit 1
candidate_lock_dir="$STATE_DIR/lock"
if ! /bin/mkdir "$candidate_lock_dir" 2>/dev/null; then
  lock_pid= lock_started=0
  if [[ -r "$candidate_lock_dir/owner" ]]; then read -r lock_pid lock_started < "$candidate_lock_dir/owner" || true; fi
  now=${WATCHDOG_NOW_EPOCH:-$(/usr/bin/perl -e 'print time')}
  lock_age=0; [[ $lock_started =~ ^[0-9]+$ ]] && lock_age=$((now - lock_started))
  if [[ ! $lock_pid =~ ^[0-9]+$ ]] || ! /bin/kill -0 "$lock_pid" 2>/dev/null || ((lock_age > 300)); then
    log "WARN taking over stale lock pid=${lock_pid:-unknown} age=${lock_age}s"
    /bin/rm -rf "$candidate_lock_dir"
    /bin/mkdir "$candidate_lock_dir" 2>/dev/null || { LOCK_DIR=""; log 'SKIP lock takeover race'; exit 0; }
  else
    log "SKIP watchdog already running pid=$lock_pid age=${lock_age}s"
    exit 0
  fi
fi
LOCK_DIR="$candidate_lock_dir"
now=${WATCHDOG_NOW_EPOCH:-$(/usr/bin/perl -e 'print time')}
printf '%s %s\n' "$$" "$now" > "$LOCK_DIR/owner"
trap cleanup EXIT

failure_file="$STATE_DIR/engine_failure_count"
failure_since_file="$STATE_DIR/engine_failure_since_epoch"
restart_file="$STATE_DIR/restart_epochs"
last_restart_file="$STATE_DIR/last_restart_epoch"
last_swap_alert_file="$STATE_DIR/last_swap_alert_epoch"
last_run_file="$STATE_DIR/last_run_epoch"
read_integer() { local out=0; [[ -r $1 ]] && read -r out < "$1" || true; [[ $out =~ ^[0-9]+$ ]] || out=0; printf '%s' "$out"; }
failures=$(read_integer "$failure_file")
failure_since=$(read_integer "$failure_since_file")
last_run=$(read_integer "$last_run_file")
skip_cycle=0
if ((last_run > 0 && now - last_run > 360)); then
  failures=0; failure_since=0; skip_cycle=1
  write_state "$failure_file" 0
  write_state "$failure_since_file" 0
  log 'WAKE grace: previous run gap exceeded 3x interval; counters reset and this cycle skipped'
fi
write_state "$last_run_file" "$now"

# Only a failed/timed-out engine query can increment this counter or restart Docker.
if ((skip_cycle)); then
  log 'WAKE grace cycle skipped; no engine restart decision'
  exit 0
fi
if ! run_timeout 30 "$DOCKER_BIN" info >/dev/null 2>&1; then
  if ((failures == 0 || failure_since == 0 || now - failure_since > 900)); then failures=0; failure_since=$now; fi
  failures=$((failures + 1))
  log "ENGINE DOWN consecutive=$failures; docker info failed or timed out"
  notify 'Docker engine is unavailable'
  write_state "$failure_file" "$failures"
  write_state "$failure_since_file" "$failure_since"
  if ((failures >= 3 && now - failure_since >= 360)); then
    last_restart=$(read_integer "$last_restart_file")
    recent_count=0
    if [[ -r $restart_file ]]; then
      while IFS= read -r stamp; do
        [[ $stamp =~ ^[0-9]+$ ]] && ((now - stamp < 86400)) && recent_count=$((recent_count + 1))
      done < "$restart_file"
    fi
    if ((now - last_restart < 1800)); then
      log 'RESTART withheld: 30-minute cooldown active'
    elif ((recent_count >= 2)); then
      log 'RESTART withheld: maximum two restarts in rolling 24 hours reached'
    elif [[ -e "$STATE_DIR/PAUSE" ]]; then
      log 'RESTART withheld: PAUSE file present; alert only'
    elif ! "${WATCHDOG_PGREP_BIN:-/usr/bin/pgrep}" -x 'Docker Desktop' >/dev/null 2>&1 && ! "${WATCHDOG_PGREP_BIN:-/usr/bin/pgrep}" -x 'Docker' >/dev/null 2>&1; then
      log 'RESTART withheld: Docker Desktop app is not running; alert only'
      notify 'Docker engine unavailable and Docker Desktop is not running; automatic open suppressed'
    elif ((DRY_RUN)); then
      log 'DRY-RUN would restart Docker Desktop; restart disabled'
      notify 'DRY-RUN would restart Docker Desktop after confirmed process exit'
    else
      # Record every attempt before quit so aborts and killed runs consume cooldown/quota.
      restart_tmp="$restart_file.tmp.$$"
      : > "$restart_tmp"
      if [[ -r $restart_file ]]; then
        while IFS= read -r stamp; do
          [[ $stamp =~ ^[0-9]+$ ]] && ((now - stamp < 86400)) && printf '%s\n' "$stamp" >> "$restart_tmp"
        done < "$restart_file"
      fi
      printf '%s\n' "$now" >> "$restart_tmp"
      /bin/mv -f "$restart_tmp" "$restart_file"
      write_state "$last_restart_file" "$now"
      log 'ACTION restarting Docker Desktop after 3 consecutive engine failures'
      run_timeout 10 "${WATCHDOG_OSASCRIPT_BIN:-/usr/bin/osascript}" -e 'quit app "Docker"' >/dev/null 2>&1 || true
      process_gone=0
      for _ in {1..30}; do
        if ! "${WATCHDOG_PGREP_BIN:-/usr/bin/pgrep}" -x 'Docker Desktop' >/dev/null 2>&1 && ! "${WATCHDOG_PGREP_BIN:-/usr/bin/pgrep}" -x 'Docker' >/dev/null 2>&1; then process_gone=1; break; fi
        refresh_lock
        "${WATCHDOG_SLEEP_BIN:-/bin/sleep}" 2
      done
      if ((!process_gone)); then
        log 'ERROR Docker process did not exit within 60s; restart aborted and attempt counted'
      else
        if run_timeout 10 "${WATCHDOG_OPEN_BIN:-/usr/bin/open}" -a Docker >/dev/null 2>&1; then log 'Docker Desktop open command accepted'; else log 'ERROR Docker Desktop open command failed'; fi
        engine_back=0
        for _ in {1..60}; do
          if run_timeout 10 "$DOCKER_BIN" info >/dev/null 2>&1; then engine_back=1; break; fi
          refresh_lock
          "${WATCHDOG_SLEEP_BIN:-/bin/sleep}" 2
        done
        if ((engine_back)); then
          log 'OK Docker engine returned after Desktop restart'
          write_state "$failure_file" 0
          write_state "$failure_since_file" 0
        else
          log 'ERROR Docker engine did not return within 120s after Desktop restart'
        fi
      fi
    fi
  fi
  exit 0
fi

# An available engine resets the engine outage streak. Bot health never triggers a Desktop restart.
write_state "$failure_file" 0
write_state "$failure_since_file" 0
PAUSE_FILE="$STATE_DIR/PAUSE"
if [[ -e $PAUSE_FILE ]]; then
  log 'PAUSED momentum checks and bot-related alerts/actions disabled; engine monitoring remains active'
else
  bot_state=''
  inspect_out=''
  if ! inspect_out=$(run_timeout 10 "$DOCKER_BIN" inspect --format '{{.RestartCount}} {{.State.OOMKilled}} {{.State.Running}}' "$CONTAINER" 2>/dev/null); then
    bot_state='bot inspect unavailable'
  else
    read -r restart_count oom_killed running <<< "$inspect_out"
    previous=$(read_integer "$STATE_DIR/previous_restart_count")
    if [[ $restart_count =~ ^[0-9]+$ ]]; then
      if ((restart_count > previous)); then bot_state="ALERT momentum RestartCount increased ($previous->$restart_count)"; fi
      write_state "$STATE_DIR/previous_restart_count" "$restart_count"
    fi
    previous_oom=$(cat "$STATE_DIR/previous_oom_killed" 2>/dev/null || printf false)
    if [[ $oom_killed == true && $previous_oom != true ]]; then bot_state='ALERT momentum container reports OOMKilled'; fi
    [[ $oom_killed == true || $oom_killed == false ]] && write_state "$STATE_DIR/previous_oom_killed" "$oom_killed"
    heartbeat_seen="$STATE_DIR/heartbeat_seen"
    if [[ $running != true ]]; then
      bot_state='ALERT momentum container is not running'
    elif [[ $bot_state == '' ]]; then
      hb=$(run_timeout 10 "$DOCKER_BIN" exec "$CONTAINER" python -c \
        'import json,time,os; p="/app/data/heartbeat.json"; print(("MISSING " if not os.path.exists(p) else str(json.load(open(p)).get("epoch", "INVALID"))+" ")+str(time.time()))' 2>/dev/null) || hb='EXEC_ERROR'
      read -r heartbeat_epoch container_now <<< "$hb"
      if [[ $heartbeat_epoch == MISSING ]]; then
        if [[ -e $heartbeat_seen ]]; then
          bot_state='ALERT momentum heartbeat disappeared after support was detected'
        else
          if [[ ! -e "$STATE_DIR/heartbeat_notice_sent" ]]; then log 'NOTICE heartbeat not-yet-supported (image has no heartbeat file yet)'; notify 'Momentum heartbeat is not yet supported by the running image'; : > "$STATE_DIR/heartbeat_notice_sent"; fi
          bot_state='not-yet-supported'
        fi
      elif [[ $heartbeat_epoch == EXEC_ERROR || ! $heartbeat_epoch =~ ^[0-9]+([.][0-9]+)?$ || ! $container_now =~ ^[0-9]+([.][0-9]+)?$ ]]; then
        bot_state='ALERT momentum heartbeat unavailable or invalid'
      else
        : > "$heartbeat_seen"
        age=$(awk -v n="$container_now" -v h="$heartbeat_epoch" 'BEGIN {printf "%d", n-h}')
        if ((age < 0 || age >= 600)); then bot_state="ALERT momentum heartbeat stale (${age}s)"; fi
      fi
    fi
  fi
  if [[ -n $bot_state && $bot_state != not-yet-supported ]]; then
    log "$bot_state"
    notify "$bot_state"
  else
    log "OK engine available; momentum=${bot_state:-healthy}"
  fi
fi

swap_line=$(run_timeout 3 "${WATCHDOG_SYSCTL_BIN:-/usr/sbin/sysctl}" vm.swapusage 2>/dev/null) || swap_line=''
if [[ $swap_line =~ total[[:space:]]*=[[:space:]]*([0-9]+([.][0-9]+)?)(M|G).*used[[:space:]]*=[[:space:]]*([0-9]+([.][0-9]+)?)(M|G) ]]; then
  total_value=${BASH_REMATCH[1]}; total_unit=${BASH_REMATCH[3]}
  swap_value=${BASH_REMATCH[4]}; swap_unit=${BASH_REMATCH[6]}
  swap_mb=$(/usr/bin/perl -e 'my ($n,$u)=@ARGV; print int($n*($u eq "G" ? 1024 : 1))' "$swap_value" "$swap_unit")
  total_mb=$(/usr/bin/perl -e 'my ($n,$u)=@ARGV; print int($n*($u eq "G" ? 1024 : 1))' "$total_value" "$total_unit")
  if ((swap_mb > 14336 && total_mb > 0 && swap_mb * 100 > total_mb * 95)); then
    last_swap=$(read_integer "$last_swap_alert_file")
    if ((now - last_swap >= 21600)); then log "ALERT host swap used ${swap_value}${swap_unit} (>95% of total and >14GiB); no restart"; notify 'Host swap usage exceeds 95% of total and 14 GiB'; write_state "$last_swap_alert_file" "$now"; fi
  fi
fi
exit 0
