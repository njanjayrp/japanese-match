# Third-party data

## KanjiVG

`data/strokes.json` is generated from [KanjiVG](http://kanjivg.tagaini.net),
copyright © 2009–2011 Ulrich Apel, released under the
[Creative Commons Attribution-ShareAlike 3.0](https://creativecommons.org/licenses/by-sa/3.0/)
licence.

The generator (`tools/gen_strokes.py`) downloads one SVG per kana and keeps only
the path data for each stroke, in writing order. That makes `data/strokes.json`
a derivative work, so **that file remains CC BY-SA 3.0** — if you redistribute
it, keep this attribution and share it under the same licence.

Nothing else in this repository is derived from KanjiVG.

## Everything else

The kana tables, romaji mappings, confusability clusters and vocabulary in
`data/kana.json` and `data/words.json` were written for this project.
