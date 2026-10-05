"""qa.py — the pure parts: face-track association, mouth aperture, envelopes and speech masks, activity scoring, lag
search, speaker choice and flags, identity assignment and aggregation. No MediaPipe, no OpenCV, no media."""
import math

import numpy as np
import pytest

import qa as Q


# ---------------------------------------------------------------- tracks


def test_iou():
    assert Q.iou((0, 0, 10, 10), (0, 0, 10, 10)) == 1.0
    assert Q.iou((0, 0, 10, 10), (20, 20, 30, 30)) == 0.0
    assert Q.iou((0, 0, 10, 10), (5, 0, 15, 10)) == pytest.approx(50 / 150)


def test_associate_is_greedy_one_to_one():
    tracks = [(0, 0, 10, 10), (100, 0, 110, 10)]
    dets = [(101, 0, 111, 10), (1, 0, 11, 10), (300, 0, 310, 10)]
    assert Q.associate(tracks, dets, 0.3) == [(0, 1), (1, 0)]
    # two detections competing for one track: the better overlap wins, the other stays unmatched
    assert Q.associate([(0, 0, 10, 10)], [(4, 0, 14, 10), (1, 0, 11, 10)], 0.3) == [(0, 1)]


def test_track_faces_links_moving_faces_and_bridges_short_gaps():
    a = lambda x: ((x, 0.0, x + 50.0, 60.0), 0.1)  # noqa: E731
    b = lambda x: ((x, 0.0, x + 50.0, 60.0), 0.2)  # noqa: E731
    frames = []
    for f in range(30):
        dets = [a(10 + f)]  # drifts right one pixel per frame
        if not (10 <= f < 13):  # B is missed for 3 frames: within the gap allowance
            dets.append(b(300 - f))
        frames.append(dets)
    tracks = Q.track_faces(frames, min_iou=0.3, max_gap=6)
    assert len(tracks) == 2
    ta, tb = sorted(tracks, key=lambda t: t.boxes[0][0])
    assert len(ta.frames) == 30 and set(ta.values) == {0.1}
    assert len(tb.frames) == 27 and set(tb.values) == {0.2}
    s = Q.track_series(tb, 30)
    assert np.isnan(s[10:13]).all() and s[9] == 0.2


def test_track_faces_long_gap_starts_a_new_track():
    box = ((0.0, 0.0, 50.0, 60.0), 0.3)
    frames = [[box]] * 5 + [[]] * 10 + [[box]] * 5
    tracks = Q.track_faces(frames, min_iou=0.3, max_gap=6)
    assert [t.frames[0] for t in tracks] == [0, 15]


def test_mouth_aperture_and_box():
    xy = np.zeros((478, 2))
    xy[61] = (100, 200)
    xy[291] = (150, 200)  # width 50
    for u, l in Q.LIP_PAIRS:
        xy[u] = (125, 195)
        xy[l] = (125, 205)  # gap 10
    assert Q.mouth_aperture(xy) == pytest.approx(0.2)
    xy2 = xy.copy()
    xy2[291] = xy2[61]
    assert math.isnan(Q.mouth_aperture(xy2))
    assert Q.landmarks_box(np.array([[1, 2], [5, 9], [3, 4]], dtype=float)) == (1, 2, 5, 9)


# ---------------------------------------------------------------- audio


def test_frame_envelope_db_of_a_sine():
    sr, fps = 16000, 25
    t = np.arange(sr) / sr
    audio = 0.5 * np.sin(2 * np.pi * 200 * t)
    env = Q.frame_envelope_db(audio.astype(np.float32), sr, fps, 25)
    assert env == pytest.approx(np.full(25, 20 * math.log10(0.5 / math.sqrt(2))), abs=0.05)
    silent = Q.frame_envelope_db(np.zeros(sr, dtype=np.float32), sr, fps, 30)  # frames past the end stay at the floor
    assert (silent == Q.ENVELOPE_FLOOR_DB).all()


def test_place_audio_pads_or_cuts_the_head():
    a = np.arange(1, 5, dtype=np.float32)  # 4 samples at 2 Hz = 2 s
    assert Q.place_audio(a, 2, 1.0).tolist() == [0, 0, 1, 2, 3, 4]
    assert Q.place_audio(a, 2, -0.5).tolist() == [2, 3, 4]
    assert Q.place_audio(a, 2, 0.0) is a


def test_parse_windows_accepts_three_shapes():
    assert Q.parse_windows([{"start": 0.5, "end": 1.0}]) == [(0.5, 1.0)]
    assert Q.parse_windows([[0, 1], [2, 3]]) == [(0.0, 1.0), (2.0, 3.0)]
    align_answer = {"words": [{"text": "hi", "start": 1.0, "end": 1.2}, {"text": "x", "start": None, "end": None}]}
    assert Q.parse_windows(align_answer) == [(1.0, 1.2)]
    assert Q.parse_windows(None) == []
    with pytest.raises(Q.QaInputError):
        Q.parse_windows([{"start": 2, "end": 1}])
    with pytest.raises(Q.QaInputError):
        Q.parse_windows(["nope"])


def test_speech_mask_from_windows_uses_frame_centres():
    m = Q.speech_mask_from_windows([(0.1, 0.3)], fps=10, n_frames=5)
    assert m.tolist() == [False, True, True, False, False]


def test_energy_vad_and_short_runs():
    env = np.full(100, -60.0)
    env[20:40] = -20.0
    env[60:62] = -20.0  # a 2-frame click: dropped
    m = Q.speech_mask_from_envelope(env, above_floor_db=12, min_dbfs=-45, min_run=3)
    assert m[20:40].all() and not m[:20].any() and not m[40:].any()
    assert not Q.speech_mask_from_envelope(np.full(10, -50.0)).any()  # nothing above the floor


# ---------------------------------------------------------------- scoring


def smooth_noise(n, seed):
    rng = np.random.default_rng(seed)
    x = np.convolve(rng.standard_normal(n + 8), np.ones(5) / 5, mode="same")[4:n + 4]
    return x


def test_activity_stats_inside_vs_outside():
    fps = 25
    speech = np.zeros(100, dtype=bool)
    speech[30:70] = True
    ap = np.full(100, 0.05)
    ap[30:70] = 0.05 + 0.1 * (np.arange(40) % 2)  # opens and closes only while speaking
    act = Q.mouth_activity(ap, fps)
    st = Q.activity_stats(act, speech)
    assert st["inside"] == pytest.approx((39 * 0.1 * fps + 0) / 40, rel=0.05)
    assert st["outside"] < 0.2 and st["ratio"] > 10
    assert st["inside_frames"] == 40 and st["outside_frames"] == 59  # frame 0 has no velocity


@pytest.mark.parametrize("shift", [3, -2, 0])
def test_lag_search_finds_the_shift(shift):
    audio = smooth_noise(200, 1)
    mouth = np.roll(audio, shift)  # mouth[t] = audio[t - shift]
    mouth[: max(shift, 0)] = np.nan
    if shift < 0:
        mouth[shift:] = np.nan
    lag, r = Q.best_lag(Q.lagged_correlation(mouth, audio, 5))
    assert lag == shift and r == pytest.approx(1.0)


def test_lag_search_ignores_missing_frames_and_handles_no_data():
    a = np.full(50, np.nan)
    assert Q.best_lag(Q.lagged_correlation(a, np.arange(50.0), 3)) == (None, None)
    assert Q.pearson(np.ones(10), np.arange(10.0)) is None  # constant: undefined


def make_tracks(n, series_by_id):
    tracks = []
    for tid, s in series_by_id.items():
        frames = [i for i in range(n) if not np.isnan(s[i])]
        x = 100.0 * tid
        tracks.append(Q.Track(id=tid, frames=frames, boxes=[(x, 0.0, x + 50.0, 60.0)] * len(frames), values=[float(s[i]) for i in frames]))
    return tracks


def speech_scene(n=200):
    """Speech in two bursts; an envelope (dB) that moves syllable by syllable inside them."""
    speech = np.zeros(n, dtype=bool)
    speech[20:80] = True
    speech[120:180] = True
    syll = smooth_noise(n, 7)
    env = np.where(speech, -20 + 8 * syll / np.abs(syll).max(), -60.0)
    return env, speech


def test_speaker_is_chosen_and_a_still_listener_is_clean():
    fps, n = 25, 200
    env, speech = speech_scene(n)
    speaker = np.where(speech, 0.25 + 0.2 * (env + 20) / 8, 0.05)  # opens with the loudness
    listener = 0.05 + 0.002 * np.sin(np.arange(n) / 7)  # barely moves
    out = Q.score_tracks(make_tracks(n, {0: listener, 1: speaker}), n, env, speech, fps, max_lag=5, speakers=1)
    assert out["speaker_tracks"] == [1]
    t = {r["id"]: r for r in out["tracks"]}
    assert t[1]["is_speaker"] and t[1]["flags"] == [] and t[1]["best_lag_frames"] == 0 and t[1]["corr_best"] > 0.9
    assert t[0]["flags"] == []


def test_extra_singer_and_still_speaker_are_flagged():
    fps, n = 25, 200
    env, speech = speech_scene(n)
    lead = np.where(speech, 0.25 + 0.2 * (env + 20) / 8, 0.05)
    extra = np.roll(lead, 1)  # another face mouthing the same vocals, one frame late
    out = Q.score_tracks(make_tracks(n, {0: lead, 1: extra}), n, env, speech, fps, max_lag=5, speakers=1, mode="singing")
    t = {r["id"]: r for r in out["tracks"]}
    speaker = out["speaker_tracks"][0]
    other = 1 - speaker
    assert t[other]["flags"] == ["EXTRA_SINGER"]
    out = Q.score_tracks(make_tracks(n, {0: lead, 1: extra}), n, env, speech, fps, max_lag=5, speakers=1, mode="speech")
    assert {r["id"]: r for r in out["tracks"]}[other]["flags"] == ["NON_SPEAKER_TALKING"]
    # a duet: both are expected to sing, nobody is flagged
    out = Q.score_tracks(make_tracks(n, {0: lead, 1: extra}), n, env, speech, fps, max_lag=5, speakers=2, mode="singing")
    assert sorted(out["speaker_tracks"]) == [0, 1] and all(r["flags"] == [] for r in out["tracks"])
    # the only face on screen keeps its mouth shut through the line
    still = np.full(n, 0.05)
    out = Q.score_tracks(make_tracks(n, {0: still}), n, env, speech, fps, max_lag=5, speakers=1)
    assert out["tracks"][0]["is_speaker"] and "MOUTH_STILL_WHILE_SPEAKING" in out["tracks"][0]["flags"]


def test_mouth_moving_while_silent_and_short_tracks():
    fps, n = 25, 200
    env, speech = speech_scene(n)
    chatter = 0.2 + 0.1 * (np.arange(n) % 2)  # moves the whole time, inside and outside speech alike
    short = np.full(n, np.nan)
    short[:5] = 0.1
    out = Q.score_tracks(make_tracks(n, {0: chatter, 1: short}), n, env, speech, fps, max_lag=5, speakers=1)
    t = {r["id"]: r for r in out["tracks"]}
    assert t[0]["is_speaker"] and "MOUTH_MOVING_WHILE_SILENT" in t[0]["flags"]
    assert t[1]["scored"] is False and t[1]["is_speaker"] is False


def test_no_speech_means_no_speaker():
    n = 100
    ap = 0.1 + 0.05 * np.sin(np.arange(n))
    out = Q.score_tracks(make_tracks(n, {0: ap}), n, np.full(n, -60.0), np.zeros(n, dtype=bool), 25, 5, 1)
    assert out["speaker_tracks"] == [] and out["tracks"][0]["activity_inside"] is None


# ---------------------------------------------------------------- identity


def test_cosine():
    assert Q.cosine([1, 0], [1, 0]) == 1.0
    assert Q.cosine([1, 0], [0, 1]) == 0.0
    assert Q.cosine([0, 0], [1, 1]) == 0.0


def test_assign_faces_one_to_one():
    # face 0 is the best match for BOTH characters; character 0 takes it (0.9), character 1 gets face 1
    sim = np.array([[0.9, 0.8], [0.1, 0.5]])
    assert Q.assign_faces(sim) == {0: (0, 0.9), 1: (1, 0.5)}
    assert Q.assign_faces(np.array([[0.2], [0.7], [0.4]])) == {0: (1, 0.7)}
    assert Q.assign_faces(np.zeros((0, 2))) == {}
    assert Q.assign_faces(np.array([[0.6, 0.3]])) == {0: (0, 0.6)}  # one face, two characters: one stays unseen


def test_aggregate_identity():
    s = Q.aggregate_identity([0.7, None, 0.6, 0.3, 0.65], threshold=0.363)
    assert s["frames"] == 5 and s["frames_with_face"] == 4
    assert s["min"] == 0.3 and s["median"] == pytest.approx(0.625) and s["below_threshold"] == 1 and s["share_below"] == 0.25
    assert s["drift"] == pytest.approx(0.4)
    empty = Q.aggregate_identity([None, None])
    assert empty["frames_with_face"] == 0 and empty["median"] is None


# ---------------------------------------------------------------- availability


def test_syncnet_is_disabled_without_its_folder(monkeypatch, tmp_path):
    monkeypatch.setattr(Q, "SYNCNET_DIR", str(tmp_path / "missing"))
    st = Q.syncnet_check("x.mp4")
    assert st["available"] is False and "does not exist" in st["reason"]
    monkeypatch.setattr(Q, "SYNCNET_DIR", str(tmp_path))
    assert Q.syncnet_status()["available"] is False  # interface only, even when the folder exists


def test_status_explains_missing_packages(monkeypatch):
    monkeypatch.setattr(Q.importlib.util, "find_spec", lambda name: None)
    st = Q.status()
    assert st["mouth"]["available"] is False and "mediapipe" in st["mouth"]["reason"]
    assert st["identity"]["available"] is False and "cv2" in st["identity"]["reason"]
    assert st["syncnet"]["available"] is False


def test_scaled_size_keeps_even_dimensions():
    assert Q.scaled_size(1920, 1080, 960) == (960, 540)
    assert Q.scaled_size(1280, 736, 960) == (960, 552)
    assert Q.scaled_size(640, 360, 960) == (640, 360)
