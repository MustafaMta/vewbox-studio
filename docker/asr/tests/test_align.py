"""align.py — the pure parts: normalisers, tokenisation, trellis/backtrack on synthetic emissions with a known path,
segment merging, word times, emission windowing. No model, no torch."""
import math

import numpy as np
import pytest

import align as A

# a toy wav2vec2-style vocabulary: <pad> is the CTC blank, "|" the word delimiter, upper-case letters
EN_VOCAB = {"<pad>": 0, "<s>": 1, "</s>": 2, "<unk>": 3, "|": 4, "'": 5, **{c: 6 + i for i, c in enumerate("ABCDEFGHIJKLMNOPQRSTUVWXYZ")}}
AR_LETTERS = "ءابتثجحخدذرزسشصضطظعغفقكلمنهوي"  # no ة, ى, أ, گ: those must fall back
AR_VOCAB = {"<pad>": 0, "|": 1, **{c: 2 + i for i, c in enumerate(AR_LETTERS)}}
BW_VOCAB = {"<pad>": 0, "|": 1, **{A.BUCKWALTER[c]: 2 + i for i, c in enumerate(AR_LETTERS)}}


def emission_for(path_tokens, T, V, at, p=0.9):
    """Log-probs where frame at[k] emits path_tokens[k] with probability p and every other frame is blank (id 0)."""
    e = np.full((T, V), (1 - p) / (V - 1))
    e[:, 0] = p
    for tok, t in zip(path_tokens, at):
        e[t, :] = (1 - p) / (V - 1)
        e[t, tok] = p
    return np.log(e)


# ---------------------------------------------------------------- normalisation


@pytest.mark.parametrize("raw,norm", [
    ("Hello,", "hello"), ("I’ll", "i'll"), ("Thirty-two", "thirty two"), ("32", "thirty two"), ("1,000", "one thousand"),
    ("2026", "two thousand twenty six"), ("007", "007"), ("rock&roll", "rock and roll"), ("'87", "eighty seven"), ("well—known", "well known"),
])
def test_normalize_en(raw, norm):
    assert A.normalize_en_word(raw) == norm


def test_spell_number_limits():
    assert A.spell_number("0") == "zero"
    assert A.spell_number("115") == "one hundred fifteen"
    assert A.spell_number("1000000") == "1000000"  # beyond a million stays digits (unalignable, interpolated)


@pytest.mark.parametrize("raw,norm", [
    ("مُحَمَّدٌ", "محمد"),  # harakat, shadda, tanwin
    ("جـمـيـل", "جميل"),  # tatweel
    ("شلونك؟", "شلونك"),  # Arabic question mark
    ("هٰذا", "هذا"),  # dagger alef
    ("٣", "3"),  # Arabic-Indic digit → ASCII (left unaligned)
    ("ﻻ", "لا"),  # presentation form → base letters (NFKC)
])
def test_normalize_ar(raw, norm):
    assert A.normalize_ar_word(raw) == norm


def test_split_script_drops_punctuation_only_tokens():
    assert A.split_script("Wait — what?  … No!") == ["Wait", "what?", "No!"]


def test_vocab_modes_and_case():
    assert A.arabic_vocab_mode(AR_VOCAB) == "arabic"
    assert A.arabic_vocab_mode(BW_VOCAB) == "buckwalter"
    assert A.arabic_vocab_mode(EN_VOCAB) == "none"
    assert A.latin_case(EN_VOCAB) == "upper"
    assert A.latin_case({c.lower(): i for c, i in EN_VOCAB.items()}) == "lower"
    assert A.word_delimiter(EN_VOCAB) == 4
    assert A.word_delimiter({"a": 1}) is None


def test_map_char_fallbacks():
    assert A.map_char("a", EN_VOCAB, "en", case="upper") == EN_VOCAB["A"]
    assert A.map_char("é", EN_VOCAB, "en", case="upper") is None
    assert A.map_char("ب", AR_VOCAB, "ar", "arabic") == AR_VOCAB["ب"]
    assert A.map_char("أ", AR_VOCAB, "ar", "arabic") == AR_VOCAB["ا"]  # hamza-on-alef → bare alef
    assert A.map_char("ة", AR_VOCAB, "ar", "arabic") == AR_VOCAB["ه"]
    assert A.map_char("گ", AR_VOCAB, "ar", "arabic") == AR_VOCAB["ك"]
    assert A.map_char("ش", BW_VOCAB, "ar", "buckwalter") == BW_VOCAB["$"]
    assert A.map_char("گ", BW_VOCAB, "ar", "buckwalter") == BW_VOCAB["k"]
    assert A.map_char("3", AR_VOCAB, "ar", "arabic") is None


def test_plan_tokens_delimiters_and_owners():
    plan = A.plan_tokens("Hi, you!", "en", EN_VOCAB)
    V = EN_VOCAB
    assert plan.tokens == [V["H"], V["I"], V["|"], V["Y"], V["O"], V["U"]]
    assert plan.owners == [(0, 0), (0, 1), (-1, -1), (1, 0), (1, 1), (1, 2)]
    # a spelled number is one word whose parts are separated by the delimiter
    plan = A.plan_tokens("32", "en", EN_VOCAB)
    assert [w.text for w in plan.words] == ["32"] and plan.words[0].norm == "thirty two"
    assert plan.tokens.count(V["|"]) == 1


def test_plan_tokens_unknown_word_is_skipped_without_double_delimiter():
    plan = A.plan_tokens("go 007 now", "en", EN_VOCAB)
    V = EN_VOCAB
    assert plan.tokens == [V["G"], V["O"], V["|"], V["N"], V["O"], V["W"]]
    assert [w.text for w in plan.words] == ["go", "007", "now"]


def test_plan_tokens_rejects_bad_language_and_non_arabic_vocab():
    with pytest.raises(A.AlignmentError):
        A.plan_tokens("x", "fr", EN_VOCAB)
    with pytest.raises(A.AlignmentUnavailable):
        A.plan_tokens("سلام", "ar", EN_VOCAB)


# ---------------------------------------------------------------- trellis / backtrack


def test_trellis_backtrack_recovers_known_path():
    tokens = [2, 3, 4]
    em = emission_for(tokens, T=10, V=5, at=[1, 4, 7])
    trellis = A.get_trellis(em, tokens, 0)
    assert trellis.shape == (11, 4)
    assert trellis[0, 0] == 0 and np.isneginf(trellis[0, 1:]).all()
    path = A.backtrack(trellis, em, tokens, 0)
    segs = A.merge_repeats(path)
    assert [(s.token_index, s.start, s.end) for s in segs] == [(0, 1, 4), (1, 4, 7), (2, 7, 8)]
    # the emitting frame scores 0.9 and so do the blank frames that follow it
    assert all(abs(s.score - 0.9) < 1e-9 for s in segs)


def test_trellis_matches_brute_force_best_path():
    rng = np.random.default_rng(3)
    T, V, tokens = 7, 4, [1, 2, 1]
    em = np.log(rng.dirichlet(np.ones(V), size=T))
    trellis = A.get_trellis(em, tokens, 0)
    # brute force: within the first t frames, choose the frames at which each token is emitted (strictly increasing);
    # every other frame among the first t emits blank
    import itertools

    for t in range(len(tokens), T + 1):
        best = -math.inf
        for frames in itertools.combinations(range(t), len(tokens)):
            s = sum(em[f, 0] for f in range(t) if f not in frames) + sum(em[f, tok] for f, tok in zip(frames, tokens))
            best = max(best, s)
        assert trellis[t, len(tokens)] == pytest.approx(best)
    assert np.isneginf(trellis[: len(tokens), len(tokens)]).all()


def test_repeated_letters_are_separate_segments():
    V = EN_VOCAB
    tokens = [V["L"], V["L"]]
    em = emission_for(tokens, T=8, V=len(V), at=[2, 5])
    path = A.backtrack(A.get_trellis(em, tokens, 0), em, tokens, 0)
    segs = A.merge_repeats(path)
    assert [(s.token_index, s.start) for s in segs] == [(0, 2), (1, 5)]


def test_backtrack_fails_when_audio_is_too_short():
    em = np.log(np.full((2, 5), 0.2))
    with pytest.raises(A.AlignmentError):
        A.backtrack(A.get_trellis(em, [1, 2, 3], 0), em, [1, 2, 3], 0)


def test_merge_repeats():
    pts = [A.Point(0, 3, 0.5), A.Point(0, 4, 1.0), A.Point(1, 5, 0.2), A.Point(2, 6, 0.4), A.Point(2, 7, 0.6)]
    segs = A.merge_repeats(pts)
    assert [(s.token_index, s.start, s.end, round(s.score, 3)) for s in segs] == [(0, 3, 5, 0.75), (1, 5, 6, 0.2), (2, 6, 8, 0.5)]


# ---------------------------------------------------------------- words


def test_align_emission_word_times():
    V = EN_VOCAB
    text = "Hi, you!"
    toks = A.plan_tokens(text, "en", V).tokens  # H I | Y O U
    #            H  I  |   Y   O   U
    at = [5, 8, 12, 25, 28, 31]
    em = emission_for(toks, T=50, V=len(V), at=at)
    out = A.align_emission(em, text, "en", V, 0, frame_seconds=0.02, offset=10.0)
    w = out["words"]
    assert [x["text"] for x in w] == ["Hi,", "you!"]
    assert w[0]["start"] == pytest.approx(10.0 + 5 * 0.02) and w[0]["end"] == pytest.approx(10.0 + 12 * 0.02)  # ends where "|" is emitted
    assert w[1]["start"] == pytest.approx(10.0 + 25 * 0.02) and w[1]["end"] == pytest.approx(10.0 + 32 * 0.02)
    assert out["coverage"] == 1.0 and out["char_coverage"] == 1.0 and out["unaligned_words"] == []
    assert out["mean_score"] == pytest.approx(0.9)
    assert [c["char"] for c in out["chars"]] == ["h", "i", "y", "o", "u"]


def test_unaligned_word_is_interpolated_between_neighbours():
    text = "باب ٣ بيت"  # the digit word has nothing in the vocabulary
    plan = A.plan_tokens(text, "ar", AR_VOCAB)
    assert [w.text for w in plan.words] == ["باب", "٣", "بيت"]
    n = len(plan.tokens)  # ب ا ب | ب ي ت
    em = emission_for(plan.tokens, T=60, V=len(AR_VOCAB), at=[2, 4, 6, 10, 30, 33, 36][:n])
    out = A.align_emission(em, text, "ar", AR_VOCAB, 0, frame_seconds=0.02)
    w = out["words"]
    assert w[1]["aligned"] is False and w[1]["score"] is None
    assert w[1]["start"] == w[0]["end"] and w[1]["end"] == w[2]["start"]
    assert out["coverage"] == pytest.approx(2 / 3, abs=1e-4) and out["unaligned_words"] == ["٣"]


def test_align_emission_refusals():
    with pytest.raises(A.AlignmentError):
        A.align_emission(np.zeros((100, len(EN_VOCAB))), "— …", "en", EN_VOCAB, 0)
    with pytest.raises(A.AlignmentError):
        A.align_emission(np.zeros((100, len(EN_VOCAB))), "007", "en", EN_VOCAB, 0)
    with pytest.raises(A.AlignmentError):
        A.align_emission(np.zeros((3, len(EN_VOCAB))), "hello", "en", EN_VOCAB, 0)


def test_buckwalter_vocabulary_aligns_arabic_text():
    plan = A.plan_tokens("شلونك", "ar", BW_VOCAB)
    assert plan.tokens == [BW_VOCAB[c] for c in "$lwnk"]


# ---------------------------------------------------------------- windows


def test_emission_windows_cover_every_frame_once():
    n = 16000 * 75 + 123  # 75 s
    ws = A.emission_windows(n, window_s=30, context_s=1)
    total = (n - A.RECEPTIVE) // A.FRAME_HOP + 1
    covered = []
    for w in ws:
        assert w["read_start"] % A.FRAME_HOP == 0 and 0 <= w["read_start"] < w["read_end"] <= n
        assert w["frame_start"] == w["read_start"] // A.FRAME_HOP + w["keep_from"]
        covered += list(range(w["frame_start"], w["frame_start"] + w["keep"]))
    assert covered == list(range(total))
    assert len(ws) == 3
    assert A.emission_windows(399) == []
    assert len(A.emission_windows(16000 * 5)) == 1


def test_windowed_emission_equals_whole_clip_for_a_local_model():
    """A stand-in 'model' whose frame f is a function of samples [f*hop, f*hop+receptive) gives the same frames when
    run window by window and stitched as when run on the whole clip."""
    rng = np.random.default_rng(0)
    audio = rng.standard_normal(16000 * 7 + 77).astype(np.float32)

    def model(x):
        nf = (len(x) - A.RECEPTIVE) // A.FRAME_HOP + 1
        return np.array([x[f * A.FRAME_HOP:f * A.FRAME_HOP + A.RECEPTIVE].sum() for f in range(max(0, nf))])

    whole = model(audio)
    parts = [model(audio[w["read_start"]:w["read_end"]])[w["keep_from"]:w["keep_from"] + w["keep"]] for w in A.emission_windows(len(audio), window_s=2, context_s=0.5)]
    np.testing.assert_allclose(np.concatenate(parts), whole, rtol=1e-5)


def test_status_without_dependencies_explains_why(monkeypatch):
    monkeypatch.setattr(A.importlib.util, "find_spec", lambda name: None)
    st = A.status()
    assert st["en"]["available"] is False and "transformers" in st["en"]["reason"]
    assert set(st) == {"en", "ar"}
