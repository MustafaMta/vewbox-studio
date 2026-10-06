# Vewbox build: a stand-in for `decord`, which latentsync/utils/util.py imports at module level but the corrector's
# inference path never uses (frames and audio are decoded with ffmpeg; Whisper reads audio through ffmpeg). decord 0.6.0
# publishes no wheel for Python 3.12. Any real use fails loudly.


class _Missing:
    def __init__(self, *args, **kwargs):
        raise RuntimeError("decord is not installed in the Vewbox lipsync image (the corrector decodes with ffmpeg)")


class VideoReader(_Missing):
    pass


class AudioReader(_Missing):
    pass
