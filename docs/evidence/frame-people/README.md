# People in storyboard frames (D30), 2026-10-03

Qwen3.5-4B (core ComfyUI TextGenerate, greedy) asked how many people are physically present, portraits on the wall excluded, on the ten frames of 'The Static Sky' counted by eye: 10/10 right in 16 s (one model load). Ground truth: 1.1=1, 1.2=1, 1.3a=2, 1.4=2, 2.1=1, 2.2=1, 2.3a=4 (two strangers), 2.4=1, 2.3b=2, 1.3b=4 (a stranger and a duplicate). The prompt sentence 'exactly two people … nobody else' held in 1 of 2 redraws, so the count is checked after drawing (one redraw, then a warning).


## Takes, every half second (D33)

Sampling from 0.1 s every 0.5 s, one Qwen3.5-4B prompt per take (10-18 s per take):

| Take | Shot | Expected | Counts | Verdict |
|---|---|---|---|---|
| gen-7922ac1c4a | 2.3 (old action 'Najm steps into frame') | 2 | 232222222222222 | caught: 3 at 0.6 s (a second Najm walking in while the first fades) |
| gen-3f19d06ef4 | 1.4 | 2 | 2222222222222222 | pass |
| gen-cc48a8b114 | 2.4 (camera on the wife's portrait) | 1 | 1111112211011 | false surplus at 3.1-3.6 s: the large portrait counted |

So a surplus fails a take unless the action features a picture or a reflection of someone; then it is flagged for the producer instead.

