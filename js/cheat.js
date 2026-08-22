// Cheat sheets — the tables that are better looked at than drilled.
//
// Some vocabulary isn't really a list of words, it's a shape: relative time
// expressions are six prefixes crossed with four scales, and drilling them one
// flashcard at a time hides exactly the pattern that makes them cheap to learn.
// So this mode doesn't quiz. It lays the grid out whole, marks the cells that
// break the pattern, and states the rules underneath.
//
// Romaji is derived here like everywhere else, so a sheet can never drift out
// of step with the converter. A cell may still carry an explicit "romaji", and
// on these sheets that's almost always about spacing: あしたのあさ converts to
// "ashitanoasa", which is correct and unreadable.

const CheatMode = (() => {
    let sheets = [];
    let current = 0;

    const el = {};

    function init(data) {
        sheets = Array.isArray(data) ? data : [];
        for (const id of ["cheat-sheet", "cheat-body", "cheat-empty"]) {
            el[id] = document.getElementById(id);
        }

        const sel = el["cheat-sheet"];
        sel.innerHTML = "";
        sheets.forEach((s, i) => {
            const o = document.createElement("option");
            o.value = String(i);
            o.textContent = s.title;
            sel.appendChild(o);
        });
        // One sheet needs no picker; the heading already says which it is.
        sel.closest(".controls").hidden = sheets.length < 2;

        const saved = sheets.findIndex(s => s.id === Store.pref("cheatSheet", ""));
        current = saved >= 0 ? saved : 0;
        sel.value = String(current);

        sel.addEventListener("change", e => {
            current = Number(e.target.value) || 0;
            Store.setPref("cheatSheet", sheets[current]?.id || "");
            render();
            window.scrollTo(0, 0);
        });

        // One listener for the whole body: cells are re-created on every render.
        el["cheat-body"].addEventListener("click", e => {
            const cell = e.target.closest("[data-kana]");
            if (cell) Speech.say(cell.dataset.kana);
        });
    }

    function render() {
        const sheet = sheets[current];
        el["cheat-empty"].hidden = !!sheet;
        el["cheat-body"].hidden = !sheet;
        if (!sheet) return;

        const esc = Furigana.esc;
        const out = [];

        out.push(`<h2 class="sheet-title">${esc(sheet.title)}</h2>`);
        if (sheet.blurb) out.push(`<p class="sheet-blurb">${esc(sheet.blurb)}</p>`);

        if (sheet.legend?.length) {
            out.push(`<div class="sheet-legend">` + sheet.legend.map(k =>
                `<span class="legend-chip"><b>${esc(k.term)}</b>${esc(k.gloss)}</span>`
            ).join("") + `</div>`);
        }

        for (const grid of sheet.grids || []) out.push(renderGrid(grid, esc));

        if ((sheet.grids || []).some(g => g.rows.some(r => r.cells.some(c => c.odd)))) {
            out.push(`<p class="sheet-key"><span class="odd-dot"></span> breaks the pattern — learn these flat</p>`);
        }

        if (sheet.rules?.length) {
            out.push(`<div class="sheet-rules">` + sheet.rules.map((r, i) =>
                `<div class="rule">` +
                    `<div class="rule-n">${i + 1}</div>` +
                    `<div><div class="rule-title">${esc(r.title)}</div>` +
                    `<div class="rule-body">${esc(r.body)}</div></div>` +
                `</div>`
            ).join("") + `</div>`);
        }

        el["cheat-body"].innerHTML = out.join("");
    }

    function renderGrid(grid, esc) {
        const head = `<tr><th class="tt-corner"></th>` +
            grid.columns.map(c => `<th>${esc(c)}</th>`).join("") + `</tr>`;

        const body = grid.rows.map(row =>
            `<tr><th class="tt-label">${esc(row.label)}</th>` +
            row.cells.map(c => cell(c, esc)).join("") + `</tr>`
        ).join("");

        return `<section class="sheet-grid">` +
            (grid.title ? `<h3 class="sheet-grid-title">${esc(grid.title)}</h3>` : "") +
            `<div class="grid-scroll"><table class="tt">` +
                `<thead>${head}</thead><tbody>${body}</tbody>` +
            `</table></div></section>`;
    }

    // Two kinds of cell: a word (kana, derived romaji, meaning — tap to hear it)
    // and a gloss, which is the column that explains why the word is what it is.
    function cell(c, esc) {
        if (!c) return `<td class="tt-blank"></td>`;

        if (!c.kana) {
            if (!c.term && !c.en) return `<td class="tt-blank"></td>`;
            return `<td class="tt-gloss">` +
                (c.term ? `<span class="tt-term">${esc(c.term)}</span>` : "") +
                (c.en ? `<span class="tt-en">${esc(c.en)}</span>` : "") +
            `</td>`;
        }

        return `<td class="tt-cell${c.odd ? " odd" : ""}" data-kana="${esc(c.kana)}">` +
            `<span class="tt-kana">${esc(c.kana)}</span>` +
            `<span class="tt-romaji">${esc(Romaji.romajiOf(c))}</span>` +
            `<span class="tt-en">${esc(c.en || "")}</span>` +
        `</td>`;
    }

    function onShow() {
        if (!el["cheat-body"].innerHTML) render();
    }

    return { init, onShow };
})();
