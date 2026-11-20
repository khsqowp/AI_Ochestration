#!/usr/bin/env bash
set -euo pipefail
SERVER=${FORWARD_TEST_SERVER:-linuxserver}
CONTAINER=ochestration-trading-trading-forward-test-1
exec ssh "$SERVER" docker exec "$CONTAINER" python -m forward_test.status "$@"
