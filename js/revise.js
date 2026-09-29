// Revision — which sentence is right?
//
// The cheat sheets state the rules and show the patterns, but reading a rule is
// not the same as being able to pick the right sentence under pressure. This
// mode takes a meaning in English and offers four Japanese sentences: one
// correct, three carrying exactly the mistakes the sheets warn about — wo where
// ga belongs, amari with a positive verb, na on an i-adjective, ni after
// senshuu.
//
// The wrong sentences are written by hand in data/revision.json rather than
// generated. Generating them sounds tempting and is a trap: swapping a particle
// usually produces another perfectly correct sentence with a different meaning,
// and a quiz that calls a correct sentence wrong teaches something false.
//
// The reveal is the point of the mode. It shows every option with what is wrong
// with it, so one question teaches three rules rather than one.
//
// Where the words exist in data/kanji.json the sentences are written in kanji,
// with a bar under the options giving each one's reading. All four options of a
// question always carry the same kanji, so the writing never singles one out.
//
// A round is 15 questions, dealt so that consecutive ones test different rules.
// Nine of the questions in the pack are about ga against wo, so a plain shuffle
// deals two or three of them in a row regularly — which reads as the quiz being
// repetitive when it is only being random.

const ReviseMode = (() => {
    const ROUND = 15;

    let items = [];
    let round = [];
    let idx = 0;
    let locked = false;
    let sheet = "__all__";
    let titles = {};
    let picked = null;

    const el = {};

    function init(data, sheets) {
        items = data || [];
        titles = Object.fromEntries((sheets || []).map(s => [s.id, s.title]));
        for (const id of ["rev-sheet", "rev-card", "rev-progress", "rev-topic", "rev-prompt",
                          "rev-question", "rev-options", "rev-kanji", "rev-reveal", "rev-correct",
                          "rev-romaji", "rev-why", "rev-next", "rev-empty"]) {
            el[id] = document.getElementById(id);
        }

        buildSheetSelect(sheets || []);
        sheet = Store.pref("reviseSheet", "__all__");
        if (!sheetExists(sheet)) sheet = "__all__";
        el["rev-sheet"].value = sheet;
        el["rev-sheet"].addEventListener("change", e => {
            sheet = e.target.value;
            Store.setPref("reviseSheet", sheet);
            start();
        });

        el["rev-next"].addEventListener("click", next);
        start();
    }

    // Only sheets that actually have questions — an empty topic in the picker
    // is a dead end.
    function buildSheetSelect(sheets) {
        const sel = el["rev-sheet"];
        sel.innerHTML = "";
        add(sel, "__all__", "Everything");
        for (const s of sheets) {
            if (items.some(i => i.sheet === s.id)) add(sel, s.id, s.title);
        }
    }

    function add(sel, value, label) {
        const o = document.createElement("option");
        o.value = value;
        o.textContent = label;
        sel.appendChild(o);
    }

    function sheetExists(id) {
        return id === "__all__" || items.some(i => i.sheet === id);
    }

    function pool() {
        return sheet === "__all__" ? items : items.filter(i => i.sheet === sheet);
    }

    function idOf(item) {
        return item.id;
    }

    function roundSize() {
        return Math.min(ROUND, pool().length);
    }

    function start() {
        const p = pool();
        el["rev-empty"].hidden = p.length > 0;
        el["rev-card"].hidden = p.length === 0;
        if (!p.length) {
            el["rev-empty"].textContent = "No revision questions for this sheet yet.";
            return;
        }
        round = [];
        idx = 0;
        deal();
        show();
    }

    // Same deal as the word and adjective decks: a question leaves the deck as
    // it goes on screen, so every question comes up once before any repeats.
    function deal() {
        while (round.length <= idx) {
            const item = Store.dealCard("revise_" + sheet, pool(), idOf,
                                        round.map(idOf), spreadBySheet);
            if (!item) return;
            round.push(item);
        }
    }

    /**
     * Order a freshly shuffled deck so it cycles through the topics: bucket by
     * sheet, then take one from each bucket in turn. Every question still
     * appears exactly once per pass — only the order changes.
     *
     * Measured over 40 rounds of 15: a plain shuffle puts two questions from the
     * same sheet next to each other 2.3 times a round, this 1.8. Bucketing by
     * rule instead was worse (2.9), because eleven of the rules live on one
     * sheet, so cycling the rules still cycled inside that sheet.
     */
    function spreadBySheet(ids) {
        const byId = new Map(items.map(i => [i.id, i]));
        const buckets = new Map();
        for (const id of ids) {
            const key = byId.get(id).sheet;
            if (!buckets.has(key)) buckets.set(key, []);
            buckets.get(key).push(id);
        }
        const out = [];
        let queues = Store.shuffle([...buckets.values()]);
        while (queues.length) {
            for (const q of queues) out.push(q.shift());
            queues = Store.shuffle(queues.filter(q => q.length));
        }
        return out;
    }

    function show() {
        const item = round[idx];
        if (!item) return;
        locked = false;
        picked = null;
        el["rev-reveal"].hidden = true;
        el["rev-options"].hidden = false;
        el["rev-question"].hidden = false;
        el["rev-progress"].textContent = `${idx + 1} / ${roundSize()}`;
        // Which sheet the question came from — the corner said "Revision", which
        // the tab already says. Only worth showing when the picker says
        // Everything; otherwise it just repeats the picker.
        el["rev-topic"].textContent = sheet === "__all__" ? (titles[item.sheet] || "") : "";
        el["rev-prompt"].textContent = item.en;
        el["rev-question"].textContent = "Which one says that?";

        const options = Store.shuffle([
            { kana: item.correct.kana, jp: jpOf(item.correct), ok: true },
            ...item.wrong.map(w => ({ kana: w.kana, jp: jpOf(w), why: w.why })),
        ]);

        el["rev-options"].after(el["rev-kanji"]);
        readings(item);

        const box = el["rev-options"];
        box.innerHTML = "";
        box.classList.add("options-jp");
        for (const opt of options) {
            const btn = document.createElement("button");
            btn.className = "option";
            btn.textContent = opt.jp;
            btn.addEventListener("click", () => answered(btn, box, opt, options));
            box.appendChild(btn);
        }
    }

    /**
     * The sentence as it is written — in kanji where data/revision.json gives a
     * kanji form, otherwise in kana. Every option of a question carries the same
     * kanji, so the writing can never single one of them out.
     */
    function jpOf(side) {
        return side.kanji || side.kana;
    }

    // The bar under the options: every kanji word on screen with its reading.
    // Knowing that 上手 is jouzu does not tell you whether the particle is right,
    // so this costs the question nothing and saves squinting at a wall of kanji.
    function readings(item) {
        const notes = item.kanjiNotes || [];
        el["rev-kanji"].hidden = notes.length === 0;
        el["rev-kanji"].innerHTML = notes.map(n =>
            `<span><b>${Furigana.esc(n.word)}</b> ${Furigana.esc(n.kana)}</span>`).join("");
    }

    function answered(btn, box, opt, options) {
        if (locked) return;
        locked = true;
        picked = opt;

        btn.classList.add(opt.ok ? "correct" : "wrong");
        if (!opt.ok) {
            const right = options.find(o => o.ok).jp;
            for (const b of box.children) {
                if (b.textContent === right) b.classList.add("correct");
            }
        }
        for (const b of box.children) b.disabled = true;

        const item = round[idx];
        Store.grade("revise", idOf(item), !!opt.ok);
        App.onAnswer(!!opt.ok);

        setTimeout(() => reveal(options), opt.ok ? 550 : 1400);
    }

    // Every option, with what is wrong with it. Three rules per question.
    function reveal(options) {
        const item = round[idx];
        el["rev-options"].hidden = true;
        el["rev-question"].hidden = true;
        el["rev-reveal"].hidden = false;

        el["rev-correct"].textContent = jpOf(item.correct);
        el["rev-romaji"].textContent = item.correct.romaji;

        el["rev-why"].innerHTML = options.map(o => {
            const yours = o === picked ? " yours" : "";
            return `<div class="why-row${o.ok ? " ok" : ""}${yours}">` +
                `<span class="why-jp">${Furigana.esc(o.jp)}</span>` +
                `<span class="why-text">${Furigana.esc(o.ok ? "correct" : o.why)}</span>` +
            `</div>`;
        }).join("");

        // The explanations are written in the same kanji, so the reading bar
        // follows them down rather than sitting above the answer.
        el["rev-next"].before(el["rev-kanji"]);
        el["rev-next"].textContent = idx === roundSize() - 1 ? "Finish round" : "Next";
        Speech.say(item.correct.kana);
        el["rev-next"].focus({ preventScroll: true });
    }

    function next() {
        idx += 1;
        if (idx >= roundSize()) { start(); return; }
        deal();
        show();
    }

    function onShow() {
        if (!round.length) start();
    }

    return { init, onShow, start };
})();
