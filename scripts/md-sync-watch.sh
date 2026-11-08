#!/bin/bash
# fswatch로 마크다운 소스 디렉터리를 감시하다 변경이 생기면 sync-md-to-obsidian.sh 를 실행한다.
# launchd(com.orchestration.md-sync)가 이 스크립트를 데몬으로 상시 띄운다.
#
# 저장소 경로는 이 스크립트 위치에서 계산한다. ~/CODE 아래 저장소는 Desktop 폴더
# 보호 범위와 구분된다. Obsidian vault가 iCloud에 있으면 동기화 목적지 권한은 별도로
# 확인해야 하며, 이 watcher에 Full Disk Access를 기본 요구하지 않는다.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FSWATCH="${FSWATCH_BIN:-/opt/homebrew/bin/fswatch}"

WATCH_PATHS=(
  "$SRC_ROOT/obsidian"
  "$SRC_ROOT/docs"
  "$SRC_ROOT/trading/docs"
  "$SRC_ROOT/README.md"
  "$SRC_ROOT/trading/README.md"
)

# 시작 시 1회 동기화(누락분 따라잡기).
"$SCRIPT_DIR/sync-md-to-obsidian.sh" || true

# --latency 2 : 연속 저장을 묶어서 2초에 한 번만 실행. --one-per-batch : 배치당 1줄.
exec "$FSWATCH" -o --latency 2 --one-per-batch "${WATCH_PATHS[@]}" \
  | while read -r _; do
      "$SCRIPT_DIR/sync-md-to-obsidian.sh" || true
    done
