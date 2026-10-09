"""Build-time helper (docker/tts-iq/Dockerfile): print upstream's dependency list from the pinned chatterbox checkout's
pyproject.toml as requirement lines (its own pins and environment markers kept), minus the packages the image installs
differently: torch/torchaudio (cu128 2.8.0 first, sm_120), resemble-perth (a moving git master upstream → the PyPI
release 1.0.1), s3tokenizer (unpinned upstream → 0.3.0) and gradio (the demo UI, not the library).
    python requirements-from-pyproject.py /opt/chatterbox/pyproject.toml > requirements.txt"""
import re
import sys
import tomllib

DROP = {"torch", "torchaudio", "resemble-perth", "gradio", "s3tokenizer"}
with open(sys.argv[1], "rb") as f:
    deps = tomllib.load(f)["project"]["dependencies"]
for d in deps:
    name = re.split(r"[\s;@<>=!~\[]", d.strip(), 1)[0].lower()
    if name in DROP:
        continue
    print(d)
