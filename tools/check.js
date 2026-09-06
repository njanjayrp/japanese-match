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
Romaji.init(kana.kana);

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
                if (c.romaji && c.romaji.replace(/ /g, "") !== Romaji.toRomaji(c.kana)) {
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

console.log(failures ? `\nFAILED — ${failures} problem(s)` : "\nAll checks passed");
Deno.exit(failures ? 1 : 0);
