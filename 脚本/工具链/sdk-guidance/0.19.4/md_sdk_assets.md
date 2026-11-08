<!-- builda-sdk-version: 0.19.4 -->
# Audio and Platform Asset Pack (assets.zip / res)

Public API:

- `Builda.assets.url(path)`
- `Builda.audio.playBGM(path, opts)`
- `Builda.audio.stopBGM()`
- `Builda.audio.playSFX(path, opts)`
- `Builda.audio.vibrate(level)` (vibration strength 1 light / 2 medium / 3 heavy)

Audio needs no "first-tap unlock": on the real-device runtime, `Builda.audio.*` is implemented natively by the host App and is not subject to the browser autoplay policy, so BGM can play as soon as the game is entered, so **do not** copy the web-game convention of "tap anywhere to enable sound" as a guide overlay or first-interaction unlock logic. The mock in local `builda dev` uses the browser `Audio`, which the browser autoplay policy may block until the first interaction — this is a development-environment phenomenon, not real-device behavior; do not change game logic for it.

Local mock:

- On the real-device runtime, audio playback should call `Builda.audio.*`; the SDK prefers the Builda App bridge (native implementation, no autoplay restriction, no first-tap unlock needed); the local browser mock uses the browser `Audio`, and returns `{ok:true,data:{available:false}}` when there is no `Audio` environment.

## Platform asset pack (audio / large assets) and the Builda App bridge

When the user's request mentions the Builda App, FMOD (or the misspelling FM0D), BGM, sound effects, external audio, CDN audio, "uploading assets separately", 3D models, the bundle being too large, dynamically loading assets, AssetBundle, ads, rewarded video, watching ads, `showRewardAds` or `onRewardAdsResultV2`, integrate per this section. Integration code still calls the Builda SDK; do not call `flutter_inappwebview.callHandler`, `window.__cysjHost` or low-level App bridge methods directly in game business code. The Builda SDK relays the app's audio/ad capabilities inside the Builda App and provides a mock during local browser development.

MVP asset pack rules:

- Only one `assets.zip` is supported, with two top-level subtrees, each handling one kind of asset:
  - `audio/**`: the host audio channel (played by the Builda App/FMOD); only `.mp3`, `.ogg`, `.wav` are allowed.
  - `res/**`: large assets the game fetches itself (3D models, textures, level data, Spine skeletons/atlases, Unity AssetBundles, Godot data-only pcks); only
    `.glb`, `.gltf`, `.bin`, `.ktx2`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.json`, `.bundle`, `.hash`, `.pck`, `.skel`, `.atlas` are allowed.
    `.pck` must be data-only: the server parses and validates it; any pck containing scripts (`.gd/.gdc/.gdns/.cs`), native libraries/GDExtension,
    encrypted content, or scenes/resources referencing scripts causes the whole pack to be rejected.
- Single file ≤32MB, total uncompressed ≤320MB, file count ≤10000.
- Not supported: script/executable content (`.js`/`.wasm`/`.html`/`.pck` are all rejected), fonts, transcoding, overwriting, deletion, GC.
- The main bundle zip must still be self-contained up to "can enter and start the core gameplay"; `res/**` is deferred-load content and does not replace the game's main bundle.
- Assets already served via `res/**` **must not also be packed into the main bundle zip** (you pay for the size twice), nor copied into the build directory; `builda dev` falls back to serving `audio/**` and `res/**` under the project-root `assets/` at same-origin paths (or specify explicitly with `--assets <dir|zip>`), so the loop closes locally. When there is no `assetsBaseUrl`, the mock SDK resolves `assets.url()` against the page's directory into an **absolute URL**, which Godot `HTTPRequest`/Unity `UnityWebRequest` can use directly, consistent with real-device behavior; when audio fails to load, the mock prints the full URL with `console.warn` in the browser console — if there is no sound, check the console and the `dev-assets=` output line first.

Recommended directory:

```text
assets/
  audio/
    bgm/main.mp3
    sfx/hit.ogg
  res/
    models/car.glb
    textures/wall.ktx2
```

Packaging (only pack subtrees that actually exist):

```bash
cd assets
zip -r ../assets.zip audio res
cd ..
./.builda-agent/builda assets check assets.zip
./.builda-agent/builda assets upload assets.zip
```

After a successful `assets upload`, `assetsVersion`, `assetsBaseUrl` and `assetsManifestUrl` are written into `builda.publish.json`. Subsequently `create-draft` or `update-draft` binds these fields to the game version. The manifest fields below are only for technical verification and troubleshooting; do not give the user a trial-play URL in the final reply:

```json
{
  "assets": {
    "version": "ast_...",
    "baseUrl": "https://.../",
    "manifestUrl": "https://.../assets.json"
  }
}
```

Godot call example:

```gdscript
func play_title_music() -> void:
	BuildaClient.builda.audio_play_bgm("audio/bgm/main.mp3", true, 0.8)

func play_hit_sound() -> void:
	BuildaClient.builda.audio_play_sfx("audio/sfx/hit.ogg", "hit", 1.0)
```

If you are not using the `BuildaClient` Autoload, you can also call the same-named methods directly on an `addons/builda/builda.gd` instance. The path passed in must be a relative path inside assets.zip, e.g. `audio/bgm/main.mp3`; do not hard-code the final CDN URL into game logic. If you really need a URL, call `Builda.assets.url("audio/bgm/main.mp3")` or the Godot wrapper `asset_url("audio/bgm/main.mp3")`.

### res/** dynamic loading of large assets (3D models, etc.)

When the user complains that the bundle is too large, the upload exceeds the limit, or wants "asset splitting / dynamic loading", first read the full topic: `./md_bundle_size.md` (diagnosis methods, move-out decisions, the full set of slimming techniques for audio/fonts/textures/engine export, the pre-upload checklist, and Godot asset-splitting pitfalls in practice — Web download-to-disk, static reference chains, preset generation, on-demand loading audit).

The key difference between `res/**` and `audio/**`: audio is played by the host App, while `res/**` is **fetched by the game code itself**. Uniform rules:

- Use only relative paths + `Builda.assets.url("res/models/car.glb")` to fetch the URL at runtime (Godot side `asset_url(...)`, Unity side `BuildaSDK.AssetsUrl(...)` / `BuildaSDK.AssetsBaseUrl()`); **never hard-code CDN URLs** — `assetsBaseUrl` changes on every re-upload.
- Load failures must be perceivable and retryable (progress bar/placeholder/retry button); white screens or hangs are not allowed; before release, really test the failure branch offline in `builda dev`.
- It is recommended to prefetch the current level's assets concurrently at startup and show progress, rather than pulling them one by one midway through play.

Per-engine integration:

- **Godot** (two routes, pick one):
  - data-only `.pck` (recommended, native and efficient): in Godot, export a resource-only pck (Export PCK + resource filter, **do not tick any scripts**); at runtime `HTTPRequest` downloads → write to `user://` → `ProjectSettings.load_resource_pack()` mounts into `res://` → use with a normal `load()`. It consumes imported resources (`.ctex`/serialized mesh), faster than parsing glb at runtime. Hard constraints: the pck must not contain `.gd/.gdc/.gdns/.cs`, native libraries/GDExtension or encrypted content, and **scenes/resources must not reference scripts** — all of the above are parsed and validated by the server, and violations reject the whole pack. Compression is not a concern: RSCC-compressed resources produced by the Godot scene importer (such as the `.scn` imported from glb) are automatically decompressed and inspected by the server — for scenes that need attached logic, instead have a script in the main bundle `set_script()`/compose after instantiation. Note that mounting a pck overrides `res://` resources at the same path in the main bundle; paths must not conflict with the main bundle (unless you intentionally do an override update).
  - `.glb` runtime parsing: `HTTPRequest` fetches the URL → `GLTFDocument.append_from_buffer()` instantiates. First verify with the target Godot 4.x Web export template that the runtime gltf module works, then migrate assets in bulk.
- **HTML5 (three.js/pixi)**: `GLTFLoader` / `Assets.load` consume the URL directly, with no extra work.
- **Unity WebGL** (two routes, pick one):
  - glTFast consuming `.glb`: official package `com.unity.cloud.gltfast`. Note that WebGL has no Burst and runtime parsing is slowish; glTFast material shaders must be forced into the main bundle via a Shader Variant Collection, otherwise it looks fine in the editor but magenta on real devices.
  - AssetBundle / Addressables (recommended): inject the Addressables RemoteLoadPath at runtime from `BuildaSDK.AssetsBaseUrl()`, or use bare `UnityWebRequestAssetBundle`. Bundles must be built with **the same Unity version** as the player; WebGL uses LZ4 or no compression (LZMA fully decompresses into memory); explicitly name build artifacts with the `.bundle` extension (the Addressables catalog's `.json`/`.hash` also go in `res/**`); avoid multiple bundles embedding the same shader redundantly.
  - Textures/configs are consumed natively by `UnityWebRequest` as `.png`/`.jpg`/`.json`; **do not choose `.webp`** (Unity has no native decoding; that extension is for H5/Godot).
