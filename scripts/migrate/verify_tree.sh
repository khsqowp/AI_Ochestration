#!/bin/bash
set -u
(($# == 2)) || { echo 'usage: verify_tree.sh <src_dir> <dest>' >&2; exit 2; }
RSYNC_BIN=${RSYNC_BIN:-}; if [[ -z $RSYNC_BIN ]]; then if [[ -x /opt/homebrew/bin/rsync ]]; then RSYNC_BIN=/opt/homebrew/bin/rsync; else RSYNC_BIN=rsync; fi; fi
tmp=$(mktemp); "$RSYNC_BIN" -rcn --delete --itemize-changes --exclude=.DS_Store --exclude='._*' "$1"/ "$2" > "$tmp" 2>&1; rc=$?; if ((rc!=0)) || [ -s "$tmp" ]; then cat "$tmp"; rm -f "$tmp"; exit 1; fi; rm -f "$tmp"; exit 0
