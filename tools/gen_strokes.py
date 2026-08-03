#!/usr/bin/env python3
"""Generate data/strokes.json from KanjiVG.

Downloads the KanjiVG SVG for every single-character kana in data/kana.json and
extracts just the path data, in stroke order. Output is a flat
{ "あ": ["M31.01,33c0.88...", ...] } map rendered against a 109x109 viewBox.

KanjiVG (c) Ulrich Apel, CC BY-SA 3.0 — see NOTICE.md.
"""
import json, os, re, sys, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

KANA_JSON = sys.argv[1] if len(sys.argv) > 1 else "data/kana.json"
OUT       = sys.argv[2] if len(sys.argv) > 2 else "data/strokes.json"
BASE_URL  = "https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/{:05x}.svg"

# KanjiVG orders <path> elements by stroke, and tags each with an -sN id.
PATH_RE = re.compile(r'<path[^>]*\bid="kvg:[0-9a-f]+-s(\d+)"[^>]*\bd="([^"]+)"')


def fetch(char):
    url = BASE_URL.format(ord(char))
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            svg = r.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return char, None, f"HTTP {e.code}"
    except Exception as e:
        return char, None, str(e)

    strokes = sorted(PATH_RE.findall(svg), key=lambda m: int(m[0]))
    if not strokes:
        return char, None, "no stroke paths"
    return char, [d for _, d in strokes], None


def main():
    with open(KANA_JSON, encoding="utf-8") as f:
        kana = json.load(f)["kana"]

    # Stroke practice only makes sense for single signs; yōon are just two of
    # these written together, so they'd be redundant.
    chars = sorted({e["char"] for e in kana if len(e["char"]) == 1})
    print(f"fetching {len(chars)} kana from KanjiVG...")

    out, failed = {}, []
    with ThreadPoolExecutor(max_workers=12) as pool:
        for char, strokes, err in pool.map(fetch, chars):
            if strokes:
                out[char] = strokes
            else:
                failed.append((char, err))

    payload = {
        "_license": "Stroke data from KanjiVG (c) Ulrich Apel, CC BY-SA 3.0, "
                    "http://kanjivg.tagaini.net",
        "_viewBox": "0 0 109 109",
        "strokes": {c: out[c] for c in sorted(out)},
    }
    os.makedirs(os.path.dirname(OUT) or ".", exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))

    size = os.path.getsize(OUT)
    total = sum(len(v) for v in out.values())
    print(f"wrote {OUT}: {len(out)}/{len(chars)} kana, {total} strokes, {size/1024:.0f} KB")
    if failed:
        print("missing:", ", ".join(f"{c} ({e})" for c, e in failed))


if __name__ == "__main__":
    main()
