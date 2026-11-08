#!/bin/bash
# 마크다운 -> iCloud Obsidian 실시간 동기화 LaunchAgent 설치/갱신.
#
# 사전 준비 (1회):
#   1) brew install fswatch
#   2) 이 스크립트 실행: bash scripts/install-md-sync.sh
#   3) 접근 거부가 기록되면 로그에서 프로세스와 대상 경로를 먼저 확인한다.
#      CODE 아래 저장소는 Desktop 폴더 권한 대상이 아니다. iCloud vault 목적지는
#      별도 보호 대상일 수 있으므로 Full Disk Access를 선제적으로 부여하지 않는다.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
LABEL="com.orchestration.md-sync"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
TEMPLATE="$SCRIPT_DIR/$LABEL.plist.template"

command -v fswatch >/dev/null || { echo "fswatch 없음 — 'brew install fswatch' 먼저"; exit 1; }

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"

sed -e "s#__REPO__#$REPO#g" -e "s#__HOME__#$HOME#g" "$TEMPLATE" > "$PLIST"
chmod +x "$SCRIPT_DIR/md-sync-watch.sh" "$SCRIPT_DIR/sync-md-to-obsidian.sh"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl kickstart -k "gui/$(id -u)/$LABEL"

echo "설치 완료: $PLIST"
echo "로그: tail -f ~/Library/Logs/orchestration-md-sync.log"
echo
echo "로그에 'Operation not permitted' 가 보이면 프로세스와 거부된 경로를 확인한다."
echo "Desktop 접근과 iCloud vault 접근은 서로 다른 권한 대상이며, Full Disk Access를 선제적으로 부여하지 않는다."
