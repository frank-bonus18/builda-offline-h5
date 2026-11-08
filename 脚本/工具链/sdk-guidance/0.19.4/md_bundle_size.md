<!-- builda-sdk-version: 0.19.4 -->
# Game Bundle Size Optimization Guide (CP topic)

The default applied limit for the main bundle zip is **200 MiB**; a first release has no `gameId` yet, so it is also fixed at 200 MiB. For existing games owned by the current user, the server's dynamic whitelist may configure `201..500 MiB`; the compile-time ceiling is still 500 MiB. The CLI must not forge a `gameId`, split requests, or
bypass the Server's decision. Even with a higher quota, the Builda App still downloads the whole bundle before trial play — bundle size directly determines how long players wait to enter the game.
This document lists optimization techniques ordered "from largest to smallest payoff" and applies to all three engines (Godot Web / HTML5 / Unity WebGL).

## 0. Diagnose first, then act

Before optimizing, see clearly what the size is made of; do not go by gut feeling:

```bash
# Rank zip entries by size (top 20)
unzip -l build.zip | sort -k1 -rn | head -20
# Or for the export directory
du -ah build/web | sort -rh | head -20
```

The usual big items, in order: 3D models, audio, fonts, textures/atlases, source files mistakenly packed into the bundle. Match them up category by category.

## 1. Move large assets out to res/** (largest payoff)

Assets that **do not need to be ready on the first screen**, such as 3D models, large textures and level data, should not go into the main bundle — put them in the `res/**` subtree of `assets.zip`, upload to the CDN, and load them dynamically after the game starts:

- Whitelist: `.glb .gltf .bin .ktx2 .png .jpg .jpeg .webp .json .bundle .hash .pck .skel .atlas`; limits: single file ≤32 MiB, total uncompressed ≤320 MiB, file count ≤10000. `.pck` must be data-only (no scripts/native code/encryption, scenes must not reference scripts; the server parses and validates it).
- Game code fetches the URL at runtime with `Builda.assets.url("res/models/car.glb")` (Godot side `asset_url(...)`, Unity side `BuildaSDK.AssetsUrl(...)`); **never hard-code CDN URLs**.
- Per-engine integration (Godot `GLTFDocument` / H5 consumes the URL directly / Unity glTFast or Addressables), upload commands, local debugging and failure-handling requirements are in the SKILL section "res/** dynamic loading of large assets"; not repeated here.
- Assets that have been moved out **must be deleted from the main bundle zip**, otherwise you pay for the size twice.
- Baseline: the main bundle must still be self-contained up to "can enter and start the core gameplay"; `res/**` is deferred content, and load failures must be perceivable and retryable.

## 2. Move audio out and compress it

- Audio played through the Builda App/FMOD goes in the `audio/**` of `assets.zip` (`.mp3/.ogg/.wav`) and does not take main-bundle space.
- Whether in the main bundle or not: BGM at around 128kbps `.mp3`/`.ogg` is enough; keep `.wav` only for very short sound effects; long sound effects can be downmixed to mono.
- Godot note: audio for FMOD **must not be stuffed into a `.pck`** (native code cannot read it, see `md_cysj_app.md`); loose files also make size easier to control.

## 3. Fonts (CJK is the hardest-hit area)

- A full CJK font is 10–20MB; **never put it directly into the bundle**. Godot/Unity subset it with fontTools; the full workflow is in `./md_godot_i18n.md` (Godot) and chapter 5 of `./md_unity_webgl.md` (Unity).
- HTML5 (pixi/phaser/canvas) games should **prefer system fonts**; Chinese usually needs no bundled font file at all.
- The platform provides no shared fonts, and fonts cannot be pulled from an external CDN (COEP blocks it), so "subset and ship in the bundle" is the only correct path.

## 4. Textures and images

- Control source dimensions: on a phone screen, a single image of 2048×2048 or larger is basically waste; pack UI slices into atlases.
- Use `.jpg`/`.webp` for photo-like images (note Unity has no native webp decoding), and `.png` only when an alpha channel is needed; for huge background images consider `.ktx2` GPU-compressed textures (they can also be moved out to `res/**`).
- Clean up before export: art source files (`.psd/.blend/.fbx` originals) and super-resolution originals must not appear in the export directory.

## 5. Engine-side export slimming

- **Godot**: in the export preset, use resource filters to pack only actually referenced resources; check whether the `.pck` contains editor-only assets or test scenes; export with the release template, not debug.
- **Unity WebGL**: enable Managed Stripping (High) and Strip Engine Code; configure build compression and memory settings per the export chapter of `./md_unity_webgl.md`; remove unused packages (Analytics, test frameworks) from the project.
- **HTML5**: disable sourcemaps (a `.map` in the zip is rejected outright by bundle-check); enable tree-shaking/minify in the build tool; `node_modules` must never go into the bundle.

## 6. Packaging hygiene checklist

Go through this before uploading:

- [ ] Assets moved out to `res/**` / `audio/**` are not in the main bundle zip
- [ ] No `.map`, `node_modules`, source files such as `.psd/.blend`, or hidden files (`bundle-check` blocks some of these, but do not rely on it as the safety net)
- [ ] CJK fonts are subset (HTML5 uses system fonts directly)
- [ ] BGM/long sound effects have compressed bitrates
- [ ] Each of the top 20 entries in `unzip -l` is confirmed as "really needed in the first bundle"
- [ ] After unzipping the main bundle, `builda dev` can go straight into the core gameplay (the self-contained baseline is not broken)

When size approaches the server's current effective quota, go back to section 1 and keep moving assets out first; the dynamic quota is a controlled compatibility capability for existing games, not a substitute target for optimization.

## 7. Godot asset splitting in practice: pitfalls (res/** + pck)

The following lessons come from a real CP project's full asset-splitting effort (first bundle 72MB → 33MB), organized by "most likely to recur". The core lesson in one sentence: **the pitfalls on this path cannot be avoided by reading docs; every step must be verified with real artifacts in a real Web export.**

### 7.1 The correct order of work

1. **Minimal spike**: in an empty project, verify `load_resource_pack()` mounting + compressed texture format preservation (print the texture's format to confirm ETC2 is still there). Note that an empty project must first run `--headless --path <dir> --import` once to generate `.godot/`, otherwise `--script` hangs with no output.
2. **Web spike**: get download, write-to-disk and mount working in a real export + `builda dev` — all Web-only pitfalls show up in this step; finding them early saves all later rework.
3. Only then do the split layout, preset generation and loader.
4. Game integration comes last; audit the "iterate over a directory" code first (see 7.5).
5. Treat offline/failure branches **the same as** the success path, and verify them together.

### 7.2 Godot Web runtime pitfalls (the editor and native exports are all fine; only Web breaks)

- **`HTTPRequest.download_file` does not write to disk on Web**: the log shows `result=RESULT_SUCCESS`, HTTP 200, the bytes all transferred, but the file does not exist. In a Web export the response body is returned **only** through the `body` parameter of the `request_completed` signal — you must write it to `user://` yourself with `FileAccess` and verify with `file_exists()` right after writing. Any "read the file after download" logic must be verified this way, otherwise the failure silently propagates far before surfacing.
- **UID warnings are harmless**: loading resources moved out of the main bundle prints `invalid UID: 'uid://xxx' - using text path instead` — the engine automatically falls back to the text path and resolves it fine; ignore it.
- `Builda.assets.url()` returns an absolute URL (toolchain ≥0.4.1) that `HTTPRequest.request()` can use directly; before starting, run `builda check` to make sure the SDK is up to date.

### 7.3 Split strategy and platform contract

- **Split by load timing; do not make one big pack**: the 32MB single-file limit is naturally satisfied, and players who "only play the initial content" never download a single additional pack.
- **Scene boundary**: `.tscn` files with scripts always stay in the main bundle; only move out pure resources such as models/textures/audio; glb import artifacts (`.ctex`/`.mesh`/imported `.scn`) do not reference scripts and are compliant by nature. Compressed imported `.scn` (RSCC) and export artifacts such as the `project.binary` that `--export-pack` always includes are already handled correctly by the server; no stripping or re-saving is needed.
- **Self-check locally; do not use uploads for trial and error**: the server rejects the whole pack and reports only one issue at a time, so rounds of tens of MB of traffic are too expensive. Write a pck manifest parsing script to self-check each pack (list the entries in the pack in addition to `builda assets check`). Note that in pck format 4 (Godot 4.4+) the directory table is at the end of the file, with its offset as a u64 at header offset `0x20` — parsing with the old format (directory right after the header) yields 0 entries **without any error**, a false positive that silently "passes validation".

### 7.4 Build pipeline

- **The `*` in an export `exclude_filter` crosses path separators** (`String.matchn` semantics); there is no "match a single level only" syntax; and filters can only exclude, not include — hand-writing multiple split presets is bound to go wrong. Generate all presets with a script from a **single split manifest**; resources not listed in the manifest stay in the main bundle by default (the safe default).
- **`all_resources` packs every resource with a `.import`, even with zero references**: when splitting, review the pack manifest entry by entry and do a dead-asset audit along the way; it often frees size for free.
- **The dev pack-copy order is deliberate**: export → build the main bundle zip → **then** copy the pcks into the export directory so `builda dev` serves them same-origin. Before uploading, use `unzip -l` to confirm the main bundle zip contains no additional packs (paying for size twice is explicitly prohibited by the platform).

### 7.5 Game integration (the category most likely to recur)

- **Static reference chains must be fully cut**: when an `ext_resource` in a scene points to a resource in a deferred pack, instantiating it while the pack is not mounted yields null and often **fails silently** (typical: `AudioStreamPlayer.stream` is null and plays nothing, then works again after one round). The editor and native exports **can never reproduce it** — all resources are local there. Whenever you move a resource out of the main bundle, ask: **who else statically references it on the startup path?** This bug recurs very easily and is worth a build-time check: starting from the main scene and each deferred scene, run a **static reference reachability analysis**, and abort the build if a startup-reachable resource lands in a deferred pack. The rule must use "reachability", not "is referenced at all" — a deferred scene referencing resources in its own pack is legal, and a blanket rule produces so many false positives it becomes unusable.
- **Audit all "iterate over a directory and do something" code**: warm-up, preview and collection/codex loops are cheap with full packing, but after switching to on-demand loading every item may trigger a download — otherwise entering the lobby first pulls tens of MB. Warm-up only processes content already on disk; request only when something is actually selected.
- **Failures must be perceivable and retryable** (platform acceptance criterion): show progress while downloading, a clear message and retry entry on failure, and make requests idempotent (re-selecting = retrying). The offline branch must be really tested in `builda dev`; code review alone does not count.

### 7.6 Debugging tips

- In `--script` mode tests, autoloads are empty: `extends SceneTree` + `_init()` runs too early; use `_initialize()` + `call_deferred()`, and copy the skeleton of an existing test in the project.
- **Script Parse Errors do not make the export fail**: `build` still exits 0 and `bundle-check` is still ok, but that script is dead at runtime. Grep the build log for `SCRIPT ERROR` / `Parse Error`.
- Mounting the pck in an empty project for verification is well worth it: it is the only way to prove "the resource really comes from the pack (not a local leftover) and the compressed texture format really survived".

### 7.7 An observation that holds throughout

The right posture for this kind of integration work is to **verify every step with artifacts rather than writing code right after reading the docs**: list the pck manifest entry by entry, mount in an empty project to verify formats, and run the real Web export in `builda dev`. Together these cost less than half a day, but they are the only reliable sources of information.
