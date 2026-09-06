// Adjective forms — pick the right conjugation.
//
// Words mode asks what a word means. This asks what it does: given an
// adjective and a slot — present, past, either of them negated — choose the
// form. The whole difficulty of Japanese adjectives is that there are two
// families and only one of them conjugates, so the wrong answers are always
// this same word run through the other family's rule. Getting kirei right
// means nothing if you got there by pattern-matching the ending; the option
// list makes you choose against the trap directly.
//
// Every question is a (word, slot) pair, and a word can come back in the same
// round under a different slot — with three exceptions in the pool, a round of
// ten has to reuse them.

const AdjGame = (() => {
    const ROUND = 10;
    const OPTIONS = 4;

    let words = [];
    let round = [];            // { word, slot }
    let idx = 0;
    let locked = false;
    let family = "__all__";

    const el = {};

    function init(data) {
        words = (data || []).filter(AdjForms.isAdjective);
        for (const id of ["adj-family", "adj-card", "adj-progress", "adj-slot-label",
                          "adj-prompt", "adj-prompt-sub", "adj-question", "adj-options",
                          "adj-reveal", "adj-reveal-word", "adj-reveal-family",
                          "adj-forms", "adj-note", "adj-next", "adj-speak",
                          "adj-empty"]) {
            el[id] = document.getElementById(id);
        }

        family = Store.pref("adjFamily", "__all__");

        el["adj-family"].value = family;
        el["adj-family"].addEventListener("change", e => {
            family = e.target.value;
            Store.setPref("adjFamily", family);
            start();
        });

        el["adj-next"].addEventListener("click", next);
        // Deliberately the plain adjective, not the form being asked for —
        // speaking the answer aloud would hand the question over.
        el["adj-speak"].addEventListener("click", () => {
            const q = round[idx];
            if (q) Speech.say(AdjForms.readingOf(q.word));
        });

        start();
    }

    function pool() {
        if (family === "i")    return words.filter(w => AdjForms.familyOf(w) === "i");
        if (family === "na")   return words.filter(w => AdjForms.familyOf(w) === "na");
        if (family === "odd")  return words.filter(AdjForms.isException);
        return words;
    }

    function idOf(w) {
        return w.kanji || w.kana;
    }

    // Four slots per word, so a handful of exceptions still fills a round.
    function roundSize() {
        return Math.min(ROUND, pool().length * AdjForms.SLOTS.length);
    }

    function deckKey() {
        return "adj_" + family;
    }

    function start() {
        const p = pool();
        const enough = p.length > 0;
        el["adj-empty"].hidden = enough;
        el["adj-card"].hidden = !enough;
        if (!enough) {
            el["adj-empty"].innerHTML = words.length
                ? "No adjectives in this family yet."
                : 'No adjectives yet. Tag some with <code>"adj"</code> in <code>data/words.json</code>.';
            return;
        }
        round = [];
        idx = 0;
        deal();
        show();
    }

    // Cards leave the deck as they're shown, like the word deck — see dealCard.
    function deal() {
        while (round.length <= idx) {
            const word = Store.dealCard(deckKey(), pool(), idOf, round.map(q => idOf(q.word)));
            if (!word) return;
            round.push({ word, slot: slotFor(word) });
        }
    }

    // A slot this word hasn't been asked about yet this round, so a small pool
    // drills four different forms rather than the same one four times.
    function slotFor(word) {
        const used = new Set(round.filter(q => idOf(q.word) === idOf(word)).map(q => q.slot));
        const free = AdjForms.SLOTS.filter(s => !used.has(s.id));
        const from = free.length ? free : AdjForms.SLOTS;
        return from[Math.floor(Math.random() * from.length)].id;
    }

    function show() {
        const q = round[idx];
        if (!q) return;
        locked = false;
        el["adj-reveal"].hidden = true;
        el["adj-options"].hidden = false;
        el["adj-question"].hidden = false;
        el["adj-progress"].textContent = `${idx + 1} / ${roundSize()}`;

        const slot = AdjForms.SLOTS.find(s => s.id === q.slot);
        const written = q.word.kanji || q.word.kana;
        const reading = AdjForms.readingOf(q.word);

        el["adj-slot-label"].textContent = slot.label;
        el["adj-prompt"].innerHTML = Furigana.render(written, reading, true);
        // Meaning only, no romaji: the reading is in the furigana above it, and
        // an adjective's romaji spells out the ending the question is about.
        el["adj-prompt-sub"].textContent = q.word.english;
        // The family is the answer to half the question, so it stays hidden
        // until the reveal.
        el["adj-question"].textContent = `Which one is \u201c${slot.gloss.replace("—", shortMeaning(q.word))}\u201d?`;

        renderOptions(q);
    }

    // "expensive / tall" and "hot (of weather)" don't sit inside "it wasn't —",
    // so the question uses the first sense and the card shows the full meaning.
    function shortMeaning(word) {
        return word.english.split(" / ")[0].replace(/\s*\([^)]*\)/g, "").trim();
    }

    function renderOptions(q) {
        const { answer, options } = AdjForms.optionsFor(q.word, q.slot, OPTIONS);
        const box = el["adj-options"];
        box.innerHTML = "";
        box.classList.add("options-jp");
        // No romaji on the options, whatever the toggle says. The endings are
        // the entire question here, and shiroku nai desu written underneath
        // hands over the answer to anyone who can't yet read the kana — which
        // is not the case in Words mode, where the romaji is a reading crutch
        // rather than the thing being tested. The prompt and the reveal still
        // gloss, so nothing is left unreadable.
        for (const form of Store.shuffle(options.slice())) {
            const btn = document.createElement("button");
            btn.className = "option";
            btn.textContent = form;
            btn.addEventListener("click", () => answered(btn, box, form === answer, answer));
            box.appendChild(btn);
        }
    }

    function answered(btn, box, correct, answer) {
        if (locked) return;
        locked = true;

        btn.classList.add(correct ? "correct" : "wrong");
        if (!correct) {
            for (const b of box.children) {
                const text = (b.querySelector(".option-main") || b).textContent;
                if (text === answer) b.classList.add("correct");
            }
        }
        for (const b of box.children) b.disabled = true;

        const q = round[idx];
        Store.grade("adj", idOf(q.word), correct);
        App.onAnswer(correct);

        setTimeout(reveal, correct ? 550 : 1400);
    }

    // The payoff: all four forms at once, with the one you were asked about
    // marked. Seeing the set is what teaches the pattern — a single right
    // answer doesn't show you that ja nakatta and ku nakatta are the same shape.
    function reveal() {
        const q = round[idx];
        const forms = AdjForms.formsOf(q.word);
        const fam = AdjForms.familyOf(q.word);

        el["adj-options"].hidden = true;
        el["adj-question"].hidden = true;
        el["adj-reveal"].hidden = false;

        el["adj-reveal-word"].innerHTML =
            Furigana.render(q.word.kanji || q.word.kana, AdjForms.readingOf(q.word), true);
        el["adj-reveal-family"].textContent = AdjForms.isIrregular(q.word)
            ? "irregular — built on よい"
            : (fam === "na" ? "な-adjective" : "い-adjective") +
              (AdjForms.isException(q.word) ? " — ends in い, an exception" : "");
        el["adj-reveal-family"].classList.toggle("odd", AdjForms.isException(q.word));

        el["adj-forms"].innerHTML = AdjForms.SLOTS.map(s =>
            `<div class="form-row${s.id === q.slot ? " asked" : ""}">` +
                `<span class="form-label">${Furigana.esc(s.label)}</span>` +
                `<span class="form-jp">${Furigana.esc(forms[s.id])}</span>` +
                `<span class="form-romaji">${Furigana.esc(AdjForms.spacedRomaji(forms[s.id]))}</span>` +
            `</div>`
        ).join("");

        // The chip above already says which family it is; the note is only
        // worth showing for what it adds beyond that.
        const note = (q.word.note || "").replace(/^(i|na)-adjective\s*(—\s*)?/, "");
        el["adj-note"].textContent = note;
        el["adj-note"].hidden = !note;
        el["adj-next"].textContent = idx === roundSize() - 1 ? "Finish round" : "Next";

        Speech.say(forms[q.slot]);
        el["adj-next"].focus({ preventScroll: true });
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
