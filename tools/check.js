// Sanity checks for the pure-logic modules. Run with: deno run --allow-read tools/check.js
//
// Guards the two things most likely to break quietly when words are added:
// derived romaji, and whether furigana can be aligned to a word's kanji.

const read = p => Deno.readTextFileSync(new URL("../" + p, import.meta.url));

// romaji.js and furigana.js are plain IIFEs with no DOM use, so they load as-is.
const scope = {};
const load = src => new Function(src + "\n;return {Romaji: typeof Romaji !== 'undefined' ? Romaji : undefined," +
                                       " Furigana: typeof Furigana !== 'undefined' ? Furigana : undefined};");
const { Romaji } = load(read("js/romaji.js"))();
globalThis.Romaji = Romaji;
const { Furigana } = load(read("js/furigana.js"))();
const AdjForms = new Function(read("js/adjective-forms.js") + "\n;return AdjForms;")();

const kana = JSON.parse(read("data/kana.json"));
const words = JSON.parse(read("data/words.json"));
const strokes = JSON.parse(read("data/strokes.json"));
const sheets = JSON.parse(read("data/sheets.json"));
const kanji = JSON.parse(read("data/kanji.json"));
const revision = JSON.parse(read("data/revision.json"));
Romaji.init(kana.kana);

/**
 * Does this romaji override spell out that reading, allowing only spacing and
 * the particles that are written one way and said another?
 *
 * Token by token, because a token is ambiguous on its own: "e" is the particle
 * へ in "eki e ikimasu" and the word え, a picture, in "e wo nimai kakimashita".
 * Nothing in the romaji says which, so each token may match either what it says
 * or what it would be spelled as, and the reading decides.
 *
 * The ん apostrophe only marks a syllable boundary and a space marks it just as
 * well, so it is dropped from both sides first.
 */
const SAID_AS = { wa: "ha", e: "he", o: "wo" };
function spellsOut(romaji, reading) {
    const bare = r => r.replace(/'/g, "");
    const want = bare(reading);
    let pos = 0;
    for (const token of bare(romaji).split(" ")) {
        if (!token) continue;
        const alt = SAID_AS[token];
        if (want.startsWith(token, pos)) pos += token.length;
        else if (alt && want.startsWith(alt, pos)) pos += alt.length;
        else return false;
    }
    return pos === want.length;
}

let failures = 0;
const fail = msg => { console.log("  ✗ " + msg); failures++; };

// ── 1. Romaji conversion ────────────────────────────────────────────────────
console.log("romaji conversion");
const CASES = [
    ["こんにちは", "konnichiha"],   // needs the per-word override; particle は
    ["がっこう", "gakkou"],
    ["とうきょう", "toukyou"],
    ["コーヒー", "koohii"],
    ["ビール", "biiru"],
    ["きょう", "kyou"],
    ["しんぶん", "shinbun"],
    ["しんゆう", "shin'yuu"],       // ん before y needs the apostrophe
    ["れんあい", "ren'ai"],         // ん before a vowel too
    ["いっしょ", "issho"],
    ["まって", "matte"],
    ["こっち", "kotchi"],           // っ + ch is "tch" in Hepburn
    ["ちゃ", "cha"],
    ["じゃ", "ja"],
    ["ふじさん", "fujisan"],
    ["おおきい", "ookii"],
    ["わたし", "watashi"],
    ["ジャンプ", "janpu"],
    ["でんわ", "denwa"],
];
for (const [input, expected] of CASES) {
    const got = Romaji.toRomaji(input);
    if (got !== expected) fail(`${input}: expected "${expected}", got "${got}"`);
}
console.log(`  ${CASES.length - failures} / ${CASES.length} passed`);

// ── 2. Every kana sign round-trips ──────────────────────────────────────────
const before = failures;
console.log("kana coverage");
for (const e of kana.kana) {
    if (e.type === "small" || e.type === "mark") continue;
    const got = Romaji.toRomaji(e.char);
    if (got !== e.romaji) fail(`${e.char} (${e.script}): table says "${e.romaji}", converter says "${got}"`);
}
console.log(`  ${kana.kana.length} signs checked, ${failures - before} mismatches`);

// ── 3. Confusables are usable ───────────────────────────────────────────────
console.log("confusables");
const byScript = {};
for (const e of kana.kana) (byScript[e.script] ||= new Set()).add(e.char);
let thin = 0;
for (const e of kana.kana) {
    if (e.type !== "base") continue;
    const list = (kana.confusables[e.char] || []).filter(c => byScript[e.script].has(c));
    if (list.length < 5) { thin++; console.log(`  ! ${e.char} only has ${list.length} confusables`); }
    if (list.includes(e.char)) fail(`${e.char} lists itself as a confusable`);
}
console.log(`  ${thin} basic signs with a thin distractor pool`);

// ── 4. Furigana alignment across the whole library ──────────────────────────
console.log("furigana alignment");
let annotated = 0, fellBack = 0;
for (const w of words) {
    const written = w.kanji || w.kana;
    const reading = Romaji.readingOf(w);
    if (!Romaji.hasKanji(written)) continue;
    annotated++;
    const html = Furigana.render(written, reading, true);
    if (!html.includes("<ruby>")) fail(`${written} produced no ruby at all`);

    // A word that is nothing but kanji (人, 学校) correctly gets one ruby over
    // the lot. It's only a fallback when there was okurigana to anchor on and
    // we failed to use it — that usually means kanji and kana disagree.
    const hasOkurigana = [...written].some(c => Romaji.isKana(c));
    if (hasOkurigana && html === `<ruby>${written}<rt>${reading}</rt></ruby>`) {
        fellBack++;
        fail(`${written} (${reading}) — has okurigana but couldn't align; do the fields match?`);
    }
}
console.log(`  ${annotated} words carry kanji, ${fellBack} failed to align`);

// ── 5. Word data hygiene ────────────────────────────────────────────────────
console.log("word data");
const seenEnglish = new Map();
const seenWord = new Set();
for (const w of words) {
    const written = w.kanji || w.kana;
    if (!w.kana) fail(`${written}: missing kana`);
    if (!w.english) fail(`${written}: missing english`);
    if (!w.group) fail(`${written}: missing group`);
    if (w.kana && ![...w.kana].every(c => Romaji.isKana(c))) {
        fail(`${written}: kana field contains non-kana`);
    }
    if (seenWord.has(written)) fail(`duplicate entry: ${written}`);
    seenWord.add(written);
    // Duplicate meanings make multiple-choice options ambiguous.
    if (seenEnglish.has(w.english)) {
        fail(`duplicate meaning "${w.english}": ${seenEnglish.get(w.english)} and ${written}`);
    }
    seenEnglish.set(w.english, written);
}
const groups = {};
for (const w of words) groups[w.group] = (groups[w.group] || 0) + 1;
for (const [g, n] of Object.entries(groups)) {
    if (n < 4) console.log(`  ! group "${g}" has only ${n} words — too few for a 4-option quiz`);
}
console.log(`  ${words.length} words in ${Object.keys(groups).length} groups`);

// ── 6. Stroke data ──────────────────────────────────────────────────────────
console.log("stroke data");
let missing = 0;
for (const e of kana.kana) {
    if (e.char.length !== 1 || e.type === "extended") continue;
    if (!strokes.strokes[e.char]) { missing++; console.log(`  ! no strokes for ${e.char}`); }
}
console.log(`  ${Object.keys(strokes.strokes).length} signs with stroke data, ${missing} missing`);

// ── 7. Cheat sheets ─────────────────────────────────────────────────────────
// Sheets carry kana only and derive their romaji at render time, so the one
// thing that can break them is a cell that isn't kana — it would silently pass
// through the converter unchanged and print Japanese where romaji belongs.
console.log("cheat sheets");
let cells = 0;
for (const sheet of sheets) {
    if (!sheet.id) fail("a sheet has no id");
    if (!sheet.title) fail(`sheet ${sheet.id}: missing title`);
    for (const grid of sheet.grids || []) {
        for (const row of grid.rows || []) {
            if (row.cells.length !== grid.columns.length) {
                fail(`${sheet.id} / ${grid.title} / row ${row.label}: ` +
                     `${row.cells.length} cells for ${grid.columns.length} columns`);
            }
            for (const c of row.cells) {
                if (!c || !c.kana) continue;   // a blank cell is allowed
                cells++;
                if (!c.en) fail(`${sheet.id}: ${c.kana} has no meaning`);
                if (![...c.kana].every(ch => Romaji.isKana(ch))) {
                    fail(`${sheet.id}: "${c.kana}" is not pure kana — romaji can't be derived`);
                }
                // Overrides here are nearly always about word spacing. Anything
                // else is legal (a particle that reads differently) but worth a
                // second look, because it's also what a typo looks like.
                // The ん apostrophe (takusan'arimasu) only marks a syllable
                // boundary, and a space marks it just as well, so an override may
                // trade one for the other.
                if (c.romaji && !spellsOut(c.romaji, Romaji.toRomaji(c.kana))) {
                    console.log(`  ! ${sheet.id}: "${c.kana}" override "${c.romaji}" ` +
                                `isn't just spacing on "${Romaji.toRomaji(c.kana)}"`);
                }
            }
        }
    }
}
console.log(`  ${sheets.length} sheet(s), ${cells} cells checked`);

// ── 8. Adjective forms ──────────────────────────────────────────────────────
console.log("adjective forms");
const FORM_CASES = [
    ["おおきい", "i",  ["おおきいです", "おおきくないです", "おおきかったです", "おおきくなかったです"]],
    ["しずか",   "na", ["しずかです", "しずかじゃないです", "しずかでした", "しずかじゃなかったです"]],
    ["きれい",   "na", ["きれいです", "きれいじゃないです", "きれいでした", "きれいじゃなかったです"]],
    ["いい",     "i",  ["いいです", "よくないです", "よかったです", "よくなかったです"]],
];
for (const [kana, adj, want] of FORM_CASES) {
    const got = Object.values(AdjForms.formsOf({ kana, adj }));
    if (got.join(" ") !== want.join(" ")) {
        fail(`${kana}: conjugated to ${got.join(" / ")}, expected ${want.join(" / ")}`);
    }
}

// Every adjective has to build four distinct options for all four slots, or the
// quiz shows a duplicate — and with the answer among the duplicates, two
// buttons would both be right.
const adjectives = words.filter(AdjForms.isAdjective);
for (const w of adjectives) {
    const written = w.kanji || w.kana;
    const forms = AdjForms.formsOf(w);
    if (new Set(Object.values(forms)).size !== 4) {
        fail(`${written}: two of its four forms are identical — ${Object.values(forms).join(" / ")}`);
    }
    for (const slot of AdjForms.SLOTS) {
        const { answer, options } = AdjForms.optionsFor(w, slot.id, 4);
        if (options.length !== 4) {
            fail(`${written} ${slot.id}: only ${options.length} options`);
        }
        if (new Set(options).size !== options.length) {
            fail(`${written} ${slot.id}: duplicate options — ${options.join(" / ")}`);
        }
        if (options.filter(o => o === answer).length !== 1) {
            fail(`${written} ${slot.id}: the answer appears ${options.filter(o => o === answer).length} times`);
        }
        for (const form of options) {
            if (![...form].every(c => Romaji.isKana(c))) {
                fail(`${written} ${slot.id}: option "${form}" isn't pure kana`);
            }
            // The gloss under an option may space the romaji out, nothing more.
            const spaced = AdjForms.spacedRomaji(form);
            if (spaced.replace(/ /g, "") !== Romaji.toRomaji(form)) {
                fail(`${written}: spaced romaji "${spaced}" isn't just spacing on "${Romaji.toRomaji(form)}"`);
            }
        }
    }
}
// A word tagged as an adjective but whose family can't be read is a silent
// dropout: the mode just never shows it.
for (const w of words) {
    if (w.adj && !AdjForms.familyOf(w)) fail(`${w.kanji || w.kana}: adj is "${w.adj}", expected "i" or "na"`);
    if (!w.adj && w.group === "Adjectives") fail(`${w.kanji || w.kana}: in Adjectives but has no adj field`);
}
const exceptions = adjectives.filter(AdjForms.isException).map(w => w.kana);
console.log(`  ${adjectives.length} adjectives conjugated, ${exceptions.length} exceptions (${exceptions.join(", ")})`);

// ── 9. Kanji for the Write mode ─────────────────────────────────────────────
console.log("kanji");
const seenKanji = new Set();
for (const k of kanji) {
    if ([...k.char].length !== 1) fail(`kanji "${k.char}": not a single character`);
    if (seenKanji.has(k.char)) fail(`duplicate kanji: ${k.char}`);
    seenKanji.add(k.char);
    // Without stroke data the character silently vanishes from the picker.
    if (!strokes.strokes[k.char]) fail(`${k.char}: no stroke data — rerun tools/gen_strokes.py`);
    // note is optional — it exists for irregular readings, not every entry.
    for (const field of ["romaji", "meaning", "word", "wordKana", "wordEnglish"]) {
        if (!k[field]) fail(`${k.char}: missing ${field}`);
    }
    if (k.wordKana && ![...k.wordKana].every(c => Romaji.isKana(c))) {
        fail(`${k.char}: wordKana "${k.wordKana}" isn't pure kana`);
    }
    // The character has to actually appear in the word it claims to come from.
    if (k.word && !k.word.includes(k.char)) {
        fail(`${k.char}: not present in its own word "${k.word}"`);
    }
    // A compound should be one the library teaches, or the kanji is orphaned.
    // A single-character word is the word, so there is nothing to look up.
    if (k.word && [...k.word].length > 1 && !words.some(w => w.kanji === k.word)) {
        console.log(`  ! ${k.char}: "${k.word}" isn't in words.json`);
    }
}
// A kanji in the Kana quiz is asked for like a sign: prompt the character, pick
// the reading, or the reverse. That only works if the reading is unambiguous.
const quizzed = kanji.filter(k => k.quiz);
const kanaLabels = new Set(kana.kana.map(e => e.romaji));
const labels = new Map();
for (const k of quizzed) {
    if (k.word !== k.char) {
        fail(`${k.char}: quiz kanji must be a word on its own, not "${k.word}" — ` +
             `otherwise there is no single reading to ask for`);
    }
    const label = Romaji.toRomaji(k.wordKana);
    // In the romaji → sign direction the label is the prompt, so a label that is
    // also a kana's romaji would have two correct answers on screen.
    if (kanaLabels.has(label)) {
        fail(`${k.char}: reads "${label}", which is also a kana — the reverse direction ` +
             `would have two right answers`);
    }
    if (labels.has(label)) {
        fail(`${k.char} and ${labels.get(label)} both read "${label}" — ambiguous in the quiz`);
    }
    labels.set(label, k.char);
}
console.log(`  ${kanji.length} kanji, ${kanji.reduce((n, k) => n + (strokes.strokes[k.char] || []).length, 0)} strokes, ` +
            `${quizzed.length} in the kana quiz`);

// ── 10. Revision questions ──────────────────────────────────────────────────
console.log("revision");
/** Same length, one differing kana, and that kana is neither the opening word
 *  nor inside the closing verb or copula — i.e. somewhere you have to hunt. */
function midTwin(a, b) {
    if (a.length !== b.length) return false;
    let at = -1;
    for (let i = 0; i < a.length; i++) {
        if (a[i] === b[i]) continue;
        if (at !== -1) return false;
        at = i;
    }
    return at > 1 && at < a.length - 3;
}
// Every word this file knows how to write, for validating the revision reading
// bar. A character's own word plus any compound it lists — 上手 is not read
// 上 + 手, so it can only be known by being written down.
const kanjiWords = new Map();
for (const k of kanji) {
    kanjiWords.set(k.word, k.wordKana);
    for (const c of k.compounds || []) {
        if (!c.word || !c.kana) fail(`${k.char}: a compound is missing word or kana`);
        else if (!c.word.includes(k.char)) fail(`${k.char}: not present in its compound "${c.word}"`);
        else kanjiWords.set(c.word, c.kana);
    }
}
const seenIds = new Set();
const prompts = new Map();
const sheetIds = new Set(sheets.map(s => s.id));
for (const item of revision) {
    const where = item.id || item.en;
    if (!item.id) fail(`revision item "${item.en}" has no id`);
    if (seenIds.has(item.id)) fail(`duplicate revision id: ${item.id}`);
    seenIds.add(item.id);
    if (!item.en) fail(`${where}: no English prompt`);
    // Two questions with the same prompt and different answers are unanswerable:
    // both are right, and only a hint in the prompt could separate them. That
    // hint is what a parenthetical like "(the textbook's form)" was doing.
    if (prompts.has(item.en)) fail(`${where}: same prompt as ${prompts.get(item.en)} — "${item.en}"`);
    prompts.set(item.en, item.id);
    // An item pointing at a sheet that no longer exists drops out of the topic
    // picker without a word.
    if (!sheetIds.has(item.sheet)) fail(`${where}: sheet "${item.sheet}" is not in sheets.json`);
    if (!item.correct || !item.correct.kana) fail(`${where}: no correct answer`);
    if (!Array.isArray(item.wrong) || item.wrong.length !== 3) {
        fail(`${where}: needs exactly 3 wrong options, has ${item.wrong ? item.wrong.length : 0}`);
        continue;
    }

    const all = [item.correct.kana, ...item.wrong.map(w => w.kana)];
    // Two identical options would put the right answer on screen twice, and a
    // click on the wrong copy would be graded wrong.
    if (new Set(all).size !== all.length) fail(`${where}: two options are the same sentence`);
    for (const kana of all) {
        if (![...kana].every(c => Romaji.isKana(c))) {
            fail(`${where}: "${kana}" is not pure kana — romaji can't be derived`);
        }
    }
    for (const w of item.wrong) {
        if (!w.why) fail(`${where}: "${w.kana}" has no explanation`);
    }

    // A question must not come down to spotting one kana in the middle of four
    // otherwise identical sentences. One such pair is the point — it is the rule
    // being tested. Two or more and the question stops testing grammar and
    // starts testing eyesight.
    const lookalikes = [];
    for (let a = 0; a < all.length; a++) {
        for (let b = a + 1; b < all.length; b++) {
            if (midTwin(all[a], all[b])) lookalikes.push(`${all[a]} / ${all[b]}`);
        }
    }
    if (lookalikes.length > 1) {
        fail(`${where}: ${lookalikes.length} pairs of options differ by one kana ` +
             `in the middle — at most one may:\n      ` + lookalikes.join("\n      "));
    }

    // Kanji forms. Every option carries the same kanji or none of them do:
    // an option written differently from the rest is pickable on its looks.
    const withKanji = [item.correct, ...item.wrong].filter(o => o.kanji);
    if (withKanji.length && withKanji.length !== 4) {
        fail(`${where}: ${withKanji.length} of 4 options have a kanji form — all or none`);
    }
    // The family the reading bar prints has to be the one words.json records,
    // and the adjective has to actually be in the sentence — a bar that names
    // the wrong family teaches the opposite of the rule.
    for (const n of item.adjNotes || []) {
        const word = words.find(w => w.kana === n.kana && w.adj);
        if (!word) { fail(`${where}: names ${n.kana} as an adjective, words.json doesn't`); continue; }
        if (word.adj !== n.family) {
            fail(`${where}: calls ${n.kana} ${n.family}, words.json says ${word.adj}`);
        }
        const shows = Object.values(AdjForms.formsOf({ kana: n.kana, adj: n.family }))
            .some(f => item.correct.kana.includes(f.replace(/です$/, "")));
        if (!shows) fail(`${where}: names ${n.kana}, which isn't in "${item.correct.kana}"`);
    }
    // A question whose point is telling the families apart must not be handed
    // the answer: kirei ends in i and takes na, and spotting that is the test.
    if (item.covers.includes("adjectives:which-family") && (item.adjNotes || []).length) {
        fail(`${where}: tests which-family and still names the family`);
    }

    if (withKanji.length) {
        const notes = item.kanjiNotes || [];
        if (!notes.length) fail(`${where}: written in kanji but has no kanjiNotes for the reading bar`);
        for (const n of notes) {
            if (!kanjiWords.has(n.word)) {
                fail(`${where}: reading bar names ${n.word}, which is not in kanji.json`);
            } else if (kanjiWords.get(n.word) !== n.kana) {
                fail(`${where}: reading bar says ${n.word} is ${n.kana}, ` +
                     `kanji.json says ${kanjiWords.get(n.word)}`);
            }
        }
        // Putting each word's reading back must give the kana exactly. This is
        // what stops a substitution from quietly changing the sentence — 上手
        // standing where じょうず never was, or a swap eating a neighbouring kana.
        for (const o of [item.correct, ...item.wrong]) {
            let back = o.kanji;
            for (const n of notes) back = back.split(n.word).join(n.kana);
            if (back !== o.kana) {
                fail(`${where}: "${o.kanji}" reads back as "${back}", not "${o.kana}"`);
            }
        }
    }
    // The romaji may space the reading out and may trade the ん apostrophe for a
    // space, but must not change it — with one exception: the particles は and へ
    // are written ha and he and said wa and e. Because the spacing convention
    // puts a particle in a token of its own, that substitution can be undone
    // token by token and checked exactly.
    if (!spellsOut(item.correct.romaji || "", Romaji.toRomaji(item.correct.kana))) {
        fail(`${where}: romaji "${item.correct.romaji}" isn't just spacing on ` +
             `"${Romaji.toRomaji(item.correct.kana)}"`);
    }
}
// Coverage: a rule on a sheet with no question behind it is a rule you can read
// and never be tested on, which is the whole gap this mode exists to close.
const ruleIds = new Set();
for (const sheet of sheets) {
    for (const r of sheet.rules || []) {
        if (!r.id) fail(`sheet ${sheet.id}: rule "${r.title}" has no id`);
        else ruleIds.add(`${sheet.id}:${r.id}`);
    }
}
const covered = new Set();
for (const item of revision) {
    if (!item.covers || !item.covers.length) {
        fail(`${item.id}: doesn't say which rule it tests`);
        continue;
    }
    for (const c of item.covers) {
        if (!ruleIds.has(c)) fail(`${item.id}: covers "${c}", which is not a rule on any sheet`);
        covered.add(c);
    }
}
const uncovered = [...ruleIds].filter(r => !covered.has(r));
if (uncovered.length) {
    fail(`${uncovered.length} rule(s) have no revision question:\n      ` + uncovered.join("\n      "));
}

const byTopic = {};
for (const item of revision) byTopic[item.sheet] = (byTopic[item.sheet] || 0) + 1;
console.log(`  ${revision.length} questions: ` +
            Object.entries(byTopic).map(([k, n]) => `${k} ${n}`).join(", "));

console.log(failures ? `\nFAILED — ${failures} problem(s)` : "\nAll checks passed");
Deno.exit(failures ? 1 : 0);
