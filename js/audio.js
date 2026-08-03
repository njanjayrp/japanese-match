// Japanese text-to-speech via the Web Speech API — built into Safari on both
// macOS and iOS, so this needs no server, no key and no network at play time.
//
// iOS quirk: speechSynthesis.getVoices() is empty until the voiceschanged event
// fires, and the very first utterance must originate from a user gesture. Both
// are handled below; if no ja-JP voice exists we just stay silent rather than
// reading Japanese aloud in an English accent.

const Speech = (() => {
    const synth = window.speechSynthesis;
    let voice = null;
    let ready = false;

    function pickVoice() {
        if (!synth) return null;
        const voices = synth.getVoices();
        if (!voices.length) return null;
        const ja = voices.filter(v => /^ja([-_]|$)/i.test(v.lang));
        if (!ja.length) return null;
        // Prefer a local voice — network voices lag and fail offline.
        return ja.find(v => v.localService) || ja[0];
    }

    function init() {
        if (!synth) return;
        voice = pickVoice();
        ready = !!voice;
        if (!ready) {
            synth.addEventListener("voiceschanged", () => {
                voice = pickVoice();
                ready = !!voice;
                document.body.classList.toggle("no-speech", !ready);
            }, { once: true });
        }
        document.body.classList.toggle("no-speech", !ready);
    }

    function available() {
        return !!voice;
    }

    function say(text, { rate = 0.85 } = {}) {
        if (!synth || !voice || !text) return;
        synth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.voice = voice;
        u.lang = voice.lang || "ja-JP";
        u.rate = rate;   // slightly slow — mora timing is the point
        u.pitch = 1;
        synth.speak(u);
    }

    return { init, say, available };
})();
