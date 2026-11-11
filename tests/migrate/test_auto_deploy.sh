#!/bin/bash
set -euo pipefail

SOURCE_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin"

cat > "$T/bin/timeout" <<'STUB'
#!/bin/bash
[ "$1" = -k ] && shift 2
shift
exec "$@"
STUB
cat > "$T/bin/curl" <<'STUB'
#!/bin/bash
exit 0
STUB
cat > "$T/bin/docker" <<'STUB'
#!/bin/bash
printf '%s\n' "$*" >> "$DOCKER_RECORD"
exit "${DOCKER_RC:-0}"
STUB
chmod +x "$T/bin/"*
export PATH="$T/bin:$PATH" SLACK_WEBHOOK_URL=

failures=0
report() {
    if [ "$1" -eq 0 ]; then
        printf 'auto_deploy %s: PASS\n' "$2"
    else
        printf 'auto_deploy %s: FAIL\n' "$2"
        failures=$((failures + 1))
    fi
}

setup_case() {
    CASE_DIR=$T/$1
    mkdir -p "$CASE_DIR/home" "$CASE_DIR/seed/scripts/linux"
    cp "$SOURCE_ROOT/scripts/linux/auto_deploy.sh" "$CASE_DIR/seed/scripts/linux/"
    cp "$SOURCE_ROOT/scripts/linux/notify.sh" "$CASE_DIR/seed/scripts/linux/"
    chmod +x "$CASE_DIR/seed/scripts/linux/auto_deploy.sh"
    git init --bare -q "$CASE_DIR/origin.git"
    git init -q -b main "$CASE_DIR/seed"
    git -C "$CASE_DIR/seed" config user.name Test
    git -C "$CASE_DIR/seed" config user.email test@example.invalid
    printf 'initial\n' > "$CASE_DIR/seed/README.md"
    git -C "$CASE_DIR/seed" add .
    git -C "$CASE_DIR/seed" commit -qm initial
    git -C "$CASE_DIR/seed" remote add origin "$CASE_DIR/origin.git"
    git -C "$CASE_DIR/seed" push -q -u origin main
    git clone -q -b main "$CASE_DIR/origin.git" "$CASE_DIR/clone"
    git -C "$CASE_DIR/clone" config user.name Test
    git -C "$CASE_DIR/clone" config user.email test@example.invalid
    export HOME="$CASE_DIR/home" DEPLOY_ROOT="$CASE_DIR/clone"
    export DEPLOY_STATE_DIR="$CASE_DIR/state" DEPLOY_LOG="$CASE_DIR/home/logs/auto-deploy.log"
    export NOTIFY_STATE_DIR="$CASE_DIR/notify" NOTIFY_LOG="$CASE_DIR/home/logs/alerts.log"
    export DOCKER_RECORD="$CASE_DIR/docker.log"
    unset DOCKER_RC || true
}

new_commit() {
    local case_dir=$1 file=$2 content=$3
    mkdir -p "$(dirname "$CASE_DIR/seed/$file")"
    printf '%s\n' "$content" > "$CASE_DIR/seed/$file"
    git -C "$CASE_DIR/seed" add "$file"
    git -C "$CASE_DIR/seed" commit -qm "change $file"
    git -C "$CASE_DIR/seed" push -q origin main
}

setup_case no_change
bash "$DEPLOY_ROOT/scripts/linux/auto_deploy.sh"
[ ! -s "$DOCKER_RECORD" ]
report "$?" 'no new commit'

setup_case readme
new_commit "$CASE_DIR" README.md changed
bash "$DEPLOY_ROOT/scripts/linux/auto_deploy.sh"
rc=0
[ "$(git -C "$DEPLOY_ROOT" rev-parse HEAD)" = "$(git -C "$CASE_DIR/seed" rev-parse HEAD)" ] || rc=1
grep -q 'compose .* build' "$DOCKER_RECORD" || rc=1
grep -q 'compose .* up -d --remove-orphans' "$DOCKER_RECORD" || rc=1
! grep -q 'docker-compose.trading.yml' "$DOCKER_RECORD" || rc=1
report "$rc" 'README deploy'

setup_case trading_only
new_commit "$CASE_DIR" trading/x.py 'print(1)'
new_commit "$CASE_DIR" docker-compose.trading.yml 'services: {}'
bash "$DEPLOY_ROOT/scripts/linux/auto_deploy.sh"
rc=0
[ "$(git -C "$DEPLOY_ROOT" rev-parse HEAD)" = "$(git -C "$CASE_DIR/seed" rev-parse HEAD)" ] || rc=1
[ ! -s "$DOCKER_RECORD" ] || rc=1
report "$rc" 'trading-only fast-forward'

setup_case docker_failure
new_commit "$CASE_DIR" README.md failing
DOCKER_RC=1; export DOCKER_RC
if bash "$DEPLOY_ROOT/scripts/linux/auto_deploy.sh"; then rc=1; else rc=0; fi
expected=$(git -C "$CASE_DIR/seed" rev-parse HEAD)
[ "$(cat "$DEPLOY_STATE_DIR/failed-sha")" = "$expected" ] || rc=1
before=$(wc -l < "$DOCKER_RECORD")
bash "$DEPLOY_ROOT/scripts/linux/auto_deploy.sh"
after=$(wc -l < "$DOCKER_RECORD")
[ "$before" = "$after" ] || rc=1
report "$rc" 'failed deployment suppression'

setup_case dirty
new_commit "$CASE_DIR" README.md remote
printf 'local edit\n' >> "$DEPLOY_ROOT/README.md"
if bash "$DEPLOY_ROOT/scripts/linux/auto_deploy.sh"; then rc=1; else rc=0; fi
[ "$(git -C "$DEPLOY_ROOT" rev-parse HEAD)" = "$(git -C "$CASE_DIR/seed" rev-parse HEAD~1)" ] || rc=1
[ ! -s "$DOCKER_RECORD" ] || rc=1
report "$rc" 'dirty tracked checkout'

setup_case paused
new_commit "$CASE_DIR" README.md paused
mkdir -p "$DEPLOY_STATE_DIR"
touch "$DEPLOY_STATE_DIR/PAUSE"
bash "$DEPLOY_ROOT/scripts/linux/auto_deploy.sh"
[ ! -s "$DOCKER_RECORD" ]
report "$?" 'PAUSE'

[ "$failures" -eq 0 ]
