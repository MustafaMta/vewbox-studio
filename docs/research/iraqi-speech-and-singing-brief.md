# Iraqi (Muslim Baghdadi) speech and singing — study brief before synthesis

Ordered by the producer 2026-10-10. Scope: Muslim Baghdadi *gilit* Arabic, the variety of the capital that Iraqi broadcast,
pop and everyday speech default to. An LLM cannot listen; everything below is grounded in published phonetics/dialectology
(§1), published descriptions of Iraqi music (§3), and corpus documentation (§4), and turned into **checkable hypotheses
(H-n) the studio must measure on licensed audio and confirm with a native ear** before any model is tuned. Nothing here
proposes cloning an identifiable speaker or training on copyrighted recordings.

## 1. Baghdadi phonology and prosody — what the literature says, and what to measure

**Dialect position.** Blanc, *Communal Dialects in Baghdad* (1964; Brill reprint 2024) splits Mesopotamian Arabic into
*qeltu* (Mosul, Jewish/Christian Baghdadi) and *gilit* (Muslim Baghdad, the south); the labels are the word "I said"
(https://betterread.com.au/book/communal-dialects-in-baghdad.do; summary https://languagehat.com/iraqi-arabic/). Vewbox
targets *gilit*: **ق → /ɡ/** (گلت *gilit*), but not in every word (§1.3).

### 1.1 Segments (sources: Wikipedia "Baghdadi Arabic" https://en.wikipedia.org/wiki/Baghdadi_Arabic; Hassan 1981 Leeds PhD
https://etheses.whiterose.ac.uk/id/eprint/2345/1/Hassan_ZM_Linguistics_PhD_1981.pdf; Hassan 2011 emphatics
https://www.degruyterbrill.com/document/doi/10.1075/cilt.319.10has/html; Hassan 2011 quantity
https://www.degruyterbrill.com/document/doi/10.1075/cilt.319.03has/html; Mosul 2021 stop VOT study
https://radab.uomosul.edu.iq/index.php/radab/article/view/31635)
- **چ /tʃ/** is a native phoneme (كاف → چ in many core words: باچر, چان, چبير, چم), not a loan sound. No published acoustic study
  of native Iraqi /tʃ/ was found. **H1:** closure 50–90 ms + frication 60–110 ms; a /k/ substitute (the usual TTS failure)
  shows no frication band above 2 kHz. Measure closure/frication duration and centre of gravity on every چ in the corpus.
- **گ /ɡ/** (ق → g) is fully voiced: Iraqi voiced stops carry voicing through closure (negative VOT, Mosul 2021; Basrah 2025
  confirms negative VOT for voiced, positive for voiceless, and only /t, k/ aspirated). **H2:** voicing lead ≥ 40 ms on گ;
  a model that produces a devoiced [k]-like گلت is wrong.
- **ق /q/ survives** in learned/abstract and religious vocabulary (حقيقة، مستقبل، اقتصاد، قانون، قرآن) and some old
  borrowings; everyday words take /ɡ/; a few take /k/ (وقت → *wakit*, قتل → *kital*) (https://en.wikipedia.org/wiki/Mesopotamian_Arabic;
  borderlessblogger Muslim Baghdadi series https://borderlessblogger.com/tag/iraqi/). **H3:** build a per-lexeme q/ɡ/k
  table from the corpus; expect a stable split, with register-driven variation only in a few items (دقيقة *dagīga ~ daqīqa*).
- **پ /p/, ڤ /v/** occur only in loans and vary with /b, f/ by speaker (پرده، پنكة، ڤيزا). **H4:** proportion of [p]/[v]
  realisations per speaker; younger urban speakers expected > 70 %.
- **Emphatics** (ص ط ظ, with ض merged into ظ /ðˤ/: ضيف → *ðˤēf*): pharyngealisation spreads over the whole word in both
  directions (Hassan 2011). Across eight dialects F1 rises and F2 drops in emphatic context (Alsabhi 2024,
  https://etheses.whiterose.ac.uk/id/eprint/36246/1/Alsabhi_107038357.pdf). **H5:** F2 of /a/ next to an emphatic ≥ 200 Hz
  lower than the plain pair (صار vs سار); the lowering reaches the non-adjacent vowel too.
- **Vowels:** short /i u ə a/, long /iː uː eː oː aː/; /eː/ (< ay) is an **opening diphthong** [iɛː] (ليش *liēš*), /aw/ → /oː/
  (لون *lōn*); schwa in unstressed syllables. **H6:** long:short duration ratio 1.8–2.2 in stressed open syllables (Hassan
  1981 baseline, re-measure); F2 of /eː/ moves ≥ 150 Hz over the vowel.
- **Clusters:** *gilit* allows word-initial CC (شلونك *šlōnak*, شگد *šgad*, چبير *čbīr*) without a prothetic vowel; stress
  ignores epenthetic vowels and superheavy final syllables (CVVC, CVCC) attract stress (Jastrow 2007 via the Mosul
  stress note; Iraqi learner stress study https://ejournal.uin-malang.ac.id/index.php/ijazarabi/article/view/29072).
  **H7:** no vowel ≥ 30 ms before initial clusters; stress on final syllable in باچر-type CVVC words.

### 1.2 Prosody (sources: IVAr corpus — Hellmuth & Almbark, UK Data Service, Iraqi speakers from Baghdad recorded in
Amman, https://reshare.ukdataservice.ac.uk/852878/; Hellmuth 2018 polar-interrogative contours across the eight IVAr
dialects, https://doi.org/10.21437/SpeechProsody.2018-200; Saaed 2025 Iraqi focus study
https://jls.tu.edu.iq/index.php/jls/article/view/1877; Aljamaan & Aljutaily citing Ghazali et al. 2007 for an Iraqi
falling HL statement contour, https://jltr.academypublication.com/index.php/jltr/article/download/11507/9584/38072)
- **Statements** end in a fall (HL); Iraqi was characterised by a falling contour in Ghazali et al. 2007. **H8:** final
  syllable F0 ≥ 4 st below the phrase peak; declination across a 2-second phrase ≈ 1–2 st/s.
- **Polar questions** have no particle; the contrast is purely tonal. The IVAr scripted dialogues contain the Baghdadi
  data; the per-dialect result was not readable here, so treat as open. **H9:** Baghdadi polar questions end high (rise or
  high plateau on the last stressed syllable), ≥ 3 st above the statement twin; **wh-questions** (شنو، وين، ليش، شلون) put the
  peak on the wh-word and fall. **H10:** echo/incredulous questions (*šinu?!*) widen range ≥ 6 st.
- **Focus** is not marked by F0-peak alignment in Iraqi Arabic (Saaed 2025: no significant effect across neutral,
  information and contrastive focus); trends toward later peak and higher intensity. **H11:** contrastive focus =
  longer stressed syllable (+20–30 %) and +2–3 dB, not a different peak position; expect post-focal compression.
- **Rhythm/rate, pauses (no Iraqi numbers published — measure):** **H12:** conversational rate 5–7 syll/s; clause-boundary
  pauses 200–450 ms, turn-final 600–1,000 ms; filled pauses يعني /ˈjaʕni/, اممم, ها /haː/ carry level or slightly
  rising F0 and lengthen their final vowel ≥ 250 ms.
- **Emotional cadence (hypotheses):** anger narrows syllable duration and raises intensity, not necessarily F0 range;
  sorrow (the *ʕatāba/abūðiyya* register) lengthens final vowels and adds creak; affection uses the vocatives عيني، يابه،
  حبيبي on a low fall. **H13:** measure per emotion F0 median, range (5–95 %), rate, final-vowel length, creak %.
- **Sentence endings and connected speech:** final -h of the feminine ending is silent (هسه /ˈhassa/); pre-pausal vowel
  lengthening; بس، لعد، ها as turn-final tags; object clitics fuse (گلتلك *gitlak*). **H14:** word-final short vowels before
  pause ≥ 1.4× their medial length.
- **Code-switching with English:** inter-sentential switching dominates among Iraqi students; tag switching (اوكي، سوري، باي)
  is common (Khalaf 2026, Al-Sa'ati 2023, https://berj.uomosul.edu.iq/index.php/berj/article/view/38721;
  Nadhim 2026 discourse markers https://iasj.rdd.edu.iq/journals/uploads/2026/05/29/052e6c5eb196fa76d19d73aa646d5ef5.pdf).
  **H15:** English islands keep Iraqi vowel quality and stress (laptop → /ˈlaːbtoːb/), no aspiration on /p/, and the
  switch point carries no pause > 100 ms.

### 1.3 Regression vocabulary (Muslim Baghdadi; IPA; use as the fixed test list for every engine, read by a native reviewer)

| # | Word | IPA | Gloss / feature |
|---|---|---|---|
| 1 | باچر | ˈbaːtʃir | tomorrow (چ, final-syllable stress) |
| 2 | نحچي | ˈniħtʃi | we talk / let's talk (چ after ħ) |
| 3 | چاي | tʃaːj | tea |
| 4 | چنت | ˈtʃinit | I was / you were |
| 5 | چان | tʃaːn | he was |
| 6 | چبير | tʃiˈbiːr | big (initial cluster possible: tʃbiːr) |
| 7 | چم | tʃam | how many |
| 8 | چلب | ˈtʃalib | dog |
| 9 | چذاب | tʃaðˈðaːb | liar |
| 10 | چفچير | tʃafˈtʃiːr | ladle (two چ) |
| 11 | چيس | tʃiːs | bag |
| 12 | هيچ | heːtʃ | like this |
| 13 | شلونچ | ʃˈloːnitʃ | how are you (f.) — 2f clitic -چ |
| 14 | بيتچ | ˈbeːtitʃ | your (f.) house |
| 15 | گلت | ˈɡilit | I said |
| 16 | گلتلك | ˈɡitlak | I told you (m.) (contraction) |
| 17 | گال / يگول | ɡaːl / jiˈɡuːl | he said / he says |
| 18 | اگلك | aˈɡulːak | I'll tell you |
| 19 | گدام | ɡidˈdaːm | in front of |
| 20 | گام | ɡaːm | he got up / began (aspect) |
| 21 | گعد / يگعد | ˈɡiʕad / ˈjiɡʕud | sat / sits |
| 22 | گلب | ˈɡalub | heart |
| 23 | گمر | ˈɡumar | moon |
| 24 | گهوة | ˈɡahwa | coffee |
| 25 | شگد | ʃˈɡad | how much (cluster) |
| 26 | گدر | ˈɡidar | he could |
| 27 | دگيگة | daˈɡiːɡa ~ daˈqiːqa | minute (variable q/ɡ — H3) |
| 28 | وكت | ˈwakit | time (ق → k) |
| 29 | كتل | ˈkital | he killed (ق → k) |
| 30 | حقيقة | ħaˈqiːqa | truth (q kept) |
| 31 | مستقبل | musˈtaqbal | future (q kept) |
| 32 | قانون | qaːˈnuːn | law (q kept) |
| 33 | قرآن | qurˈʔaːn | Qur'an (q kept) |
| 34 | ثقافة | θaˈqaːfa | culture (q kept, θ kept) |
| 35 | پرده | ˈparda | curtain (پ) |
| 36 | پنكة | ˈpanka | ceiling fan (پ) |
| 37 | پاچة | ˈpaːtʃa | pacha dish (پ + چ) |
| 38 | پايسكل | paːjˈsikil | bicycle (پ, loan) |
| 39 | ڤيزا | ˈviːza | visa (ڤ) |
| 40 | ڤيديو | ˈvidjo | video (ڤ) |
| 41 | ڤيلا | ˈviːla | villa (ڤ) |
| 42 | شلونك | ʃˈloːnak | how are you (m.) (cluster, oː) |
| 43 | هسه | ˈhassa | now (silent final ه) |
| 44 | يمعود | jamˈʕawwad | hey man (vocative, ʕ) |
| 45 | كلشي | ˈkulːʃi | everything |
| 46 | ماكو | ˈmaːku | there isn't |
| 47 | اكو | ˈaku | there is |
| 48 | شكو | ˈʃaku | what's there / what's up |
| 49 | شكو ماكو | ˈʃaku ˈmaːku | what's new (fixed phrase) |
| 50 | شنو | ˈʃinu | what |
| 51 | وين / وينك | weːn / ˈweːnak | where / where are you |
| 52 | ليش | liɛːʃ | why (opening diphthong eː) |
| 53 | شوكت | ʃˈwakit | when (contraction) |
| 54 | شبيك | ʃˈbiːk | what's wrong with you (contraction) |
| 55 | شدتسوي | ʃdatˈsawwi | what are you doing (contraction + progressive da-) |
| 56 | شدعوة | ʃˈdaʕwa | what on earth (contraction) |
| 57 | شسمه | ˈʃisma | what's-it-called (filler) |
| 58 | مدري | ˈmadri | I don't know |
| 59 | ماريد | maˈriːd | I don't want |
| 60 | مو | muː | not (nominal negation) |
| 61 | داروح / راح اروح | daˈruːħ / raːħ aˈruːħ | I'm going / I will go (aspect markers) |
| 62 | يعني | ˈjaʕni | I mean (hesitation marker) |
| 63 | لعد | laˈʕad | so / then |
| 64 | بس | bas | only / enough (tag) |
| 65 | هواية | ˈhwaːja | a lot |
| 66 | شوية | ʃˈwajja | a little |
| 67 | خوش | xoːʃ | good (prenominal) |
| 68 | زين | zeːn | good / OK |
| 69 | ضيف | ðˤeːf | guest (ض → ðˤ, emphatic spread) |
| 70 | صار / سار | sˤaːr / saːr | happened / walked (emphatic pair — H5) |
| 71 | عيني / يابه | ˈʕeːni / ˈjaːba | my eye (endearment) / dad, man |
| 72 | عاشت ايدك | ˈʕaːʃat ˈiːdak | thank you (lit. may your hand live) |
| 73 | الله بالخير | ˈaɫɫa bilˈxeːr | greeting reply (dark l) |
| 74 | تدلل | tdalˈlal | you're welcome / at your service |
| 75 | اوكي، سوري، لابتوب | ˈʔoːkeː, ˈsoːri, ˈlaːbtoːb | English tags/loans with Iraqi vowels (H15) |

## 2. Measurement plan (per licensed recording, scripted in Praat/Parselmouth; results go to `docs/research`)
1. Segment with forced alignment on an Iraqi-spelled transcript; hand-check چ گ ق پ ڤ tokens.
2. Per H1–H7: consonant durations/VOT/frication CoG; vowel durations and F1/F2 trajectories; emphatic F2 deltas.
3. Per H8–H14: F0 (semitones re speaker median) at phrase peak and last syllable; pause histogram at punctuation vs
   turn end; rate; final-vowel lengthening; creak share; per-emotion stats.
4. Per H15: pause at switch points; vowel formants inside English islands.
5. Acceptance: a synthesised version of §1.3 must match the corpus distributions within one SD **and** pass the native
   ear (the 2026-10-08 rule: ear beats machine QA).

## 3. Singing brief — principles for original Vewbox songs

Sources: UNESCO/Wikipedia Iraqi maqam (https://en.wikipedia.org/wiki/Iraqi_maqam); Amir ElSaffar's description of maqam
form (https://www.amirelsaffar.com/iraqi-maqm); Cleveland Classical review of Hamid Al-Saadi with Safaafir
(https://clevelandclassical.com/safaafir-with-hamid-al-saadi-iraqi-music-at-cma-january-29/); Sublime Frequencies
*Choubi Choubi!* liner descriptions (https://www.fusetronsound.com/products/v-a-choubi-choubi-folk-pop-sounds-from-iraq);
Reuters on Basra *khashaba* (https://reuters.screenocean.com/record/1620564); Babylon Univ. study of chobi songs
(https://www.journalofbabylon.com/index.php/JUBH/article/download/6705/4836/11853).

- **Two poles.** *Maqam al-ʿirāqī*: free-rhythm, melismatic, text in fuṣḥā *qaṣīda* or dialect *zuhayrī*; form = *tahrīr*
  (textless vocables, establishes mode and mood) → *qiṭaʿ/awṣāl* → *jalsa* → **miyāna** (climax, high register) → *qarār*
  (descent) → *taslīm*. *Pesteh/pasta*: short, metred, syllabic, humorous everyday text, sung in **unison by the whole
  chalghi**, audience joins — the native call-and-response/backing-vocal model. Modern Iraqi pop sits between: maqam-derived
  *mawwāl* intro (free, ornamented), then a metred song; the chobi/khashaba layer is **fast ornamental percussion over a
  steady beat** (*khishba*/zanbūr drum), melodies in one maqam without modulation.
- **Vowel elongation.** Sustained notes land on long vowels /aː iː uː/ and the open [iɛː]/[oː]; short vowels and schwa are
  never stretched — the singer lengthens the syllable's long vowel or inserts a vocable (*yā, āh, wēlī*) instead. Rule for
  lyricists: put melisma targets on CVV syllables; keep چ گ ق on short syllables between held notes.
- **چ /tʃ/ and گ /ɡ/ survive** as short consonant onsets between vowels; nothing is lost when the song is in dialect
  (pesteh, chobi, pop). Only fuṣḥā *qaṣīda* text uses /q/ and no چ. Hypothesis to check: in sustained passages the burst
  of چ shortens but the frication stays audible (H1 target still ≥ 40 ms).
- **Ornamentation.** Mordent-like turns on the approach to the held note; the "sobbing" pulsed trill (*trillo*-like) on
  sorrow lines; grit/grain in the chest register at emotional peaks; register contrast between near-fading low *qarār*
  and the ringing *miyāna*. Emotional delivery = range and grain, not vibrato width.
- **Phrasing and breath.** Breath at poetic line ends (hemistich/line of the *zuhayrī*, AAA BBB A), never mid-word; the
  *mawwāl* phrase is one breath per line with a long terminal vowel; pesteh phrases are short (2–4 s) and square.
- **Verse vs chorus.** Verse: solo, more melisma, dialect pronunciation closest to speech; chorus/pesteh: unison or
  backing voices, syllabic, slightly MSA-leaning vowels, rhythmic clipping of final vowels on the beat.
- **Duets/backing.** Alternate lines (call-and-response), then unison on the hook; backing vocals double the hook an octave
  or a fourth below, same vowel shapes, no ornament.
- **Speech-like vs melodic.** Spoken-register inserts (يمعود، ها، يابه) keep speech F0 and timing; sung syllables lose
  schwa reduction and the fast connected-speech contractions (گلتلك may expand to گلت لك).

## 4. Sources

**Listening references (study only — not for training, no cloning):** IVAr corpus Iraqi set (UK Data Service, restricted
licence; https://reshare.ukdataservice.ac.uk/852878/; project https://www.york.ac.uk/language-linguistic-science/research/phonetics-phonology/arabic-dialects/);
Speech Accent Archive, Baghdad (14 speakers, CC BY-NC-SA 4.0; https://accent.gmu.edu/places/baghdad/); BnF 2014 reissue of
Muhammad al-Qubanchi's 1932 Cairo Congress recordings (via https://en.wikipedia.org/wiki/Iraqi_maqam); Hamid Al-Saadi /
Safaafir maqam recordings (https://hamidalsaadi.bandcamp.com/); *Choubi Choubi! Folk and Pop Sounds from Iraq* vols 1–2
(Sublime Frequencies); Reuters khashaba report (above); Bițună 2013 Iraqi lexis corpus
(https://journals.unibuc.ro/index.php/roar/article/view/1982); Nadhim 2026 discourse markers (above).

**Training-eligible (licence verified or to verify before use):** `hayderkharrufa/iraqi-dialect-tts-corpus` — CC BY 4.0,
3.7 h MSA + 1 h Iraqi, Zenodo 10.5281/zenodo.11170567 (https://github.com/hayderkharrufa/iraqi-dialect-tts-corpus);
SH_ArabicIraqiAccent — 47 Baghdad-suburb speakers, 2.5 h, 16 kHz, "publicly available", **licence not stated — verify**
(https://jeng.utq.edu.iq/index.php/main/article/view/742); LDC2006S45 Iraqi Arabic CTS — ~50 h, 8 kHz, paid LDC licence,
research terms — **confirm commercial use** (https://catalog.ldc.upenn.edu/LDC2006S45); Appen off-the-shelf Iraqi TTS/
pronunciation data — commercial licence (https://datasets.appen.com/country-iran-or-iraq/use-case-tts). Survey:
Arab Voices (https://arxiv.org/pdf/2601.13319). **Vewbox's own recordings (§5) are the primary training source.**

## 5. Studio recording protocol (future sessions; consented, paid, Baghdad-raised speakers; 48 kHz/24-bit, treated room)
- **Script blocks:** (a) §1.3 list, each item isolated and in a carrier sentence; (b) minimal pairs for H3/H5; (c) 40
  statement/polar/wh/echo quadruplets for H8–H10; (d) IVAr-style tasks — read folktale, retell, scripted dialogue, map
  task, 10 min free conversation; (e) code-switch dialogues (tech, work, phone) for H15.
- **Emotions (each block (c)–(d)):** neutral, joy, anger, sorrow, tenderness, sarcasm, fear, urgency — two takes each,
  self-rated; native reviewer rates authenticity before the take counts.
- **Registers:** street Baghdadi, family, formal-dialect (TV interview), MSA-leaning news, whispered, shouted/calling.
- **Singing (same speakers where able, plus singers):** *tahrīr*-style vocables, a *zuhayrī* line free-rhythm, a pesteh
  hook in unison (3 voices), a chobi-tempo verse, sustained /aː iː uː/ on five pitches, چ/گ words at three tempi.
- **Metadata:** speaker age bracket, neighbourhood, years in Baghdad, emotion, register, take number; releases allow TTS
  training and synthesis of **non-identifiable** composite voices only.
