#!/bin/bash
set -euo pipefail
FORCE=0; [[ ${1:-} == --force-nonempty ]] && { FORCE=1; shift; }
(($# >= 2)) || { echo 'usage: volume_restore.sh [--force-nonempty] <indir> <volume>...' >&2; exit 2; }
dir=$1; shift; db=${DOCKER_BIN:-docker}
for vol in "$@"; do
  [ -f "$dir/$vol.tar" ] && [ -f "$dir/$vol.tar.sha256" ] && [ -f "$dir/$vol.manifest" ] || { echo "missing snapshot files for $vol" >&2; exit 1; }
  (cd "$dir" && sha256sum -c "$vol.tar.sha256")
  "$db" volume inspect "$vol" >/dev/null || { echo "volume does not exist: $vol" >&2; exit 1; }
  "$db" ps --filter "volume=$vol" --format '{{.ID}}' | grep -q . && { echo "running container uses $vol" >&2; exit 1; }
  if (( ! FORCE )) && [ -n "$("$db" run --rm -v "$vol:/v" alpine sh -c 'find /v -mindepth 1 -print -quit')" ]; then echo "volume is not empty: $vol" >&2; exit 1; fi
  "$db" run --rm -i -v "$vol:/v" alpine tar --numeric-owner -xpf - -C /v < "$dir/$vol.tar"
  tmp=$(mktemp); "$db" run --rm -v "$vol:/v:ro" alpine sh -c 'cd /v && { find . -type d -print0 | sort -z | while IFS= read -r -d "" f; do s=$(stat -c "%u:%g %a" "$f"); printf "d %s %s\n" "$s" "${f#./}"; done; find . -type f -print0 | sort -z | while IFS= read -r -d "" f; do h=$(sha256sum "$f" | cut -d " " -f1); s=$(stat -c "%u:%g %a %s" "$f"); printf "f %s %s\n" "$h" "$s" "${f#./}"; done; }' > "$tmp"
  if ! diff -u "$dir/$vol.manifest" "$tmp"; then rm -f "$tmp"; exit 1; fi; rm -f "$tmp"
done
