#!/usr/bin/env bash
# Installs a non-blocking pre-push hook that mirrors trading/ to Coin_Trade:mac.
# The hook always exits 0; failures only print a warning to stderr.
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
hook="$(git rev-parse --git-path hooks/pre-push)"
mkdir -p "$(dirname "$hook")"

if [[ -e "$hook" ]] && ! grep -q "mirror_trading_to_coin_trade" "$hook"; then
  echo "existing pre-push hook at $hook is not ours; not overwriting" >&2
  exit 1
fi

cat > "$hook" <<HOOK
#!/usr/bin/env bash
# mirror_trading_to_coin_trade (installed by scripts/install-mirror-hook.sh)
# Never blocks or fails the push.
log="\${TMPDIR:-/tmp}/mirror_trading_to_coin_trade.log"
(
  cd "$repo_root" || exit 0
  if ! bash scripts/mirror_trading_to_coin_trade.sh >>"\$log" 2>&1; then
    echo "warning: trading mirror to Coin_Trade:mac failed (see \$log)" >&2
  fi
) </dev/null &
exit 0
HOOK
chmod +x "$hook"
echo "installed $hook"
