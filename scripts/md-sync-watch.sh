#!/bin/bash
# fswatch로 마크다운 소스 디렉터리를 감시하다 변경이 생기면 sync-md-to-obsidian.sh 를 실행한다.
# launchd(com.orchestration.md-sync)가 이 스크립트를 데몬으로 상시 띄운다.
#
# 왜 launchd WatchPaths 를 안 쓰나:
#   프로젝트가 ~/Desktop 하위에 있으면 macOS TCC가 launchd 자식 프로세스의
#   Desktop 접근을 막는다. fswatch(Homebrew 바이너리)에 '전체 디스크 접근 권한'을
#   부여하면 이 우회가 가능하다. install-md-sync.sh 참고.
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
