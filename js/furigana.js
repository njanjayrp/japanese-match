// Build <ruby> markup so kanji carry their reading above them.
//
// Safari renders <ruby>/<rt> natively, so 食べる with its reading becomes
// 食(た)べる with no library and no layout hacks.
//
// The alignment trick: split the written form into runs of kanji and runs of
// kana, then use the kana runs as anchors inside the full reading. 食べ物 is
// [食][べ][物], and finding "べ" inside たべもの tells us 食=た and 物=もの.
// If anchoring fails we fall back to one ruby over the whole word, which looks
// slightly clumsy but is never wrong.

const Furigana = (() => {

    function segment(written) {
        const runs = [];
        for (const ch of written) {
            const kind = Romaji.isKanji(ch) ? "kanji" : "kana";
            const last = runs[runs.length - 1];
            if (last && last.kind === kind) last.text += ch;
            else runs.push({ kind, text: ch });
        }
        return runs;
    }

    function align(written, reading) {
        const runs = segment(written);
        if (!runs.some(r => r.kind === "kanji")) return null;   // nothing to annotate

        const pairs = [];
        let pos = 0;

        for (let i = 0; i < runs.length; i++) {
            const run = runs[i];

            if (run.kind === "kana") {
                // The reading must contain this okurigana here; if it doesn't,
                // the two fields disagree and we bail out to whole-word ruby.
                if (reading.startsWith(run.text, pos)) {
                    pairs.push({ text: run.text });
                    pos += run.text.length;
                    continue;
                }
                return null;
            }

            const next = runs[i + 1];
            if (!next) {
                pairs.push({ text: run.text, rt: reading.slice(pos) });
                pos = reading.length;
                continue;
            }
            // Anchor on the kana run that follows this kanji run.
            const at = reading.indexOf(next.text, pos + 1);
            if (at === -1) return null;
            pairs.push({ text: run.text, rt: reading.slice(pos, at) });
            pos = at;
        }

        if (pos !== reading.length) return null;
        if (pairs.some(p => p.rt === "")) return null;
        return pairs;
    }

    /**
     * @param {string} written  e.g. "食べる" (may be kana-only)
     * @param {string} reading  e.g. "たべる"
     * @param {boolean} show    false renders the plain word with no readings
     * @returns {string} HTML
     */
    function render(written, reading, show = true) {
        if (!written) return esc(reading || "");
        if (!show || !reading || written === reading || !Romaji.hasKanji(written)) {
            return esc(written);
        }
        const pairs = align(written, reading);
        if (!pairs) {
            return `<ruby>${esc(written)}<rt>${esc(reading)}</rt></ruby>`;
        }
        return pairs.map(p =>
            p.rt ? `<ruby>${esc(p.text)}<rt>${esc(p.rt)}</rt></ruby>` : esc(p.text)
        ).join("");
    }

    function esc(s) {
        return String(s).replace(/[&<>"]/g, c =>
            ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    }

    return { render, esc };
})();
