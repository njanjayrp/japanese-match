// Browse — the whole library in one scrollable list.
//
// Mostly a proofreading tool: after adding words to words.json this is where
// you check the furigana lines up and the derived romaji looks right. Tapping
// a row speaks it.

const BrowseMode = (() => {
    let words = [];
    let group = "__all__";
    let query = "";

    const el = {};

    function init(data) {
        words = data;
        for (const id of ["browse-group", "browse-search", "browse-list", "browse-count"]) {
            el[id] = document.getElementById(id);
        }

        const sel = el["browse-group"];
        sel.innerHTML = "";
        addOption(sel, "__all__", "All groups");
        if (words.some(w => w.marked)) addOption(sel, "__marked__", "★ Marked");
        for (const g of [...new Set(words.map(w => w.group).filter(Boolean))].sort()) {
            addOption(sel, g, g);
        }

        sel.addEventListener("change", e => { group = e.target.value; render(); });
        el["browse-search"].addEventListener("input", e => {
            query = e.target.value.trim().toLowerCase();
            render();
        });
    }

    function addOption(sel, value, label) {
        const o = document.createElement("option");
        o.value = value;
        o.textContent = label;
        sel.appendChild(o);
    }

    function filtered() {
        let list = words;
        if (group === "__marked__") list = list.filter(w => w.marked);
        else if (group !== "__all__") list = list.filter(w => w.group === group);

        if (query) {
            list = list.filter(w => {
                const hay = [w.kanji, w.kana, w.english, Romaji.romajiOf(w), w.group]
                    .filter(Boolean).join(" ").toLowerCase();
                return hay.includes(query);
            });
        }
        return list;
    }

    function render() {
        const list = filtered();
        el["browse-count"].textContent =
            `${list.length} word${list.length === 1 ? "" : "s"}`;

        const ul = el["browse-list"];
        ul.innerHTML = "";
        for (const w of list) {
            const written = w.kanji || w.kana;
            const reading = Romaji.readingOf(w);
            const li = document.createElement("li");
            li.className = "word-row";
            li.innerHTML =
                `<div class="row-jp">${Furigana.render(written, reading, true)}</div>` +
                `<div class="row-meta">` +
                    `<span class="row-romaji">${Furigana.esc(Romaji.romajiOf(w))}</span>` +
                    `<span class="row-en">${Furigana.esc(w.english)}</span>` +
                `</div>` +
                (w.note ? `<div class="row-note">${Furigana.esc(w.note)}</div>` : "");
            if (w.marked) li.classList.add("marked");
            li.addEventListener("click", () => Speech.say(reading));
            ul.appendChild(li);
        }
    }

    function onShow() {
        render();
    }

    return { init, onShow };
})();
