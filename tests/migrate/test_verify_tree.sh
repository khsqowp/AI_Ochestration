#!/bin/bash
set -euo pipefail
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
cat > "$T/rsync" <<'STUB'
#!/bin/bash
[ "${RSYNC_OUTPUT:-}" = empty ] || printf '%s\n' "$RSYNC_OUTPUT"
exit 0
STUB
chmod +x "$T/rsync"
RSYNC_BIN="$T/rsync" RSYNC_OUTPUT=empty bash scripts/migrate/verify_tree.sh a b
if RSYNC_BIN="$T/rsync" RSYNC_OUTPUT='>f+++++++++ changed' bash scripts/migrate/verify_tree.sh a b; then echo 'verify_tree non-empty expected failure' >&2; exit 1; fi
echo 'verify_tree: PASS'
