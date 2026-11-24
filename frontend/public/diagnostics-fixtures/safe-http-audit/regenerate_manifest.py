"""Regenerate safe_http_checks/manifest.json SHA-256 hashes.

Why this exists: safe_rule_bundle.py's loader is fail-closed -- if you edit
or add a file under safe_http_checks/ without updating manifest.json, every
check using that bundle starts raising "SHA-256 mismatch" with no guidance
on how to fix it. Run this script instead of computing hashes by hand.

Usage (from anywhere -- it locates safe_http_checks/ via this file's own path):
    python3 regenerate_manifest.py

It recomputes the SHA-256 of every *.json file in safe_http_checks/ (except
manifest.json itself) and rewrites manifest.json's "files" map in place.
Every other manifest field (schema_version, bundle_id, auto_update,
network_scope, bundle_version) is left untouched -- bump bundle_version by
hand if you want the version string to reflect the change.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

BUNDLE_DIR = Path(__file__).resolve().parent / "safe_http_checks"
MANIFEST_PATH = BUNDLE_DIR / "manifest.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    rule_files = sorted(path for path in BUNDLE_DIR.glob("*.json") if path.name != "manifest.json")
    if not rule_files:
        raise SystemExit(f"no rule files found under {BUNDLE_DIR}")
    manifest["files"] = {path.name: sha256(path) for path in rule_files}
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Updated {len(rule_files)} hash(es) in {MANIFEST_PATH}:")
    for path in rule_files:
        print(f"  {path.name}: {manifest['files'][path.name]}")


if __name__ == "__main__":
    main()
