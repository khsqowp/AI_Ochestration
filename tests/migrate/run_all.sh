#!/bin/bash
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd); cd "$ROOT"
for test in tests/migrate/test_*.sh; do bash "$test"; done
