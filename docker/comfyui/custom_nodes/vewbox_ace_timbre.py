"""VEWBOX — ACE-Step 1.5 TIMBRE REFERENCE, the way the official text2music task uses `reference_audio` (Phase 3,
producer directive 2026-10-07: test ACE-Step's own reference audio before any singing-voice model is considered).

ComfyUI's own "Set Reference Audio" node (comfy_extras/nodes_ace.py, ReferenceTimbreAudio) puts the reference in
`reference_audio_timbre_latents`, and comfy/model_base.py ACEStep15.extra_conds then DROPS the 5Hz LM's audio codes and
marks the generation a cover: the song's musical content is tokenised from the reference itself. With a short speech
reference that is a cover of speech, not a song in that voice. The official ACE-Step 1.5 text2music task instead keeps
the LM (it is skipped only for cover/repaint/extract) and sends the reference to the timbre encoder.

This node does the official thing: it stores the reference latents under its own key; the patched extra_conds runs
ComfyUI's normal text2music path unchanged (audio codes from the LM, src latents from the codes) and then replaces ONLY
the timbre encoder's input (`refer_audio`, otherwise a silence latent) with the reference — trimmed to 750 latent
frames (30 s at 25 Hz) and padded with the silence latent, exactly as ComfyUI shapes its own reference. Nothing else
in the graph changes. Whether the result sounds like the reference's speaker is what the controlled test measures; this
node claims nothing.
"""
import torch

import comfy.conds
import comfy.ldm.ace.ace_step15 as ace15
import comfy.model_base
import node_helpers

KEY = "vewbox_timbre_latents"
MAX_FRAMES = 750

_original_extra_conds = comfy.model_base.ACEStep15.extra_conds


def _extra_conds(self, **kwargs):
    timbre = kwargs.pop(KEY, None)
    out = _original_extra_conds(self, **kwargs)
    if timbre:
        noise, device = kwargs["noise"], kwargs["device"]
        ref = timbre[-1].to(device)[:, :, : min(MAX_FRAMES, noise.shape[2])]
        if ref.shape[2] < noise.shape[2]:
            pad = ace15.get_silence_latent(noise.shape[2], device)
            ref = torch.cat([ref.to(pad), pad[:, :, ref.shape[2]:]], dim=2)
        out["refer_audio"] = comfy.conds.CONDRegular(ref)
    return out


if getattr(comfy.model_base.ACEStep15.extra_conds, "__name__", "") != "_extra_conds":
    comfy.model_base.ACEStep15.extra_conds = _extra_conds


class VewboxAceTimbreReference:
    """Conditioning + the VAE-encoded reference audio → conditioning that carries the reference as TIMBRE only."""

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"conditioning": ("CONDITIONING",), "latent": ("LATENT",)}}

    RETURN_TYPES = ("CONDITIONING",)
    FUNCTION = "apply"
    CATEGORY = "vewbox"

    def apply(self, conditioning, latent):
        return (node_helpers.conditioning_set_values(conditioning, {KEY: [latent["samples"]]}, append=True),)


NODE_CLASS_MAPPINGS = {"VewboxAceTimbreReference": VewboxAceTimbreReference}
NODE_DISPLAY_NAME_MAPPINGS = {"VewboxAceTimbreReference": "Vewbox ACE-Step timbre reference (text2music)"}
