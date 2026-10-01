# Japanese Match

A small offline app for learning Japanese vocabulary, kana and stroke order.
Static files only — no build step, no framework, no server at runtime. Works in
Safari on the Mac and installs to the iPhone home screen as a standalone app.

## Running it

```sh
python3 -m http.server 8731
```

Then open <http://localhost:8731>. Any static host works; the app never talks to
a backend. All progress lives in `localStorage` on the device.

### On the iPhone

Serve the folder from your Mac (as above), open the address in Safari on the
phone, then **Share → Add to Home Screen**. The service worker caches everything
on first load, so it keeps working with no signal. The page, the JS, the CSS and
the two hand-edited data files are network-first, so a reload picks up changes
without touching `CACHE_NAME` — bump it in [`sw.js`](sw.js) only when
`kana.json`, `strokes.json` or the icons change, since those are cache-first.

## The three sections

The tab bar has two rows: the section, then the modes inside it.

```
Words     Practice · Adj · Browse
Writing   Practice · Learning
Grammar   Cheat · Revise
```

Each section remembers which mode you were last in, so coming back to Writing
lands you where you left it.

**Words → Practice** — two-stage reveal. You get the written form, recall the *reading*,
and only then the *meaning*. A Japanese word is three linked facts (form,
reading, meaning) and testing them as one lump lets you coast on vague
recognition. Both stages have to be right for the word to count. The `EN → JP`
toggle flips to production, which is the harder and more useful direction once a
word is familiar.

**Words → Adj** — pick the right form. An adjective comes up with a slot — present,
past, or either of them negated — and four candidate conjugations. Every other
question in a round is a negative one, and the tense alternates evenly inside
each polarity: drawing the slot at random per question was uniform across a
session but streaky within a round, and ten questions is too few to spend nine
of them on the present. The wrong
ones aren't other words: they're *this* word run through the other family's
rule, which is the only mistake worth drilling. kirei's negative is offered
against kire-kunai desu and kirei-kunai desu, ii's against i-kunai desu. Answer
and the reveal lays out all four forms at once, because seeing ja nakatta desu
and ku nakatta desu side by side is what shows they're the same shape. The
family filter narrows to い, to な, or to the three exceptions on their own.

**Writing → Practice** — a kana sign appears, you pick its reading (or the reverse). Under *Both
scripts* + *Everything*, or on its own with *Kanji only*, the pool also holds
the basic kanji from [`data/kanji.json`](data/kanji.json) marked `"quiz": true`
— only characters that are a word by themselves (山 yama, 川 kawa), because a
character like 上 has no single reading to ask for. Distractors
come from a hand-built confusability map, not at random: シ/ツ/ソ/ン, ぬ/め/ね/れ/わ,
は/ほ/ま and the rest of the shapes beginners actually mix up, then same-row
(vowel discrimination), then same-column (consonant discrimination). Random
options would make this trivial.

**Writing → Learning** — stroke-order playback for every single kana, drawn one stroke at a
time. Writing kana by hand is the fastest way to stop confusing them. The script
picker also has a small hand-picked kanji set ([`data/kanji.json`](data/kanji.json)),
shown with the word each character was taken from — 上 alone has no one reading,
so it is labelled and spoken as 上手 じょうず.

**Words → Browse** — the whole library in one list. Mostly a proofreading tool: after
adding words, check here that the furigana lines up and the derived romaji looks
right. Tapping a row speaks it.

**Grammar → Revise** — the quiz the cheat sheets don't give you. An English meaning comes
up with four Japanese sentences, one right and three carrying the exact mistakes
the sheets warn about: `wo` where `ga` belongs, `amari` with a positive verb,
`na` on an i-adjective, `ni` after `senshuu`. Answer and the reveal lists every
option with what is wrong with it, so one question teaches three rules. Fifteen
questions a round, filtered by topic or drawn from everything.

Where the words exist in [`data/kanji.json`](data/kanji.json) the sentences are
written in kanji, with a bar under the options giving each word its reading.
All four options of a question always carry the same kanji, so the writing can
never single one of them out, and knowing that 上手 is *jouzu* tells you nothing
about whether the particle is right.

The same bar names the family of any adjective the question conjugates. "The
water was cold" cannot be answered unless you already know *tsumetai* takes the
i rule, and nothing else on the screen says so. The questions whose point is
telling the families apart declare `adjectives:which-family` and go without it —
spotting that *kirei* ends in i and still takes na is the whole exercise there,
and `check.js` fails if such a question carries the line anyway.

The wrong sentences are written by hand in
[`data/revision.json`](data/revision.json) and never generated. Generating them
is a trap: swapping a particle usually yields another perfectly correct sentence
with a different meaning, and a quiz that calls a correct sentence wrong teaches
you something false.

**Grammar → Cheat** — reference tables, not a quiz. Some vocabulary isn't a list of words
but a shape: relative time expressions are six prefixes crossed with four scales,
and drilling them one flashcard at a time hides the very pattern that makes them
cheap to learn. So this mode lays the grid out whole, stripes the cells that
break the pattern, and states the rules underneath. Tapping a cell speaks it.

Words are dealt off a shuffled deck, one group at a time: the whole group goes
past you before any word comes back. A card leaves the deck as it appears, not a
round at a time, so quitting three words in doesn't cost you the seven you never
saw.

Adjective forms are dealt the same way, and are derived from the kana rather
than stored: only the family lives in the data, so a word tagged `"adj": "na"`
conjugates itself.

Kana uses the spaced-repetition store instead — wrong answers come back soon and
often, right answers fade, and five correct in a row retires a sign until the
pool runs thin. Every mode records every answer either way, so the stats and the
answer streak work the same across all of them.

## Adding words

Edit [`data/words.json`](data/words.json). One object per word:

```json
{
    "kanji":   "食べます",
    "kana":    "たべます",
    "english": "to eat",
    "group":   "Verbs",
    "note":    "ichidan (る-verb) — dictionary form 食べる (たべる)",
    "marked":  false
}
```

Verbs are stored in the polite ます form, because that's the form they're taught
and heard in; the dictionary form lives in the `note`.

| field | required | notes |
|---|---|---|
| `kana` | yes | how it's written in kana — hiragana, or katakana for loanwords (`コーヒー`) |
| `english` | yes | the meaning. Keep these distinct; duplicates make multiple choice ambiguous |
| `group` | yes | drives the dropdown. Aim for 8+ words per group so quizzes have room |
| `kanji` | no | the written form. Leave `""` for kana-only words like `ありがとう` |
| `romaji` | no | **override only.** Normally derived — see below |
| `note` | no | shown on the reveal card. Verb class, particle quirks, that sort of thing |
| `marked` | no | `true` puts it in the ★ Marked group for focused review |
| `adj` | no | `"i"` or `"na"` — an adjective, and which family. Drives the Adj mode |

**You don't write the romaji.** Kana → romaji is deterministic, so it's derived
at runtime from the `kana` field and stays consistent for free. Only set
`romaji` when the spelling and the reading genuinely disagree — the particle
は in `こんにちは`, which is written *ha* and read *wa*.

The romaji style is deliberately direct: every kana maps to its own syllable and
ー doubles the vowel, so `コーヒー` is `koohii` rather than the prettier Hepburn
`kōhī`. It's less elegant but it round-trips back to kana, so the romaji never
hides a character from you while you're still leaning on it.

**Furigana is worked out for you** from `kanji` + `kana`. `食べ物` + `たべもの`
becomes 食(た)べ物(もの), by anchoring on the okurigana. If the two fields
disagree the alignment fails loudly in `tools/check.js` rather than rendering
something wrong.

After editing, run the checks:

```sh
deno run --allow-read tools/check.js
```

It verifies romaji derivation, furigana alignment, duplicate meanings, thin
groups, stroke coverage and cheat-sheet cells.

## Adding a cheat sheet

Edit [`data/sheets.json`](data/sheets.json). A sheet is a title, an optional
legend, one or more grids, and the rules that explain them:

```json
{
    "id": "weekdays",
    "title": "Days of the week",
    "blurb": "One suffix and seven prefixes.",
    "legend": [{ "term": "-youbi", "gloss": "day of the week" }],
    "grids": [{
        "title": "the seven days",
        "columns": ["weekday", "what the prefix means"],
        "rows": [{ "label": "Mon", "cells": [
            { "kana": "げつようび", "en": "Monday" },
            { "term": "月", "en": "moon → Monday, lundi" }
        ] }]
    }],
    "rules": [{ "title": "One suffix does all the work", "body": "…" }]
}
```

A cell with `kana` is a word: it derives its own romaji, and tapping it speaks
it. Add `"odd": true` and it gets the accent stripe — use it for the cells the
rules *don't* cover, since the whole point of a sheet is separating the pattern
from the handful of things you have to memorise flat. A cell with `term`/`en`
instead is a plain gloss, for the column that explains why the word is what it
is. Cells left out or written as `{}` render blank.

`romaji` is available here as an override too, but on a sheet it's almost always
about spacing: あしたのあさ derives as `ashitanoasa`, which is correct and
unreadable, so it's spelled `ashita no asa` by hand. `check.js` flags an override
that changes anything beyond the spaces.

## Regenerating the datasets

Both are committed, so you only need this if you change the generators.

```sh
python3 tools/gen_kana.py data/kana.json                    # kana tables + confusability map
python3 tools/gen_strokes.py data/kana.json data/strokes.json   # stroke paths, needs network
```

`gen_strokes.py` also picks up every character in [`data/kanji.json`](data/kanji.json),
so rerun it after adding a kanji — KanjiVG is a kanji dictionary that happens to
include the kana, and the same fetch serves both. A kanji with no stroke data
would just vanish from the picker, so `check.js` fails on one.

## Adding a revision question

Edit [`data/revision.json`](data/revision.json). One object per question:

```json
{
    "id": "senshuu-ni", "covers": ["calendar:ni-or-nothing"], "sheet": "calendar",
    "en": "I went last week.",
    "correct": { "kana": "せんしゅういきました", "romaji": "senshuu ikimashita" },
    "wrong": [
        { "kana": "せんしゅうにいきました", "why": "relative time words take no ni." }
    ]
}
```

`covers` lists the sheet rules the question tests, as `sheet:rule-id` — every
rule in `sheets.json` carries an `id` for this. **`check.js` fails if any rule
has no question behind it**, so coverage is enforced rather than remembered: add
a rule to a sheet and the checks stay red until you write a question for it.

Exactly three wrong options, each with its `why` — that text is the lesson, so
say what rule was broken rather than "wrong particle". `sheet` has to match a
sheet id in `sheets.json`, which is what the topic picker filters on. Every
option must be pure kana so the romaji derives, and the check refuses two
identical options, since the right answer would then be on screen twice.

The romaji follows the cheat-sheet convention — spacing only, no re-spelling —
with one exception: a particle in a token of its own may be written as it is
said, so `wa` for は and `e` for へ. The check undoes that substitution token by
token, so it still catches a typo.

A question must not come down to spotting one kana in the middle of four
otherwise identical sentences. One such pair is the point — it is the rule being
tested. Two or more and you are testing eyesight, not grammar, so `check.js`
fails on it; make the other distractors go wrong somewhere the eye lands, at the
verb ending, on a missing particle, in a different word.

Kanji forms are added by a script and stored as a `kanji` string beside each
option plus a `kanjiNotes` list for the reading bar. The substitution is
word-wise and guarded, because `hito` is 人 but `hitori` is 一人, and it is
skipped wherever a wrong option would come out as a real word — 好きます and
嫌います are 好く and 嫌う conjugated, and 上手い is *umai*. `check.js` reads every
kanji form back to kana and fails if it doesn't match.

Make sure a wrong option is actually wrong. The temptation is to flip a particle
and move on, but `ookii kuruma` and `ookina kuruma` are both correct, and
`kyou wa samui` and `kyou ga samui` differ in emphasis, not in grammar.

## Adding a kanji

Edit [`data/kanji.json`](data/kanji.json), then rerun `gen_strokes.py`:

```json
{ "char": "上", "romaji": "ue / jou", "meaning": "above, up",
  "word": "上手", "wordKana": "じょうず", "wordEnglish": "good at",
  "note": "じょうず is jukujikun — the word carries its own reading." }
```

`word` has to contain the character, and a multi-character one should already be
in `words.json`. Add `"quiz": true` to put the character in the Kana quiz as
well; `check.js` then insists the character is a word on its own and that its
reading collides with no kana and no other quiz kanji — otherwise the
reading → sign direction would show two right answers. `romaji` is the character's own reading — kun, or kun / on — and
labels it in the picker; it is deliberately *not* the slice of the word's
reading that lines up with it, because for a jukujikun word like 上手 or 下手
no such slice exists and writing one down teaches a reading that isn't real.
That is what `note` is for.

## Tests

```sh
deno run --allow-read tools/check.js                                    # data + pure logic
deno run --allow-read --allow-net --location=http://localhost/ tools/smoke.js   # drives the real UI headlessly
```

`smoke.js` loads `index.html` into a DOM shim and plays actual rounds — clicking
options, checking both the right and wrong branches, and confirming the
spaced-repetition weights move in the right direction.

## Audio

Japanese text-to-speech uses the Web Speech API, which is built into Safari on
macOS and iOS — no key, no server, nothing to install. If no `ja-JP` voice is
present the speaker buttons hide themselves rather than reading Japanese in an
English accent.

## Ideas worth building next

- **Fill in the particle** — は / を / に / が / で over short sentences. This is
  the classic beginner wall and the mode that would probably teach you the most.
- **Verb conjugation drills** — godan vs ichidan vs irregular, ます/て/た forms.
  The `note` field already records the class.
- **Kanji mode** — a kanji with its on'yomi/kun'yomi and the words that use it,
  rather than drilling characters in isolation.
- **Counters** — 一つ/一人/一本/一枚, which nothing else in the app touches yet.

## Licence

See [NOTICE.md](NOTICE.md). `data/strokes.json` is derived from KanjiVG and stays
CC BY-SA 3.0; everything else is original to this project.
