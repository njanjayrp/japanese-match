// Kana → romaji, and kana script detection.
//
// We use "direct" romaji: every kana maps to its own syllable and ー just
// doubles the preceding vowel (コーヒー → koohii). It's less pretty than
// macron Hepburn (kōhī) but it round-trips back to kana, so the romaji never
// hides a character from you — which matters while you're still reading it.
// Individual words can override this with an explicit "romaji" field.

const Romaji = (() => {
    let table = new Map();   // kana string → romaji, longest keys first
    let maxKey = 1;

    const SOKUON  = new Set(["っ", "ッ"]);
    const HATSUON = new Set(["ん", "ン"]);
    const CHOON   = "ー";
    const VOWELS  = "aiueo";

    function init(kanaEntries) {
        table = new Map();
        for (const e of kanaEntries) {
            if (e.type === "small" || e.type === "mark") continue;
            if (!table.has(e.char)) table.set(e.char, e.romaji);
            maxKey = Math.max(maxKey, e.char.length);
        }
    }

    function isHiragana(ch) {
        const c = ch.codePointAt(0);
        return c >= 0x3041 && c <= 0x3096;
    }

    function isKatakana(ch) {
        const c = ch.codePointAt(0);
        return (c >= 0x30a1 && c <= 0x30fa) || c === 0x30fc;
    }

    function isKana(ch) {
        return isHiragana(ch) || isKatakana(ch);
    }

    function isKanji(ch) {
        const c = ch.codePointAt(0);
        return (c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf);
    }

    function hasKanji(str) {
        return [...str].some(isKanji);
    }

    // Which script is this string written in? Mixed kanji+kana counts by its kana.
    function scriptOf(str) {
        const chars = [...str].filter(isKana);
        if (!chars.length) return "kanji";
        return chars.some(isKatakana) && !chars.some(isHiragana) ? "katakana" : "hiragana";
    }

    function toRomaji(kana) {
        if (!kana) return "";
        let out = "";
        let i = 0;
        const chars = [...kana];

        while (i < chars.length) {
            const ch = chars[i];

            // っ — hold the next consonant. Hepburn writes っち as "tchi".
            if (SOKUON.has(ch)) {
                const next = lookup(chars, i + 1);
                if (next) {
                    out += next.romaji.startsWith("ch") ? "t" : next.romaji[0];
                    i += 1;
                    continue;
                }
                i += 1;
                continue;
            }

            // ー — lengthen whatever vowel we just wrote.
            if (ch === CHOON) {
                const last = out[out.length - 1];
                if (last && VOWELS.includes(last)) out += last;
                i += 1;
                continue;
            }

            // ん — needs an apostrophe before a vowel or y, else しんや reads "shinya".
            if (HATSUON.has(ch)) {
                const next = lookup(chars, i + 1);
                const needsBreak = next && (VOWELS.includes(next.romaji[0]) || next.romaji[0] === "y");
                out += needsBreak ? "n'" : "n";
                i += 1;
                continue;
            }

            const hit = lookup(chars, i);
            if (hit) {
                out += hit.romaji;
                i += hit.length;
            } else {
                out += ch;
                i += 1;
            }
        }
        return out;
    }

    // Longest-match lookup so よう-style yōon beat their single-kana prefixes.
    function lookup(chars, at) {
        for (let len = maxKey; len >= 1; len--) {
            if (at + len > chars.length) continue;
            const slice = chars.slice(at, at + len).join("");
            const romaji = table.get(slice);
            if (romaji) return { romaji, length: len };
        }
        return null;
    }

    // The reading a word should be tested/spoken with.
    function readingOf(word) {
        return word.kana || word.kanji || "";
    }

    // The romaji to display: explicit override wins, else derived from kana.
    function romajiOf(word) {
        return word.romaji || toRomaji(readingOf(word));
    }

    return { init, toRomaji, isKana, isHiragana, isKatakana, isKanji, hasKanji,
             scriptOf, readingOf, romajiOf };
})();
