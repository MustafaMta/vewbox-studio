"""TRAIN LORA — Stage A of the Vewbox-IQ recipe (docs/research/iraqi-voice-production.md §2 "Vewbox-IQ v1"; docs/VEWBOX-IQ.md):

  trainable   PEFT LoRA r32 / α64 / dropout 0.05 on t3.tfmr.layers.{0..29}.self_attn.{q,k,v,o}_proj and .mlp.{gate,up,down}_proj
              + the Arabic-block rows of t3.text_emb (a trained copy via PEFT modules_to_save; every other row is held by a
                gradient mask AND restored after each optimizer step, so it is exact, not approximate)
  frozen      everything else in T3 (cond_enc.spkr_enc / perceiver / emotion_adv_fc — the speaker path; speech_emb,
              speech_head — the S3 token semantics; text_head; text_pos_emb, speech_pos_emb; the base Llama weights) and
              ve.* / s3gen.* by construction: the trainer never instantiates them (prepare_tokens.py already ran them)
  loss        T3.loss = text CE + speech CE (speech targets = the cached S3 tokens; --text-loss-weight scales the text term)
  optimiser   AdamW β(0.9, 0.95), weight decay 0.01 (0 on the embedding copy), peak lr 3e-6, linear warm-up 500 steps,
              cosine decay to --lr-min; grad-accum to --batch; grad-clip 0.5; bf16 autocast only with --bf16
  replay      --replay-tokens <cache> --replay-ratio 0.25: each sample is drawn from the English/MSA cache with that
              probability (protects [en] and MSA; research: 20–30 %)
  prompt      the 150 prompt speech tokens (hp.speech_cond_prompt_len) come from ANOTHER utterance of the same speaker when
              one exists (--prompt-source speaker, default) — at inference the prompt is the reference, never the line —
              else from the utterance itself; shorter prompts are tiled to the full length (counted in the log)
  checkpoints every --checkpoint-every steps: <out>/<name>/step-NNNNNN/{adapter/ (PEFT), t3_merged.safetensors (base + LoRA
              deltas + the trained embedding — the exact state the tts-iq service loads), provenance.json}
  log         <out>/<name>/train-log.jsonl (step, losses, lr, grad norm, replay share, seconds) + summary.json
  stop        --eval-file <json>: an external verdict the studio writes per checkpoint ({ "step", "stop", "reason",
              "ecapa_sim", "cer_en" }); with --wait-eval-seconds the trainer waits for the verdict of the checkpoint it just
              wrote; --base-ecapa-sim / --base-cer-en apply the research stop rules to the numbers (SIM drop > 0.03, CER up)
  --smoke     the producer's small controlled experiment: 200 steps on ≤ 30 min of data, a checkpoint (= eval point)
              every 50 steps, warm-up 20, batch 4

  python train_lora.py --tokens /training/tokens/train --out /training/checkpoints --name stage-a-smoke --smoke --bf16
  python train_lora.py --tokens /training/tokens/train --replay-tokens /training/tokens/replay-en --replay-ratio 0.25 \
      --out /training/checkpoints --name stage-a --steps 8000 --batch 16 --micro-batch 4 --bf16 --checkpoint-every 500

Deterministic for a seed (data order, LoRA init, dropout); cuDNN/attention kernels may still differ run to run unless
--deterministic (slower). Stage B (partial FT of layers 18–29 after merging) is a later script; this one is Stage A only."""
from __future__ import annotations

import argparse
import json
import math
import random
import re
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, "/opt/iq")
from common import arabic_row_mask, die, git_commit_hint, log, read_jsonl, sha256_file, vocab_tokens  # noqa: E402

import iq_model  # noqa: E402

LORA_TARGET_RE = r"tfmr\.layers\.\d+\.(self_attn\.(q|k|v|o)_proj|mlp\.(gate|up|down)_proj)"
TEXT_EMB_COPY = "text_emb.modules_to_save.default.weight"
FROZEN_PREFIXES = ("cond_enc.", "speech_emb.", "speech_head.", "text_head.", "text_pos_emb.", "speech_pos_emb.", "tfmr.embed_tokens.", "tfmr.norm.")


# ------------------------------------------------------------------------------------------------ data
class TokenSet:
    """One token cache (prepare_tokens.py): the index records, the npz loaded lazily and kept (int32/float32, small)."""

    def __init__(self, folder: Path, max_speech: int, max_seconds: float | None = None, seed: int = 0) -> None:
        self.folder = folder
        rows = [r for r in read_jsonl(folder / "index.jsonl") if (folder / f"{r['id']}.npz").is_file() and 1 <= r["n_speech"] <= max_speech and r["n_text"] >= 1]
        if max_seconds is not None:
            rng = random.Random(seed)
            rng.shuffle(rows)
            kept, total = [], 0.0
            for r in rows:
                if total + float(r["durationSeconds"]) > max_seconds:
                    continue
                kept.append(r)
                total += float(r["durationSeconds"])
            rows = sorted(kept, key=lambda r: r["id"])
        if not rows:
            die(f"{folder}: no usable utterances in index.jsonl")
        self.rows = rows
        self.by_speaker: dict[str, list[int]] = {}
        for i, r in enumerate(rows):
            self.by_speaker.setdefault(r["speaker"], []).append(i)
        self.cache: dict[str, dict[str, np.ndarray]] = {}
        self.seconds = sum(float(r["durationSeconds"]) for r in rows)
        self.manifests = sorted({(r.get("manifest"), r.get("manifest_sha256")) for r in rows})

    def load(self, i: int) -> dict[str, np.ndarray]:
        uid = self.rows[i]["id"]
        if uid not in self.cache:
            z = np.load(self.folder / f"{uid}.npz")
            self.cache[uid] = {"text": z["text"].astype(np.int64), "speech": z["speech"].astype(np.int64), "ve": z["ve"].astype(np.float32)}
        return self.cache[uid]

    def prompt_for(self, i: int, rng: random.Random, source: str, length: int) -> tuple[np.ndarray, bool, bool]:
        """(prompt tokens of `length`, from another utterance?, tiled?)"""
        other = False
        j = i
        if source == "speaker":
            cands = [k for k in self.by_speaker[self.rows[i]["speaker"]] if k != i]
            if cands:
                j = rng.choice(cands)
                other = True
        sp = self.load(j)["speech"]
        tiled = sp.shape[0] < length
        if tiled:
            sp = np.tile(sp, int(math.ceil(length / sp.shape[0])))
        return sp[:length], other, tiled


def collate(items: list[dict[str, Any]], hp: Any, device: Any):
    import torch  # type: ignore

    sot, eot = int(hp.start_text_token), int(hp.stop_text_token)
    sos, eos = int(hp.start_speech_token), int(hp.stop_speech_token)
    texts = [np.concatenate([[sot], it["text"], [eot]]) for it in items]
    speeches = [np.concatenate([[sos], it["speech"], [eos]]) for it in items]
    tl = torch.tensor([len(t) for t in texts], dtype=torch.long)
    sl = torch.tensor([len(s) for s in speeches], dtype=torch.long)
    T, S = int(tl.max()), int(sl.max())
    text = torch.full((len(items), T), eot, dtype=torch.long)
    speech = torch.full((len(items), S), eos, dtype=torch.long)
    for i, (t, s) in enumerate(zip(texts, speeches)):
        text[i, : len(t)] = torch.from_numpy(np.asarray(t, dtype=np.int64))
        speech[i, : len(s)] = torch.from_numpy(np.asarray(s, dtype=np.int64))
    prompt = torch.from_numpy(np.stack([it["prompt"] for it in items]).astype(np.int64))
    ve = torch.from_numpy(np.stack([it["ve"] for it in items]))
    return {"text": text.to(device), "text_lens": tl.to(device), "speech": speech.to(device), "speech_lens": sl.to(device), "prompt": prompt.to(device), "ve": ve.to(device)}


# ------------------------------------------------------------------------------------------------ model
def build_t3(base_dir: Path, device: str):
    """T3 only, from the v3 file (verified against the file afterwards). ve and s3gen are never built here."""
    import torch  # type: ignore
    from chatterbox.models.t3 import T3  # type: ignore
    from chatterbox.models.t3.modules.t3_config import T3Config  # type: ignore
    from safetensors.torch import load_file  # type: ignore

    t3 = T3(T3Config.multilingual())
    sd = load_file(str(base_dir / iq_model.T3_FILE), device="cpu")
    if "model" in sd:
        sd = sd["model"][0]
    res = t3.load_state_dict(sd, strict=True)
    assert not res.missing_keys and not res.unexpected_keys
    t3.to(device)
    if not iq_model._verify_t3_is_v3(t3, base_dir / iq_model.T3_FILE):
        die("the loaded T3 does not match t3_mtl23ls_v3.safetensors")
    base_sd = {k: v.detach().cpu().clone() for k, v in sd.items()}
    return t3, base_sd


def attach_lora(t3: Any, args: argparse.Namespace, train_rows: bool):
    from peft import LoraConfig, get_peft_model  # type: ignore

    cfg = LoraConfig(r=args.lora_r, lora_alpha=args.lora_alpha, lora_dropout=args.lora_dropout, bias="none", target_modules=LORA_TARGET_RE,
                     modules_to_save=["text_emb"] if train_rows else None)
    peft_model = get_peft_model(t3, cfg)  # mutates t3 in place: the LoRA layers and the text_emb wrapper live in t3 now
    return peft_model, cfg


def lora_modules(t3: Any) -> dict[str, Any]:
    out = {}
    for name, mod in t3.named_modules():
        if hasattr(mod, "lora_A") and hasattr(mod, "lora_B") and re.fullmatch(LORA_TARGET_RE, name):
            out[name] = mod
    return out


def assert_frozen_set(t3: Any, train_rows: bool) -> dict[str, Any]:
    """Every trainable parameter is a LoRA factor or the text_emb copy; every named frozen module is frozen. Printed."""
    trainable, total, bad = 0, 0, []
    names_trainable = []
    for name, p in t3.named_parameters():
        total += p.numel()
        if p.requires_grad:
            trainable += p.numel()
            names_trainable.append(name)
            ok = ".lora_A." in name or ".lora_B." in name or (train_rows and name == TEXT_EMB_COPY)
            if not ok or name.startswith(FROZEN_PREFIXES):
                bad.append(name)
    if bad:
        die(f"parameters outside the Stage A trainable set are trainable: {bad[:10]}")
    n_layers = len({re.match(r"tfmr\.layers\.(\d+)\.", n).group(1) for n in names_trainable if n.startswith("tfmr.layers.")})
    info = {"trainable_params": trainable, "total_params": total, "trainable_share": round(trainable / total, 5), "lora_layers": n_layers,
            "lora_param_count": sum(p.numel() for n, p in t3.named_parameters() if ".lora_" in n), "text_emb_copy_trainable": train_rows,
            "frozen_by_name": list(FROZEN_PREFIXES), "frozen_by_construction": ["ve.*", "s3gen.* (tokenizer, speaker_encoder CAMPPlus, flow, mel2wav)"]}
    log(f"[train] trainable {trainable:,} / {total:,} ({info['trainable_share'] * 100:.3f} %); LoRA on {n_layers} layers ({info['lora_param_count']:,} params); text_emb copy trainable: {train_rows}")
    return info


def merged_state_dict(t3: Any, base_sd: dict[str, Any], train_rows: bool) -> dict[str, Any]:
    """base + (B @ A) * scaling for every LoRA target, + the trained embedding copy — the same tensors PEFT's merge gives,
    computed from the kept base weights so the key set is exactly the base checkpoint's (no deepcopy, no unload)."""
    import torch  # type: ignore

    merged = {k: v.clone() for k, v in base_sd.items()}
    with torch.no_grad():
        for name, mod in lora_modules(t3).items():
            A = mod.lora_A["default"].weight.detach().float()
            B = mod.lora_B["default"].weight.detach().float()
            scaling = float(mod.scaling["default"])
            delta = (B @ A) * scaling
            key = f"{name}.weight"
            merged[key] = (base_sd[key].float() + delta.cpu()).to(base_sd[key].dtype)
        if train_rows:
            copy = dict(t3.named_parameters())[TEXT_EMB_COPY].detach().cpu()
            merged["text_emb.weight"] = copy.to(base_sd["text_emb.weight"].dtype).clone()
    if set(merged) != set(base_sd):
        die("merged state dict keys differ from the base checkpoint")
    return merged


# ------------------------------------------------------------------------------------------------ schedule
def lr_at(step: int, args: argparse.Namespace) -> float:
    if step < args.warmup:
        return args.lr * (step + 1) / max(1, args.warmup)
    progress = min(1.0, (step - args.warmup) / max(1, args.steps - args.warmup))
    return args.lr_min + 0.5 * (args.lr - args.lr_min) * (1 + math.cos(math.pi * progress))


# ------------------------------------------------------------------------------------------------ eval hook
def read_verdict(path: Path | None) -> dict[str, Any] | None:
    if not path or not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return None


def stop_reason(verdict: dict[str, Any] | None, step: int, args: argparse.Namespace) -> str | None:
    if not verdict:
        return None
    if verdict.get("stop") is True:
        return f"external verdict at step {verdict.get('step', '?')}: {verdict.get('reason', 'stop')}"
    if args.base_ecapa_sim is not None and isinstance(verdict.get("ecapa_sim"), (int, float)) and verdict["ecapa_sim"] < args.base_ecapa_sim - 0.03:
        return f"held-out ECAPA SIM {verdict['ecapa_sim']:.3f} dropped more than 0.03 below the base {args.base_ecapa_sim:.3f} (verdict for step {verdict.get('step', '?')})"
    if args.base_cer_en is not None and isinstance(verdict.get("cer_en"), (int, float)) and verdict["cer_en"] > args.base_cer_en + 1e-9:
        return f"English CER {verdict['cer_en']:.3f} regressed past the base {args.base_cer_en:.3f} (verdict for step {verdict.get('step', '?')})"
    return None


# ------------------------------------------------------------------------------------------------ main
def main() -> None:
    ap = argparse.ArgumentParser(description="Vewbox-IQ Stage A: LoRA + Arabic text_emb rows on Chatterbox MTL V3's T3")
    ap.add_argument("--tokens", required=True, nargs="+", help="token cache folder(s) of the Iraqi training manifest (prepare_tokens.py)")
    ap.add_argument("--replay-tokens", nargs="*", default=[], help="token cache folder(s) of the English/MSA replay manifest")
    ap.add_argument("--replay-ratio", type=float, default=0.25)
    ap.add_argument("--out", required=True)
    ap.add_argument("--name", default="stage-a")
    ap.add_argument("--base-dir", default=None)
    ap.add_argument("--device", default="cuda")
    ap.add_argument("--steps", type=int, default=8000)
    ap.add_argument("--batch", type=int, default=16, help="utterances per optimizer step (grad-accum = batch / micro-batch)")
    ap.add_argument("--micro-batch", type=int, default=4)
    ap.add_argument("--lr", type=float, default=3e-6)
    ap.add_argument("--lr-min", type=float, default=0.0)
    ap.add_argument("--warmup", type=int, default=500)
    ap.add_argument("--weight-decay", type=float, default=0.01)
    ap.add_argument("--beta1", type=float, default=0.9)
    ap.add_argument("--beta2", type=float, default=0.95)
    ap.add_argument("--clip", type=float, default=0.5)
    ap.add_argument("--lora-r", type=int, default=32)
    ap.add_argument("--lora-alpha", type=int, default=64)
    ap.add_argument("--lora-dropout", type=float, default=0.05)
    ap.add_argument("--text-emb-rows", default="arabic", choices=["arabic", "arabic+lang", "none"], help="which text_emb rows may move")
    ap.add_argument("--emb-lr", type=float, default=None, help="peak learning rate of the text_emb rows (default: --lr); smoke 4 (2026-10-10): the untrained چ گ پ ڤ rows need more than the LoRA's rate")
    ap.add_argument("--init-rows", default="", help="phoneme-representation init, 'گ=g,پ=p,ڤ=v,چ=c+h': each listed row of the trainable text_emb copy starts as the MEAN of the named base rows (graphemes the base already pronounces that way)")
    ap.add_argument("--text-loss-weight", type=float, default=1.0)
    ap.add_argument("--prompt-source", default="speaker", choices=["speaker", "self"])
    ap.add_argument("--max-speech-tokens", type=int, default=520, help="skip utterances longer than this (25 tokens/s: 520 ≈ 20.8 s)")
    ap.add_argument("--bf16", action="store_true")
    ap.add_argument("--grad-checkpoint", action="store_true")
    ap.add_argument("--deterministic", action="store_true")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--checkpoint-every", type=int, default=500)
    ap.add_argument("--log-every", type=int, default=10)
    ap.add_argument("--eval-file", default=None)
    ap.add_argument("--wait-eval-seconds", type=int, default=0)
    ap.add_argument("--base-ecapa-sim", type=float, default=None)
    ap.add_argument("--base-cer-en", type=float, default=None)
    ap.add_argument("--commit", default=None, help="the vewbox git commit for provenance.json")
    ap.add_argument("--no-base-hash", action="store_true", help="skip hashing the 2.1 GB T3 file for provenance")
    ap.add_argument("--smoke", action="store_true")
    args = ap.parse_args()
    if args.smoke:
        args.steps, args.checkpoint_every, args.warmup, args.batch, args.micro_batch = 200, 50, 20, 4, min(args.micro_batch, 4)
        log("[train] SMOKE: 200 steps, ≤ 30 min of data, checkpoint/eval every 50 steps, warm-up 20, batch 4")
    if args.batch % args.micro_batch:
        die("--batch must be a multiple of --micro-batch")
    accum = args.batch // args.micro_batch

    import torch  # type: ignore

    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)
    torch.cuda.manual_seed_all(args.seed)
    if args.deterministic:
        torch.use_deterministic_algorithms(True, warn_only=True)
        torch.backends.cudnn.deterministic = True
        torch.backends.cudnn.benchmark = False
    device = torch.device(args.device)
    base_dir = Path(args.base_dir) if args.base_dir else iq_model.default_base_dir()
    missing = iq_model.missing_base_files(base_dir)
    if missing:
        die(f"base files missing in {base_dir}: {missing}")

    # data
    cap = 1800.0 if args.smoke else None
    main_sets = [TokenSet(Path(t), args.max_speech_tokens, cap, args.seed) for t in args.tokens]
    replay_sets = [TokenSet(Path(t), args.max_speech_tokens, cap, args.seed) for t in args.replay_tokens]
    main_n = sum(len(s.rows) for s in main_sets)
    replay_n = sum(len(s.rows) for s in replay_sets)
    replay_ratio = args.replay_ratio if replay_sets else 0.0
    log(f"[train] main {main_n} utterances ({sum(s.seconds for s in main_sets) / 3600:.2f} h); replay {replay_n} ({sum(s.seconds for s in replay_sets) / 3600:.2f} h) at ratio {replay_ratio}")
    one_utt_speakers = sum(1 for s in main_sets for v in s.by_speaker.values() if len(v) == 1)
    if one_utt_speakers:
        log(f"[train] {one_utt_speakers} speaker(s) have a single utterance: their prompt comes from the utterance itself")

    # model
    t3, base_sd = build_t3(base_dir, args.device)
    train_rows = args.text_emb_rows != "none"
    for p in t3.parameters():
        p.requires_grad_(False)
    peft_model, lora_cfg = attach_lora(t3, args, train_rows)
    if args.grad_checkpoint:
        t3.tfmr.gradient_checkpointing_enable()
    n_rows = int(base_sd["text_emb.weight"].shape[0])
    row_mask_t = None
    emb_param = None
    frozen_rows_snapshot = None
    if train_rows:
        vocab = vocab_tokens(base_dir / iq_model.VOCAB_FILE)
        mask = arabic_row_mask(vocab, n_rows, include_lang_token=args.text_emb_rows == "arabic+lang")
        row_mask_t = torch.tensor(mask, dtype=torch.float32, device=device)[:, None]
        emb_param = dict(t3.named_parameters()).get(TEXT_EMB_COPY)
        if emb_param is None:
            die(f"PEFT did not expose {TEXT_EMB_COPY}: the modules_to_save wrapper changed; inspect t3.named_parameters()")
        emb_param.register_hook(lambda g: g * row_mask_t)
        # PHONEME-REPRESENTATION INIT (smoke 4): a row the base never trained (چ گ پ ڤ came out as [k]/[s], [l]/[b] in every
        # earlier run) starts from the graphemes the base already pronounces with that sound; only trainable rows may be set
        init_report: dict[str, Any] = {}
        if args.init_rows.strip():
            with torch.no_grad():
                for spec in [s.strip() for s in args.init_rows.split(",") if s.strip()]:
                    target, _, sources = spec.partition("=")
                    target = target.strip()
                    src_tokens = [s.strip() for s in sources.split("+") if s.strip()]
                    if target not in vocab or any(s not in vocab for s in src_tokens):
                        die(f"--init-rows: unknown token in {spec!r} (vocab has {[t for t in [target, *src_tokens] if t in vocab]})")
                    tid = vocab[target]
                    if not mask[tid]:
                        die(f"--init-rows: {target!r} (row {tid}) is not a trainable row")
                    rows = torch.stack([base_sd["text_emb.weight"][vocab[s]].to(emb_param.device, emb_param.dtype) for s in src_tokens])
                    emb_param.data[tid] = rows.mean(dim=0)
                    init_report[target] = {"row": tid, "from": src_tokens, "ids": [vocab[s] for s in src_tokens]}
            log(f"[train] text_emb init: {json.dumps(init_report, ensure_ascii=False)}")
        frozen_rows_snapshot = emb_param.detach().clone()
        log(f"[train] text_emb: {int(sum(mask))} of {n_rows} rows trainable (Arabic block{' + [ar]' if args.text_emb_rows == 'arabic+lang' else ''}); the rest masked and restored each step; embedding lr {args.emb_lr if args.emb_lr is not None else args.lr}")
    frozen_info = assert_frozen_set(t3, train_rows)

    # optimiser: decoupled weight decay would move the frozen rows of the embedding copy — that group gets 0
    lora_params = [p for n, p in t3.named_parameters() if p.requires_grad and n != TEXT_EMB_COPY]
    groups = [{"params": lora_params, "weight_decay": args.weight_decay}]
    if emb_param is not None:
        groups.append({"params": [emb_param], "weight_decay": 0.0, "lr_scale": (args.emb_lr / args.lr) if (args.emb_lr is not None and args.lr > 0) else 1.0})
    opt = torch.optim.AdamW(groups, lr=args.lr, betas=(args.beta1, args.beta2), weight_decay=args.weight_decay)

    # provenance
    out_dir = Path(args.out) / args.name
    out_dir.mkdir(parents=True, exist_ok=True)
    datasets = [{"tokens": str(s.folder), "manifests": [{"path": m, "sha256": h} for m, h in s.manifests], "utterances": len(s.rows), "hours": round(s.seconds / 3600, 3), "role": "main"} for s in main_sets]
    datasets += [{"tokens": str(s.folder), "manifests": [{"path": m, "sha256": h} for m, h in s.manifests], "utterances": len(s.rows), "hours": round(s.seconds / 3600, 3), "role": "replay"} for s in replay_sets]
    base_prov = {"repo": "ResembleAI/chatterbox", "revision": iq_model.BASE_REVISION, "t3_file": iq_model.T3_FILE, "t3_sha256": None if args.no_base_hash else sha256_file(base_dir / iq_model.T3_FILE), "code": f"resemble-ai/chatterbox@{iq_model.CODE_COMMIT}"}
    config = {k: v for k, v in vars(args).items()}
    provenance_base = {"name": args.name, "stage": "A", "base": base_prov, "adapter": {"type": "peft-lora", "r": args.lora_r, "alpha": args.lora_alpha, "dropout": args.lora_dropout, "targets": LORA_TARGET_RE, "modules_to_save": ["text_emb"] if train_rows else [], "text_emb_rows": args.text_emb_rows, "emb_lr": args.emb_lr, "init_rows": init_report if train_rows else {}},
                       "datasets": datasets, "replay_ratio": replay_ratio, "config": config, "seed": args.seed, "vewbox_commit": args.commit or git_commit_hint(), "frozen": frozen_info,
                       "versions": {"torch": torch.__version__, "peft": __import__("peft").__version__, "transformers": __import__("transformers").__version__}}
    (out_dir / "config.json").write_text(json.dumps(provenance_base, ensure_ascii=False, indent=2), encoding="utf-8")

    # loop
    from chatterbox.models.t3.modules.cond_enc import T3Cond  # type: ignore

    rng = random.Random(args.seed)
    plen = int(t3.hp.speech_cond_prompt_len)
    log_path = out_dir / "train-log.jsonl"
    t3.train()
    t_start = time.time()
    step = 0
    stopped: str | None = None
    tiled_count = other_count = 0

    def sample(micro: int) -> tuple[list[dict[str, Any]], int]:
        items, n_replay = [], 0
        nonlocal tiled_count, other_count
        for _ in range(micro):
            use_replay = replay_sets and rng.random() < replay_ratio
            ts = rng.choice(replay_sets if use_replay else main_sets)
            i = rng.randrange(len(ts.rows))
            z = ts.load(i)
            prompt, other, tiled = ts.prompt_for(i, rng, args.prompt_source, plen)
            tiled_count += int(tiled)
            other_count += int(other)
            n_replay += int(bool(use_replay))
            items.append({"text": z["text"], "speech": z["speech"], "ve": z["ve"], "prompt": prompt})
        return items, n_replay

    def t3_losses(model, cond, b):
        """The text and speech cross-entropies as NEXT-TOKEN prediction (the decoder generates token t+1 from the hidden
        state at t). Upstream `T3.loss` (chatterbox@65b18437) is not usable for training: it hands [B, T, V] logits to
        cross_entropy as if the classes were on dim 1 (RuntimeError on the first step, 2026-10-10) and compares position
        t with token t, unshifted. Logits in float32 for the loss; padding beyond each sequence's length is ignored."""
        import torch.nn.functional as F  # noqa: PLC0415

        out = model.forward(t3_cond=cond, text_tokens=b["text"], text_token_lens=b["text_lens"], speech_tokens=b["speech"], speech_token_lens=b["speech_lens"], training=True)

        def shifted(logits, tokens, lens):
            x = logits[:, :-1].float().transpose(1, 2)  # (B, V, T-1): position t predicts token t+1
            y = tokens[:, 1:].clone()
            pos = torch.arange(y.size(1), device=y.device)[None]
            y[pos >= (lens[:, None] - 1)] = -100  # beyond the sequence (the last real token has no successor)
            return F.cross_entropy(x, y, ignore_index=-100)

        return shifted(out.text_logits, b["text"], b["text_lens"]), shifted(out.speech_logits, b["speech"], b["speech_lens"])

    def checkpoint(step: int, losses: dict[str, float]) -> Path:
        ck = out_dir / f"step-{step:06d}"
        ck.mkdir(parents=True, exist_ok=True)
        peft_model.save_pretrained(str(ck / "adapter"))
        from safetensors.torch import save_file  # type: ignore

        merged = merged_state_dict(t3, base_sd, train_rows)
        save_file({k: v.contiguous() for k, v in merged.items()}, str(ck / iq_model.MERGED_FILE))
        prov = {**provenance_base, "step": step, "losses": losses, "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "merged_sha256": sha256_file(ck / iq_model.MERGED_FILE), "prompts": {"from_other_utterance": other_count, "tiled": tiled_count}}
        (ck / iq_model.PROVENANCE_FILE).write_text(json.dumps(prov, ensure_ascii=False, indent=2), encoding="utf-8")
        log(f"[train] checkpoint {ck} (merged sha256 {prov['merged_sha256'][:12]})")
        return ck

    recent: list[dict[str, float]] = []
    with open(log_path, "a", encoding="utf-8") as logf:
        while step < args.steps and stopped is None:
            lr = lr_at(step, args)
            for g in opt.param_groups:
                g["lr"] = lr * float(g.get("lr_scale", 1.0))
            opt.zero_grad(set_to_none=True)
            acc = {"loss": 0.0, "loss_text": 0.0, "loss_speech": 0.0}
            n_replay = 0
            for _ in range(accum):
                items, nr = sample(args.micro_batch)
                n_replay += nr
                b = collate(items, t3.hp, device)
                cond = T3Cond(speaker_emb=b["ve"], cond_prompt_speech_tokens=b["prompt"], emotion_adv=torch.full((len(items), 1, 1), 0.5, device=device))
                with torch.autocast("cuda", dtype=torch.bfloat16, enabled=bool(args.bf16)):
                    lt, ls = t3_losses(t3, cond, b)
                    loss = args.text_loss_weight * lt + ls
                (loss / accum).backward()
                acc["loss"] += float(loss.detach()) / accum
                acc["loss_text"] += float(lt.detach()) / accum
                acc["loss_speech"] += float(ls.detach()) / accum
            gn = float(torch.nn.utils.clip_grad_norm_([p for g in groups for p in g["params"]], args.clip))
            if not math.isfinite(gn):
                stopped = f"non-finite gradient norm at step {step}"
                break
            opt.step()
            if emb_param is not None:
                with torch.no_grad():  # exact: frozen rows back to the base (the mask zeroes their gradient; this guards the optimizer's own moves)
                    emb_param.data = torch.where(row_mask_t.bool(), emb_param.data, frozen_rows_snapshot)
            step += 1
            rec = {"step": step, **{k: round(v, 5) for k, v in acc.items()}, "lr": lr, "grad_norm": round(gn, 4), "replay_share": round(n_replay / args.batch, 3), "seconds": round(time.time() - t_start, 1)}
            recent.append(acc)
            logf.write(json.dumps(rec) + "\n")
            logf.flush()
            if step % args.log_every == 0 or step == 1:
                log(f"[train] step {step}/{args.steps} loss {acc['loss']:.4f} (text {acc['loss_text']:.4f} speech {acc['loss_speech']:.4f}) lr {lr:.2e} gn {gn:.3f} replay {rec['replay_share']:.2f} {rec['seconds']:.0f}s")
            if step % args.checkpoint_every == 0 or step == args.steps:
                mean = {k: round(sum(r[k] for r in recent[-args.checkpoint_every:]) / len(recent[-args.checkpoint_every:]), 5) for k in acc}
                checkpoint(step, mean)
                verdict_path = Path(args.eval_file) if args.eval_file else None
                if verdict_path and args.wait_eval_seconds > 0:
                    t_wait = time.time()
                    while time.time() - t_wait < args.wait_eval_seconds:
                        v = read_verdict(verdict_path)
                        if v and int(v.get("step", -1)) == step:
                            break
                        time.sleep(5)
                stopped = stop_reason(read_verdict(verdict_path), step, args)
    summary = {"name": args.name, "steps_done": step, "stopped": stopped, "seconds": round(time.time() - t_start, 1), "final_loss": recent[-1] if recent else None, "prompts": {"from_other_utterance": other_count, "tiled": tiled_count}, "checkpoints": sorted(p.name for p in out_dir.glob("step-*"))}
    (out_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    log(json.dumps(summary, ensure_ascii=False))
    if stopped:
        log(f"[train] STOPPED: {stopped}")


if __name__ == "__main__":
    main()
