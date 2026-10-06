"""Model fetcher — manifest-driven, resumable, verified.

Each manifest entry names a Hugging Face repo, a file inside it, the folder it belongs in under the models root,
its expected size and sha256 (when published), and a priority group. Files are downloaded with huggingface_hub (xet
chunks resume on their own), then hashed and compared; a mismatch is deleted and retried. A `.manifest-state.json`
beside the root records what is verified, so the application can tell which capabilities are ready.

The root is the model store (VEWBOX_MODELS_ROOT, docs/MODELS-STORAGE.md). layout.json places a logical folder in it:
ComfyUI's typed folders under comfyui/, the caches under cache/; state keys stay `<logical folder>/<name>`.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
import time
from pathlib import Path

from huggingface_hub import hf_hub_download, HfApi


def log(msg: str, **kw: object) -> None:
    rec = {"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "msg": msg, **kw}
    print(json.dumps(rec, ensure_ascii=False), flush=True)


def sha256_of(path: Path, chunk: int = 16 * 1024 * 1024) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            b = f.read(chunk)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def load_state(root: Path) -> dict:
    p = root / ".manifest-state.json"
    if p.exists():
        try:
            return json.loads(p.read_text())
        except Exception:
            return {}
    return {}


def save_state(root: Path, state: dict) -> None:
    """Merge this run's records into the file on disk (another fetcher may have verified files meanwhile), then
    replace it atomically. A run never forgets what a parallel run proved."""
    p = root / ".manifest-state.json"
    merged = load_state(root)
    merged.update(state)
    state.update(merged)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(merged, indent=2, sort_keys=True))
    tmp.replace(p)


def free_bytes(path: Path) -> int:
    return shutil.disk_usage(path).free


def load_layout(path: Path) -> dict:
    """layout.json beside this script (docs/MODELS-STORAGE.md); none = the flat layout (folder = path)."""
    try:
        return json.loads(path.read_text())
    except FileNotFoundError:
        return {}


LAYOUT = load_layout(Path(__file__).with_name("layout.json"))


def physical(folder: str, layout: dict | None = None) -> str:
    """The folder's place inside the store: ComfyUI's typed folders under comfyui/, the renamed caches, the rest as is.
    The manifest and the state file keep the logical folder."""
    layout = LAYOUT if layout is None else layout
    top, _, rest = folder.partition("/")
    comfy = layout.get("comfyui") or {}
    if top in comfy.get("folders", []):
        return f"{comfy.get('dir', 'comfyui')}/{folder}"
    renamed = (layout.get("renamed") or {}).get(top)
    if renamed:
        return f"{renamed}/{rest}" if rest else renamed
    return folder


def fetch(entry: dict, root: Path, state: dict, api: HfApi, token: str | None) -> bool:
    dest_dir = root / physical(entry["folder"])
    dest_dir.mkdir(parents=True, exist_ok=True)
    name = entry.get("as") or Path(entry["file"]).name
    dest = dest_dir / name
    key = f"{entry['folder']}/{name}"
    rec = state.get(key, {})
    expected_sha = entry.get("sha256")
    expected_size = int(entry.get("bytes", 0) or 0)

    if dest.exists() and rec.get("verified") and (not expected_size or dest.stat().st_size == expected_size):
        log("already verified", file=key)
        return True
    # a complete file with no record (state lost, or written by another run): hash it before downloading anything
    if dest.exists() and expected_sha and (not expected_size or dest.stat().st_size == expected_size):
        t0 = time.time()
        sha = sha256_of(dest)
        if sha == expected_sha:
            state[key] = {"verified": True, "sha256": sha, "bytes": dest.stat().st_size, "repo": entry["repo"], "file": entry["file"], "revision": entry.get("revision") or rec.get("revision"), "license": entry.get("license"), "verified_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "seconds": round(time.time() - t0, 1)}
            save_state(root, state)
            log("verified existing file", file=key, bytes=dest.stat().st_size, seconds=round(time.time() - t0, 1))
            return True
        log("existing file does not match; downloading again", file=key, got=sha, expected=expected_sha)
        dest.unlink()

    # resolve the exact revision once so a later run checks the same bytes
    revision = entry.get("revision") or rec.get("revision")
    if not revision:
        info = api.model_info(entry["repo"], token=token)
        revision = info.sha
    need = expected_size - (dest.stat().st_size if dest.exists() else 0) if expected_size else 0
    if need > 0 and free_bytes(root) < need + 2 * 1024 ** 3:
        log("not enough free space", file=key, need_bytes=need, free_bytes=free_bytes(root))
        return False

    for attempt in range(1, 4):
        try:
            t0 = time.time()
            got = hf_hub_download(repo_id=entry["repo"], filename=entry["file"], revision=revision, repo_type=entry.get("repo_type", "model"), local_dir=str(dest_dir / ".hf"), token=token)
            got_p = Path(got)
            if got_p.resolve() != dest.resolve():
                if dest.exists():
                    dest.unlink()
                shutil.move(str(got_p), str(dest))
            size = dest.stat().st_size
            if expected_size and size != expected_size:
                raise RuntimeError(f"size mismatch: got {size}, expected {expected_size}")
            sha = sha256_of(dest)
            if expected_sha and sha != expected_sha:
                raise RuntimeError(f"sha256 mismatch: got {sha}, expected {expected_sha}")
            state[key] = {"verified": True, "sha256": sha, "bytes": size, "repo": entry["repo"], "file": entry["file"], "revision": revision, "license": entry.get("license"), "verified_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "seconds": round(time.time() - t0, 1)}
            save_state(root, state)
            log("verified", file=key, bytes=size, sha256=sha, seconds=round(time.time() - t0, 1))
            return True
        except Exception as e:  # noqa: BLE001
            log("download failed", file=key, attempt=attempt, error=str(e)[:400])
            if "mismatch" in str(e) and dest.exists():
                dest.unlink()
            time.sleep(min(60, 5 * attempt))
    return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--root", required=True)
    ap.add_argument("--groups", default="", help="comma separated priority groups to fetch (default: all, in manifest order)")
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args()
    root = Path(args.root)
    # the model store carries a marker (docs/MODELS-STORAGE.md): without it the root is not the store (a detached VHDX,
    # a wrong path) and nothing is written there
    if os.environ.get("MODELS_REQUIRE_MARKER") == "1" and not (root / ".vewbox-models").exists():
        log("not the model store: no .vewbox-models marker; attach it first (wsl --mount --vhd <VEWBOX_MODELS_VHDX> --name models)", root=str(root))
        return 2
    root.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(Path(args.manifest).read_text())
    groups = [g for g in args.groups.split(",") if g] or [g["name"] for g in manifest["groups"]]
    state = load_state(root)
    token = os.environ.get("HF_TOKEN") or None
    api = HfApi()
    ok_all = True
    total = 0
    for g in manifest["groups"]:
        if g["name"] not in groups:
            continue
        log("group", name=g["name"], purpose=g.get("purpose"), files=len(g["files"]))
        for entry in g["files"]:
            total += int(entry.get("bytes", 0) or 0)
            if args.list:
                log("file", folder=entry["folder"], path=physical(entry["folder"]), file=entry["file"], bytes=entry.get("bytes"), license=entry.get("license"))
                continue
            if not fetch(entry, root, state, api, token):
                ok_all = False
    # The hub's local_dir scaffolding (.hf) holds partial downloads. It is never removed here: another fetcher run
    # (a different group, started in parallel) may be writing its own partial next to ours, and wiping the tree
    # once cost a 21 GB download. Completed files are moved out; what remains in .hf is metadata, kilobytes.
    log("done", ok=ok_all, total_bytes=total)
    return 0 if ok_all else 1


if __name__ == "__main__":
    sys.exit(main())
