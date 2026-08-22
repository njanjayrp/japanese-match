// Stroke-order playback.
//
// KanjiVG gives us one SVG path per stroke, already in writing order. Drawing
// each path with a dash pattern equal to its own length and animating the dash
// offset from full to zero makes the stroke appear to be written. Strokes are
// queued so they play one after another at a speed you can actually follow.

const StrokeMode = (() => {
    const SPEED = 0.011;    // seconds per SVG unit of path length
    const MIN_MS = 260;
    const GAP_MS = 130;
    const LOOPS  = 5;       // times the whole sign is written before it rests
    const LOOP_GAP_MS = 700;// pause on the finished sign between repeats

    let strokes = {};       // char → [path d, ...]
    let kana = [];
    let current = null;
    let timers = [];
    let script = "hiragana";
    let set = "base";

    const el = {};

    function init(kanaData, strokeData) {
        kana = kanaData.kana;
        strokes = strokeData.strokes || {};

        for (const id of ["write-script", "write-set", "stroke-paths", "write-char",
                          "write-romaji", "write-count", "write-replay",
                          "write-picker", "write-speak"]) {
            el[id] = document.getElementById(id);
        }

        script = Store.pref("writeScript", "hiragana");
        set    = Store.pref("writeSet", "base");
        el["write-script"].value = script;
        el["write-set"].value = set;

        el["write-script"].addEventListener("change", e => {
            script = e.target.value; Store.setPref("writeScript", script); buildPicker();
        });
        el["write-set"].addEventListener("change", e => {
            set = e.target.value; Store.setPref("writeSet", set); buildPicker();
        });
        el["write-replay"].addEventListener("click", () => current && play(current));
        el["write-speak"].addEventListener("click", () => current && Speech.say(current.char));

        buildPicker();
    }

    function pool() {
        const types = set === "base"
            ? new Set(["base"])
            : new Set(["base", "dakuten", "handakuten", "small"]);
        return kana.filter(k =>
            k.script === script && types.has(k.type) &&
            k.char.length === 1 && strokes[k.char]
        );
    }

    function buildPicker() {
        const box = el["write-picker"];
        box.innerHTML = "";
        const list = pool();
        for (const k of list) {
            const btn = document.createElement("button");
            btn.className = "pick";
            btn.innerHTML = `<span class="pick-char">${Furigana.esc(k.char)}</span>` +
                            `<span class="pick-romaji">${Furigana.esc(k.romaji)}</span>`;
            btn.addEventListener("click", () => select(k, btn));
            box.appendChild(btn);
        }
        // Preselect the first sign but stay silent — nobody wants the page
        // reading a kana at them the moment it loads.
        const first = list[0];
        if (first) select(first, box.firstElementChild, { silent: true });
    }

    function select(k, btn, { silent = false } = {}) {
        current = k;
        for (const b of el["write-picker"].children) b.classList.remove("active");
        if (btn) btn.classList.add("active");
        el["write-char"].textContent = k.char;
        el["write-romaji"].textContent = k.romaji;
        const n = (strokes[k.char] || []).length;
        el["write-count"].textContent = n === 1 ? "1 stroke" : `${n} strokes`;
        play(k);
        if (!silent) Speech.say(k.char);
    }

    // Writing it once is easy to miss. Play the whole sign LOOPS times, pausing
    // on the finished character in between, then leave it up.
    function play(k) {
        for (const t of timers) clearTimeout(t);
        timers = [];
        pass(k, 0);
    }

    function pass(k, n) {
        const total = draw(k);
        if (n + 1 < LOOPS) {
            timers.push(setTimeout(() => pass(k, n + 1), total + LOOP_GAP_MS));
        }
    }

    /** Draws the sign once. Returns how long the sequence takes, in ms. */
    function draw(k) {
        const g = el["stroke-paths"];
        g.innerHTML = "";
        const data = strokes[k.char] || [];

        let delay = 0;
        data.forEach((d, i) => {
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", d);
            path.setAttribute("class", "stroke");
            g.appendChild(path);

            const len = path.getTotalLength();
            const dur = Math.max(MIN_MS, Math.round(len * SPEED * 1000));

            path.style.strokeDasharray = `${len}`;
            path.style.strokeDashoffset = `${len}`;
            path.style.transition = "none";
            path.style.opacity = "0";

            timers.push(setTimeout(() => {
                path.style.opacity = "1";
                // Force a reflow so the transition starts from the offset above.
                void path.getBoundingClientRect();
                path.style.transition = `stroke-dashoffset ${dur}ms linear`;
                path.style.strokeDashoffset = "0";
            }, delay));

            delay += dur + GAP_MS;
        });

        return delay;
    }

    function onShow() {
        if (current) play(current);
    }

    return { init, onShow };
})();
