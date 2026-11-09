#!/usr/bin/env bash
# One-way mirror: trading/ (tracked files only) -> khsqowp/Coin_Trade branch "mac".
# Never touches Coin_Trade main. git subtree split is deterministic, so repeat
# runs fast-forward. Set MIRROR_FORCE=1 only if split history was rewritten.
set -euo pipefail

REMOTE_URL="${MIRROR_REMOTE_URL:-https://github.com/khsqowp/Coin_Trade.git}"
TARGET_BRANCH="${MIRROR_BRANCH:-mac}"
PREFIX="trading"

if [[ "$TARGET_BRANCH" == "main" || "$TARGET_BRANCH" == "master" ]]; then
  echo "refusing to mirror onto protected branch '$TARGET_BRANCH'" >&2
  exit 2
fi

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

sha="$(git subtree split --prefix="$PREFIX" HEAD)"
if [[ -z "$sha" ]]; then
  echo "subtree split produced no commit" >&2
  exit 1
fi

remote_sha="$(git ls-remote "$REMOTE_URL" "refs/heads/$TARGET_BRANCH" | awk '{print $1}')"
if [[ "$remote_sha" == "$sha" ]]; then
  echo "mirror up to date: $TARGET_BRANCH @ $sha"
  exit 0
fi

if [[ "${MIRROR_FORCE:-0}" == "1" ]]; then
  git push --force-with-lease="refs/heads/$TARGET_BRANCH:${remote_sha}" \
    "$REMOTE_URL" "$sha:refs/heads/$TARGET_BRANCH"
else
  git push "$REMOTE_URL" "$sha:refs/heads/$TARGET_BRANCH"
fi
echo "mirrored $PREFIX/ -> $TARGET_BRANCH @ $sha"
