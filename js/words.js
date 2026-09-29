// Word mode — two-stage reveal.
//
// A Japanese word is really three linked facts: the written form, its reading,
// and its meaning. Testing them as one lump lets you coast on recognition, so
// JP→EN asks for the reading first and only then the meaning. Both have to be
// right for the word to count as correct.
//
// EN→JP is the production direction and stays single-stage: recalling the
// written form from the meaning is already the hard part.

const WordMode = (() => {
    const ROUND = 10;
    const OPTIONS = 4;

    let words = [];
    let round = [];
    let idx = 0;
    let stage = "reading";     // reading → meaning → done
    let missedThisWord = false;
    let locked = false;
    let group = "__all__";
    let dir = "recognise";
    let showRomaji = true;

    const el = {};

    function init(data) {
        words = data;
        for (const id of ["word-group", "word-dir", "word-prompt", "word-prompt-sub",
                          "word-question", "word-options", "word-progress",
                          "word-stage-label", "word-reveal", "reveal-word",
                          "reveal-romaji", "reveal-english", "reveal-note",
                          "word-next", "word-speak", "romaji-toggle", "words-empty",
                          "word-card"]) {
            el[id] = document.getElementById(id);
        }

        group      = Store.pref("wordGroup", "__all__");
        dir        = Store.pref("wordDir", "recognise");
        showRomaji = Store.pref("showRomaji", true);

        buildGroupSelect();
        el["word-group"].value = groupExists(group) ? group : (group = "__all__");
        el["word-group"].addEventListener("change", e => {
            group = e.target.value;
            Store.setPref("wordGroup", group);
            start();
        });

        el["word-dir"].addEventListener("click", e => {
            const btn = e.target.closest(".seg-btn");
            if (!btn) return;
            dir = btn.dataset.dir;
            Store.setPref("wordDir", dir);
            syncDirButtons();
            start();
        });
        syncDirButtons();

        el["romaji-toggle"].addEventListener("click", () => {
            showRomaji = !showRomaji;
            Store.setPref("showRomaji", showRomaji);
            syncRomajiButton();
            renderStage();
        });
        syncRomajiButton();

        el["word-next"].addEventListener("click", next);
        el["word-speak"].addEventListener("click", () => {
            const w = round[idx];
            if (w) Speech.say(Romaji.readingOf(w));
        });

        start();
    }

    function groupExists(g) {
        return g === "__all__" || g === "__marked__" || words.some(w => w.group === g);
    }

    function buildGroupSelect() {
        const sel = el["word-group"];
        sel.innerHTML = "";
        add(sel, "__all__", "All groups");
        if (words.some(w => w.marked)) add(sel, "__marked__", "★ Marked");
        for (const g of [...new Set(words.map(w => w.group).filter(Boolean))].sort()) {
            add(sel, g, g);
        }
        function add(s, value, label) {
            const o = document.createElement("option");
            o.value = value;
            o.textContent = label;
            s.appendChild(o);
        }
    }

    function pool() {
        if (group === "__marked__") return words.filter(w => w.marked);
        if (group === "__all__") return words;
        return words.filter(w => w.group === group);
    }

    function idOf(w) {
        return w.kanji || w.kana;
    }

    function start() {
        const p = pool();
        const enough = p.length >= 4;
        el["words-empty"].hidden = enough;
        el["word-card"].hidden = !enough;
        if (!enough) {
            el["words-empty"].innerHTML = words.length
                ? "This group needs at least 4 words to build a quiz."
                : 'No words yet. Add some to <code>data/words.json</code> and reload.';
            return;
        }
        // Every group is dealt off a shuffled deck rather than drawn fresh each
        // round: no weighting, no mastery retirement, the whole group goes past
        // you before anything comes back. Each group keeps its own deck, so
        // switching groups and back resumes where you left off. Cards are drawn
        // as they're shown, never a round ahead — a round dealt up front loses
        // the cards you never reach, and starting a round is exactly what every
        // app launch and every toggle does.
        round = [];
        idx = 0;
        deal();
        show();
    }

    // The deck for the group in view. A round is just the progress counter:
    // ten cards, or the whole group if it's smaller.
    function deckKey() {
        return "words_" + group;
    }

    function roundSize() {
        return Math.min(ROUND, pool().length);
    }

    function deal() {
        while (round.length <= idx) {
            const card = Store.dealCard(deckKey(), pool(), idOf, round.map(idOf));
            if (!card) return;
            round.push(card);
        }
    }

    function show() {
        stage = dir === "recognise" ? "reading" : "produce";
        missedThisWord = false;
        locked = false;
        el["word-reveal"].hidden = true;
        el["word-options"].hidden = false;
        el["word-question"].hidden = false;
        el["word-prompt"].hidden = false;
        el["word-prompt-sub"].hidden = false;
        el["word-progress"].textContent = `${idx + 1} / ${roundSize()}`;
        renderStage();
    }

    function renderStage() {
        const w = round[idx];
        if (!w) return;
        const reading = Romaji.readingOf(w);
        const written = w.kanji || w.kana;
        const kanaOnly = !w.kanji || w.kanji === w.kana;

        // Whether a voice exists is handled by the .no-speech body class, which
        // updates when iOS finally fires voiceschanged; here we only decide
        // whether this particular stage should offer audio at all.
        el["word-speak"].hidden = false;

        if (stage === "produce") {
            el["word-stage-label"].textContent = "Recall";
            el["word-prompt"].className = "prompt prompt-en";
            el["word-prompt"].textContent = w.english;
            el["word-prompt-sub"].textContent = w.group || "";
            el["word-question"].textContent = "Which word is it?";
            el["word-speak"].hidden = true;
            renderOptions(produceOptions(w), o => o.label, o => o.word === w,
                          o => Romaji.romajiOf(o.word));
            return;
        }

        if (stage === "reading") {
            el["word-stage-label"].textContent = "Reading";
            el["word-prompt"].className = "prompt prompt-jp";
            // No furigana here — the reading is exactly what's being tested.
            el["word-prompt"].textContent = written;
            el["word-prompt-sub"].textContent = "";
            el["word-question"].textContent = kanaOnly
                ? "How do you read this?"
                : "What’s the reading?";
            // When the label is already romaji there's nothing to gloss.
            renderOptions(readingOptions(w, kanaOnly),
                          o => o.label,
                          o => o.word === w,
                          kanaOnly ? null : o => Romaji.romajiOf(o.word));
            return;
        }

        // stage === "meaning" — reading is now known, so show it in full.
        el["word-stage-label"].textContent = "Meaning";
        el["word-prompt"].className = "prompt prompt-jp";
        el["word-prompt"].innerHTML = Furigana.render(written, reading, true);
        el["word-prompt-sub"].textContent = showRomaji ? Romaji.romajiOf(w) : "";
        el["word-question"].textContent = "What does it mean?";
        renderOptions(meaningOptions(w), o => o.english, o => o === w);
    }

    // ── Distractors ─────────────────────────────────────────────────────────
    // Wrong answers are picked to be plausible, not random: readings that look
    // or sound like the real one, meanings from the same semantic group.

    function readingOptions(w, kanaOnly) {
        const correctLabel = kanaOnly ? Romaji.romajiOf(w) : Romaji.readingOf(w);
        const target = Romaji.readingOf(w);
        const others = words.filter(x => x !== w);

        const label = x => kanaOnly ? Romaji.romajiOf(x) : Romaji.readingOf(x);
        const seen = new Set([correctLabel]);

        const scored = others
            .map(x => ({ word: x, label: label(x) }))
            .filter(o => o.label && !seen.has(o.label) && seen.add(o.label))
            .map(o => ({ ...o, score: readingSimilarity(target, Romaji.readingOf(o.word)) }))
            .sort((a, b) => b.score - a.score);

        const picks = takeSpread(scored, OPTIONS - 1);
        return Store.shuffle([{ word: w, label: correctLabel }, ...picks]);
    }

    // Same length and same opening mora are what make two readings easy to mix up.
    function readingSimilarity(a, b) {
        if (!a || !b) return 0;
        let score = 0;
        if (a.length === b.length) score += 3;
        else if (Math.abs(a.length - b.length) === 1) score += 1;
        if (a[0] === b[0]) score += 3;
        if (a[a.length - 1] === b[b.length - 1]) score += 2;
        const shared = [...new Set([...a])].filter(c => b.includes(c)).length;
        return score + shared;
    }

    function meaningOptions(w) {
        const sameGroup = words.filter(x => x !== w && x.group === w.group);
        const rest      = words.filter(x => x !== w && x.group !== w.group);
        const seen      = new Set([w.english]);
        const uniq      = list => list.filter(x => !seen.has(x.english) && seen.add(x.english));

        const picks = [
            ...Store.shuffle(uniq(sameGroup)),
            ...Store.shuffle(uniq(rest)),
        ].slice(0, OPTIONS - 1);

        return Store.shuffle([w, ...picks]);
    }

    function produceOptions(w) {
        const written = x => x.kanji || x.kana;
        const target  = Romaji.readingOf(w);
        const seen    = new Set([written(w)]);

        const scored = words
            .filter(x => x !== w && !seen.has(written(x)) && seen.add(written(x)))
            .map(x => ({
                word: x,
                label: written(x),
                score: readingSimilarity(target, Romaji.readingOf(x)) +
                       (x.group === w.group ? 4 : 0),
            }))
            .sort((a, b) => b.score - a.score);

        const picks = takeSpread(scored, OPTIONS - 1);
        return Store.shuffle([{ word: w, label: written(w) }, ...picks]);
    }

    // Take from the top of a ranked list but not the very top three every time,
    // or the same distractors show up round after round.
    function takeSpread(scored, n) {
        const band = scored.slice(0, Math.max(n, Math.min(scored.length, n * 4)));
        return Store.shuffle(band).slice(0, n);
    }

    // ── Answering ───────────────────────────────────────────────────────────

    // subOf is the romaji crutch under a Japanese option. Without it, anyone who
    // can't yet read kana is guessing between four shapes they can't pronounce —
    // the romaji button turns it off once the kana start to stick.
    function renderOptions(options, labelOf, isCorrect, subOf) {
        const box = el["word-options"];
        box.innerHTML = "";
        box.classList.toggle("options-jp", stage !== "meaning");
        for (const opt of options) {
            const btn = document.createElement("button");
            btn.className = "option";
            const sub = showRomaji && subOf ? subOf(opt) : "";
            if (sub) {
                btn.innerHTML =
                    `<span class="option-main">${Furigana.esc(labelOf(opt))}</span>` +
                    `<span class="option-sub">${Furigana.esc(sub)}</span>`;
            } else {
                btn.textContent = labelOf(opt);
            }
            btn.addEventListener("click", () => answer(btn, box, isCorrect(opt)));
            box.appendChild(btn);
        }
    }

    function answer(btn, box, correct) {
        if (locked) return;
        locked = true;

        if (correct) {
            btn.classList.add("correct");
        } else {
            btn.classList.add("wrong");
            missedThisWord = true;
            for (const b of box.children) {
                if (b !== btn && isCorrectButton(b)) b.classList.add("correct");
            }
        }
        for (const b of box.children) b.disabled = true;

        const w = round[idx];
        if (stage === "reading" && correct) Speech.say(Romaji.readingOf(w));

        setTimeout(() => {
            if (stage === "reading") {
                stage = "meaning";
                locked = false;
                renderStage();
            } else {
                finishWord();
            }
        }, correct ? 550 : 1400);
    }

    // The correct button is whichever we tagged during render; re-derive it by
    // comparing against the word rather than storing extra state on the node.
    function isCorrectButton(b) {
        const w = round[idx];
        // With romaji showing, the button also holds a gloss — match on the
        // Japanese line alone, not the whole button.
        const text = (b.querySelector(".option-main") || b).textContent;
        if (stage === "meaning") return text === w.english;
        if (stage === "produce") return text === (w.kanji || w.kana);
        const kanaOnly = !w.kanji || w.kanji === w.kana;
        return text === (kanaOnly ? Romaji.romajiOf(w) : Romaji.readingOf(w));
    }

    function finishWord() {
        const w = round[idx];
        const correct = !missedThisWord;
        Store.grade("words", idOf(w), correct);
        App.onAnswer(correct);

        stage = "done";
        el["word-options"].hidden = true;
        el["word-question"].hidden = true;
        // The reveal shows the word again, in full — leaving the prompt above it
        // printed the same word twice.
        el["word-prompt"].hidden = true;
        el["word-prompt-sub"].hidden = true;
        el["word-speak"].hidden = true;
        el["word-reveal"].hidden = false;

        const reading = Romaji.readingOf(w);
        const written = w.kanji || w.kana;
        el["reveal-word"].innerHTML = Furigana.render(written, reading, true);
        el["reveal-romaji"].textContent = Romaji.romajiOf(w);
        el["reveal-english"].textContent = w.english;
        el["reveal-note"].textContent = w.note || "";
        el["reveal-note"].hidden = !w.note;
        el["word-next"].textContent = idx === roundSize() - 1 ? "Finish round" : "Next";

        Speech.say(reading);
        el["word-next"].focus({ preventScroll: true });
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

    function syncDirButtons() {
        for (const b of el["word-dir"].children) {
            b.classList.toggle("active", b.dataset.dir === dir);
        }
    }

    function syncRomajiButton() {
        el["romaji-toggle"].classList.toggle("off", !showRomaji);
    }

    return { init, onShow, start };
})();
