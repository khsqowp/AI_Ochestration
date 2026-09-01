#!/bin/bash
# 마크다운 -> iCloud Obsidian 실시간 동기화 LaunchAgent 설치/갱신.
#
# 사전 준비 (1회):
#   1) brew install fswatch
#   2) 시스템 설정 > 개인정보 보호 및 보안 > 전체 디스크 접근 권한 에서
#      /opt/homebrew/bin/fswatch 를 추가하고 체크한다.
#      (프로젝트가 ~/Desktop 하위에 있으면 이 권한 없이는 launchd가 소스를 못 읽는다.)
#   3) 이 스크립트 실행: bash scripts/install-md-sync.sh
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
echo "로그에 'Operation not permitted' 가 보이면 fswatch 에 전체 디스크 접근 권한이 없는 것."
echo "위 사전 준비 2) 를 확인하고 다시 'bash scripts/install-md-sync.sh' 실행."
