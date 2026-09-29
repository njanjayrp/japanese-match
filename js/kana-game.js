// Kana match game.
//
// The whole difficulty of kana is that the signs look like each other — シ/ツ,
// ソ/ン, ぬ/め, は/ほ/ま. So distractors come from a hand-built confusability
// map (see tools/gen_kana.py) rather than at random: same cluster first, then
// same consonant row, then same vowel column, and only then anything else.
// Random options would make this trivially easy and teach you nothing.

const KanaGame = (() => {
    const ROUND = 12;
    const OPTIONS = 6;

    let all = [];
    let kanji = [];         // single-character words, quizzed like a sign
    let confusables = {};
    let round = [];
    let idx = 0;
    let locked = false;
    let correctCount = 0;
    let misses = [];

    let script = "both";
    let set = "base";
    let dir = "toRomaji";

    const SETS = {
        base:    new Set(["base"]),
        // The basic 46 plus the kanji, so the kanji actually come up: in
        // Everything they are 15 signs among 250 and a round of 12 usually
        // has none.
        kanji:   new Set(["base", "kanji"]),
        dakuten: new Set(["base", "dakuten", "handakuten"]),
        yoon:    new Set(["base", "dakuten", "handakuten", "yoon"]),
        all:     new Set(["base", "dakuten", "handakuten", "yoon", "small", "mark",
                          "extended", "kanji"]),
    };

    const el = {};

    function init(data, kanjiData) {
        // A kanji only joins the quiz if the character is a word on its own, so
        // there is one reading to ask for — 山 is yama, where 上 could be ue,
        // jou or the ず of jouzu. The label is that word's reading, which is
        // why a kanji sits in the pool looking exactly like a kana.
        kanji = (kanjiData || []).filter(k => k.quiz).map(k => ({
            char: k.char,
            romaji: Romaji.toRomaji(k.wordKana),
            script: "kanji",
            type: "kanji",
            meaning: k.meaning,
        }));
        all = data.kana.concat(kanji);
        confusables = data.confusables || {};

        for (const id of ["kana-script", "kana-set", "kana-dir", "kana-prompt",
                          "kana-options", "kana-progress", "kana-score",
                          "kana-card", "kana-round-end", "kana-round-score",
                          "kana-round-misses", "kana-again", "kana-speak"]) {
            el[id] = document.getElementById(id);
        }

        script = Store.pref("kanaScript", "both");
        set    = Store.pref("kanaSet", "base");
        dir    = Store.pref("kanaDir", "toRomaji");

        el["kana-script"].value = script;
        el["kana-set"].value = set;
        syncDirButtons();

        el["kana-script"].addEventListener("change", e => {
            script = e.target.value; Store.setPref("kanaScript", script); start();
        });
        el["kana-set"].addEventListener("change", e => {
            set = e.target.value; Store.setPref("kanaSet", set); start();
        });
        el["kana-dir"].addEventListener("click", e => {
            const btn = e.target.closest(".seg-btn");
            if (!btn) return;
            dir = btn.dataset.dir;
            Store.setPref("kanaDir", dir);
            syncDirButtons();
            start();
        });
        el["kana-again"].addEventListener("click", start);
        el["kana-speak"].addEventListener("click", () => {
            const k = round[idx];
            if (k) Speech.say(k.char);
        });
    }

    function pool() {
        // Kanji only: the character-set picker is about kana, so it is ignored
        // rather than left to empty the pool.
        if (script === "kanji") return kanji;

        const types = SETS[set] || SETS.base;
        return all.filter(k =>
            types.has(k.type) &&
            (script === "both" || k.script === script) &&
            k.type !== "mark"                 // ー has no reading to guess
        );
    }

    // Deck is per-direction: recognising あ and producing it are different skills.
    function deckName() {
        return "kana";
    }

    function idOf(k) {
        return k.script[0] + ":" + k.char;
    }

    function start() {
        const p = pool();
        el["kana-round-end"].hidden = true;
        el["kana-card"].hidden = false;
        round = Store.pickRound(deckName(), p, Math.min(ROUND, p.length), idOf);
        idx = 0;
        correctCount = 0;
        misses = [];
        show();
    }

    function show() {
        const k = round[idx];
        if (!k) return;
        locked = false;
        el["kana-progress"].textContent = `${idx + 1} / ${round.length}`;
        el["kana-score"].textContent = `${correctCount} correct`;
        // Only offer audio when the kana itself is on screen; the .no-speech
        // body class handles the "no Japanese voice installed" case.
        el["kana-speak"].hidden = dir !== "toRomaji";

        const promptText = dir === "toRomaji" ? k.char : k.romaji;
        el["kana-prompt"].textContent = promptText;
        el["kana-prompt"].classList.toggle("as-romaji", dir === "toKana");
        el["kana-prompt"].classList.toggle("long", promptText.length > 2);

        renderOptions(k, buildOptions(k));
    }

    /**
     * Ranked distractor pool: explicit confusables, then same row, then same
     * vowel, then anything from the active pool. Deduplicated by the label the
     * user actually sees, so じ and ぢ never both appear as "ji".
     */
    function buildOptions(k) {
        const p = pool();
        const labelOf = x => dir === "toRomaji" ? x.romaji : x.char;
        const answerLabel = labelOf(k);

        const byChar = new Map();
        for (const x of p) byChar.set(x.script + x.char, x);

        const sameScript = p.filter(x => x.script === k.script && x.char !== k.char);
        const cluster = (confusables[k.char] || [])
            .map(c => byChar.get(k.script + c))
            .filter(Boolean);

        const tiers = [
            cluster,
            sameScript.filter(x => x.row === k.row && x.vowel !== k.vowel),
            sameScript.filter(x => x.vowel === k.vowel && x.row !== k.row),
            sameScript,
            p.filter(x => x.char !== k.char),
        ];

        const seen = new Set([answerLabel]);
        const picks = [];
        for (const tier of tiers) {
            for (const x of Store.shuffle(tier.slice())) {
                if (picks.length >= OPTIONS - 1) break;
                const label = labelOf(x);
                if (seen.has(label)) continue;
                seen.add(label);
                picks.push(x);
            }
            if (picks.length >= OPTIONS - 1) break;
        }

        return Store.shuffle([k, ...picks]);
    }

    function renderOptions(k, options) {
        const box = el["kana-options"];
        box.innerHTML = "";
        box.classList.toggle("options-jp", dir === "toKana");
        for (const opt of options) {
            const btn = document.createElement("button");
            btn.className = "option";
            btn.textContent = dir === "toRomaji" ? opt.romaji : opt.char;
            btn.addEventListener("click", () => answer(btn, box, opt === k, k));
            box.appendChild(btn);
        }
    }

    function answer(btn, box, correct, k) {
        if (locked) return;
        locked = true;

        if (correct) {
            btn.classList.add("correct");
            correctCount += 1;
        } else {
            btn.classList.add("wrong");
            misses.push(k);
            const answerLabel = dir === "toRomaji" ? k.romaji : k.char;
            for (const b of box.children) {
                if (b.textContent === answerLabel) b.classList.add("correct");
            }
        }
        for (const b of box.children) b.disabled = true;

        Store.grade(deckName(), idOf(k), correct);
        App.onAnswer(correct);
        Speech.say(k.char);

        setTimeout(() => {
            idx += 1;
            if (idx >= round.length) finishRound();
            else show();
        }, correct ? 480 : 1300);
    }

    function finishRound() {
        el["kana-card"].hidden = true;
        el["kana-round-end"].hidden = false;
        const pct = Math.round((correctCount / round.length) * 100);
        el["kana-round-score"].textContent = `${correctCount} / ${round.length}  ·  ${pct}%`;

        const box = el["kana-round-misses"];
        box.innerHTML = "";
        if (!misses.length) {
            box.innerHTML = '<p class="clean">Clean round.</p>';
            return;
        }
        const seen = new Set();
        const heading = document.createElement("p");
        heading.className = "misses-heading";
        heading.textContent = "Worth another look";
        box.appendChild(heading);
        const list = document.createElement("div");
        list.className = "miss-list";
        for (const k of misses) {
            const key = idOf(k);
            if (seen.has(key)) continue;
            seen.add(key);
            const chip = document.createElement("button");
            chip.className = "miss";
            chip.innerHTML = `<span class="miss-char">${Furigana.esc(k.char)}</span>` +
                             `<span class="miss-romaji">${Furigana.esc(k.romaji)}</span>`;
            chip.addEventListener("click", () => Speech.say(k.char));
            list.appendChild(chip);
        }
        box.appendChild(list);
    }

    function onShow() {
        if (!round.length) start();
    }

    function syncDirButtons() {
        for (const b of el["kana-dir"].children) {
            b.classList.toggle("active", b.dataset.dir === dir);
        }
    }

    return { init, onShow, start };
})();
