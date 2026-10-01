// Bootstrap: load the three data files, wire the tabs, register the service
// worker. Everything below runs from static files — there is no build step and
// no server beyond whatever is handing out the files.

const App = (() => {
    const MODES = {
        words:  () => WordMode,
        kana:   () => KanaGame,
        adj:    () => AdjGame,
        write:  () => StrokeMode,
        browse: () => BrowseMode,
        cheat:  () => CheatMode,
        revise: () => ReviseMode,
    };

    // Two rows of navigation: the section, then the modes in it. The labels
    // live here and nowhere else — the markup for both rows is rendered from
    // this list. A mode's internal name (kana, write) is not its label, because
    // "Practice" means a different thing in Words than in Writing.
    const GROUPS = [
        { id: "words", label: "Words", modes: [
            { id: "words",  label: "Practice" },
            { id: "adj",    label: "Adj" },
            { id: "browse", label: "Browse" },
        ] },
        { id: "writing", label: "Writing", modes: [
            { id: "kana",  label: "Practice" },
            { id: "write", label: "Learning" },
        ] },
        { id: "grammar", label: "Grammar", modes: [
            { id: "cheat",  label: "Cheat" },
            { id: "revise", label: "Revise" },
        ] },
    ];

    let mode = "words";

    async function boot() {
        const [kanaData, words, strokeData, sheets, kanji, revision] = await Promise.all([
            loadJSON("data/kana.json"),
            loadJSON("data/words.json").catch(() => []),
            loadJSON("data/strokes.json").catch(() => ({ strokes: {} })),
            loadJSON("data/sheets.json").catch(() => []),
            loadJSON("data/kanji.json").catch(() => []),
            loadJSON("data/revision.json").catch(() => []),
        ]);

        Romaji.init(kanaData.kana);
        Speech.init();

        WordMode.init(words);
        KanaGame.init(kanaData, kanji);
        AdjGame.init(words);
        StrokeMode.init(kanaData, strokeData, kanji);
        BrowseMode.init(words);
        CheatMode.init(sheets);
        ReviseMode.init(revision, sheets);

        document.getElementById("groups").addEventListener("click", e => {
            const btn = e.target.closest(".group");
            if (btn) switchGroup(btn.dataset.group);
        });
        document.getElementById("tabs").addEventListener("click", e => {
            const tab = e.target.closest(".tab");
            if (tab) switchMode(tab.dataset.mode);
        });
        renderGroups();

        const startMode = new URLSearchParams(location.search).get("mode")
                       || Store.pref("mode", "words");
        switchMode(MODES[startMode] ? startMode : "words");
        renderStreak();

        if ("serviceWorker" in navigator) {
            // The page you are looking at was served by the worker that was
            // already installed, so a reload after the data changed still shows
            // the old data — the new worker only takes over once that load has
            // finished. Reloading once when it does is the difference between
            // changes appearing and you reloading twice wondering why they
            // didn't. Only when a worker was already in charge: on a first
            // visit the handover is expected and there is nothing stale to drop.
            const had = !!navigator.serviceWorker.controller;
            let reloaded = false;
            navigator.serviceWorker.addEventListener("controllerchange", () => {
                if (!had || reloaded) return;
                reloaded = true;
                location.reload();
            });
            navigator.serviceWorker.register("./sw.js").catch(() => {});
        }
    }

    async function loadJSON(path) {
        const res = await fetch(path, { cache: "no-cache" });
        if (!res.ok) throw new Error(`${path}: ${res.status}`);
        return res.json();
    }

    function groupOf(id) {
        return GROUPS.find(g => g.modes.some(m => m.id === id)) || GROUPS[0];
    }

    function switchMode(next) {
        mode = next;
        const group = groupOf(mode);
        Store.setPref("mode", mode);
        // Remembered per section, so coming back to Writing lands you where you
        // left it rather than always on its first mode.
        Store.setPref("mode_" + group.id, mode);

        for (const btn of document.getElementById("groups").children) {
            btn.classList.toggle("active", btn.dataset.group === group.id);
        }
        renderTabs(group);
        for (const view of document.querySelectorAll(".view")) {
            view.classList.toggle("active", view.id === `${mode}-view`);
        }
        window.scrollTo(0, 0);
        MODES[mode]().onShow();
    }

    function switchGroup(id) {
        const group = GROUPS.find(g => g.id === id);
        if (!group) return;
        const remembered = Store.pref("mode_" + id, group.modes[0].id);
        switchMode(group.modes.some(m => m.id === remembered) ? remembered : group.modes[0].id);
    }

    function renderGroups() {
        const box = document.getElementById("groups");
        box.innerHTML = "";
        for (const g of GROUPS) {
            const btn = document.createElement("button");
            btn.className = "group";
            btn.dataset.group = g.id;
            btn.textContent = g.label;
            box.appendChild(btn);
        }
    }

    function renderTabs(group) {
        const box = document.getElementById("tabs");
        box.innerHTML = "";
        for (const m of group.modes) {
            const btn = document.createElement("button");
            btn.className = "tab" + (m.id === mode ? " active" : "");
            btn.dataset.mode = m.id;
            btn.textContent = m.label;
            box.appendChild(btn);
        }
    }

    // Called by each mode after a graded answer, so the streak badge is shared.
    function onAnswer(correct) {
        Store.bumpStreak(correct);
        renderStreak();
    }

    function renderStreak() {
        const { cur, best } = Store.streak();
        const badge = document.getElementById("streak-badge");
        badge.textContent = cur > 0 ? `🔥 ${cur}` : "";
        badge.title = `Current streak ${cur} · best ${best}`;
    }

    return { boot, onAnswer, switchMode };
})();

document.addEventListener("DOMContentLoaded", () => {
    App.boot().catch(err => {
        document.body.insertAdjacentHTML("afterbegin",
            `<p class="fatal">Couldn't load data: ${err.message}</p>`);
    });
});
