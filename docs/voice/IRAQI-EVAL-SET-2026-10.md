# Iraqi Arabic voice evaluation set, October 2026

Iraqi Arabic Language and Voice Engineer, 2026-10-04. Written while the inference containers were stopped (the website
phase's generation pause); nothing here was spoken or heard yet. The set, the harness and the review form are ready to
run the moment `tts-habibi` and `asr` come up in the model phase.

**The producer's standard:** "genuinely natural Iraqi Arabic, not generic Modern Standard Arabic with occasional Iraqi
vocabulary." This set is built so that a native Baghdadi listener can tell the two apart line by line, and so that the
machine's measurements (ASR, loudness, timing) support the review without ever standing in for it.

**What is and is not decided by a machine** (docs/CONTRACTS-VOICE-IDENTITY-V2.md §4; docs/research/MODEL-STACK-2026-10.md
§2.4): ASR proves that the words are intelligible, not that the dialect is Baghdadi — synthetic Iraqi scores a *lower*
ASR error than real Iraqi speech (Habibi paper, WER 17.7 vs 27.2), so a good ASR score is not evidence of a good accent.
Naturalness, dialect fidelity, emotional delivery, rhythm and speaker consistency are rated by a native listener on the
form in §6. Until that review is recorded, no voice is "verified"; the labels stay "Iraqi dialect not yet verified by a
native listener" (`dialectStatus: UNVERIFIED`).

**Status on 2026-10-04.** Ready to run: the set (§1–3), the harness (§4, dry-run proven, unit-tested on
`tests/fixtures/speech-en.wav` and synthetic audio), the review page (opened in a browser on a sample report), the text
preparation in the app (§5). Not run: no line has been spoken, no WAV exists, no listener has heard anything; every
claim about the voices waits for the model phase and the review (§6).

Files:

- `tests/fixtures/voice/iraqi-eval-set.json`: the 60 lines, machine-readable (the harness and the unit tests read it).
- `tests/fixtures/voice/habibi-irq-vocab-chars.json`: the characters the Iraqi engine's vocabulary knows (read from
  the model volume without starting a container; sha256 of `vocab.txt` inside), so that a test can prove every line is
  spoken with every letter intact (§5).
- `scripts/voice-eval.mjs`: the harness (§4).
- Evidence of a run: `docs/evidence/iraqi-eval/<run>/` with `report.json`, `review.html`, `wavs/` and the listening
  records a reviewer saves.

## 1. What the set covers

Sixty lines of Baghdadi Iraqi Arabic, written by the engineer (not generated), with six lines reused from the earlier
suite (`scripts/iraqi-voice-suite.mjs`) and two from the model-stack plan (§5.7 I3, I4) so that results stay comparable.

| Category | Lines | What it tests |
|---|---|---|
| conversation | 7 | everyday Baghdadi: greeting chains, offers, errands, the café; اكو/ماكو, ويا, ما ظل, يمعود |
| question | 8 | شلون / شنو / وين / منو / ليش / شوكت / لعد / شسوي, the «مو؟» tag question, rising intonation |
| exclamation | 3 | يا الله, عفية, يا ويلي; stress and vowel length |
| numbers | 7 | Iraqi numerals (اثنعش، خمسطعش، اربعطعش، ميتين، تسعمية), the construct form (ثلاث سنين), times (ونص), a date with an Iraqi month (شباط), a year, and one line with raw digits (`7:30`, `15`, `250`) for the text preparation |
| names | 5 | Iraqi first names (كرار، ساهر، شيماء، نبأ، زينب، فاطمة), kunyas (ابو سلام، ام حسين), the honorific حجي, Baghdad places (الاعظمية، الكرادة، المنصور) |
| emotion | 12 | anger ×2, tenderness ×3, humour ×3, sadness ×2, fear, tiredness; pauses («...») and repetition |
| long | 2 | 25–30 words in one breath: conversational rhythm, pauses at commas, no drift at the end |
| short | 3 | one or two words: ماكو. / هسه؟ / لا والله! — intonation alone |
| code-switch | 3 | two lines with English words (routed to IndexTTS by the studio's rule) and their Arabic-script twin on the Iraqi engine |
| film | 10 | the film's lines: six from **The Static Sky** and four from the fixture show **The Opening Hour** (see below) |

**Male and female voices.** `sex` says who should speak a line: `M`, `F`, or `ANY` (both voices of a run). The two
designed Iraqi seeds of the A/B (`docs/evidence/voice-design/iraqi-ab/seeds/`) are one male and one female voice; the
consented Iraqi recordings the contract asks for (§2 of the contract) are the real references when they exist.

**Speaker consistency.** The same voice speaks every `ANY` line: the reviewer rates "same voice as the others" on the
form, and the harness records the ECAPA cosine between lines when the design service is up (optional).

**The film's own lines.** The studio snapshot (read-only `GET /api/studio` on 2026-10-04) holds **The Static Sky**
(`short-28bdb3342b`, language EN) with six dialogue lines and **no `textAr`**: the production is English, with one Iraqi
character in the cast (أبو سلام, `char-bc112248bf`, MALE, AR / IRAQI_BAGHDADI, no voice yet). The six `film-ss-*` lines
are therefore the engineer's Baghdadi renderings of those six English lines, each tagged with the studio `lineId`
(`filmLineId`); they are evaluation material, not lines written into the production. The four `film-fx-*` lines are real
`textAr` dialogue from the fixture show (`scripts/v4-fixture.ts` → `src/domain/sample.ts`, The Opening Hour), kept
exactly as written there — including «تكدر» with ك where Baghdadi says /g/, which is itself a thing to listen for.

**Lines whose MSA rendering would sound wrong** are marked `msaWouldSoundWrong: true` (56 of 60). On those a reviewer
can tell dialect fidelity from mere intelligibility: an engine that reads «شلونك» as "kayfa ḥāluka", «گلتلك» with a
/q/, «باچر» with a /k/ or «اثنعش» as "ithnā ʿashar" is intelligible and wrong. The four lines marked `false` (name-03,
short-03, mix-03, film-ss-05) test names, stress and loanwords where an MSA-leaning reading is tolerable.

## 2. Feature tags

Each line lists the features it tests. The tags, and what to listen for:

| Tag | Listen for |
|---|---|
| `گ-for-ق` | the Baghdadi /g/ in گلتلك، گهوة، گوم، گال، اگعد، صدگ، شگد، يوگف، عتيگ، گاعدة; an MSA /q/ here is wrong |
| `چ-for-ك` | the /tʃ/ in چاي، باچر، حچاية، هيچ، تحچي، نحچي، احچي، چنت، چا; ASR cannot confirm it (docs/evidence/voice-design/iraqi-ab: never written چ in 36 tries), so this is a listening item |
| `ك-as-g` | a word written with ك that Baghdad says with /g/ («تكدر»): which does the engine say? |
| `vowel-reduction` | گلتلك = *gilitlak*, چنت = *chinit*, يمعود, خلصنا: the short vowels Baghdadi drops or centralises; a fully vowelled MSA reading sounds read, not spoken |
| `question-intonation`, `rising-tail`, `tag-question` | the rise on شلونك؟ / هسه؟ / the «مو؟» tag; a flat reading of a question is a fault |
| `exclamation`, `stress` | يا الله! عفية! لا والله! — energy and the stressed syllable |
| `pause` | «...» inside a line: a real pause, not a swallowed gap or a restart |
| `numbers-iraqi`, `teens-عش`, `construct-numeral`, `time`, `date`, `year` | اثنعش، خمسطعش، اربعطعش, ثلاث سنين (not ثلاثة), سبعة ونص, الف وتسعمية وسبعة وثمانين, شباط |
| `digits-raw` | the one line with digits: raw vs prepared (§5) |
| `kunya-ابو`, `kunya-ام`, `honorific-حجي`, `iraqi-name`, `hamza-name`, `place-baghdad`, `foreign-name-arabic-script` | names must be right and unhesitant; hamza names (شيماء، نبأ) end cleanly; المارينر reads as a name |
| `ويا`, `اني`, `احنا`, `هسه`, `شلون`, `شنو`, `وين`, `منو`, `ليش`, `شوكت`, `لعد`, `ماكو`, `اكو`, `مو`, `بس`, `هاي`, `هيچ`, `باچر`, `هواية`, `شوية`, `زين`, `خوش`, `يمعود`, `عفية`, `بعده=still`, `عمر+pronoun+ما=never`, `ما-ظل`, `ما-بي`, `ما-عدنا`, `ب-preposition`, `عَ-contraction`, `هال-demonstrative`, `ش-interrogative`, `راح-future`, `گاعد-progressive`, `چا-particle`, `لو=or`, `من=since` | Baghdadi function words and grammar; each one has an MSA counterpart that would be heard as a substitution (§4.3) |
| `endearment`, `endearment-عيوني`, `يا-بويه`, `دير-بالك`, `يا-ويلي`, `يا-الله`, `هلا-والله`, `والله` | the warmth or the force of the idiom |
| `conversational-rhythm`, `long-sentence`, `one-word`, `one-breath`, `comic-timing`, `repetition`, `reported-speech` | pacing: no rush at the end of a long line, no drawl on a one-word line |
| `shadda-diacritic`, `tatweel-article` | hand diacritics (ويّاي، شغّل) are kept; the tatweel in «الـ wifi» is removed before the engine (§5) |
| `code-switch`, `loanword`, `loanword-transliterated`, `loanword-تكسي` | English words readable inside Baghdadi speech, and the Arabic-script twin |
| `whisper-register`, `low-energy`, `muttering`, `trembling`, `firm`, `dry` | delivery registers the reference must carry (Habibi has no emotion input: delivery comes from the reference recording) |

## 3. The lines

`sex`: M, F or ANY. `MSA wrong`: an MSA reading would be audibly wrong.

| id | category | text | gloss | features | emotion | sex | MSA wrong | source |
|---|---|---|---|---|---|---|---|---|
| conv-01 | conversation | شلونك؟ شخبارك؟ شكو ماكو؟ | How are you? What's your news? What's up? | شلون, شخبار, شكو-ماكو, question-intonation, greeting-chain | warm | ANY | yes | authored |
| conv-02 | conversation | هلا والله، تفضل اگعد. شنو تشرب، چاي لو گهوة؟ | Hello and welcome, sit down. What will you drink, tea or coffee? | هلا-والله, گ-for-ق, چ-for-ك, شنو, لو=or, question-intonation | warm | ANY | yes | authored |
| conv-03 | conversation | تعال نگعد بالگهوة شوية، ما عدنا شغل اليوم. | Come, let's sit at the café a while; we have no work today. | گ-for-ق, شوية, ما-negation, ب-preposition, ما-عدنا | calm | ANY | yes | authored |
| conv-04 | conversation | هاي الحچاية طويلة، خليها لباچر. | This story is long, leave it for tomorrow. | هاي, چ-for-ك, باچر, خلي | calm | ANY | yes | authored |
| conv-05 | conversation | عندي شغلة بسيطة، تگدر تجي ويّاي للسوگ؟ | I have a small errand; can you come with me to the market? | گ-for-ق, ويا, shadda-diacritic, question-intonation, تجي | neutral | ANY | yes | authored |
| conv-06 | conversation | اكو واحد يسأل عليك بالباب، اگله يفوت؟ | There's someone asking for you at the door; shall I tell him to come in? | اكو, گ-for-ق, يفوت, ب-preposition, question-intonation | neutral | ANY | yes | authored |
| conv-07 | conversation | يمعود خلصنا، ما ظل شي نسويه. | Come on, man, we're done; there's nothing left to do. | يمعود, ما-ظل, نسوي, vowel-reduction | tired | ANY | yes | authored |
| q-01 | question | وين رايح هالوقت؟ | Where are you going at this hour? | وين, هال-demonstrative, question-intonation | curious | ANY | yes | authored |
| q-02 | question | ليش ما گلتلي من البداية؟ | Why didn't you tell me from the start? | ليش, گ-for-ق, vowel-reduction, ما-negation, question-intonation | reproachful | ANY | yes | suite (scripts/iraqi-voice-suite.mjs: why) |
| q-03 | question | شنو اسمك؟ واني شلون اعرفك؟ | What's your name? And how am I supposed to know you? | شنو, اني, شلون, question-intonation | curious | ANY | yes | authored |
| q-04 | question | منو هذا اللي وياك؟ | Who is that with you? | منو, اللي, ويا, question-intonation | curious | ANY | yes | authored |
| q-05 | question | لعد شسوي هسه؟ انطيني فكرة. | So what do I do now? Give me an idea. | لعد, ش-interrogative, هسه, انطي, question-intonation | worried | ANY | yes | authored |
| q-06 | question | صدگ؟ ما اصدگ! | Really? I don't believe it! | گ-for-ق, question-intonation, exclamation, ما-negation | surprised | ANY | yes | authored |
| q-07 | question | انت تدري بالسالفة، مو؟ | You know about the matter, don't you? | تدري, السالفة, مو-tag, tag-question, rising-tail | probing | ANY | yes | authored |
| q-08 | question | شوكت ترجع؟ اني انتظرك عالباب. | When will you be back? I'll wait for you at the door. | شوكت, اني, عَ-contraction, question-intonation | tender | ANY | yes | authored |
| ex-01 | exclamation | يا الله! شلون طلع الجو حلو اليوم! | Wow! How lovely the weather turned out today! | يا-الله, شلون-exclamative, طلع, exclamation, stress | happy | ANY | yes | authored |
| ex-02 | exclamation | عفية عليك! هيچ اريدك! | Well done! That's how I want you! | عفية, هيچ, چ-for-ك, exclamation | happy | ANY | yes | authored |
| ex-03 | exclamation | يا ويلي، نسيت المفتاح بالبيت! | Oh no, I forgot the key at home! | يا-ويلي, ب-preposition, exclamation | dismayed | ANY | yes | authored |
| num-01 | numbers | عمري اثنعش سنة، واخوي خمسطعش. | I'm twelve, and my brother is fifteen. | numbers-iraqi, teens-عش, اخوي, vowel-reduction | neutral | ANY | yes | authored |
| num-02 | numbers | الساعة سبعة ونص، والباص يجي بثمانية. | It's half past seven, and the bus comes at eight. | time, ونص, يجي, ب-preposition | neutral | ANY | yes | authored |
| num-03 | numbers | السعر ميتين وخمسين الف دينار، مو اكثر. | The price is two hundred and fifty thousand dinars, no more. | numbers-iraqi, ميتين, مو, price | firm | ANY | yes | authored |
| num-04 | numbers | الموعد الساعة 7:30 يوم 15 من الشهر، والسعر 250 ألف. | The appointment is at 7:30 on the 15th of the month, and the price is 250 thousand. | digits-raw, time, date, numbers-iraqi | neutral | ANY | yes | authored — the only line with digits on purpose: spoken raw and through the studio's text preparation, to hear what each does |
| num-05 | numbers | ثلاث سنين وما شفتك، تگول ثلاثين. | Three years without seeing you; it feels like thirty. | numbers-iraqi, construct-numeral, گ-for-ق, ما-negation | nostalgic | ANY | yes | authored |
| num-06 | numbers | انولدت بسنة الف وتسعمية وسبعة وثمانين، ببغداد. | I was born in 1987, in Baghdad. | year, numbers-iraqi, تسعمية, انولد-passive, ب-preposition | neutral | ANY | yes | authored |
| num-07 | numbers | باچر اربعطعش شباط، تتذكر؟ | Tomorrow is the fourteenth of February, remember? | date, numbers-iraqi, teens-عش, باچر, iraqi-month, question-intonation | tender | ANY | yes | authored |
| name-01 | names | ابو سلام گال راح يجي بعد العصر. | Abu Salam said he'll come in the afternoon. | kunya-ابو, گ-for-ق, راح-future, يجي | neutral | ANY | yes | authored (Abu Salam is the Iraqi character of The Static Sky, char-bc112248bf) |
| name-02 | names | حجي محمود وام حسين ينتظروك بالاعظمية. | Hajji Mahmoud and Umm Hussein are waiting for you in Adhamiya. | honorific-حجي, kunya-ام, place-baghdad, ينتظروك, ب-preposition | neutral | ANY | yes | authored |
| name-03 | names | ساهر وشيماء ونبأ راحوا للكرادة. | Saher, Shaima and Naba went to Karrada. | iraqi-name, hamza-name, place-baghdad, راحوا | neutral | ANY | no | authored — intelligibility line: three first names, two ending in hamza |
| name-04 | names | يا كرار، گوم شوف منو بالباب. | Karrar, get up and see who's at the door. | vocative-يا, iraqi-name, گ-for-ق, منو, imperative | neutral | ANY | yes | authored |
| name-05 | names | زينب وفاطمة جايات من المنصور بالتكسي. | Zainab and Fatima are coming from Mansour by taxi. | iraqi-name, feminine-plural-participle, place-baghdad, loanword-تكسي | neutral | ANY | yes | authored |
| emo-anger-01 | emotion | گلتلك ميت مرة لا تلعب بالخيط! هسه انگطع. | I told you a hundred times not to play with the string! Now it's snapped. | گ-for-ق, ميت-مرة, هسه, exclamation, stress, vowel-reduction | angry | ANY | yes | suite (angry), shortened |
| emo-anger-02 | emotion | لا تحچي وياي هيچ! اني مو ولدك. | Don't talk to me like that! I'm not your boy. | چ-for-ك, ويا, هيچ, اني, مو, exclamation | angry | ANY | yes | model-stack §5.7 I3, extended |
| emo-tender-01 | emotion | لا تخاف حبيبي، اني هنا، ما اروح. | Don't be afraid, my dear, I'm here, I'm not leaving. | اني, ما-negation, endearment, pause | tender | F | yes | authored |
| emo-tender-02 | emotion | عيوني، نام هسه وباچر نحچي. | My darling (lit. my eyes), sleep now and tomorrow we'll talk. | endearment-عيوني, هسه, باچر, چ-for-ك | tender | ANY | yes | authored |
| emo-tender-03 | emotion | يا بويه، دير بالك على روحك، البرد چا قوي. | Son (lit. father, said to a child), take care of yourself; the cold is strong, you know. | يا-بويه, دير-بالك, چا-particle, چ-for-ك | tender | ANY | yes | authored |
| emo-humour-01 | emotion | البيت ما بي چاي؟ لعد شلون عايشين احنا! | No tea in the house? Then how are we even alive! | ما-بي, چ-for-ك, لعد, شلون, احنا, exclamation, question-intonation | humour | ANY | yes | authored (answers film-fx-02) |
| emo-humour-02 | emotion | گلتله روح للطبيب، گال الطبيب هو اللي محتاجني. | I told him go to the doctor; he said the doctor is the one who needs me. | گ-for-ق, vowel-reduction, اللي, reported-speech, comic-timing | humour | ANY | yes | authored |
| emo-humour-03 | emotion | شگد تاكل؟ مثل القطار، ما يوگف! | How much do you eat? Like a train, it never stops! | ش-interrogative, گ-for-ق, ما-negation, exclamation | humour | ANY | yes | authored |
| emo-sad-01 | emotion | ما ظل احد يسأل عني من راحت امي. | No one asks about me any more since my mother passed. | ما-ظل, من=since, راحت, low-energy | sad | ANY | yes | suite (sad) |
| emo-sad-02 | emotion | تعبت... تعبت هواية، وما عندي احد احچي وياه. | I'm tired... so tired, and I have no one to talk to. | pause, هواية, چ-for-ك, ويا, ما-negation, repetition | sad | ANY | yes | authored |
| emo-fear-01 | emotion | اسمع... اكو شي يتحرك ورة الباب، لا تفتحه. | Listen... there's something moving behind the door, don't open it. | pause, اكو, ورة, whisper-register, ما-negation | afraid | ANY | yes | suite (afraid) |
| emo-tired-01 | emotion | والله ماكو شي، بس تعبان شوية. | Honestly there's nothing wrong, I'm just a little tired. | والله, ماكو, بس, شوية, low-energy | tired | ANY | yes | model-stack §5.7 I4 |
| long-01 | long | لمن چنت صغير، جدي علمني شلون اصلّح الطيارة بخيط واحد وشوية صبر، وگللي الهوا ما يسمعك اذا تصرخ عليه، بس يسمعك اذا تمشي وياه. | When I was small, my grandfather taught me how to mend a kite with one string and a little patience, and he told me the wind doesn't hear you if you shout at it, only if you walk with it. | لمن, چنت, چ-for-ك, شلون, گ-for-ق, shadda-diacritic, long-sentence, conversational-rhythm, ويا | nostalgic | ANY | yes | suite (long), چنت added |
| long-02 | long | اليوم الصبح طلعت من البيت بدري، والشارع كله هادي، بس صوت الباعة وريحة الخبز من الفرن، وحسيت كأن بغداد گاعدة تتنفس وياي. | This morning I left the house early; the whole street was quiet, only the vendors' voices and the smell of bread from the bakery, and I felt as if Baghdad were breathing with me. | بدري, هادي, ريحة, گ-for-ق, گاعد-progressive, ويا, long-sentence, conversational-rhythm | calm | ANY | yes | authored |
| short-01 | short | ماكو. | There's none. / Nothing. | ماكو, one-word, falling-intonation | flat | ANY | yes | authored |
| short-02 | short | هسه؟ | Now? | هسه, one-word, question-intonation | surprised | ANY | yes | authored |
| short-03 | short | لا والله! | No way! | والله, exclamation, stress | surprised | ANY | no | authored — same words in MSA; the Baghdadi stress and vowel length decide |
| mix-01 | code-switch | شغّل الـ wifi وافتح الـ app، الـ battery خلصت. | Turn on the wifi and open the app; the battery is dead. | code-switch, tatweel-article, loanword, shadda-diacritic | neutral | ANY | yes | suite (tech) — routed to IndexTTS (MIXED script); spoken only with `--indextts` |
| mix-02 | code-switch | OK ابو سلام، هسه نسوي test للراديو، ready؟ | OK Abu Salam, now we run a test on the radio, ready? | code-switch, هسه, نسوي, kunya-ابو, question-intonation | neutral | ANY | yes | authored — routed to IndexTTS (MIXED script) |
| mix-03 | code-switch | شغّل الواي فاي وافتح التطبيق، البطارية خلصت. | Turn on the wifi and open the app; the battery is dead (the same words in Arabic script). | loanword-transliterated, shadda-diacritic | neutral | ANY | no | suite (tech-ar) — the Arabic-script twin of mix-01 on the Iraqi engine |
| film-ss-01 | film | عتيگ. كلشي يصير عتيگ. | Obsolete. Everything turns obsolete. (Elias: "Obsolescence. Always obsolescence.") | گ-for-ق, كلشي, muttering, repetition | muttering | M | yes | The Static Sky line-2e2e6225ef, Iraqi rendering by the engineer |
| film-ss-02 | film | بعده... يشتغل، مو؟ | It's still... working, isn't it? (Najm: "It's still… functional, isn't it?") | بعده=still, pause, مو-tag, tag-question, rising-tail | curious | M | yes | The Static Sky line-45066aa8a4, rendering |
| film-ss-03 | film | الوشوشة هاي بس حچاية تنتظر منو يحچيها. | This static is just a story waiting for someone to tell it. (Elias: "Static's just a story waiting to be told.") | هاي, بس, چ-for-ك, منو, warmth | nostalgic | M | yes | The Static Sky line-bc1475218a, rendering |
| film-ss-04 | film | هذا... ما يصير. | This... can't be. (Elias: "That's… not possible.") | pause, ما-negation, trembling | trembling | M | yes | The Static Sky line-c28636643c, rendering |
| film-ss-05 | film | المارينر... ضاعت بسنة سبعة وثمانين. | The Mariner... was lost in eighty-seven. (Najm: "The Mariner… it vanished in '87.") | foreign-name-arabic-script, pause, year, numbers-iraqi, ب-preposition | low | M | no | The Static Sky line-ddda108a0b, rendering — intelligibility of a Western ship name in Arabic letters |
| film-ss-06 | film | هي عمرها ما راحت. | She never left. (Elias: "She never left.") | عمر+pronoun+ما=never, whisper-register, ما-negation | whisper | M | yes | The Static Sky line-b00523bf7a, rendering |
| film-fx-01 | film | تكدر تنام ببيتك مثل الناس. | You could sleep at home like a normal person. (Layla) | ك-as-g, ب-preposition, مثل-الناس | dry | F | yes | fixture The Opening Hour s1e1 d1 — written with ك where Baghdad says /g/: which does the engine say? |
| film-fx-02 | film | البيت ما بي چاي. | Home has no tea. (Karim) | ما-بي, چ-for-ك, one-breath | dry | M | yes | fixture The Opening Hour s1e1 d2 |
| film-fx-03 | film | منو مات؟ | Who died? (Abu Samir) | منو, question-intonation, one-breath | dry | M | yes | fixture The Opening Hour s1e1 d3 |
| film-fx-04 | film | شيل هذا. هنا ما نسوي هيچ. | Put that away. We don't do that here. (Abu Samir) | شيل, ما-negation, نسوي, هيچ, چ-for-ك, firm | firm | M | yes | fixture The Opening Hour s1e1 d4 |

## 4. The harness: `scripts/voice-eval.mjs`

Built and tested without a GPU (dry runs, unit tests on `tests/fixtures/speech-en.wav` and synthetic ffmpeg files);
it runs the moment the voice containers are up. It never touches the studio: `--base` is required, explicit, and a URL
with port 4200 or a path under `/api` is refused; it only ever `GET`s `/health` and `POST`s `/synthesize` and
`/transcribe` on the service origins it was given.

**The model-phase command** (both voices of the example config are *designed* seeds, hence `--allow-synthetic`; with
consented Iraqi recordings in the config the flag is not needed and the report is not stamped):

```
pnpm exec tsx scripts/voice-eval.mjs --base http://127.0.0.1:8021 --asr http://127.0.0.1:8030 --indextts http://127.0.0.1:8020 \
    --voices tests/fixtures/voice/iraqi-eval-voices.example.json --allow-synthetic --prepare both \
    --out docs/evidence/iraqi-eval/2026-10-run1
```

Then open `docs/evidence/iraqi-eval/2026-10-run1/review.html` from that folder (the players load `wavs/…` relative to
the page), have the native listener rate every line, save the JSON, and merge it:

```
pnpm exec tsx scripts/voice-eval.mjs --merge-review docs/evidence/iraqi-eval/2026-10-run1/review-<name>-<date>.json --out docs/evidence/iraqi-eval/2026-10-run1
```

`--dry-run` validates everything (arguments, the set, the references, their provenance tags) and writes `plan.json`
with no request at all; it was run on 2026-10-04 with the command above minus `--indextts`: 107 synthesis calls for
60 lines × 2 voices (105 prepared lines plus num-04 raw for each voice; the two code-switched lines need `--indextts`,
else they are listed as skipped, never spoken by the Iraqi engine).

### 4.1 What one run produces

`<out>/`:

- `plan.json`: services, parameters, voices (sha256, duration, provenance tag, reference transcript), every planned
  call with the text as spoken.
- `wavs/<voice>-<lineId>[-raw]-<engine>-s<seed>.wav`: the audio, as the service returned it (its own −1 dBTP limiter,
  its provenance tag in the WAV INFO chunk).
- `asr/<same>.json`: the full transcript with word timings and the model that transcribed it.
- `report.json`: per line — the text, what was actually sent (`spoken`, after preparation, and the `changes`), gloss,
  features, emotion, expected sex, voice and engine, seed and engine version, synthesis time, duration, sample rate,
  integrated loudness, true peak, loudness range, silence (leading, trailing, longest inner pause, ratio), letters per
  second of speech, the transcript, the ASR model, WER (orthographic), CER (orthographic and dialect-folded), coverage,
  the studio's own CER / coverage / verdict (`normalizeIraqi` fold, when run under tsx), the MSA heuristic (§4.3), and
  `flags`. Plus the measured summary per voice, category and engine, and `listening: PENDING`.
- `review.html`: the reviewer's page (§6).
- After the merge: `REVIEW.md` and `report.listening` with the pass/fail per voice.

### 4.2 Measurements and flags

| Measurement | How | Flag |
|---|---|---|
| intelligibility | the ASR (Arabic → `whisper-large-v3-arabic-dialectal-v2` via `language=ar`; the response's `model` is recorded and `ASR_NOT_DIALECT_MODEL` raised if plain large-v3 answered); WER on `normalizeArabicEval` (hamza forms, ة/ه, ى/ي, diacritics, tatweel, zero-width marks, both digit sets, Persian ک/ی, punctuation); CER raw and after the letter fold (گ ق ك one class, چ ج تش one class) | `CER_ABOVE_GATE` (> 0.15 folded), `UNINTELLIGIBLE` (> 0.35) |
| level | ffmpeg `loudnorm` pass 1: integrated LUFS, true peak, LRA | `LOUDNESS_OUT_OF_RANGE` (outside −23…−16 LUFS), `PEAK_ABOVE_CEILING` (> −0.95 dBTP), `SILENT` |
| timing | ffprobe duration; ffmpeg `silencedetect` (−35 dB, ≥ 0.25 s): leading, trailing, longest inner pause, ratio; letters per second of speech | `MOSTLY_SILENCE` (> 50 %), `TOO_SHORT` (< 0.3 s), `TOO_LONG_FOR_TEXT` (> 0.4 s per letter + 2 s) |
| provenance | the WAV tag the voice service writes | `NO_PROVENANCE_TAG` (not the studio's service) |
| MSA reading | §4.3 | `MSA_LIKE` |

None of these is a quality verdict; together they stop a broken run (wrong engine, unconverted ASR model, clipping,
silence, a reference heard as English) from reaching a listener, and they put a number next to every line the listener
rates.

### 4.3 The MSA-reading heuristic

The dialect-tuned ASR writes dialect speech in dialect spelling. So when the text carries a Baghdadi marker and the
transcript carries its MSA counterpart instead, one of two things happened: the engine read the line as MSA, or the ASR
normalised dialect speech toward MSA. The heuristic (`msaReadingFlags` in `scripts/lib/voice-eval-metrics.mjs`):

1. Both sides go through `normalizeArabicEval`. A marker table pairs Iraqi forms with the MSA forms an ASR writes
   (شلون → كيف / كيف حالك; شنو → ماذا; وين → أين; منو → من هو; ليش → لماذا; شوكت → متى; هسه → الآن; ماكو → لا يوجد;
   اكو → يوجد / هناك; هواية → كثيراً / جداً; باچر → غداً; مو → ليس; اني → أنا; احنا → نحن; زين → جيد; لعد → إذن;
   شوية → قليلاً; بس → فقط / لكن; راح → سوف; ويا → مع; هيچ → هكذا; تدري → تعرف; بعده → لا يزال; تجي/يجي → تأتي/يأتي;
   نسوي → نفعل; ورة → وراء; اثنعش → اثنا عشر; خمسطعش → خمسة عشر; اربعطعش → أربعة عشر; ميتين → مئتان; تسعمية →
   تسعمائة; مية → مائة; دير بالك → انتبه; عفية → أحسنت; خوش → جميل). Words match whole, with an attached و/ب/ل/ف/ال.
2. A **substitution** is counted when the text has the Iraqi form, the transcript has the MSA form, and the transcript
   does not also have the Iraqi form (then the ASR merely added a word).
3. **Grammar**: لم / لن / سوف / ليس / ليست / لست / سيكون in the transcript but not in the text.
4. **Tanween** (case endings) in the transcript is counted and shown, never flagged alone: the ASR writes it on its own.
5. **Letters**: for every گ/چ word in the text, how the transcript spelled it (as such, with another letter, or not
   found) — reported for the listener, not counted: ق for گ is a transcription convention as much as a pronunciation
   (the A/B wrote غ for گ 15 times out of 18 on a real Iraqi clip).
6. `msaLike` = two or more substitutions, or one when the line has at most two markers, or any grammar word.

Limits, stated plainly: the heuristic cannot see an MSA *accent* on a line whose words are all dialect-neutral
(name-03, short-03), cannot tell a /q/ from a /g/, and can be fooled by the ASR in both directions. It is a pointer for
the listener, and the review form asks the listener directly.

## 5. Text preparation review: what the engine hears

**What the app did before this work.** `speakLine` (src/worker/handlers/voice.ts) sent the line to `/synthesize`
exactly as written in `textAr`; docker/tts/app.py trims it and checks its length (≤ 2000 characters), and Habibi's
`infer_process` chunks it at punctuation. No digit, tatweel, line-break or quote handling anywhere on the Iraqi path.
IndexTTS (`infer_v2_5.py`) has no Arabic normaliser either (research VOICE-IDENTITY-V2 §2.5). The ASR side had the
dialect fold `normalizeIraqi` for the gate, with spelled numbers up to «ميتين» and «الف».

**What the engine's vocabulary says** (`vocab.txt` of Habibi IRQ, read from the model volume, sha256 in
`tests/fixtures/voice/habibi-irq-vocab-chars.json`): 2 712 entries (the F5-TTS base vocabulary with pinyin, Korean,
Cyrillic… plus the Arabic letters). F5-TTS maps a character outside it to index 0, the space, so an unknown character
is cut out of its word. In the vocabulary: both digit sets, «، ؟ ؛ … — –», the diacritics and the tatweel, گ چ پ ڤ ک ی,
««»» and the single curly quotes. **Not** in it: the curly double quotes “ ” „, the zero-width joiners, the Arabic
letter mark, the no-break space, the Persian digits ۴ ۵ ۶, line breaks and tabs. Every line of the set passes the
vocabulary check as written (a unit test), and again after preparation.

**Implemented (pure text, unit-tested in `tests/unit/iraqi-text.test.ts`, wired into `speakLine` for both local
engines; the hosted MiniMax path keeps its own normaliser).** `prepareLineText(text, { engine, language, dialect })` in
`src/server/providers/iraqi-text.ts`; the job log carries what changed (`line prepared for habibi: …`) and the text as
spoken. The script is never rewritten and the line is verified against the original:

| Rule | Before | What the engine hears | Why |
|---|---|---|---|
| digits → Baghdadi number words | «الموعد الساعة 7:30 يوم 15 من الشهر، والسعر 250 ألف.» | «الموعد الساعة سبعة ونص يوم خمسطعش من الشهر، والسعر ميتين وخمسين ألف.» | digits have no stable Iraqi reading in ASR-derived training text; a Baghdadi says اثنعش، خمسطعش، ميتين، ثلاث تالاف، ميت الف، مليونين |
| construct form before a noun | «3 سنين», «1 دينار» | «ثلاث سنين», «دينار واحد» | «ثلاثة سنين» is a reading, not speech |
| times | «19:45», «8:20», «12:00» | «ثمانية الا ربع», «ثمانية وثلث», «اثنعش» | the 12-hour clock with ونص / وربع / الا ربع / وثلث; other minutes «وخمس دقايق» |
| percentages, decimals, separators | «25%», «7.5», «2,500» | «خمسة وعشرين بالمية», «سبعة ونص», «الفين وخمسمية» | |
| Arabic-Indic / Persian digits | «٣٥», «۱۵» | «خمسة وثلاثين», «خمسطعش» | ۴ ۵ ۶ are not even in the vocabulary |
| MSA lines (IndexTTS, no Iraqi dialect) | «250 ألف» | «مئتان وخمسون ألف» | the reading form, no case endings (the engine would read them as letters) |
| English lines | unchanged | unchanged | IndexTTS normalises English itself |
| tatweel, Arabic/Latin boundary | «شغّل الـwifi» | «شغّل ال wifi» | the tatweel is a typographic stretch; a glued «الwifi» is one unreadable token for IndexTTS |
| line breaks | «سطر اول⏎سطر ثاني» | «سطر اول. سطر ثاني» | a line break is not in the vocabulary; a sentence end gives the pause |
| curly double quotes, zero-width marks, NBSP, presentation forms | «يقول “مرحبا”», «ما‌كو», «ﻻ» | «يقول مرحبا», «ماكو», «لا» | would be cut out of the word |
| Latin ? , ; after Arabic letters; runs of marks | «شنو, زين?», «هسه؟!!» | «شنو، زين؟», «هسه؟!» | the Arabic marks are what the engine heard with a question's intonation; a run of marks is one |
| hand diacritics, گ چ | «ويّاي للسوگ باچر» | unchanged | kept as written (research: no automatic diacritisation; the fold is for evaluation only) |

**The gate keeps up** (`normalizeIraqi` in `src/server/providers/speech.ts`, tests in `tests/unit/voice-metrics.test.ts`):
hundreds 300–900 in Iraqi and MSA spellings («ثلثمية», «ثلاثمائة»), «مائة / مائتين» (previously folded to «مايه» and
never to 100), «الفين», «تالاف / آلاف», «مليون / مليونين / ملايين»; a spelled number is read as Arabic counts
(«ميتين وخمسين الف» → 250000, «ثلاث تالاف وخمسمية» → 3500, «مليونين وخمسمية الف» → 2500000); thousands separators;
«%» ≡ «بالمية»; the fractions of the hour («سبعة ونص» ≡ «7:30», «ثمانية الا ربع» ≡ «19:45», 12-hour on both sides).
So a perfect transcript of a prepared digit line scores CER 0 and coverage 1 against the original script (a test
proves it on six lines).

**Needs the engines running (not done here, listed for the model phase):**

- **A/B raw vs prepared digits** (`--prepare both` on num-04): does Habibi read «7» at all, and is «سبعة ونص» said
  naturally? The harness writes both WAVs side by side.
- **Question intonation.** The Iraqi engine has no intonation control: the only levers are the «؟» in the text (kept,
  and Latin «?» mapped to it) and the reference recording's own prosody. Whether a «؟» raises the tail is a listening
  item on q-01…q-08, short-02 and film-ss-02 (the «مو؟» tag). If it does not, the fix is an emotion-tagged reference
  set per voice (MODEL-STACK §3.10), not text.
- **Pauses.** Whether «...» gives a pause or a restart (emo-sad-02, emo-fear-01, film-ss-04): listening item; the
  harness reports the longest inner pause per line.
- **«ك» said as /g/** (film-fx-01 «تكدر»): if the engine reads it /k/, the fixture and the writing rule (skill:
  «گ written as such») disagree and the fixture line should be written «تگدر». Listening item.
- **Code-switched lines on IndexTTS** (mix-01, mix-02 against mix-03 on Habibi): whether the English words are
  readable and the Arabic stays Baghdadi, and how far the timbre moves between the two engines on one voice
  (VOICE-STACK D4's "new risk"); the harness records ECAPA only when the design service is added later — for now the
  reviewer's "same voice" rating covers it.
- **Emotion words in `delivery`** («muttering, eyes narrowing at the radio» in The Static Sky): `emotion_vector` in
  docker/tts/app.py matches whole English keywords (angry, sad, whisper is not one) and Habibi ignores it entirely;
  the mapping from a free-text direction to a delivery is a separate piece of work and not text preparation.

## 6. The listening review protocol

**Who reviews.** A native Iraqi listener who grew up with Baghdadi Arabic (two when possible, as the model-stack plan
§5 asks). Not the engineer who wrote the lines, and not someone who has only read them. Headphones, a quiet room, the
lines in the fixed order of `review.html` (the form shuffles nothing, but it hides the metrics and the transcript until
a line is rated, so the ear decides before the numbers do).

**The form** (`review.html`, written by the harness next to the WAVs; one player per line, the text, the gloss, the
intended emotion, the expected speaker sex):

| Field | Values | Meaning |
|---|---|---|
| rating | **natural** / **understandable** / **wrong** | *natural*: a Baghdadi would say it this way, pronunciation, rhythm and intonation included; *understandable*: every word is there but it is read, MSA-coloured, flat, or a sound is off (گ as ق, چ as ك, a numeral in MSA); *wrong*: a word is missing, garbled or replaced, or the line is not Iraqi |
| dialect | yes / no | "Does this sound authentically Baghdadi?" (the contract's `dialectAuthentic`; only *yes* here can ever turn a voice `LISTENER_APPROVED`) |
| emotion | matched / weak / wrong | the intended delivery (angry, tender, humour, sad, afraid, tired, whisper…) came through |
| same voice | 1–5 | the same person as the other lines of this voice (speaker consistency) |
| note | free text | which word, which sound; e.g. "باچر said with /k/", "numbers MSA", "rushed ending" |

The form saves a JSON file (`review-<name>-<date>.json`) with the reviewer's name, the run id and every rating; the
file is committed beside `report.json` under `docs/evidence/iraqi-eval/<run>/`. The harness merges it
(`--merge-review`) and writes the pass/fail per voice into `report.json` and a `REVIEW.md`.

**The pass bar, per voice** (each judged on the lines it spoke; a line spoken by two voices counts for each):

1. **natural** on at least **80 %** of lines, and **wrong** on none of the ten film lines;
2. **dialect: yes** on at least **80 %** of the lines marked `msaWouldSoundWrong`;
3. **emotion: matched** on at least **3 of 4** of the emotion lines (the model-stack bar: "emotion recognised in ≥ 3/4");
4. **same voice ≥ 4** on at least 80 % of lines;
5. no two reviewers flag the same word as wrong (when there are two reviewers; one reviewer's flag is enough to open a
   finding in `REVIEW.md`).

A voice that passes 1–5 may be labelled "Iraqi dialect: listener-approved" with the reviewer's name and date, and its
identity may become `dialectStatus: LISTENER_APPROVED` by the one route the contract allows: the listener's record
(contract §4, `src/domain/voice-identity.ts`). A voice that fails stays `UNVERIFIED` (or becomes `LISTENER_REJECTED`),
whatever its ASR numbers.

**What "verified" may and may not claim before the review.** Before a native listener has recorded a review:

- The harness's `report.json` may say: *measured* — "N of M lines intelligible (ASR CER ≤ 0.15 after the dialect fold)",
  the loudness and true-peak figures, the duration and silence ratios, and *flagged* — "the dialect-tuned ASR heard MSA
  forms on these lines" (§4.3, a heuristic).
- It may **not** say: natural, authentic, Baghdadi, Iraqi-sounding, emotionally right, consistent, or verified. Every
  UI label and evidence file keeps "Iraqi dialect not yet verified by a native listener" (`IRAQI_DIALECT_PENDING` in
  `src/domain/voice-identity.ts`). ASR success is "intelligible (measured)".
- An ASR CER of 0 on a line is not a pass on dialect: an MSA reading of «كيف حالك» for «شلونك» can score well on words
  and still be wrong; the heuristic flags the obvious cases and the listener finds the rest.
- The listening review is the acceptance; the measurements are the pre-check that stops a broken run (clipping, silence,
  wrong engine, wrong ASR model) from wasting a reviewer's hour.
