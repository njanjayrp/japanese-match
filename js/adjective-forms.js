// Adjective conjugation — derived from the kana, never stored.
//
// The polite forms, which is what the textbook drills and what you'd actually
// say: ookii desu, ookiku nai desu, ookikatta desu, ookiku nakatta desu. The
// negative is ja nai desu rather than ja arimasen for the same reason the cheat
// sheet uses it — nai is itself an i-adjective, so both families end up running
// the identical negative and there's one pattern to hold instead of two.
//
// The wrong forms matter as much as the right ones. A multiple choice built
// from random other words teaches nothing: the only interesting mistakes are
// this word conjugated by the other family's rule, which is exactly what
// kirei and yuumei invite. So they're generated here beside the real forms.

const AdjForms = (() => {
    const SLOTS = [
        { id: "now",    label: "present",          gloss: "it is —" },
        { id: "notNow", label: "present negative", gloss: "it isn't —" },
        { id: "was",    label: "past",             gloss: "it was —" },
        { id: "wasnt",  label: "past negative",    gloss: "it wasn't —" },
    ];

    // いい is the one irregular: everything but the plain present is built on よい.
    const IRREGULAR = {
        "いい": { now: "いいです", notNow: "よくないです",
                  was: "よかったです", wasnt: "よくなかったです" },
    };

    function familyOf(word) {
        return word && (word.adj === "i" || word.adj === "na") ? word.adj : null;
    }

    function isAdjective(word) {
        return familyOf(word) !== null;
    }

    function isIrregular(word) {
        return !!IRREGULAR[readingOf(word)];
    }

    // An adjective that ends in the sound い but takes な — kirei, yuumei — plus
    // ii itself. These are the ones worth drilling on their own.
    function isException(word) {
        return isIrregular(word) ||
               (familyOf(word) === "na" && readingOf(word).endsWith("い"));
    }

    function readingOf(word) {
        return word.kana || word.kanji || "";
    }

    function conjugate(reading, family) {
        if (family === "na") {
            return {
                now:    reading + "です",
                notNow: reading + "じゃないです",
                was:    reading + "でした",
                wasnt:  reading + "じゃなかったです",
            };
        }
        // The い is the ending, so it comes off before anything is added.
        const stem = reading.endsWith("い") ? reading.slice(0, -1) : reading;
        return {
            now:    reading + "です",
            notNow: stem + "くないです",
            was:    stem + "かったです",
            wasnt:  stem + "くなかったです",
        };
    }

    /** The four correct forms, keyed by slot id. */
    function formsOf(word) {
        const reading = readingOf(word);
        return IRREGULAR[reading] || conjugate(reading, familyOf(word));
    }

    /**
     * The forms this word would have if you applied the other family's rule —
     * shizuka ku nai desu, ookii ja nai desu, kire ku nai desu. These are the
     * mistakes the exceptions actually produce, so they make the distractors.
     */
    function crossForms(word) {
        const reading = readingOf(word);
        const family  = familyOf(word);
        const out = [];

        if (isIrregular(word)) {
            // ii conjugated as if it were regular, which is the whole trap.
            out.push(...Object.values(conjugate(reading, "i")));
        }

        out.push(...Object.values(conjugate(reading, family === "i" ? "na" : "i")));

        // A na-adjective ending in い invites both halves of the same error:
        // stripping the い as though it were an ending, and not stripping it.
        if (family === "na" && reading.endsWith("い")) {
            for (const form of Object.values(conjugate(reading + "◆", "i"))) {
                out.push(form.replace("◆", ""));
            }
        }
        return out;
    }

    /**
     * Options for one question: the right form first, then wrong ones in the
     * order they're worth seeing — this word by the other family's rule, then
     * its own other tenses, then the rest. Deduplicated, because a na-adjective's
     * present is the same string either way.
     */
    function optionsFor(word, slot, count) {
        const forms = formsOf(word);
        const answer = forms[slot];

        const cross = crossForms(word);
        const others = SLOTS.filter(s => s.id !== slot).map(s => forms[s.id]);

        const seen = new Set([answer]);
        const picks = [];
        for (const tier of [crossAt(cross, slot), others, cross]) {
            for (const form of tier) {
                if (picks.length >= count - 1) break;
                if (seen.has(form)) continue;
                seen.add(form);
                picks.push(form);
            }
        }
        return { answer, options: [answer, ...picks] };
    }

    // The cross form for the slot being asked about, which is the sharpest
    // wrong answer available: same tense, same polarity, wrong family.
    function crossAt(cross, slot) {
        const at = SLOTS.findIndex(s => s.id === slot);
        const sameSlot = [];
        for (let i = at; i < cross.length; i += SLOTS.length) sameSlot.push(cross[i]);
        return sameSlot;
    }

    /**
     * Romaji for a form, with the pieces spaced apart — ookiku nakatta desu
     * rather than ookikunakattadesu. Same reasoning as the spacing overrides on
     * the cheat sheets: the run-together version is correct and unreadable.
     *
     * Suffixes come off the end only, longest first, and katta is deliberately
     * not among them: ookikatta is one word, where ookiku nakatta is two.
     */
    const SUFFIXES = ["deshita", "nakatta", "desu", "nai", "ja"];

    function spacedRomaji(form) {
        let rest = Romaji.toRomaji(form);
        const tail = [];
        let stripped = true;
        while (stripped) {
            stripped = false;
            for (const suffix of SUFFIXES) {
                if (rest.length > suffix.length && rest.endsWith(suffix)) {
                    tail.unshift(suffix);
                    rest = rest.slice(0, -suffix.length);
                    stripped = true;
                    break;
                }
            }
        }
        return [rest, ...tail].join(" ");
    }

    return { SLOTS, familyOf, isAdjective, isIrregular, isException,
             formsOf, crossForms, optionsFor, readingOf, spacedRomaji };
})();
