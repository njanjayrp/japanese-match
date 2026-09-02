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
on first load, so it keeps working with no signal. Bump `CACHE_NAME` in
[`sw.js`](sw.js) whenever you change code or data, or the phone will keep serving
the old version — `data/words.json` and `data/sheets.json` are the exceptions and
are always fetched fresh when online.

## The five modes

**Words** — two-stage reveal. You get the written form, recall the *reading*,
and only then the *meaning*. A Japanese word is three linked facts (form,
reading, meaning) and testing them as one lump lets you coast on vague
recognition. Both stages have to be right for the word to count. The `EN → JP`
toggle flips to production, which is the harder and more useful direction once a
word is familiar.

**Kana** — a sign appears, you pick its reading (or the reverse). Distractors
come from a hand-built confusability map, not at random: シ/ツ/ソ/ン, ぬ/め/ね/れ/わ,
は/ほ/ま and the rest of the shapes beginners actually mix up, then same-row
(vowel discrimination), then same-column (consonant discrimination). Random
options would make this trivial.

**Write** — stroke-order playback for every single kana, drawn one stroke at a
time. Writing kana by hand is the fastest way to stop confusing them.

**Browse** — the whole library in one list. Mostly a proofreading tool: after
adding words, check here that the furigana lines up and the derived romaji looks
right. Tapping a row speaks it.

**Cheat** — reference tables, not a quiz. Some vocabulary isn't a list of words
but a shape: relative time expressions are six prefixes crossed with four scales,
and drilling them one flashcard at a time hides the very pattern that makes them
cheap to learn. So this mode lays the grid out whole, stripes the cells that
break the pattern, and states the rules underneath. Tapping a cell speaks it.

Words are dealt off a shuffled deck, one group at a time: the whole group goes
past you before any word comes back. A card leaves the deck as it appears, not a
round at a time, so quitting three words in doesn't cost you the seven you never
saw.

Kana uses the spaced-repetition store instead — wrong answers come back soon and
often, right answers fade, and five correct in a row retires a sign until the
pool runs thin. Both modes record every answer either way, so the stats and the
answer streak work the same in each.

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
