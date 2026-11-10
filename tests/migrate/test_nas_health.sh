#!/bin/bash
set -euo pipefail
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/home/config/ochestration" "$T/nas/Trade"
cat > "$T/bin/findmnt" <<'STUB'
#!/bin/bash
exit "${FINDMNT_RC:-0}"
STUB
cat > "$T/bin/timeout" <<'STUB'
#!/bin/bash
[ "$1" = -k ] && shift 2; shift; exec "$@"
STUB
cat > "$T/bin/curl" <<'STUB'
#!/bin/bash
exit 0
STUB
chmod +x "$T/bin"/*
export PATH="$T/bin:$PATH" HOME="$T/home" NAS_MOUNT="$T/nas" NAS_TRADE="$T/nas/Trade" STATE_DIR="$T/state" NOTIFY_STATE_DIR="$T/notify" NOTIFY_LOG="$T/alerts.log"
if bash scripts/linux/nas_health.sh; then echo 'missing sentinel expected failure'; exit 1; fi
FINDMNT_RC=1 bash scripts/linux/nas_health.sh && { echo 'second failure expected'; exit 1; }
grep -q 'ALERT \[nas-health\]' "$T/alerts.log"
touch "$T/nas/Trade/.nas-mounted"; printf '#!/bin/bash\nexit 0\n' > "$T/bin/findmnt"; chmod +x "$T/bin/findmnt"
bash scripts/linux/nas_health.sh; grep -q 'RECOVERY \[nas-health\]' "$T/alerts.log"
echo 'nas_health failure/recovery: PASS'
