#!/bin/bash
set -euo pipefail
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
HOME="$T/home"; mkdir -p "$HOME"; export HOME NOTIFY_STATE_DIR="$T/state" NOTIFY_LOG="$T/alerts.log" ALERT_SUPPRESS_SECONDS=21600
cat > "$T/curl" <<'STUB'
#!/bin/bash
while [ "$#" -gt 0 ]; do if [ "$1" = --data ]; then printf '%s' "$2" >> "$CURL_PAYLOAD"; shift 2; else shift; fi; done
STUB
chmod +x "$T/curl"; export PATH="$T:$PATH" CURL_PAYLOAD="$T/payload" SLACK_WEBHOOK_URL=https://example.invalid/hook
. scripts/linux/notify.sh
notify key title 'quoted "message"'; python3 -c 'import json,sys; assert json.load(open(sys.argv[1]))["text"] == '\''title: quoted \"message\"'\''' "$CURL_PAYLOAD"
notify key title two
[ "$(grep -c 'ALERT \[key\]' "$NOTIFY_LOG")" -eq 1 ]; notify_recover key title recovered; grep -q RECOVERY "$NOTIFY_LOG"
echo 'notify dedupe: PASS'
