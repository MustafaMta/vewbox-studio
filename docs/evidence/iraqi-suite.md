# Iraqi Arabic pronunciation suite

Engine: Habibi-TTS IRQ (F5-TTS v1) via the studio's voice service; transcription: faster-whisper large-v3 (language forced to Arabic). Run 2026-10-02T14:06:31.766Z.

Mean WER over 32 lines: **0.37** (male 0.27, female 0.46). WER here counts Whisper's own Arabic errors too (it normalises dialect spellings such as گ/چ), so it bounds intelligibility from above.

**Dialect authenticity is subjective quality pending review by a native Iraqi listener.** The files are under `docs/evidence/iraqi-suite/`.

| voice | id | kind | line | seconds | heard | WER |
|---|---|---|---|---|---|---|
| male | greet | short / greeting | شلونك حبيبي، شخبارك؟ | 1.8 | شلونك حبيبي شخبارك؟ | 0.00 |
| male | where | short / question | هسه وين نروح؟ | 1.1 | هسا وين روح؟ | 0.67 |
| male | what | short / question | شنو السالفة؟ | 1.1 | شنو السالفة؟ | 0.00 |
| male | why | question with گ | ليش ما گلتلي من البداية؟ | 2.1 | ليش ماقلتلي من البداية؟ | 0.40 |
| male | tomorrow | statement with چ | باچر نروح للمكان نفسه. | 1.9 | بسر نروح للمكان نفسه. | 0.25 |
| male | care | short / warm | دير بالك على نفسك. | 1.5 | دير بالك على نفسك. | 0.00 |
| male | angry | anger / long | گلتلك ميت مرة لا تلعب بالخيط! هسه انقطع وراح الطيارة! | 4.5 | قلتلك ميت مرة لا تلعب بالخيطة. هسا انقطع وراح الطيارة. | 0.30 |
| male | happy | happiness | والله فرحت هواية لمن شفتها تطير فوق السطوح! | 3.7 | والله فرحت هواية لمن شفتها تطير فوق السطوحي. | 0.13 |
| male | sad | sadness | ما ظل أحد يسأل عني من راحت أمي. | 2.6 | ما ظل أحد يسأل عني من راحة أمي. | 0.13 |
| male | excited | excitement | يلا يلا بسرعة، الهوا هسه زين، نطيّرها هسه! | 3.6 | يلا يلا بسرعة. الهو هسه زين. نطيبر هسه. | 0.25 |
| male | hesitant | hesitation | يعني... ما أدري... يمكن أجرب مرة ثانية. | 3.1 | يعني ما ادري. يمكن اجرب مرة ثانية. | 0.00 |
| male | names | names / places | سمير وأمينة وسليم راحوا للأعظمية عند أم حسن. | 3.8 | سمير وامينة وسليم راحوا للاعظمية عند ام حسن. | 0.00 |
| male | numbers | numbers | عندي ثلاث طيارات وخمسة وعشرين خيط، والباص رقم اثنعش. | 4.5 | عندي ثلاث طيارات وخمسة وعشرين خيط. والباص رقم اثنى عشر. | 0.22 |
| male | tech | English technical words | شغّل الـ wifi وافتح الـ app، الـ battery خلصت. | 3.3 | شغضة للوايفا وافتح الابك. الباتري خلصت. | 0.78 |
| male | switch | Arabic/English switching | OK سمير، هسه نسوي test للخيط، ready? | 2.6 | اوكسامير هسنسوي تاست الخيطي. | 1.00 |
| male | long | long dialogue | لمن كنت صغير، جدي علمني شلون أصلّح الطيارة بخيط واحد وشوية صبر، وگللي الهوا ما يسمعك إذا تصرخ عليه، بس يسمعك إذا تمشي وياه. | 10.6 | لمن كنت صغير، جدي علمني شلون أصلبح الطيارة بخيط واحد وشوية صبر، وقل لي الهوى ما يسمعك إذا تصرخ عليه، بس يسمعك إذا تمشي وياه. | 0.17 |
| female | greet | short / greeting | شلونك حبيبي، شخبارك؟ | 1.4 | شخبارك. | 0.67 |
| female | where | short / question | هسه وين نروح؟ | 0.9 | روح. | 1.00 |
| female | what | short / question | شنو السالفة؟ | 0.9 | شنو صالفي. | 0.50 |
| female | why | question with گ | ليش ما گلتلي من البداية؟ | 1.6 | ليش ما اتلمن البداية؟ | 0.40 |
| female | tomorrow | statement with چ | باچر نروح للمكان نفسه. | 1.5 | بس الروح للمكان نفسه. | 0.50 |
| female | care | short / warm | دير بالك على نفسك. | 1.2 | دير بالك على نفسك. | 0.00 |
| female | angry | anger / long | گلتلك ميت مرة لا تلعب بالخيط! هسه انقطع وراح الطيارة! | 3.6 | قلتلك مئة مرة لا تلعب الخيطة. سنقطع وراح الطيارة. | 0.50 |
| female | happy | happiness | والله فرحت هواية لمن شفتها تطير فوق السطوح! | 2.9 | والله فرحت هواية لمن شفتها الطير فوق السطوح. | 0.13 |
| female | sad | sadness | ما ظل أحد يسأل عني من راحت أمي. | 2.0 | ما ظل حديثا عن من راحت أمي. | 0.38 |
| female | excited | excitement | يلا يلا بسرعة، الهوا هسه زين، نطيّرها هسه! | 2.8 | يلا يلا بسرعة. نطيب انا هسه. | 0.50 |
| female | hesitant | hesitation | يعني... ما أدري... يمكن أجرب مرة ثانية. | 2.4 | يمكن اجرب مرة ثانية. | 0.43 |
| female | names | names / places | سمير وأمينة وسليم راحوا للأعظمية عند أم حسن. | 3.0 | سمير وأمينة وسليم راحوا للأعظمية عند أم حسن. | 0.00 |
| female | numbers | numbers | عندي ثلاث طيارات وخمسة وعشرين خيط، والباص رقم اثنعش. | 3.6 | عندي ثلاث طيارات وخمسة وعشرين خيط والباص رقم اثناش. | 0.11 |
| female | tech | English technical words | شغّل الـ wifi وافتح الـ app، الـ battery خلصت. | 2.6 | شغل. البفتري خلص. | 0.89 |
| female | switch | Arabic/English switching | OK سمير، هسه نسوي test للخيط، ready? | 2.0 | هسنسو تاسد الخيط. | 1.00 |
| female | long | long dialogue | لمن كنت صغير، جدي علمني شلون أصلّح الطيارة بخيط واحد وشوية صبر، وگللي الهوا ما يسمعك إذا تصرخ عليه، بس يسمعك إذا تمشي وياه. | 8.4 | اخير. جدي علمني شلون اصلح الطيارة بخيط واحد وشوية صبر. وقل لي الهوى ما يسمع كذا تصرخ عليه. بس يسمع كذا تمشي وياه. | 0.42 |