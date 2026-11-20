#!/usr/bin/env bash
set -euo pipefail
SERVER=${FORWARD_TEST_SERVER:-linuxserver}
CONTAINER=ochestration-trading-trading-forward-test-1
if [[ ${1:-} == 12h ]]; then
  CONTAINER=ochestration-trading-trading-forward-test-12h-1
  shift
  exec ssh "$SERVER" docker exec "$CONTAINER" python -m forward_test.status --profile l5_12h "$@"
fi
if [[ ${1:-} == jbb ]]; then
  CONTAINER=ochestration-trading-trading-forward-test-jbb-1h-1
  shift
  exec ssh "$SERVER" docker exec "$CONTAINER" python -m forward_test.status --profile jbb_1h "$@"
fi
exec ssh "$SERVER" docker exec "$CONTAINER" python -m forward_test.status "$@"
