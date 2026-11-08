<!-- builda-sdk-version: 0.19.4 -->
# Godot Web Localization (i18n) and Font Practices

> Generalized from the hands-on experience of games already live on the platform; all size figures in this document are real measurements.
> Applies to: small games exported via Godot Web. The localization API part (§1) applies equally to general H5 games (ignore the GDScript wrapper);
> but the font parts (§0/§2) are Godot-specific (wasm self-rendering, no system font fallback) — games rendered with HTML5
> (pixi/phaser/canvas) go through the browser text pipeline, which has built-in system font fallback, so **prefer using system fonts directly**;
> they usually do not need to bundle or subset fonts, and only custom fonts such as brand/art fonts should follow §2 to subset into the bundle.

## 0. First understand two premises

**Premise one: Godot Web export has no system font fallback.**
On desktop, when Godot lacks a glyph it silently falls back to an OS font and everything looks fine; in the Web export (wasm)
there is no such escape route — characters missing from the font render directly as boxes (tofu).
This means **the text you see in the desktop editor cannot be trusted; acceptance must be done in a Web build**.

**Premise two: in-game text falls into two categories that are handled completely differently.**

| Category | Examples | Characteristics | Strategy |
|---|---|---|---|
| Closed-set text | UI copy, buttons, hints | Fully controlled by the developer | Subset precisely into the font |
| Open-set text | Leaderboard player names, input panel echo | Arbitrary Unicode, uncontrollable | Baseline coverage by block + runtime missing-glyph filtering |

Sources of open-set text under the current SDK: other players' `name` returned by `rank_get_list`, and
the `text` returned on confirm by `input_show_panel` (the platform already applies sensitive-word moderation and truncation, but the charset is still arbitrary).
A UI-only game has a fully controllable charset; once you integrate leaderboards you must handle open-set text,
otherwise players with rare-character / foreign / emoji nicknames will fill the board with garbled text.

---

## 1. Localization (i18n) implementation

### 1.1 With a small amount of copy: write the string table directly in GDScript

A single-scene small game (a few dozen strings × several languages) does not need Godot's CSV/PO translation pipeline;
just write the translations into a dictionary inside the script:

```gdscript
# All 11 languages the Builda App currently supports
const LANGS := ["en", "zh", "ja", "es-419", "fr", "id", "pt", "ru", "th", "tr", "vi"]
const I18N := {
    "win": {"en": "Level Clear!", "zh": "过关！", "ja": "クリア！", "es-419": "¡Nivel superado!",
            "fr": "Niveau terminé !", "id": "Level Selesai!", "pt": "Fase concluída!",
            "ru": "Уровень пройден!", "th": "ผ่านด่านแล้ว!", "tr": "Seviye tamamlandı!", "vi": "Qua màn!"},
    "retry": {"en": "Try Again", "zh": "再试一次", "ja": "もう一度", "es-419": "Otra vez",
              "fr": "Réessayer", "id": "Coba Lagi", "pt": "Tentar de novo",
              "ru": "Ещё раз", "th": "ลองอีกครั้ง", "tr": "Tekrar dene", "vi": "Thử lại"},
    # strings with format arguments uniformly use the _fmt suffix
    "info_fmt": {"en": "Level %d   %d left", "zh": "第 %d 关   剩余 %d 张", "ja": "ステージ %d   残り %d 枚",
                 "es-419": "Nivel %d   quedan %d", "fr": "Niveau %d   reste %d", "id": "Level %d   sisa %d",
                 "pt": "Fase %d   restam %d", "ru": "Уровень %d   осталось %d", "th": "ด่าน %d   เหลือ %d",
                 "tr": "Seviye %d   %d kaldı", "vi": "Màn %d   còn %d"},
}

var lang := "en"

func L(key: String) -> String:
    return I18N[key][lang]
```

Usage: `overlay_title.text = L("win")`, `info_lbl.text = L("info_fmt") % [lv, n]`.

This example lists all 11 languages the Builda App currently supports (see "Localization" in `md_sdk_ui.md`). The translations are illustrative; review them for your game. A game may ship fewer languages, and any language it omits uses the fallback in §1.2. Thai and Vietnamese need a font check before release: with Noto Sans SC as the only source font, the §2.3 script prints the glyphs it cannot find as `missing=` and exits with an error, so handle those languages as described in §2.5.

An extra benefit of the embedded dictionary is that it works naturally with the font subsetting pipeline (§2.3):
the subsetting script collects characters from `*.gd`, so translations written in the script **automatically land in the font subset**,
with no need to maintain "translation file → charset" sync logic. Only once copy reaches several hundred strings should you consider
a CSV/PO pipeline, and then have the subsetting script scan the translation files as well.

### 1.2 Language selection: read `runtime_language()`, three-level fallback

Use `builda.runtime_language()` (JS side `Builda.runtime.language()`) to get the current language:
it is synchronous, returns a bare string directly, the SDK itself falls back to `"en"` when unavailable, and it never returns an empty string.

The platform only provides **bare language codes** (`zh`, `en`, no region; the sole exception is Spanish `es-419`; the supported languages are listed under "Localization" in `md_sdk_ui.md`),
but the matching logic must still be written as a three-level fallback, not just an equality check:

```gdscript
func _pick_lang() -> void:
    var code: String = builda.runtime_language()   # "zh" / "en" / "es-419" …
    if LANGS.has(code):                            # 1. exact match
        lang = code
        return
    var prefix := code.split("-")[0]               # 2. prefix downgrade, e.g. es-419 → es if the game only has es
    lang = prefix if LANGS.has(prefix) else "en"   # 3. game default language
```

- Call it once at the very top of `_ready()`; no polling needed. The host supports switching language at runtime;
  a single-scene game reads it once, a multi-scene game may re-read it on scene change.
- Which default language to choose depends on the game's main audience; for languages your game has not translated, falling back to English
  is usually friendlier than falling back to Chinese.
- Do not branch on Simplified/Traditional Chinese (the platform does not distinguish `zh-CN`/`zh-TW`), and do not design region-specific copy.

### 1.3 Local testing

The `builda dev` mock collapses the browser language to platform granularity and supports forcing it via a URL parameter:

```
http://127.0.0.1:18088/builda-dev-shell.html?gameId=local-game&builda_mock_lang=ja
```

Switch through every language your game ships, using the codes `en` / `zh` / `ja` / `es-419` / `fr` / `id` / `pt` / `ru` / `th` / `tr` / `vi`, and try one code it does not ship to check the fallback. Key things to check:
**Japanese and Russian copy is commonly 30%~100% longer than Chinese**, and other languages can also run long; fixed-width buttons and labels truncate easily,
so either leave enough room in the layout or enable `clip_text` / `autowrap`;
prepare abbreviated forms for long languages on narrow tab-style buttons.

### 1.4 Scope boundary

`title` / `tagline` / `desc` in the manifest (`builda.publish.json`) and the leaderboard
`displayName` are platform-side fields with no localization mechanism at present, and are outside in-game i18n scope.
In-game UI (e.g. leaderboard tab text) must not depend on the platform's `displayName`; supply your own copy.
Brand names such as the game title may be left untranslated, but decide that deliberately rather than by omission.

---

## 2. Font handling

### 2.1 Overall approach: one source font, subset on demand, ship with the bundle

Fonts are handled by the game itself and shipped with the bundle. Two hard constraints:

- **Referencing any external font CDN is not allowed**: the H5 Bundle must be offline self-contained,
  and under COEP `require-corp` external links get blocked, causing a white screen; the platform provides no shared fonts.
- **A full CJK font (about 10~17MB) must not go into the bundle directly**: use fontTools to cut from the source font
  a subset containing only the needed characters (on the order of a few hundred KB~1.4MB); only the subset output goes into the bundle.

Closed-set text (UI copy + translations in each language) is subset precisely; open-set text (player names, etc.)
gets baseline coverage by block (GB2312 level 1 + Latin/Cyrillic/kana, etc.),
and the runtime missing-glyph filtering in §2.4 covers the rest (Thai/Korean/Arabic/emoji).

### 2.2 Subset size reference

Measured sizes (source font Noto Sans SC, about 17MB in full):

| Charset | Characters | TTF size |
|---|---|---|
| UI copy only (Chinese-only game) | ~320 | ~137KB |
| + GB2312 level-1 common hanzi | ~3.9k | ~1.2MB |
| + Latin Extended/Cyrillic/kana/full-width (player-name baseline; Thai and Vietnamese not included) | ~4.4k | ~1.4MB |
| + GB2312 level-2 (rare characters, low payoff) | ~6.9k | ~2.2MB |

Every time you expand the charset, measure the size with fontTools first and then decide; the font is often the largest single file in the pck,
so do not add blocks on a whim.

### 2.3 Subsetting script (directly reusable; adjust paths/character blocks per project)

Keep the source font outside the export directory (add `.gdignore` to the directory); the subset output goes into the bundle:

```
tools/font_src/<source font>.ttf    # source font, not in the bundle
tools/font_src/subset_font.py       # subsetting script
fonts/game_font.ttf                 # subset output, in the bundle
```

```python
#!/usr/bin/env python3
"""Regenerate the fonts/game_font.ttf font subset. Must be rerun after UI copy changes."""
import glob, os, string, sys
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "tools/font_src/NotoSansSC-full.ttf")
OUT = os.path.join(ROOT, "fonts/game_font.ttf")
EXTRA = "×…「」！？，。：；·—～□"   # baseline punctuation; □ is the missing-glyph replacement and must be included

# Baseline-by-block coverage for open-set text (player names); Thai/Arabic/Korean are absent from the source font, rely on runtime □ replacement
INTL_RANGES = [
    (0x00A1, 0x0180),  # Latin-1 Supplement + Latin Extended-A (Spanish/French/German…)
    (0x0400, 0x0460),  # Cyrillic (Russian)
    (0x3000, 0x3100),  # CJK punctuation + Hiragana + Katakana
    (0xFF01, 0xFF5F),  # Full-width ASCII
]

def gb2312_level1() -> set:
    """GB2312 level-1: 3755 common hanzi, covering the vast majority of Chinese player names."""
    chars = set()
    for hi in range(0xB0, 0xD8):
        for lo in range(0xA1, 0xFF):
            try:
                chars.add(bytes([hi, lo]).decode("gb2312"))
            except UnicodeDecodeError:
                pass
    return chars

def collect_chars(src_cmap: dict) -> str:
    chars = set(string.printable) | set(EXTRA) | gb2312_level1()
    # For international blocks, only take glyphs that actually exist in the source font, to avoid subsetter missing-glyph errors
    chars |= {chr(cp) for lo, hi in INTL_RANGES for cp in range(lo, hi) if cp in src_cmap}
    for path in glob.glob(os.path.join(ROOT, "scripts/*.gd")):   # adjust per project: scan every file containing copy
        chars |= set(open(path, encoding="utf-8").read())        # UI copy + embedded translations collected automatically
    return "".join(sorted(c for c in chars if c.isprintable() or c == " "))

def main() -> int:
    font = TTFont(SRC)
    text = collect_chars(font.getBestCmap())
    opts = subset.Options()
    opts.layout_features = ["*"]
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    ss = subset.Subsetter(options=opts)
    ss.populate(text=text)
    ss.subset(font)
    if "fvar" in font:   # instantiate a variable font at a fixed weight to save a bit more
        instantiateVariableFont(font, {"wght": 400}, inplace=True)
    font.save(OUT)

    cmap = TTFont(OUT).getBestCmap()
    missing = [c for c in text if c.strip() and ord(c) not in cmap]
    print(f"chars={len(text)} size={os.path.getsize(OUT)} missing={missing or 'none'}")
    return 1 if missing else 0

if __name__ == "__main__":
    sys.exit(main())
```

Requires `pip install fonttools`. The script includes its own missing-glyph self-check (`missing=`);
if the output is not `none`, the source font's coverage is insufficient — switch to a source font with fuller coverage.

### 2.4 Open-set text: runtime missing-glyph filtering (mandatory)

No matter how broad the font coverage, there is always something it misses (emoji, Korean, rare characters).
Check character by character before rendering external text, and replace any missing glyph with `□`:

```gdscript
func _safe_name(raw: String) -> String:
    var f: Font = theme.default_font
    if f == null:
        return raw
    var out := ""
    for ch in raw:   # GDScript iterates by code point; an emoji is also a single ch
        out += ch if f.has_char(ch.unicode_at(0)) else "□"
    return out

# Usage: in a leaderboard row
name_label.text = _safe_name(String(player.get("name", "???")))
```

Three details:

- `□` (U+25A1) must itself be in the font (the subsetting script's `EXTRA` already includes it),
  otherwise the replacement character itself becomes tofu.
- When fallback fonts are attached (e.g. minority-language font packs), `has_char` only checks the glyphs of a single `Font`;
  to judge by "the main font or any fallback has the glyph", check each `Font` in turn before deciding whether to replace.
- Every place in the project that renders external text must go through this function: leaderboard player names and
  input panel echo text both count.

### 2.5 Quick reference: per-script support cost

Measured coverage with Noto Sans SC as the source font:

| Script | Glyphs in source font? | Cost |
|---|---|---|
| Latin Extended (Spanish/French/Portuguese/Indonesian/Turkish, etc.) | Yes | Free, merged into the subset (a few dozen KB) |
| Vietnamese | **Not verified** | `INTL_RANGES` stops at U+017F, so `ơ`, `ư` and toned letters (U+1EA0 onward) are only subset if they appear in your copy. If the §2.3 script reports them as `missing=`, attach a Latin Noto font as a fallback and exclude them from the check, and check Vietnamese player names too |
| Russian Cyrillic | Yes | Free |
| Japanese kana | Yes | Free (~180 glyphs) |
| Japanese kanji | Yes (Simplified Chinese glyph style) | UI translations collected automatically; player names rely on the GB2312 intersection + □ |
| Thai | **No** | Attach Noto Sans Thai as a fallback (the whole block is only 91 characters, tiny), and exclude Thai from the §2.3 `missing=` check |
| Korean | **No** | Needs Noto Sans KR; even the 2350 common syllables take a few hundred KB |
| Arabic | **No** | Needs Noto Sans Arabic, **and depends on contextual joining + RTL**; Godot 4 Web ships TextServer Advanced by default so it is theoretically feasible — be sure to test it for real in a Web build |
| emoji | No | Support not recommended (color emoji fonts are several MB); just filter to □ |

For a game shipping `en`, `zh`, `ja`, `es-419`, `fr`, `id`, `pt`, `ru` and `tr`, "GB2312 level 1 + Latin/Cyrillic/kana baseline + □ filtering"
(about 1.4MB) is the most cost-effective solution. If the game ships `th`, attach Noto Sans Thai; if it ships `vi`, check coverage as above. When there is later demand for Arabic/Korean or Thai player names, subset the corresponding Noto font the same way and
ship it as a second font file in the bundle, attached via `FontFile.fallbacks` (the Thai block is tiny;
even common Korean syllables take a few hundred KB, so measure before deciding); if it is not worth it, just filter to □.
Do not pull fonts from an external CDN to save bundle size — offline self-containment is a hard constraint.

### 2.6 Godot-side font setup

```gdscript
func _setup_theme() -> void:
    var th := Theme.new()
    th.default_font = load("res://fonts/game_font.ttf")
    th.default_font_size = 26
    theme = th   # attach to the root node; the whole UI inherits it
```

When fallbacks (minority-language font packs) are needed, attach them via the `FontFile.fallbacks` array,
only appending, never replacing the existing font style.

---

## 3. Workflow discipline (lessons learned)

1. **After changing any copy (including adding translations) you must rerun the subsetting script before exporting**;
   forgetting results in garbled text on Web that is invisible on desktop. It is recommended to bake
   `python3 tools/font_src/subset_font.py` into the pre-export step.
2. **Do acceptance in the target runtime**: start a local server with `builda dev` and go through each language in the browser
   (`builda_mock_lang=xx`); reproduce leaderboard garbling by fabricating data directly with
   `builda_mock_player=p2&builda_mock_name=<Thai/emoji name>`.
3. **Size awareness**: every time you expand the charset, measure the size before deciding; a full CJK font never goes into the bundle,
   only the subset output does.
4. **Japanese/Russian copy runs long**; lay out fixed-width controls for the longest language or enable clipping.

---

## Appendix: reference shape of a real project

A single-scene Godot Web small game already live:

- 5 languages chosen by that game (zh/en/ja/ru/es; not the platform's language list), 27 strings, embedded dictionary + `L()` for lookups
- Font subset of 4408 characters / 1.40MB, `missing=none`
- Leaderboard player names filtered with `_safe_name()`; Thai/Arabic/Korean/emoji display as `□`, with no loss of functionality
- Total bundle size 11.7MB (the font accounts for 1.4MB, the largest single file in the pck)
