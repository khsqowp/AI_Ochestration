#!/bin/bash
# Ochestration 마크다운 산출물을 iCloud Obsidian vault로 단방향 동기화(1회 실행).
# md-sync-watch.sh(fswatch 루프) 또는 수동 실행으로 트리거된다.
set -euo pipefail

# 소스 = 이 스크립트가 들어있는 scripts/ 의 상위(리포지토리 루트). 경로 하드코딩 안 함.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# 목적지 기본값은 현재 사용자의 iCloud Obsidian vault. 환경변수 또는
# scripts/md-sync.local(git 미추적) 로 덮어쓸 수 있다.
[ -f "$SCRIPT_DIR/md-sync.local" ] && . "$SCRIPT_DIR/md-sync.local"
DST_ROOT="${OBSIDIAN_SYNC_DEST:-$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/Ochestration}"

mkdir -p "$DST_ROOT/docs" "$DST_ROOT/trading-docs"

rsync -a --delete "$SRC_ROOT/docs/" "$DST_ROOT/docs/"
rsync -a --delete "$SRC_ROOT/trading/docs/" "$DST_ROOT/trading-docs/"
cp "$SRC_ROOT/README.md" "$DST_ROOT/README.md" 2>/dev/null || true
cp "$SRC_ROOT/trading/README.md" "$DST_ROOT/trading-README.md" 2>/dev/null || true
