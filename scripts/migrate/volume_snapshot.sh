#!/bin/bash
set -euo pipefail
ALLOW=0; [[ ${1:-} == --allow-running ]] && { ALLOW=1; shift; }
(($# >= 2)) || { echo 'usage: volume_snapshot.sh [--allow-running] <outdir> <volume>...' >&2; exit 2; }
out=$1; shift
case $out in /*) ;; *) echo 'outdir must be absolute' >&2; exit 2;; esac
mkdir -p "$out"; docker_bin=${DOCKER_BIN:-docker}
for vol in "$@"; do
  if (( ! ALLOW )) && "$docker_bin" ps --filter "volume=$vol" --format '{{.ID}}' | grep -q .; then echo "running container uses $vol" >&2; exit 1; fi
  "$docker_bin" run --rm -v "$vol:/v:ro" -v "$out:/out" alpine sh -c 'cd /v && tar -cf "/out/'"$vol"'.tar" . && { find . -type d -print0 | sort -z | while IFS= read -r -d "" f; do s=$(stat -c "%u:%g %a" "$f"); printf "d %s %s\n" "$s" "${f#./}"; done; find . -type f -print0 | sort -z | while IFS= read -r -d "" f; do h=$(sha256sum "$f" | cut -d " " -f1); s=$(stat -c "%u:%g %a %s" "$f"); printf "f %s %s\n" "$h" "$s" "${f#./}"; done; }' > "$out/$vol.manifest"
  (cd "$out" && { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$vol.tar"; else shasum -a 256 "$vol.tar"; fi; } > "$vol.tar.sha256")
done
