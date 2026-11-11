#!/bin/bash
set -u

DEPLOY_LOCK_DIR=
DEPLOY_HOLD_LOCK=false

release_deploy_lock() {
    if [ "$DEPLOY_HOLD_LOCK" = true ]; then
        rmdir "$DEPLOY_LOCK_DIR" 2>/dev/null || true
        DEPLOY_HOLD_LOCK=false
    fi
}

main() {
    local script_dir root state_dir log_file lock_dir failures_file failed_sha_file
    local now lock_mtime lock_age local_sha remote_sha old_short new_short changed
    local needs_deploy path step subject

    script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
    root=${DEPLOY_ROOT:-$(cd "$script_dir/../.." && pwd)}
    state_dir=${DEPLOY_STATE_DIR:-$HOME/.local/state/ochestration/deploy}
    log_file=${DEPLOY_LOG:-$HOME/logs/host/auto-deploy.log}
    lock_dir=$state_dir/lock
    failures_file=$state_dir/fetch-failures
    failed_sha_file=$state_dir/failed-sha

    mkdir -p "$state_dir" "$(dirname "$log_file")" || return 1
    if [ -f "$log_file" ] && [ "$(wc -c < "$log_file")" -gt 1048576 ]; then
        mv -f "$log_file" "$log_file.1" || return 1
    fi

    log() {
        printf '[%s] %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*" >> "$log_file"
    }

    # notify.sh is loaded relative to this script, independent of the checkout path.
    . "$script_dir/notify.sh"

    if [ -e "$state_dir/PAUSE" ]; then
        log 'PAUSE present; skipping deployment'
        return 0
    fi

    if ! mkdir "$lock_dir" 2>/dev/null; then
        lock_mtime=$(stat -c %Y "$lock_dir" 2>/dev/null || stat -f %m "$lock_dir" 2>/dev/null || echo 0)
        now=$(date +%s)
        lock_age=$((now - lock_mtime))
        if [ "$lock_age" -lt 3600 ]; then
            log "Lock exists; age ${lock_age}s; skipping"
            return 0
        fi
        log "Removing stale lock; age ${lock_age}s"
        rmdir "$lock_dir" 2>/dev/null || return 0
        mkdir "$lock_dir" 2>/dev/null || return 0
    fi
    DEPLOY_LOCK_DIR=$lock_dir
    DEPLOY_HOLD_LOCK=true
    trap release_deploy_lock EXIT

    if ! timeout 60 git -C "$root" fetch --quiet origin main; then
        failures=$(cat "$failures_file" 2>/dev/null || echo 0)
        failures=$((failures + 1))
        printf '%s\n' "$failures" > "$failures_file"
        if [ "$failures" -ge 3 ]; then
            notify auto-deploy-fetch 'Auto deploy fetch failing' "fetch origin main failed $failures consecutive times"
        fi
        return 1
    fi
    printf '0\n' > "$failures_file"
    notify_recover auto-deploy-fetch 'Auto deploy fetch recovered' 'fetch origin main succeeded'

    local_sha=$(git -C "$root" rev-parse HEAD) || return 1
    remote_sha=$(git -C "$root" rev-parse origin/main) || return 1
    [ "$local_sha" = "$remote_sha" ] && return 0
    [ -f "$failed_sha_file" ] && [ "$(cat "$failed_sha_file")" = "$remote_sha" ] && return 0

    if [ "$(git -C "$root" branch --show-current)" != main ] || [ -n "$(git -C "$root" status --porcelain --untracked-files=no)" ]; then
        notify auto-deploy-dirty 'Auto deploy checkout is dirty' 'checkout must be on main with no modified tracked files'
        return 1
    fi

    changed=$(git -C "$root" diff --name-only "$local_sha" "$remote_sha") || return 1
    if ! git -C "$root" merge --ff-only origin/main; then
        notify auto-deploy-diverged 'Auto deploy checkout diverged' 'fast-forward merge failed; manual checkout repair required'
        return 1
    fi

    needs_deploy=false
    while IFS= read -r path; do
        [ -z "$path" ] && continue
        case "$path" in
            trading/*|docker-compose.trading.yml) ;;
            *) needs_deploy=true ;;
        esac
    done <<< "$changed"

    old_short=${local_sha:0:7}
    new_short=${remote_sha:0:7}
    if [ "$needs_deploy" = false ]; then
        log "SKIP trading-only $old_short..$new_short"
        return 0
    fi

    # docker-compose.trading.yml must never be added: live real-money bots are deployed manually.
    local compose_args=(-f docker-compose.yml -f docker-compose.crypto-data.yml)
    step=build
    if ! (cd "$root" && timeout "${DEPLOY_BUILD_TIMEOUT:-1800}" docker compose "${compose_args[@]}" build) >> "$log_file" 2>&1; then
        printf '%s\n' "$remote_sha" > "$failed_sha_file"
        notify auto-deploy-fail 'Auto deploy failed' "$step failed at $new_short; see $log_file"
        return 1
    fi
    step=up
    if ! (cd "$root" && timeout "${DEPLOY_UP_TIMEOUT:-600}" docker compose "${compose_args[@]}" up -d --remove-orphans) >> "$log_file" 2>&1; then
        printf '%s\n' "$remote_sha" > "$failed_sha_file"
        notify auto-deploy-fail 'Auto deploy failed' "$step failed at $new_short; see $log_file"
        return 1
    fi

    rm -f "$failed_sha_file"
    notify_recover auto-deploy-fail 'Auto deploy recovered' "deployment succeeded at $new_short"
    log "DEPLOYED $old_short..$new_short"
    subject=$(git -C "$root" log -1 --format=%s "$remote_sha")
    ALERT_SUPPRESS_SECONDS=0 notify auto-deploy-ok 'Auto deploy OK' "$old_short..$new_short $subject"
}

main "$@"; exit $?
