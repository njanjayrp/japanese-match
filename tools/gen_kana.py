#!/usr/bin/env python3
"""Generate data/kana.json for japanese-match.

Emits every hiragana/katakana sign with Hepburn romaji, plus a hand-built
confusability map used to pick genuinely misleading quiz distractors.
"""
import json, os, sys

OUT = sys.argv[1] if len(sys.argv) > 1 else "kana.json"

# ── Gojūon table ────────────────────────────────────────────────────────────
# (row, [(hiragana, katakana, romaji, vowel), ...])
BASE = [
    ("a",  [("あ","ア","a","a"),("い","イ","i","i"),("う","ウ","u","u"),("え","エ","e","e"),("お","オ","o","o")]),
    ("k",  [("か","カ","ka","a"),("き","キ","ki","i"),("く","ク","ku","u"),("け","ケ","ke","e"),("こ","コ","ko","o")]),
    ("s",  [("さ","サ","sa","a"),("し","シ","shi","i"),("す","ス","su","u"),("せ","セ","se","e"),("そ","ソ","so","o")]),
    ("t",  [("た","タ","ta","a"),("ち","チ","chi","i"),("つ","ツ","tsu","u"),("て","テ","te","e"),("と","ト","to","o")]),
    ("n",  [("な","ナ","na","a"),("に","ニ","ni","i"),("ぬ","ヌ","nu","u"),("ね","ネ","ne","e"),("の","ノ","no","o")]),
    ("h",  [("は","ハ","ha","a"),("ひ","ヒ","hi","i"),("ふ","フ","fu","u"),("へ","ヘ","he","e"),("ほ","ホ","ho","o")]),
    ("m",  [("ま","マ","ma","a"),("み","ミ","mi","i"),("む","ム","mu","u"),("め","メ","me","e"),("も","モ","mo","o")]),
    ("y",  [("や","ヤ","ya","a"),("ゆ","ユ","yu","u"),("よ","ヨ","yo","o")]),
    ("r",  [("ら","ラ","ra","a"),("り","リ","ri","i"),("る","ル","ru","u"),("れ","レ","re","e"),("ろ","ロ","ro","o")]),
    ("w",  [("わ","ワ","wa","a"),("を","ヲ","wo","o")]),
    ("n'", [("ん","ン","n","")]),
]

DAKUTEN = [
    ("g", [("が","ガ","ga","a"),("ぎ","ギ","gi","i"),("ぐ","グ","gu","u"),("げ","ゲ","ge","e"),("ご","ゴ","go","o")]),
    ("z", [("ざ","ザ","za","a"),("じ","ジ","ji","i"),("ず","ズ","zu","u"),("ぜ","ゼ","ze","e"),("ぞ","ゾ","zo","o")]),
    ("d", [("だ","ダ","da","a"),("ぢ","ヂ","ji","i"),("づ","ヅ","zu","u"),("で","デ","de","e"),("ど","ド","do","o")]),
    ("b", [("ば","バ","ba","a"),("び","ビ","bi","i"),("ぶ","ブ","bu","u"),("べ","ベ","be","e"),("ぼ","ボ","bo","o")]),
]
HANDAKUTEN = [
    ("p", [("ぱ","パ","pa","a"),("ぴ","ピ","pi","i"),("ぷ","プ","pu","u"),("ぺ","ペ","pe","e"),("ぽ","ポ","po","o")]),
]

# Voicing families: base row -> voiced rows. Drives "did you spot the dakuten?" distractors.
VOICE_FAMILY = [("k","g"), ("s","z"), ("t","d"), ("h","b"), ("h","p"), ("b","p")]

# ── Yōon (contracted) syllables ─────────────────────────────────────────────
YOON_BASE = [
    ("き","キ","k"),("し","シ","sh"),("ち","チ","ch"),("に","ニ","n"),("ひ","ヒ","h"),
    ("み","ミ","m"),("り","リ","r"),("ぎ","ギ","g"),("じ","ジ","j"),("ぢ","ヂ","j"),
    ("び","ビ","b"),("ぴ","ピ","p"),
]
YOON_SMALL = [("ゃ","ャ","a","ya"),("ゅ","ュ","u","yu"),("ょ","ョ","o","yo")]

def yoon_romaji(stem, vowel):
    """Hepburn: sh/ch/j swallow the y (shu not shyu); everything else keeps it."""
    return stem + vowel if stem in ("sh", "ch", "j") else stem + "y" + vowel

# ── Small kana & marks ──────────────────────────────────────────────────────
SMALL = [
    ("っ","ッ","(sokuon)","doubles the next consonant"),
    ("ゃ","ャ","ya (small)","forms yōon"),
    ("ゅ","ュ","yu (small)","forms yōon"),
    ("ょ","ョ","yo (small)","forms yōon"),
]
MARKS = [("ー","chōonpu","lengthens the previous vowel")]

# ── Extended katakana for loanwords ─────────────────────────────────────────
EXTENDED = [
    ("ファ","fa"),("フィ","fi"),("フェ","fe"),("フォ","fo"),
    ("ティ","ti"),("ディ","di"),("トゥ","tu"),("ドゥ","du"),
    ("ウィ","wi"),("ウェ","we"),("ウォ","wo"),
    ("シェ","she"),("ジェ","je"),("チェ","che"),
    ("ヴ","vu"),("ヴァ","va"),("ヴィ","vi"),("ヴェ","ve"),("ヴォ","vo"),
]

# ── Confusability clusters ──────────────────────────────────────────────────
# Hand-built from the shapes beginners actually mix up. Membership is symmetric:
# every member of a cluster becomes a candidate distractor for every other.
HIRA_CLUSTERS = [
    "あおめぬ", "いりこ", "うつらふ", "きさちら", "くへし", "けはほま",
    "すむおぬ", "せさま", "そろる", "たなか", "つしてう", "てでへ",
    "とそ", "なたは", "にこた", "ぬめねれわ", "のぬめ", "はほまけ",
    "ひにび", "ふみう", "まもすむ", "みふ", "むすお", "めぬの",
    "もまき", "やか", "よまも", "らちう", "りい", "るろそ",
    "れねわぬ", "ろるそ", "わねれ", "をもた", "んそれ",
]
KATA_CLUSTERS = [
    "シツソン", "クワケタフ", "スヌエヲ", "ナメノヌ", "コユエヨ",
    "アマヤム", "チテキラ", "ハヘホ", "ウラワ", "ロヨコ", "ルレノハ",
    "ミニヨエ", "サセヤカ", "リソハ", "ムマヨ", "トヒテレ", "イノク",
    "オホヤネ", "モヨセ", "ネホオ", "ヲヌフ", "ケクタ", "タクケワ",
    "カヤセワ", "フワウ", "ヨヲコ",
]

def build_confusables(entries):
    """cluster membership + same-row + same-vowel + voicing siblings -> candidate pool"""
    conf = {}
    def add(a, b):
        if a == b:
            return
        conf.setdefault(a, [])
        if b not in conf[a]:
            conf[a].append(b)

    by_char = {e["char"]: e for e in entries}

    for cluster in HIRA_CLUSTERS + KATA_CLUSTERS:
        members = [c for c in cluster if c in by_char]
        for a in members:
            for b in members:
                add(a, b)

    # Voicing siblings: か/が, は/ば/ぱ — same shape, one diacritic apart.
    fam = {}
    for a, b in VOICE_FAMILY:
        fam.setdefault(a, set()).add(b)
        fam.setdefault(b, set()).add(a)
    for e in entries:
        if not e.get("vowel"):
            continue
        for other in entries:
            if other["script"] != e["script"] or other["char"] == e["char"]:
                continue
            if other.get("vowel") != e.get("vowel"):
                continue
            if other["row"] in fam.get(e["row"], ()):
                add(e["char"], other["char"])

    # Same row (vowel discrimination) and same vowel (consonant discrimination).
    for e in entries:
        if e["type"] not in ("base", "dakuten", "handakuten") or not e.get("vowel"):
            continue
        for other in entries:
            if other["script"] != e["script"] or other["char"] == e["char"]:
                continue
            if other["type"] not in ("base", "dakuten", "handakuten"):
                continue
            if other["row"] == e["row"] or other.get("vowel") == e.get("vowel"):
                add(e["char"], other["char"])
    return conf


def main():
    entries = []

    def push(char, romaji, script, row, vowel, kind, note=None):
        e = {"char": char, "romaji": romaji, "script": script,
             "row": row, "vowel": vowel, "type": kind}
        if note:
            e["note"] = note
        entries.append(e)

    for table, kind in ((BASE, "base"), (DAKUTEN, "dakuten"), (HANDAKUTEN, "handakuten")):
        for row, cells in table:
            for hira, kata, romaji, vowel in cells:
                push(hira, romaji, "hiragana", row, vowel, kind)
                push(kata, romaji, "katakana", row, vowel, kind)

    for hb, kb, stem in YOON_BASE:
        for hs, ks, vowel, _ in YOON_SMALL:
            r = yoon_romaji(stem, vowel)
            push(hb + hs, r, "hiragana", stem, vowel, "yoon")
            push(kb + ks, r, "katakana", stem, vowel, "yoon")

    for hira, kata, romaji, note in SMALL:
        push(hira, romaji, "hiragana", "small", "", "small", note)
        push(kata, romaji, "katakana", "small", "", "small", note)

    for char, romaji, note in MARKS:
        push(char, romaji, "katakana", "mark", "", "mark", note)

    for char, romaji in EXTENDED:
        push(char, romaji, "katakana", "ext", romaji[-1], "extended")

    conf = build_confusables(entries)

    payload = {
        "_comment": "Generated by tools/gen_kana.py — do not hand-edit.",
        "kana": entries,
        "confusables": conf,
    }
    os.makedirs(os.path.dirname(OUT) or ".", exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)

    counts = {}
    for e in entries:
        counts[(e["script"], e["type"])] = counts.get((e["script"], e["type"]), 0) + 1
    print(f"wrote {OUT}: {len(entries)} signs")
    for k in sorted(counts):
        print(f"  {k[0]:<9} {k[1]:<11} {counts[k]}")
    thin = [c for c, v in conf.items() if len(v) < 3]
    print(f"  confusables: {len(conf)} entries, {len(thin)} with <3 candidates")


if __name__ == "__main__":
    main()
