# Vewbox build: replaces latentsync/utils/face_detector.py (LatentSync @ a229c39), which imports InsightFace
# (`insightface.app.FaceAnalysis`, buffalo_l). InsightFace's model packs are licensed for non-commercial research only,
# so neither the package nor its weights are installed. Face detection and alignment are done by the service itself
# (docker/lipsync/face_track.py: YuNet + MediaPipe → LatentSync 1.5's 68-point alignment points), which never calls this
# class; ImageProcessor only constructs it when given a CUDA device, and the service passes device="cpu".


class FaceDetector:
    def __init__(self, device="cuda"):
        self.device = device

    def __call__(self, frame, threshold=0.5):
        raise NotImplementedError("InsightFace is not part of the Vewbox build; faces are aligned by docker/lipsync/face_track.py")
