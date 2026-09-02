// Spaced repetition + preferences, all in localStorage. No server, no accounts.
//
// Each item carries a weight (how likely it is to come up) and a streak (how
// many times you've got it right in a row). Wrong answers multiply the weight
// so the item comes back hard and soon; right answers decay it. Items you've
// nailed `MASTERED_AT` times in a row drop out of rotation until the pool runs
// thin, which stops a 40-word group turning into the same 6 words forever.

const Store = (() => {
    const PREFIX      = "jp_";
    const MASTERED_AT = 5;
    const MIN_WEIGHT  = 0.25;
    const MAX_WEIGHT  = 12;

    function read(key, fallback) {
        try {
            const raw = localStorage.getItem(PREFIX + key);
            return raw === null ? fallback : JSON.parse(raw);
        } catch {
            return fallback;
        }
    }

    function write(key, value) {
        try {
            localStorage.setItem(PREFIX + key, JSON.stringify(value));
        } catch { /* private browsing / quota — the app still works, just forgets */ }
    }

    function pref(key, fallback) {
        const v = read("pref_" + key, undefined);
        return v === undefined ? fallback : v;
    }

    function setPref(key, value) {
        write("pref_" + key, value);
    }

    // ── Per-deck item state ─────────────────────────────────────────────────
    // deck is "words" or "kana"; id is the word's kanji/kana or the kana sign.

    function stateOf(deck) {
        return read("state_" + deck, {});
    }

    function saveState(deck, state) {
        write("state_" + deck, state);
    }

    function entry(state, id) {
        return state[id] || (state[id] = { w: 1, streak: 0, seen: 0, right: 0, wrong: 0 });
    }

    function grade(deck, id, correct) {
        const state = stateOf(deck);
        const e = entry(state, id);
        e.seen += 1;
        if (correct) {
            e.right += 1;
            e.streak += 1;
            e.w = Math.max(MIN_WEIGHT, e.w * 0.6);
        } else {
            e.wrong += 1;
            e.streak = 0;
            e.w = Math.min(MAX_WEIGHT, e.w * 2.5);
        }
        saveState(deck, state);
        return e;
    }

    function isMastered(deck, id) {
        const e = stateOf(deck)[id];
        return !!e && e.streak >= MASTERED_AT;
    }

    // ── Round selection ─────────────────────────────────────────────────────

    function recent(deck) {
        return read("recent_" + deck, []);
    }

    function pushRecent(deck, ids) {
        const list = recent(deck);
        list.unshift(ids);
        write("recent_" + deck, list.slice(0, 3));
    }

    /**
     * Weighted sample without replacement.
     * @param {string} deck
     * @param {Array}  pool  candidate items
     * @param {number} count how many to draw
     * @param {(item:any)=>string} idOf
     */
    function pickRound(deck, pool, count, idOf) {
        if (pool.length <= count) return shuffle(pool.slice());

        const state   = stateOf(deck);
        const skip    = new Set(recent(deck).slice(0, 2).flat());
        const unseen  = pool.filter(x => !state[idOf(x)]);

        let active = pool.filter(x => {
            const e = state[idOf(x)];
            return !e || e.streak < MASTERED_AT;
        });
        // Everything's mastered — go round again rather than showing nothing.
        if (active.length < count) active = pool.slice();

        let eligible = active.filter(x => !skip.has(idOf(x)));
        if (eligible.length < count) eligible = active;

        const weightOf = x => {
            const e = state[idOf(x)];
            if (!e) return 4;                       // new material gets priority
            const rusty = e.streak === 0 ? 1.6 : 1; // recently missed
            return (e.w || 1) * rusty;
        };

        const picked = [];
        const bag = eligible.slice();
        while (picked.length < count && bag.length) {
            const total = bag.reduce((s, x) => s + weightOf(x), 0);
            let r = Math.random() * total;
            let idx = bag.length - 1;
            for (let i = 0; i < bag.length; i++) {
                r -= weightOf(bag[i]);
                if (r <= 0) { idx = i; break; }
            }
            picked.push(bag.splice(idx, 1)[0]);
        }

        pushRecent(deck, picked.map(idOf));
        return shuffle(picked);
    }

    /**
     * Deal the next card off a shuffled deck.
     *
     * Drawing at random every round is what makes the same words keep turning
     * up: ten cards drawn from sixty-odd, put straight back in the box. So
     * words are dealt instead — the deck is shuffled once, cards come off the
     * top, and it only reshuffles when it runs out.
     *
     * One card at a time, not a round at a time: a round reserved ten cards up
     * front and lost the ones you never reached, so quitting after three words
     * burned the other seven for that whole pass through the deck. A card
     * leaves the deck at the moment it goes on screen, so every card that's
     * gone is one you actually saw.
     *
     * @param {string} deck    storage key for this deck's remaining cards
     * @param {Array}  pool    every item currently in the set
     * @param {(item:any)=>string} idOf
     * @param {string[]} hold  ids already dealt into the round on screen; they
     *                         go to the bottom of a fresh shuffle so a pass
     *                         boundary can't repeat one straight away
     */
    function dealCard(deck, pool, idOf, hold = []) {
        if (!pool.length) return null;

        const key  = "deck_" + deck;
        const byId = new Map(pool.map(x => [idOf(x), x]));
        // Words dropped from the set since the last deal are no longer cards.
        let queue  = read(key, []).filter(id => byId.has(id));

        if (!queue.length) {
            const held  = new Set(hold);
            const fresh = shuffle([...byId.keys()]);
            queue = [...fresh.filter(id => !held.has(id)),
                     ...fresh.filter(id => held.has(id))];
        }

        const card = byId.get(queue.shift());
        write(key, queue);
        return card;
    }

    function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    // ── Answer streak badge ─────────────────────────────────────────────────

    function bumpStreak(correct) {
        const cur = correct ? read("streak", 0) + 1 : 0;
        write("streak", cur);
        const best = Math.max(read("best_streak", 0), cur);
        write("best_streak", best);
        return { cur, best };
    }

    function streak() {
        return { cur: read("streak", 0), best: read("best_streak", 0) };
    }

    function stats(deck) {
        const state = stateOf(deck);
        const ids = Object.keys(state);
        return {
            seen:     ids.length,
            mastered: ids.filter(id => state[id].streak >= MASTERED_AT).length,
            weakest:  ids.sort((a, b) => (state[b].w || 1) - (state[a].w || 1)).slice(0, 10),
        };
    }

    return { pref, setPref, grade, isMastered, pickRound, dealCard, shuffle,
             bumpStreak, streak, stats, stateOf, MASTERED_AT };
})();
