"""Model inventory — the SOURCE OF TRUTH for what is on disk (the producer's order, 2026-10-09: a model is DOWNLOADED only
when its files physically exist with the manifest's byte sizes and verified hashes; a historical state record alone is
nothing — the Qwen-Image-2512 bf16 weight was reported "downloaded" from a stale record after the file was deleted).

Reads docker/models/manifest.json, layout.json and the store's .manifest-state.json, looks at every file, and classes it:
  PRESENT_VERIFIED   exists, size matches, the state's verified sha256 equals the manifest's (or --hash verified it now)
  PRESENT_UNVERIFIED exists, size matches, no trustworthy verified record (run with --hash to verify and record)
  PARTIAL            not complete: a resumable .incomplete blob (bytes shown) or a file of the wrong size
  QUEUED             missing, but its group is in a running download queue (--queued a,b)
  MISSING            nothing on disk
  HISTORICAL_STALE   the state says verified but the file is gone (--prune-stale removes the record)
A group is VERIFIED only when every file is PRESENT_VERIFIED. Orphans (store files over 100 MB that no manifest entry
names) are listed so the store stays small. Never downloads anything; --hash reads files, --prune-stale writes state.

  docker compose -p vewbox --profile models run --rm --entrypoint python models /app/inventory.py \
      --manifest manifest.json --root /models [--hash] [--prune-stale] [--queued g1,g2] [--json out.json]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from fetch import load_state, physical, sha256_of  # noqa: E402


def incomplete_blobs(root: Path) -> dict[str, int]:
    """sha256 → bytes of every resumable .incomplete blob (huggingface_hub names them <hash>.<sha256>.incomplete)."""
    out: dict[str, int] = {}
    for p in root.rglob("*.incomplete"):
        parts = p.name.split(".")
        if len(parts) >= 3 and len(parts[-2]) == 64:
            out[parts[-2]] = max(out.get(parts[-2], 0), p.stat().st_size)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", default="manifest.json")
    ap.add_argument("--root", default="/models")
    ap.add_argument("--hash", action="store_true", help="hash PRESENT_UNVERIFIED files now and record them verified")
    ap.add_argument("--prune-stale", action="store_true", help="remove state records whose file is gone")
    ap.add_argument("--queued", default="", help="comma-separated group names a download queue is working on")
    ap.add_argument("--json", default="", help="write the full inventory here")
    a = ap.parse_args()
    root = Path(a.root)
    manifest = json.loads(Path(a.manifest).read_text())
    state = load_state(root)
    queued = {g for g in a.queued.split(",") if g}
    blobs = incomplete_blobs(root)
    named: set[Path] = set()
    groups_out = []
    stale_keys: list[str] = []
    for g in manifest.get("groups", []):
        files_out = []
        for e in g.get("files", []):
            name = e.get("as") or Path(e["file"]).name
            dest = root / physical(e["folder"]) / name
            named.add(dest.resolve())
            key = f"{e['folder']}/{name}"
            rec = state.get(key) or {}
            want_bytes = int(e.get("bytes", 0) or 0)
            want_sha = e.get("sha256")
            status, have, sha = "MISSING", 0, None
            if dest.exists():
                have = dest.stat().st_size
                if want_bytes and have != want_bytes:
                    status = "PARTIAL"
                elif rec.get("verified") and (not want_sha or rec.get("sha256") == want_sha):
                    status, sha = "PRESENT_VERIFIED", rec.get("sha256")
                elif a.hash:
                    t0 = time.time()
                    sha = sha256_of(dest)
                    if not want_sha or sha == want_sha:
                        status = "PRESENT_VERIFIED"
                        state[key] = {"verified": True, "sha256": sha, "bytes": have, "repo": e.get("repo"), "file": e.get("file"), "revision": e.get("revision") or rec.get("revision"), "license": e.get("license"), "verified_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "seconds": round(time.time() - t0, 1), "by": "inventory --hash"}
                    else:
                        status = "PARTIAL"  # wrong bytes: not the published file
                else:
                    status = "PRESENT_UNVERIFIED"
            else:
                if want_sha and want_sha in blobs:
                    status, have = "PARTIAL", blobs[want_sha]
                elif rec.get("verified"):
                    status = "HISTORICAL_STALE"
                    stale_keys.append(key)
                elif g["name"] in queued:
                    status = "QUEUED"
            files_out.append({"file": e["file"], "folder": e["folder"], "status": status, "bytes": want_bytes, "have": have, "sha256": want_sha, "verified_sha256": sha, "revision": e.get("revision") or rec.get("revision"), "license": e.get("license")})
        statuses = [f["status"] for f in files_out]
        gstatus = ("VERIFIED" if statuses and all(s == "PRESENT_VERIFIED" for s in statuses)
                   else "HISTORICAL_STALE" if any(s == "HISTORICAL_STALE" for s in statuses) and not any(s.startswith("PRESENT") or s == "PARTIAL" for s in statuses)
                   else "PARTIAL" if any(s in ("PARTIAL", "PRESENT_UNVERIFIED", "PRESENT_VERIFIED") for s in statuses)
                   else "QUEUED" if any(s == "QUEUED" for s in statuses) else "MISSING")
        total = sum(f["bytes"] for f in files_out)
        have = sum(f["have"] if f["status"] in ("PRESENT_VERIFIED", "PARTIAL") else 0 for f in files_out)
        groups_out.append({"name": g["name"], "status": gstatus, "files": len(files_out), "verified": statuses.count("PRESENT_VERIFIED"), "bytes": total, "have": have, "percent": round(100 * have / total, 1) if total else 100.0, "entries": files_out})
    # orphans: big files nobody names (the fetcher's own caches excluded)
    orphans = []
    for p in root.rglob("*"):
        if not p.is_file() or ".hf" in p.parts or p.name.startswith(".manifest-state"):
            continue
        if p.stat().st_size >= 100 * 1024 * 1024 and p.resolve() not in named:
            orphans.append({"path": str(p.relative_to(root)), "bytes": p.stat().st_size})
    if a.prune_stale and stale_keys:
        for k in stale_keys:
            state.pop(k, None)
        p = root / ".manifest-state.json"
        tmp = p.with_suffix(".tmp")
        tmp.write_text(json.dumps(state, indent=2, sort_keys=True))
        tmp.replace(p)
    elif a.hash:
        from fetch import save_state
        save_state(root, state)
    out = {"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "root": str(root), "groups": groups_out, "stale": stale_keys, "pruned": a.prune_stale, "orphans": sorted(orphans, key=lambda o: -o["bytes"])}
    if a.json:
        Path(a.json).write_text(json.dumps(out, indent=2))
    gib = lambda b: f"{b / 2**30:8.2f} GiB"  # noqa: E731
    for g in groups_out:
        print(f"{g['name']:36} {g['status']:17} {g['verified']:2}/{g['files']:2} files {gib(g['have'])} / {gib(g['bytes'])} ({g['percent']:5.1f} %)")
    if stale_keys:
        print(f"stale records ({'pruned' if a.prune_stale else 'kept; --prune-stale removes'}): " + ", ".join(stale_keys))
    for o in out["orphans"]:
        print(f"orphan {gib(o['bytes'])}  {o['path']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
