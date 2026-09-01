#!/bin/bash
# Ochestration 이 생성하는 마크다운을 iCloud Obsidian vault로 단방향 동기화(1회 실행).
#   - obsidian/          : 백엔드가 생성하는 노트 전체(뉴스/질문/업로드 정리/토픽/_archived)
#   - docs/, trading/docs : 손으로 쓴 기획 문서
# md-sync-watch.sh(fswatch 루프) 또는 수동 실행으로 트리거된다. 방향은 repo -> vault 뿐이며
# vault 쪽 편집은 다음 동기화 때 덮어써진다(소비 전용).
set -euo pipefail

# 소스 = 이 스크립트가 들어있는 scripts/ 의 상위(리포지토리 루트). 경로 하드코딩 안 함.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# 목적지 기본값은 현재 사용자의 iCloud Obsidian vault. 환경변수 또는
# scripts/md-sync.local(git 미추적) 로 덮어쓸 수 있다.
[ -f "$SCRIPT_DIR/md-sync.local" ] && . "$SCRIPT_DIR/md-sync.local"
DST_ROOT="${OBSIDIAN_SYNC_DEST:-$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/Ochestration}"

mkdir -p "$DST_ROOT/docs" "$DST_ROOT/trading-docs"

# 생성 노트: obsidian/ 트리 전체를 vault 루트로 미러링.
# --delete 로 삭제/이동도 반영하되, docs 계열과 vault 메타는 leading-'/' 앵커드 exclude 로 보호
# (rsync 는 --exclude 된 항목을 삭제하지 않는다).
rsync -a --delete \
  --exclude='/docs/' --exclude='/trading-docs/' \
  --exclude='/README.md' --exclude='/trading-README.md' \
  --exclude='.obsidian/' --exclude='.DS_Store' --exclude='.gitkeep' \
  "$SRC_ROOT/obsidian/" "$DST_ROOT/"

# 손으로 쓴 문서
rsync -a --delete "$SRC_ROOT/docs/" "$DST_ROOT/docs/"
rsync -a --delete "$SRC_ROOT/trading/docs/" "$DST_ROOT/trading-docs/"
cp "$SRC_ROOT/README.md" "$DST_ROOT/README.md" 2>/dev/null || true
cp "$SRC_ROOT/trading/README.md" "$DST_ROOT/trading-README.md" 2>/dev/null || true
