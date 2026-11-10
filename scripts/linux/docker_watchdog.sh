#!/bin/bash
set -u
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd); . "$HERE/notify.sh"
STATE_DIR=${STATE_DIR:-$HOME/.local/state/ochestration/watchdog}; mkdir -p "$STATE_DIR"; LOG=${WATCHDOG_LOG:-$HOME/logs/host/docker-watchdog.log}; mkdir -p "$(dirname "$LOG")"; [ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 1048576 ] && mv "$LOG" "$LOG.1"
log(){ printf '[%s] %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*" >> "$LOG"; }
if ! timeout 10 docker info >/dev/null 2>&1; then log 'Docker engine unavailable'; notify docker-engine 'Docker engine unavailable' 'docker info failed'; exit 1; fi
notify_recover docker-engine 'Docker engine recovered' 'docker info succeeded'
if [ -e "$STATE_DIR/PAUSE" ] || [ -e "$HOME/.local/state/ochestration/PAUSE" ]; then log 'PAUSE active'; exit 0; fi
C=${MOMENTUM_CONTAINER:-ochestration-trading-trading-momentum-rotation-1}; out=$(timeout 10 docker inspect --format '{{.RestartCount}} {{.State.OOMKilled}} {{.State.Running}}' "$C" 2>/dev/null) || { notify momentum-inspect 'Momentum inspection failed' "$C"; exit 1; }; read -r rest oom running <<EOF2
$out
EOF2
prev=$(cat "$STATE_DIR/restart-count" 2>/dev/null || echo 0); if [[ $rest =~ ^[0-9]+$ ]] && ((rest>prev)); then notify momentum-restart 'Momentum restarted' "RestartCount $prev -> $rest"; else notify_recover momentum-restart 'Momentum stable' 'restart count unchanged'; fi; printf '%s\n' "$rest" > "$STATE_DIR/restart-count.tmp"; mv "$STATE_DIR/restart-count.tmp" "$STATE_DIR/restart-count"
if [ "$oom" = true ]; then notify momentum-oom 'Momentum OOMKilled' 'container reports OOMKilled'; else notify_recover momentum-oom 'Momentum memory state recovered' 'OOMKilled is false'; fi
if [ "$running" != true ]; then notify momentum-stopped 'Momentum stopped' 'container is not running'; exit 1; else notify_recover momentum-stopped 'Momentum running' 'container is running'; fi
hb=$(timeout 10 docker exec "$C" python -c 'import json; print(json.load(open("/app/data/heartbeat.json")).get("epoch", "INVALID"))' 2>/dev/null) || hb=INVALID
if [[ $hb =~ ^[0-9]+([.][0-9]+)?$ ]]; then now=$(date +%s); age=$(awk -v n="$now" -v h="$hb" 'BEGIN{printf "%d",n-h}'); if ((age<0 || age>=600)); then notify momentum-heartbeat 'Momentum heartbeat stale' "age=${age}s"; else notify_recover momentum-heartbeat 'Momentum heartbeat recovered' "age=${age}s"; fi; else notify momentum-heartbeat 'Momentum heartbeat invalid' "value=$hb"; fi
usage=$(df -P / | awk 'NR==2 {gsub(/%/,"",$5);print $5}'); if [[ $usage =~ ^[0-9]+$ ]] && ((usage>=80)); then notify root-disk 'Root filesystem high' "usage=${usage}%"; else notify_recover root-disk 'Root filesystem recovered' "usage=${usage:-unknown}%"; fi
log "OK restart=$rest oom=$oom running=$running heartbeat=$hb root=${usage:-unknown}%"
