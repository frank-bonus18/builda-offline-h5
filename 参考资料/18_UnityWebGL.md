<!--
离线快照
源: https://ai.builda.game/game-sdk/releases/0.19.4/md_unity_webgl.md
抓取日期: 2026-11-06
固化方式: 逐条完整照录，未做摘要/浓缩/省略
-->

<!-- builda-sdk-version: 0.19.4 -->
# Unity WebGL Export (engine=unity)

> For: projects built with Unity and published as H5 games through Builda. The general packaging spec (entry / offline self-contained / limits) is governed by `h5_bundle_spec.md`; this document only covers Unity-specific export settings and pitfalls. Requires Unity 2021.3 LTS or later, with the **WebGL Build Support** module installed.

## 1. Compression settings (most important; getting this wrong means outright rejection)

`Player Settings → Publishing Settings`, choose one of the two:

- **Recommended: Compression Format = Brotli (or Gzip), with Decompression Fallback checked**.
  Output is the self-decompressing `Build/*.unityweb` format: the loader embeds a JS decompressor, any static server can serve it directly, and player download size is 3–5x smaller than uncompressed. The cost is startup overhead from main-thread decompression during loading (the Unity console will suggest server-side compression; you can ignore it — Builda's static serving architecture is designed around Fallback).
- **Fallback option: Compression Format = Disabled**. Output is raw `Build/*.wasm` / `*.data` / `*.framework.js`; startup parsing is fast but download size is large.
- **Forbidden: compression enabled without Decompression Fallback checked**. The output `*.wasm.br` / `*.data.gz` depends on server `Content-Encoding` negotiation and is garbage under static serving; `.br`/`.gz` are not on the upload whitelist, and both `builda bundle-check` and the backend hard-reject them.

## 2. WebGL Template (SDK reference contract)

`builda sdk install` has already installed the **Builda template** into `Assets/WebGLTemplates/Builda/`. Select **Builda** under `Player Settings → Resolution and Presentation → WebGL Template`.

The template `<head>` already contains `<script src="builda-sdk.js"></script>` — this is the SDK reference contract hard-checked by upload validation (`h5_bundle_spec.md` §2.1): the zip **does not package** the SDK file itself; in production it is injected by the host, and for local debugging `builda dev` serves the mock. If you use a custom template you must keep the same root-relative reference in `<head>`, and must not let build tools rename/inline it.

The template also has built-in `?dpr=N` render-resolution control (the host App passes it per device model; mobile performance guidance is the same as for Godot/HTML5).

## 3. Memory limit

WASM memory ≤ **1GiB** (the `Player Settings → Publishing Settings → Memory` settings; on 2021.3+ the one to watch is usually `Maximum Memory Size`). Exceeding it will very likely fail to start in mobile WebViews. The unity profile has no automatic check yet (Godot's Emscripten memory regex does not apply to Unity output); confirm it yourself before publishing.

## 4. Output layout (enforced by upload validation)

After export the directory should look like:

```
index.html            ← zip root, produced by the Builda template
Build/
  <name>.loader.js
  <name>.framework.js[.unityweb]
  <name>.wasm[.unityweb]
  <name>.data[.unityweb]
TemplateData/         ← template static assets
StreamingAssets/      ← optional; exempt from the extension whitelist (AssetBundles may have no extension)
```

- `index.html` must be at the zip root; `Build/` is Unity's default output directory name, **do not rename it** — validation matches the four-file set by the `Build/` prefix + suffix; the file names themselves vary with the build name and are unrestricted.
- Run the packaging command **inside the build output directory** (so index.html is at the zip root): `cd <build output dir> && zip -r -X ../game.zip .`
- **Never include in the bundle**: `*.meta`, `*.csproj`, `*.sln`, `*.unity`, `Library/`, `Temp/`, `Obj/`, `ProjectSettings/` (to prevent uploading the Unity project as the build; validation hard-rejects them); sourcemap `*.map` and `node_modules/` are likewise forbidden.

## 5. Localization (i18n) and fonts (required reading for CJK)

> This chapter is compiled from real Unity projects shipped on the platform (including measured size data); the i18n strategy mirrors the Godot side
> `md_godot_i18n.md`, but font handling differs greatly between the two — this chapter is Unity-specific guidance.

### 5.1 Two premises

**Premise one: Unity WebGL has no system font fallback.** TextMeshPro has no system fallback on WebGL, and neither does legacy `Font`. But the editor runs on macOS/Windows, which **do have** system fonts — so **the text you see in the Game view cannot be trusted; font acceptance must be done in a Web build** (`builda dev --web <build dir>`).

**Premise two: in-game text falls into two categories that are handled completely differently** (engine-independent):

| Category | Examples | Characteristics | Strategy |
|---|---|---|---|
| Closed-set text | UI copy, buttons, hints | Fully controlled by the developer | Subset precisely into the font |
| Open-set text | Leaderboard player names, input panel echo | Arbitrary Unicode, uncontrollable | Baseline coverage by block + runtime missing-glyph filtering |

### 5.2 Localization implementation

- **Write the string table directly in a C# static dictionary**; no need for the Unity Localization package. The core reason: the font subsetting script collects characters from `Assets/Scripts/*.cs`, so translations written in source automatically land in the font subset, eliminating the "translation file → charset" sync logic. Strings with format arguments uniformly use the `_fmt` suffix + `string.Format` `{0}` placeholders.

```csharp
public static class I18n
{
    // All 11 languages the Builda App currently supports
    public static readonly string[] Langs = { "en", "zh", "ja", "es-419", "fr", "id", "pt", "ru", "th", "tr", "vi" };
    public const string DefaultLang = "en";
    static readonly Dictionary<string, Dictionary<string, string>> Table = new()
    {
        ["title"] = new() { ["en"] = "TITLE", ["zh"] = "游戏标题", ["ja"] = "タイトル", ["es-419"] = "TÍTULO", ["fr"] = "TITRE", ["id"] = "JUDUL", ["pt"] = "TÍTULO", ["ru"] = "НАЗВАНИЕ", ["th"] = "ชื่อเกม", ["tr"] = "BAŞLIK", ["vi"] = "TIÊU ĐỀ" },
        ["score_fmt"] = new() { ["en"] = "Score {0}", ["zh"] = "得分 {0}", ["ja"] = "スコア {0}", ["es-419"] = "Puntos {0}", ["fr"] = "Score {0}", ["id"] = "Skor {0}", ["pt"] = "Pontos {0}", ["ru"] = "Счёт {0}", ["th"] = "คะแนน {0}", ["tr"] = "Skor {0}", ["vi"] = "Điểm {0}" },
    };
    public static string L(string key) => /* exact → DefaultLang → key */;
    public static string L(string key, params object[] args) => string.Format(L(key), args);
}
```

- This example lists all 11 languages the Builda App currently supports (see "Localization" in `md_sdk_ui.md`). The translations are illustrative. A game may ship fewer languages, and any language it omits uses the fallback below. Thai and Vietnamese need a font check before release.
- **Language selection reads `BuildaSDK.RuntimeLanguage()`, with a three-level fallback** (exact match → prefix downgrade e.g. `es-419`→`es` → the game's default language). The method is synchronous, returns a bare string directly, falls back to `"en"` when unavailable, and never returns an empty string. The platform only provides bare language codes (`zh`/`en`, no regional variants), the sole exception being Spanish `es-419` (the supported languages are listed under "Localization" in `md_sdk_ui.md`) — do not branch on Simplified/Traditional Chinese. For unsupported languages, falling back to English is usually friendlier than falling back to Chinese.
- **Initialization must happen before any string lookup**. Put it in the startup script's `Awake()`; note that Unity **does not guarantee the execution order of sibling components' `Start()`** (Godot's autoload order is explicitly declared; this nondeterminism is Unity-specific).
- **Local per-language acceptance**: append `builda_mock_lang=ja` to the `builda dev` shell URL and go through every language your game ships (codes: `en` / `zh` / `ja` / `es-419` / `fr` / `id` / `pt` / `ru` / `th` / `tr` / `vi`), then try one code it does not ship to check the fallback. Key point: **Japanese and Russian copy is commonly 30%–100% longer than Chinese** — lay out fixed-width controls for the longest language or enable clipping (legacy `Text` uses `horizontalOverflow`/`verticalOverflow`, TMP uses `overflowMode = Ellipsis`).
- **Scope boundary**: `title`/`tagline`/`desc` in `builda.publish.json` and the leaderboard `displayName` are platform-side fields with no localization mechanism today, and are outside in-game i18n scope; in-game UI (e.g. leaderboard tab text) supplies its own copy — do not read the platform's `displayName`.
- Porting from Godot: GDScript `%d`/`%s` placeholders must be changed to C# `{0}`/`{1}` — missing one causes no compile error; it just displays `%d` verbatim to players.

### 5.3 Font choice: TextMeshPro or legacy Font?

| | TextMeshPro | legacy `Font` + uGUI `Text` |
|---|---|---|
| What goes into the bundle | Pre-baked SDF atlas texture + glyph metrics table | The TTF bytes themselves |
| After the charset changes | Font Asset must be re-baked | No action needed |
| Size at ~4400 glyphs (CJK common set) | Needs a 4096² atlas, about 16MB (estimated) | About 1.4MB (measured) |
| Scaling quality | SDF, stays sharp at any magnification | Rasterized at actual pixels, natively crisp; blurs at extreme magnification |
| Complex script shaping (Arabic joining/RTL, Indic reordering) | Supported | **Basically not something you can rely on** |
| Mental model vs. Godot | Very different | Nearly identical (`HasCharacter`/metrics APIs map directly) |

**Recommendation**: for full CJK charsets + fixed font sizes, the legacy dynamic approach is more cost-effective (the size blow-up of a TMP static atlas at this scale is essentially unavoidable); choose TMP for pure Latin / small charsets, when you need outline/glow/gradient rich text, large text-scaling animations, or support for complex scripts such as Arabic. TMP also has a Dynamic mode (likewise embeds the TTF and rasterizes at runtime); its benefit is mainly the rich-text features.

### 5.4 legacy Font import settings and placement

Import settings **must be set explicitly; do not rely on defaults**:

```csharp
var importer = AssetImporter.GetAtPath("Assets/Resources/game_font.ttf") as TrueTypeFontImporter;
importer.fontTextureCase   = FontTextureCase.Dynamic;  // rasterize on demand at runtime
importer.includeFontData   = true;                     // embed the TTF bytes in the build (critical!)
importer.fontRenderingMode = FontRenderingMode.Smooth;
importer.SaveAndReimport();
```

- **`includeFontData = false` is the easiest default-value trap to fall into**: Unity records only the font name and expects the system to have that font installed — on WebGL that means guaranteed tofu.
- **The font's `.meta` must be committed** (all import settings live in it; lose it and you get different behavior with no error), same as Godot's `.import`.
- **Fonts loaded dynamically from code must be placed in `Assets/Resources/`** — Unity strips assets not referenced by scenes/prefabs; outside `Resources/`, `Resources.Load` returns null after the build.
- **The full source font (a dozen-plus MB) must be kept outside `Assets/`** (e.g. a `tools/` directory): putting it inside gets it imported by Unity, generates a `.meta`, and it will very likely be packed into the bundle — the same problem Godot solves with `.gdignore`; Unity's answer is "don't put it in Assets at all".

### 5.5 Subsetting and the charset manifest

Subset with fontTools (`pip install fonttools`), the same pipeline as the Godot side, with two Unity differences: the character source changes from `.gd` to `Assets/Scripts/*.cs`; and **the same pass additionally emits a charset manifest** (containing only characters that actually survive into the final font) at `Assets/Resources/font_charset.txt`, for runtime missing-glyph filtering:

```python
cmap = TTFont(OUT).getBestCmap()
kept = "".join(c for c in text if ord(c) in cmap)
open(OUT_CHARSET, "w", encoding="utf-8").write(kept)
```

The script must include its own missing-glyph self-check (report when the source font lacks target characters, rather than silently dropping them).

### 5.6 Open-set text: runtime missing-glyph filtering (mandatory)

Open-set text such as leaderboard player names must filter out characters outside the subset, otherwise the screen fills with tofu. **Do not rely on legacy `Font.HasCharacter`** — on dynamic fonts there is no reliable guarantee whether it queries the source cmap or the already-rasterized cache, and a wrong bet only shows up on real devices. Instead query the charset manifest emitted by the subsetter itself (produced in the same pass as the font, so it cannot drift):

```csharp
string SafeName(string raw)
{
    if (charset == null || !charset.Ready) return raw;   // fail open, see below
    var sb = new StringBuilder(raw.Length);
    for (int i = 0; i < raw.Length; i++)
    {
        char c = raw[i];
        if (char.IsHighSurrogate(c) && i + 1 < raw.Length && char.IsLowSurrogate(raw[i + 1]))
        {
            sb.Append('□'); i++; continue;   // astral-plane code points (emoji) are never in the subset
        }
        sb.Append(charset.Has(c) ? c : '□');
    }
    return sb.ToString();
}
```

Three details:

- The replacement character `□` (U+25A1) must itself be in the subset, otherwise it turns into tofu itself.
- **C# `foreach (char c in s)` iterates by UTF-16 code unit, not by code point** — you must handle surrogate pairs by hand (GDScript's `for ch in raw` iterates by code point, which is the easiest thing to miss when porting), otherwise emoji will trigger a `char.ConvertToUtf32` exception.
- When the manifest is missing, **fail open** (return the original text) rather than replacing everything with `□`: a screen full of tofu when the file is missing is a louder signal, whereas all-`□` would be mistaken for "the filtering logic is working".

Every place that renders external text must go through this function: under the current SDK that means the leaderboard (`player.name` from `RankGetList`) and the input panel (`InputShowPanel`) echo. To fabricate test data: append `builda_mock_player=p2&builda_mock_name=<Thai/emoji name>` to the `builda dev` URL.

### 5.7 Quick reference: size and script support cost (Noto Sans SC measured reference)

| Charset | Characters | TTF size |
|---|---|---|
| UI copy + ASCII only (localized translations included) | ~370 | ~160KB |
| + GB2312 level-1 common hanzi | ~4000 | ~1.2MB |
| + Latin Extended/Cyrillic/kana/full-width | ~4400 | ~1.4MB |
| + GB2312 level-2 (rare characters, low payoff) | ~7400 | ~2.4MB |

Per-script support cost (with Noto Sans SC as source font, engine-independent): Latin Extended/Cyrillic/kana come with the source font and are nearly free to merge into the subset; Thai needs a Noto Sans Thai fallback (the whole block is only 91 characters, tiny); Korean needs Noto Sans KR (2350 common syllables, a few hundred KB); **Arabic depends on contextual joining + RTL in addition to glyphs; the legacy path is basically infeasible — use TMP and be sure to test it for real**; emoji support is not recommended, just filter to `□`. Multi-font fallback: legacy uses `fallbackFontReferences` in the `.meta`; TMP uses the Font Asset's Fallback list.

### 5.8 Workflow discipline

1. **After changing any copy (including adding translations) you must rerun the subsetting script before building** — forgetting results in tofu in the browser that is invisible in the editor. Bake subsetting into the build script (run `subset_font.py` first, then the `-batchmode` build); the charset manifest is also produced by this step, and skipping it makes missing-glyph filtering consult a stale manifest.
2. **Font acceptance is always done in a Web build** (`builda dev` + `builda_mock_lang` per language); the editor Game view has system font fallback and cannot be used as evidence.
3. Brand names such as the game title may be left untranslated, but decide that deliberately rather than by omission.

### 5.9 Porting from Godot: three text-rendering pitfalls (pure Unity projects can skip)

- **Different positioning reference**: in Godot `draw_string`, `pos.y` is the text baseline, while uGUI `Text` aligns to the rect's top edge — copying coordinates directly shifts everything by one ascent; convert using `font.ascent * (size / font.fontSize)`.
- **On a dynamic font, `font.ascent` may be 0 before any glyph has been rasterized**, which breaks the conversion above; you must add a fallback (e.g. `size * 0.8f`).
- **Different outline mechanisms**: Godot's `outline_size` is a true outline (contour expansion), while the uGUI `Outline` component is four offset copies; a large `effectDistance` looks fuzzy and blocky (around `(2,2)` readability is acceptable); for a true outline use TMP's SDF outline.

## 6. SDK integration at a glance

The C# wrapper layer is in `Assets/Builda/` (installed by `builda sdk install`):

```csharp
using Builda;

BuildaSDK.Whoami(result => {
    if (result.Ok) Debug.Log(result.DataMap["name"]);
});
BuildaSDK.KvSet("save_slot1", bytes);          // private save; SDK bridges via base64 internally
var lang = BuildaSDK.RuntimeLanguage();        // synchronous: "en" / "zh" / "es-419"
var safe = BuildaSDK.RuntimeSafeArea();        // notch/capsule safe area adaptation
```

privateKV keys accept `^[A-Za-z0-9_:-]{1,64}$`; payment `payId` and leaderboard `rankId` accept `^[A-Za-z0-9_-]{1,64}$`. `:` is a legacy-compatibility character for privateKV; `.`, `+`, `/`, spaces, `$` and non-ASCII characters are deterministically rejected. When you get such a parameter error, stop retrying and fix the identifier; do not automatically delete old keys.

- Async APIs take an `Action<BuildaResult>` callback (invoked back on the main thread after the JS Promise completes); sync APIs return directly.
- For microphone voice control, prefer the **built-in `BuildaMic` component** (`Assets/Builda/Runtime/BuildaMic.cs`; attach it to a persistent object, call `StartMic()` in a tap callback; it has a built-in two-gesture state machine; read `Volume`/`Pitch` each frame); the analysis Worker is in `Assets/StreamingAssets/builda-mic/` (an algorithm the project owns and may freely modify; Unity builds include it automatically). `BuildaSDK.MicStart/MicRead/MicStop` are low-level passthroughs not recommended for direct use.
- In the editor / non-WebGL platforms every call returns an `UNSUPPORTED` failure result without throwing — write game logic normally and use `builda dev` for integration testing.

## 7. Common pitfalls

- **Compression enabled without Decompression Fallback checked** → upload rejected (`.br`/`.gz` not on the whitelist). Check Fallback or switch to Disabled.
- **Switched WebGL Template and forgot the SDK reference** → `index.html 未注入 Builda SDK` error (index.html has no Builda SDK injected). Add `<script src="builda-sdk.js"></script>` to the template `<head>`.
- **Packaging the project directory along with the build** (`Assets/`, `Library/`, `ProjectSettings/`) → validation hard-rejects. Package only the contents of the build output directory.
- **`.meta` files mixed into StreamingAssets** → validation hard-rejects. Unity builds never copy `.meta` files; their presence means a manual copy — just delete them.
- **Memory over 1GiB** → fails to start in mobile WebViews. Compress assets or lower Maximum Memory Size.
- **Content changed but version/md5 unchanged** → the App hits the old cache. Whenever content changes, run the full `builda upload-build` flow again.
- **Text turns to tofu only in the Web build, fine in the editor** → the editor has system font fallback, the build does not. The font was not embedded (the `includeFontData` default trap) or copy was changed without rerunning the subsetting script; see §5.
- **Materials created at runtime silently fail to render on WebGL** (fine in the editor, zero console errors) → shader variants were stripped by the build; see §7.1.

### 7.1 Shader variant stripping: materials created at runtime silently fail to render on WebGL

**Symptom combination (highly distinctive)**: editor Play Mode is completely fine (including `-batchmode` tests), but in the WebGL build some class of objects never appears — typically instanced meshes drawn with `Graphics.DrawMeshInstanced`; the browser console has **zero errors**, there is no magenta shader, game logic keeps running, purely the rendering is lost.

**Root cause**: the build decides which shader variants to keep based on "assets it can scan at build time" (Graphics settings default to `Instancing Stripping = Strip Unused`). When a material is **created by runtime code** (e.g. `new Material(shader) { enableInstancing = true }`) and no `.mat` asset in scenes or Resources references that shader with the matching configuration, `multi_compile` variants such as instancing get stripped; at runtime, when the variant cannot be found, drawing is **silently skipped** — no error, no fallback, no magenta, completely unlike the magenta appearance of an ordinary missing shader. In the editor variants are always fully compiled, so no in-editor test can catch it; it only reproduces in a real WebGL build.

**Fix (choose one; the first is recommended)**:

- Set `Project Settings → Graphics → Shader Stripping → Instancing Variants` to **Keep All** (corresponds to `m_InstancingStripping: 2` in `ProjectSettings/GraphicsSettings.asset`). The size cost is usually only a few KB.
- Or create a placeholder `.mat` asset with Enable Instancing checked, place it in Resources and have it reference the shader, so Strip Unused can scan it — this works but implicitly depends on a "seemingly useless" asset, which is less straightforward than an explicit Keep All.

**Troubleshooting checklist**:

1. First match the symptom combination: fine in the editor + missing in WebGL + zero errors → suspect variant stripping first, not coordinate/camera/layer issues.
2. `grep m_InstancingStripping ProjectSettings/GraphicsSettings.asset` — if the value is `0` (Strip Unused) and the material is created at runtime, that confirms it.
3. Other shader features assembled at runtime get stripped the same way (fog variants, lightmap variants); the troubleshooting approach is the same.
4. When verifying the fix, be sure to **hard refresh** (Cmd+Shift+R / Ctrl+Shift+R) — Unity WebGL's UnityCache (indexedDB) caches Build files with the same name, so a normal refresh may still run the old build; local debugging with `builda dev` is affected by this cache too.
