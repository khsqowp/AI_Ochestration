#!/bin/bash
set -u
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd); . "$HERE/notify.sh"
NAS_MOUNT=${NAS_MOUNT:-/mnt/nas}; NAS_TRADE=${NAS_TRADE:-$NAS_MOUNT/Trade}; STATE_DIR=${STATE_DIR:-/var/lib/ochestration/nas-health}; mkdir -p "$STATE_DIR"
LOG=${NAS_HEALTH_LOG:-$STATE_DIR/nas-health.log}; [ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 1048576 ] && mv "$LOG" "$LOG.1"
log(){ printf '[%s] %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*" >> "$LOG"; }
fail=$(cat "$STATE_DIR/failures" 2>/dev/null || echo 0); reason=''
if ! timeout -k 5 10 findmnt -t nfs,nfs4 "$NAS_MOUNT" >/dev/null 2>&1; then reason='NFS mount missing'
elif ! timeout -k 5 10 test -f "$NAS_TRADE/.nas-mounted"; then reason='NAS sentinel missing'
elif ! timeout -k 5 10 stat "$NAS_TRADE" >/dev/null 2>&1; then reason='NAS stat failed'
else
  timeout -k 5 10 mkdir -p "$NAS_TRADE/.health" >/dev/null 2>&1 || reason='NAS probe directory unavailable'
  if [ -z "$reason" ]; then probe="$NAS_TRADE/.health/probe.$$"; if ! timeout -k 5 10 dd if=/dev/zero of="$probe" bs=1024 count=1 conv=fsync >/dev/null 2>&1 || ! timeout -k 5 10 cmp -s "$probe" <(dd if=/dev/zero bs=1024 count=1 2>/dev/null) || ! timeout -k 5 10 rm -f "$probe"; then reason='NAS write/read/delete probe failed'; timeout -k 5 10 rm -f "$probe" >/dev/null 2>&1 || true; fi; fi
fi
if [ -n "$reason" ]; then fail=$((fail+1)); printf '%s\n' "$fail" > "$STATE_DIR/failures.tmp"; mv -f "$STATE_DIR/failures.tmp" "$STATE_DIR/failures"; log "FAIL $fail: $reason"; if ((fail>=2)); then notify nas-health 'NAS mount unhealthy' "$reason ($fail consecutive failures)"; fi; if ((fail>=5)) && [ "$(id -u)" -eq 0 ]; then timeout -k 5 15 umount -f -l "$NAS_MOUNT" >/dev/null 2>&1 || true; timeout -k 5 30 systemctl restart mnt-nas.automount >/dev/null 2>&1 || true; if timeout -k 5 10 findmnt -t nfs,nfs4 "$NAS_MOUNT" >/dev/null 2>&1 && [ -f "$NAS_TRADE/.nas-mounted" ] && timeout -k 5 10 stat "$NAS_TRADE" >/dev/null 2>&1; then log 'remount recovery succeeded'; notify_recover nas-health 'NAS mount recovered' 'remount after five failures succeeded'; printf '0\n' > "$STATE_DIR/failures"; else log 'remount recovery failed'; notify nas-health-remount 'NAS remount failed' 'automatic remount did not restore NAS'; fi; fi; exit 1
fi
if ((fail>0)); then log 'RECOVERED'; notify_recover nas-health 'NAS mount recovered' 'mount and probe checks passed'; fi
printf '0\n' > "$STATE_DIR/failures.tmp"; mv -f "$STATE_DIR/failures.tmp" "$STATE_DIR/failures"; log 'OK'; exit 0
