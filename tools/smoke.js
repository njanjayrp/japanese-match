// Headless run-through of the actual UI, so a broken round shows up here and
// not on your phone. Drives real clicks against index.html via deno-dom.
//
//   deno run --allow-read --allow-net --location=http://localhost/ tools/smoke.js
//
// Stroke mode is skipped: it needs SVG getTotalLength(), which no DOM shim has.

import { DOMParser } from "jsr:@b-fuze/deno-dom";

const read = p => Deno.readTextFileSync(new URL("../" + p, import.meta.url));

let failures = 0;
const fail = m => { console.log("  ✗ " + m); failures++; };
const ok   = m => console.log("  ✓ " + m);

// ── DOM setup ───────────────────────────────────────────────────────────────

const doc = new DOMParser().parseFromString(read("index.html"), "text/html");
const Element = doc.getElementById("word-options").constructor;
const proto = Object.getPrototypeOf(Object.getPrototypeOf(doc.body)); // Element.prototype

// deno-dom has no event system, so keep our own listener registry and walk the
// ancestor chain by hand — the app relies on delegated clicks on #tabs etc.
const listeners = new WeakMap();
proto.addEventListener = function (type, fn) {
    const forEl = listeners.get(this) || listeners.set(this, {}).get(this);
    (forEl[type] ||= []).push(fn);
};
proto.focus = function () {};
Object.defineProperty(proto, "hidden", {
    get() { return this.hasAttribute("hidden"); },
    set(v) { v ? this.setAttribute("hidden", "") : this.removeAttribute("hidden"); },
    configurable: true,
});

function fire(el, type) {
    const event = { type, target: el, preventDefault() {}, stopPropagation() {} };
    for (let node = el; node; node = node.parentElement) {
        for (const fn of listeners.get(node)?.[type] || []) fn.call(node, event);
    }
}

// Deferred timers: the app sleeps between answers, and we don't want to.
const queue = [];
globalThis.setTimeout = fn => { queue.push(fn); return queue.length; };
globalThis.clearTimeout = () => {};
function flush(limit = 50) {
    let n = 0;
    while (queue.length && n++ < limit) queue.shift()();
}

globalThis.document = doc;
globalThis.window = { speechSynthesis: undefined, scrollTo() {} };
globalThis.navigator = { serviceWorker: undefined };
globalThis.App = { onAnswer() {} };

// ── Load the app modules into one shared scope ──────────────────────────────

const SOURCES = ["js/romaji.js", "js/store.js", "js/audio.js", "js/furigana.js",
                 "js/words.js", "js/adjective-forms.js", "js/adj-game.js",
                 "js/kana-game.js", "js/browse.js", "js/cheat.js"];
const bundle = SOURCES.map(read).join("\n;\n");
const exported = new Function(
    bundle + "\n;return { Romaji, Store, Speech, Furigana, WordMode, AdjForms, AdjGame, KanaGame, BrowseMode, CheatMode };"
)();
const { Romaji, Store, Speech, WordMode, AdjForms, AdjGame, KanaGame, BrowseMode, CheatMode } = exported;

const kanaData = JSON.parse(read("data/kana.json"));
const words = JSON.parse(read("data/words.json"));
const sheets = JSON.parse(read("data/sheets.json"));

localStorage.clear();
Romaji.init(kanaData.kana);
Speech.init();

// ── Words mode ──────────────────────────────────────────────────────────────

console.log("words mode — JP→EN, two stages");
WordMode.init(words);

const optionsBox = doc.getElementById("word-options");
const stageLabel = doc.getElementById("word-stage-label");
const prompt = doc.getElementById("word-prompt");

function optionTexts() {
    return [...optionsBox.children].map(b => b.textContent);
}

if (doc.getElementById("word-card").hidden) fail("word card hidden with 73 words loaded");
if (stageLabel.textContent !== "Reading") fail(`expected Reading stage, got "${stageLabel.textContent}"`);
if (optionsBox.children.length !== 4) fail(`expected 4 reading options, got ${optionsBox.children.length}`);
if (new Set(optionTexts()).size !== optionTexts().length) fail(`duplicate reading options: ${optionTexts()}`);
if (!prompt.textContent.trim()) fail("no prompt rendered");
ok(`stage 1 shows "${prompt.textContent}" with options ${JSON.stringify(optionTexts())}`);

// Play 20 words end to end. We always click the first option, so both the
// right and wrong branches get exercised; on a wrong answer the app must
// highlight exactly one other option as the correct one, which is the bit most
// likely to break.
let stagesSeen = { Reading: 0, Meaning: 0 };
let right = 0, wrong = 0;
for (let i = 0; i < 20; i++) {
    for (const want of ["Reading", "Meaning"]) {
        if (stageLabel.textContent !== want) {
            fail(`word ${i}: expected ${want} stage, got "${stageLabel.textContent}"`);
            break;
        }
        stagesSeen[want]++;
        const opts = [...optionsBox.children];
        if (opts.length !== 4) fail(`word ${i} ${want}: ${opts.length} options`);
        const texts = opts.map(b => b.textContent);
        if (new Set(texts).size !== texts.length) fail(`word ${i} ${want}: duplicate options ${texts}`);

        const picked = opts[0];
        fire(picked, "click");

        if (picked.classList.contains("correct")) {
            right++;
        } else if (picked.classList.contains("wrong")) {
            wrong++;
            const flagged = opts.filter(b => b.classList.contains("correct"));
            if (flagged.length !== 1) {
                fail(`word ${i} ${want}: wrong answer flagged ${flagged.length} correct options, expected 1`);
            }
        } else {
            fail(`word ${i} ${want}: click produced no verdict`);
        }
        if (!opts.every(b => b.disabled)) fail(`word ${i} ${want}: options still clickable after answering`);
        flush();
    }
    const reveal = doc.getElementById("word-reveal");
    if (reveal.hidden) { fail(`word ${i}: reveal did not appear`); break; }
    if (!doc.getElementById("reveal-english").textContent) fail(`word ${i}: reveal has no meaning`);
    fire(doc.getElementById("word-next"), "click");
    flush();
}
if (!right) fail("never landed a correct answer across 40 stages — options may be mis-ordered");
if (!wrong) fail("never landed a wrong answer across 40 stages — the wrong path is untested");
ok(`20 words played: ${stagesSeen.Reading} reading + ${stagesSeen.Meaning} meaning stages, ${right} right / ${wrong} wrong`);

console.log("words mode — EN→JP");
const dirBtn = [...doc.getElementById("word-dir").children].find(b => b.dataset.dir === "produce");
fire(dirBtn, "click");
flush();
if (stageLabel.textContent !== "Recall") fail(`expected Recall stage, got "${stageLabel.textContent}"`);
if (optionsBox.children.length !== 4) fail(`expected 4 options, got ${optionsBox.children.length}`);
ok(`prompt "${prompt.textContent}" → ${JSON.stringify(optionTexts())}`);

// ── Adjective forms ─────────────────────────────────────────────────────────

console.log("adjective forms");
AdjGame.init(words);

const adjOptions = doc.getElementById("adj-options");
const adjReveal  = doc.getElementById("adj-reveal");
const adjSlot    = doc.getElementById("adj-slot-label");

if (doc.getElementById("adj-card").hidden) fail("adjective card hidden with adjectives loaded");

// Play a full round, answering right and wrong on alternate questions so both
// branches are exercised on purpose rather than by luck. The card says which
// word and which slot it wants, so the expected form is computable — and that
// is the assertion worth making: the button the app treats as correct has to
// be the form the conjugator produces.
let adjRight = 0, adjWrong = 0;
const slotsSeen = new Set();
for (let i = 0; i < 12; i++) {
    const opts = [...adjOptions.children];
    if (opts.length !== 4) { fail(`question ${i}: ${opts.length} options`); break; }
    const texts = opts.map(b => (b.querySelector(".option-main") || b).textContent);
    if (new Set(texts).size !== texts.length) fail(`question ${i}: duplicate options ${texts}`);
    if (!doc.getElementById("adj-question").textContent.trim()) fail(`question ${i}: no question text`);
    slotsSeen.add(adjSlot.textContent);

    // "ookii — big" identifies the word; the slot label identifies the form.
    const english = doc.getElementById("adj-prompt-sub").textContent.split(" — ").pop();
    const asked = words.find(w => w.english === english && AdjForms.isAdjective(w));
    const slot = AdjForms.SLOTS.find(s => s.label === adjSlot.textContent);
    if (!asked || !slot) { fail(`question ${i}: can't identify "${english}" / "${adjSlot.textContent}"`); break; }
    const want = AdjForms.formsOf(asked)[slot.id];
    if (!texts.includes(want)) {
        fail(`question ${i}: ${asked.kana} ${slot.id} — options ${texts} don't include ${want}`);
        break;
    }

    // Right on even questions, wrong on odd ones.
    const picked = i % 2 === 0
        ? opts[texts.indexOf(want)]
        : opts[texts.findIndex(t => t !== want)];
    const expectCorrect = i % 2 === 0;
    fire(picked, "click");
    if (picked.classList.contains("correct") !== expectCorrect) {
        fail(`question ${i}: ${asked.kana} ${slot.id} — clicking "${texts[opts.indexOf(picked)]}" ` +
             `was graded ${picked.classList.contains("correct") ? "correct" : "wrong"}, ` +
             `expected ${expectCorrect ? "correct" : "wrong"} against ${want}`);
    }
    if (picked.classList.contains("correct")) adjRight++;
    else if (picked.classList.contains("wrong")) {
        adjWrong++;
        const flagged = opts.filter(b => b.classList.contains("correct"));
        if (flagged.length !== 1) {
            fail(`question ${i}: wrong answer flagged ${flagged.length} correct options, expected 1`);
        }
    } else fail(`question ${i}: click produced no verdict`);
    flush();

    if (adjReveal.hidden) { fail(`question ${i}: reveal did not appear`); break; }
    const rows = [...doc.getElementById("adj-forms").children];
    if (rows.length !== 4) fail(`question ${i}: reveal listed ${rows.length} forms, expected 4`);
    const marked = rows.filter(r => r.classList.contains("asked"));
    if (marked.length !== 1) fail(`question ${i}: ${marked.length} forms marked as the one asked`);
    if (!doc.getElementById("adj-reveal-family").textContent) fail(`question ${i}: no family shown`);
    fire(doc.getElementById("adj-next"), "click");
    flush();
}
if (adjRight !== 6 || adjWrong !== 6) {
    fail(`expected 6 right and 6 wrong by construction, got ${adjRight} / ${adjWrong}`);
}
ok(`12 questions played across slots [${[...slotsSeen].join(", ")}], ${adjRight} right / ${adjWrong} wrong`);

// The exceptions are three words, so the round has to reuse them under
// different slots rather than running out of cards.
const familyPicker = doc.getElementById("adj-family");
familyPicker.value = "odd";
fire(familyPicker, "change");
flush();
if (doc.getElementById("adj-card").hidden) fail("exceptions filter emptied the card");
const oddTexts = [...adjOptions.children].map(b => (b.querySelector(".option-main") || b).textContent);
if (oddTexts.length !== 4) fail(`exceptions: ${oddTexts.length} options`);
ok(`exceptions round builds: ${doc.getElementById("adj-prompt").textContent} → ${JSON.stringify(oddTexts)}`);

// kirei's negative must offer the i-adjective mistake, or the trap isn't taught.
const kirei = words.find(w => w.kana === "きれい");
const kireiOpts = AdjForms.optionsFor(kirei, "notNow", 4).options;
if (!kireiOpts.includes("きれくないです") && !kireiOpts.includes("きれいくないです")) {
    fail(`kirei's negative offers no i-adjective distractor: ${kireiOpts.join(" / ")}`);
}
ok(`kirei drills against ${kireiOpts.filter(o => o !== "きれいじゃないです").join(" / ")}`);

// ── Kana game ───────────────────────────────────────────────────────────────

console.log("kana game");
KanaGame.init(kanaData);
KanaGame.onShow();

const kanaOptions = doc.getElementById("kana-options");
const kanaPrompt = doc.getElementById("kana-prompt");

let rounds = 0, answered = 0, thinOptions = 0;
const distractorReport = [];
for (let i = 0; i < 60; i++) {
    const opts = [...kanaOptions.children];
    if (!opts.length) break;
    if (opts.length !== 6) thinOptions++;
    const texts = opts.map(b => b.textContent);
    if (new Set(texts).size !== texts.length) fail(`duplicate kana options: ${texts}`);
    if (distractorReport.length < 4) {
        distractorReport.push(`${kanaPrompt.textContent} → ${texts.join(" ")}`);
    }
    for (const b of opts) {
        fire(b, "click");
        flush();
        break;
    }
    answered++;
    if (!doc.getElementById("kana-round-end").hidden) {
        rounds++;
        fire(doc.getElementById("kana-again"), "click");
        flush();
    }
}
if (thinOptions) fail(`${thinOptions} kana questions had fewer than 6 options`);
ok(`${answered} kana questions across ${rounds} completed rounds`);
for (const line of distractorReport) console.log(`    ${line}`);

console.log("kana game — romaji → kana");
const kanaDirBtn = [...doc.getElementById("kana-dir").children].find(b => b.dataset.dir === "toKana");
fire(kanaDirBtn, "click");
flush();
const revTexts = [...kanaOptions.children].map(b => b.textContent);
if (revTexts.length !== 6) fail(`reverse direction gave ${revTexts.length} options`);
if (!revTexts.every(t => [...t].every(c => Romaji.isKana(c)))) fail(`reverse options are not kana: ${revTexts}`);
ok(`prompt "${kanaPrompt.textContent}" → ${revTexts.join(" ")}`);

console.log("kana game — katakana, everything");
doc.getElementById("kana-script").value = "katakana";
fire(doc.getElementById("kana-script"), "change");
doc.getElementById("kana-set").value = "all";
fire(doc.getElementById("kana-set"), "change");
flush();
if (kanaOptions.children.length !== 6) fail("full katakana set did not produce 6 options");
ok("full katakana set builds a question");

// ── Browse ──────────────────────────────────────────────────────────────────

console.log("browse");
BrowseMode.init(words);
BrowseMode.onShow();
const list = doc.getElementById("browse-list");
if (list.children.length !== words.length) {
    fail(`browse shows ${list.children.length} rows, expected ${words.length}`);
}
ok(`${list.children.length} rows, e.g. ${list.children[0].textContent.trim().replace(/\s+/g, " ")}`);

// ── Cheat sheets ────────────────────────────────────────────────────────────

console.log("cheat sheets");
CheatMode.init(sheets);
CheatMode.onShow();
const cheatBody = doc.getElementById("cheat-body");
const cheatHtml = cheatBody.innerHTML;
const expectedCells = sheets[0].grids
    .flatMap(g => g.rows).flatMap(r => r.cells).filter(c => c.kana).length;
const renderedCells = cheatHtml.split("data-kana=").length - 1;
if (renderedCells !== expectedCells) {
    fail(`first sheet rendered ${renderedCells} word cells, expected ${expectedCells}`);
}
if (!cheatHtml.includes("ototoi")) fail("derived romaji missing from the sheet");
if (!cheatHtml.includes("rule-body")) fail("rules did not render");
if (doc.getElementById("cheat-sheet").closest(".controls").hidden) {
    fail("two sheets loaded but the picker is hidden");
}
ok(`sheet "${sheets[0].title}" rendered ${renderedCells} cells and ${sheets[0].rules.length} rules`);

// Switching sheets must rebuild the body, not append to it.
const picker = doc.getElementById("cheat-sheet");
picker.value = "1";
fire(picker, "change");
if (!cheatBody.innerHTML.includes(sheets[1].title)) fail("switching sheets did not re-render");
if (cheatBody.innerHTML.includes(sheets[0].blurb)) fail("old sheet left behind after switching");
if (!cheatBody.innerHTML.includes("kin'youbi")) fail("weekday romaji missing the ん apostrophe");
ok(`switched to "${sheets[1].title}"`);

// ── SRS actually adapts ─────────────────────────────────────────────────────

console.log("spaced repetition");
const state = Store.stateOf("words");
const graded = Object.keys(state).length;
if (!graded) fail("no word state recorded after 20 words");
if (!Object.values(state).every(e => e.seen > 0)) fail("some graded words have seen=0");
Store.grade("demo", "x", false);
Store.grade("demo", "x", false);
const afterMisses = Store.stateOf("demo").x;
const raised = afterMisses.w;
if (!(raised > 1)) fail(`wrong answers should raise weight, got ${raised}`);
for (let i = 0; i < 6; i++) Store.grade("demo", "x", true);
const afterHits = Store.stateOf("demo").x;
if (!Store.isMastered("demo", "x")) fail(`6 correct in a row should master, streak=${afterHits.streak}`);
if (!(afterHits.w < raised)) fail(`correct answers should lower weight: ${raised} → ${afterHits.w}`);
ok(`${graded} words tracked; weight ${raised.toFixed(2)} → ${afterHits.w.toFixed(2)} over 6 correct`);

console.log(failures ? `\nFAILED — ${failures} problem(s)` : "\nSmoke test passed");
Deno.exit(failures ? 1 : 0);
