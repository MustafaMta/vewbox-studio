"""Unit tests of the corrector's pure face-tracking and compositing (numpy + cv2 only).

    python -m pytest docker/lipsync/tests            (pytest installed)
    python docker/lipsync/tests/test_face_track.py   (no pytest: runs every test_ function)
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import face_track as ft  # noqa: E402


def mesh_with(points: dict[int, tuple[float, float]]) -> np.ndarray:
    m = np.zeros((478, 3))
    for i, (x, y) in points.items():
        m[i, :2] = (x, y)
    return m


def test_lm68_table_is_the_15_release_table():
    assert len(ft.LM68_FROM_MP478) == 68
    assert ft.LM68_FROM_MP478[17:22] == (71, 63, 105, 66, 107)
    assert ft.LM68_FROM_MP478[22:27] == (336, 296, 334, 293, 301)
    assert ft.LM68_FROM_MP478[27:36] == (168, 197, 5, 4, 75, 97, 2, 326, 305)
    assert len(set(ft.LM68_FROM_MP478)) == 68


def test_align_points_are_eyebrow_centres_and_nose():
    pts = {}
    for i in (71, 63, 105, 66, 107):
        pts[i] = (100.0, 50.0)
    for i in (336, 296, 334, 293, 301):
        pts[i] = (200.0, 52.0)
    for i in (168, 197, 5, 4, 75, 97, 2, 326, 305):
        pts[i] = (150.0, 100.0)
    p3 = ft.align_points3(ft.lm68_from_mp478(mesh_with(pts)))
    assert np.allclose(p3, [[100, 50], [200, 52], [150, 100]])


def test_lm68_refuses_a_short_mesh():
    try:
        ft.lm68_from_mp478(np.zeros((68, 2)))
    except ValueError:
        return
    raise AssertionError("expected ValueError")


def test_smoother_damps_jitter_and_follows_motion():
    s = ft.LaplacianSmooth()
    base = np.array([[0.0, 0.0], [100.0, 0.0], [50.0, 80.0]])
    s.smooth(base)
    jit = s.smooth(base + 0.5)
    assert np.all(np.abs(jit - base) < 0.5)  # a half-pixel jitter is mostly absorbed
    moved = s.smooth(base + 40.0)
    assert np.all(moved - base > 35.0)  # a real move passes almost entirely
    s.reset()
    assert np.allclose(s.smooth(base + 7), base + 7)


def test_choose_face_by_identity_never_takes_another_character():
    a = ft.Detection(box=(0, 0, 100, 100), score=0.9, identity=0.2)
    b = ft.Detection(box=(300, 0, 380, 90), score=0.9, identity=0.62)
    assert ft.choose_face([a, b], prev=None) == 1
    # the speaker is not in the frame: nothing is corrected rather than the other face
    assert ft.choose_face([a], prev=None) is None
    # near-equal identities: continuity with the previous box decides
    c = ft.Detection(box=(0, 0, 100, 100), score=0.9, identity=0.60)
    assert ft.choose_face([b, c], prev=(2, 2, 98, 98)) == 1


def test_choose_face_without_identity_continuity_hint_largest():
    small = ft.Detection(box=(0, 0, 50, 50), score=0.9)
    big = ft.Detection(box=(200, 200, 400, 400), score=0.9)
    assert ft.choose_face([small, big], prev=None) == 1  # largest
    assert ft.choose_face([small, big], prev=(2, 2, 48, 48)) == 0  # continues the track
    assert ft.choose_face([small, big], prev=None, hint=(0, 0, 60, 60)) == 0  # hint
    assert ft.choose_face([], prev=None) is None


def test_fill_gaps_bridges_short_gaps_only():
    p = lambda v: np.array([[v, 0.0], [v + 10, 0.0], [v + 5, 10.0]])  # noqa: E731
    seq = [p(0), None, None, p(30)] + [None] * 10 + [p(100)]
    out, found = ft.fill_gaps(seq, max_gap=3)
    assert found == [True, False, False, True] + [False] * 10 + [True]
    assert np.allclose(out[1], p(10)) and np.allclose(out[2], p(20))
    # a long gap is held at the nearest found points, not interpolated across a cut-away
    assert np.allclose(out[5], p(30)) and np.allclose(out[12], p(100))
    edit = ft.bridged(found, max_gap=3)
    assert edit[:4] == [True, True, True, True] and not any(edit[4:14]) and edit[14]


def test_fill_gaps_holds_ends_and_handles_no_face():
    p = np.array([[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]])
    out, found = ft.fill_gaps([None, p, None])
    assert np.allclose(out[0], p) and np.allclose(out[2], p)
    assert found == [False, True, False]
    out, found = ft.fill_gaps([None, None])
    assert out == [None, None] and found == [False, False]


def test_runs_of():
    assert ft.runs_of([True, False, False, True, False]) == [(1, 2), (4, 4)]
    assert ft.runs_of([True, True]) == []


def test_crop_square_and_mesh_pick():
    x0, y0, side = ft.crop_square((100, 100, 200, 160), 2.0, 640, 480)
    assert side == 200 and (x0, y0) == (50, 30)
    assert ft.pick_mesh_near([(10, 10), (190, 190)], (192, 192)) == 1
    assert ft.pick_mesh_near([], (0, 0)) is None


def test_composite_keeps_every_pixel_outside_the_mask():
    import cv2

    rng = np.random.default_rng(0)
    frame = rng.integers(0, 255, (120, 160, 3), dtype=np.uint8)
    # identity-like affine: crop = frame region (40..120, 20..100) scaled 1:1
    m = np.array([[1.0, 0.0, -40.0], [0.0, 1.0, -20.0]])
    keep = np.ones((80, 80), np.float32)
    keep[50:, 10:70] = 0.0  # the lower region is regenerated
    w = ft.face_weight(keep, feather_frac=0.1, erode_frac=0.05)
    gen = np.full((80, 80, 3), 255, np.uint8)
    out, wt = ft.composite(frame, gen, w, m)
    outside = wt <= 1e-6
    assert outside.sum() > 0.8 * wt.size
    assert np.array_equal(out[outside], frame[outside])  # bit-identical outside the region
    centre = (20 + 65, 40 + 40)  # a point well inside the regenerated region (y, x)
    assert wt[centre] > 0.95 and np.all(out[centre] >= 250)
    st = ft.masked_stats(frame, out, wt)
    assert st["outside_mad"] == 0.0 and st["inside_mad"] > 10
    assert cv2 is not None


def test_face_weight_is_inside_the_regenerated_region():
    keep = np.ones((100, 100), np.float32)
    keep[60:, :] = 0.0
    w = ft.face_weight(keep, feather_frac=0.06, erode_frac=0.03)
    assert w[:55].max() < 0.05  # nothing bleeds into the kept upper face
    assert w[90, 50] > 0.99
    assert 0.0 <= w.min() and w.max() <= 1.0


def test_track_report_summary():
    r = ft.TrackReport(frames=10, found=8, bridged=1, edited=9, face_height_px=[130, 150, 140], identity=[0.6, 0.7], lost_runs=[(3, 4)])
    s = r.summary()
    assert s["face_height_px"] == {"median": 140.0, "min": 130.0}
    assert s["identity_to_reference"]["min"] == 0.6
    assert s["lost_runs"] == [[3, 4]]


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for fn in fns:
        fn()
        print("ok", fn.__name__)
    print(f"{len(fns)} passed")
