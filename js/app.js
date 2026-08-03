// Bootstrap: load the three data files, wire the tabs, register the service
// worker. Everything below runs from static files — there is no build step and
// no server beyond whatever is handing out the files.

const App = (() => {
    const MODES = {
        words:  () => WordMode,
        kana:   () => KanaGame,
        write:  () => StrokeMode,
        browse: () => BrowseMode,
    };

    let mode = "words";

    async function boot() {
        const [kanaData, words, strokeData] = await Promise.all([
            loadJSON("data/kana.json"),
            loadJSON("data/words.json").catch(() => []),
            loadJSON("data/strokes.json").catch(() => ({ strokes: {} })),
        ]);

        Romaji.init(kanaData.kana);
        Speech.init();

        WordMode.init(words);
        KanaGame.init(kanaData);
        StrokeMode.init(kanaData, strokeData);
        BrowseMode.init(words);

        document.getElementById("tabs").addEventListener("click", e => {
            const tab = e.target.closest(".tab");
            if (tab) switchMode(tab.dataset.mode);
        });

        const startMode = new URLSearchParams(location.search).get("mode")
                       || Store.pref("mode", "words");
        switchMode(MODES[startMode] ? startMode : "words");
        renderStreak();

        if ("serviceWorker" in navigator) {
            navigator.serviceWorker.register("./sw.js").catch(() => {});
        }
    }

    async function loadJSON(path) {
        const res = await fetch(path, { cache: "no-cache" });
        if (!res.ok) throw new Error(`${path}: ${res.status}`);
        return res.json();
    }

    function switchMode(next) {
        mode = next;
        Store.setPref("mode", mode);
        for (const tab of document.getElementById("tabs").children) {
            tab.classList.toggle("active", tab.dataset.mode === mode);
        }
        for (const view of document.querySelectorAll(".view")) {
            view.classList.toggle("active", view.id === `${mode}-view`);
        }
        window.scrollTo(0, 0);
        MODES[mode]().onShow();
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
