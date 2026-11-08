<!-- builda-sdk-version: 0.19.4 -->
# SDK Integration (Unity)

Unity projects call platform capabilities through the C# wrapper layer `BuildaSDK` (internally bridged to `window.Builda.*` via `.jslib`; only effective in WebGL exports). Integration steps:

1. Run `./.builda-agent/builda sdk install` in the Unity project root — the C# wrapper layer and jslib bridge are installed to `Assets/Builda/`, the Builda WebGL template to `Assets/WebGLTemplates/Builda/`, and the mock SDK lands in `.builda-agent/sdk/web/` (regenerable, not committed). Unity generates `.meta` files for the new files on import; this is normal.
2. In `Player Settings → Resolution and Presentation → WebGL Template`, select **Builda** — the template `<head>` already contains `<script src="builda-sdk.js"></script>` (the SDK reference contract, hard-checked by upload validation; the zip does not package the SDK itself).
3. Game code calls the static class `BuildaSDK` in the `Builda` namespace:

```csharp
using Builda;

BuildaSDK.Whoami(result => {                       // async APIs take a callback; the result is a BuildaResult
    if (result.Ok) Debug.Log(result.DataMap["name"]);
});
BuildaSDK.KvSet("save_slot1", bytes);              // private save: value is byte[], the SDK base64-encodes it across the bridge internally
BuildaSDK.KvGet("save_slot1", r => {
    var data = BuildaSDK.KvBytes(r.Data);          // null = key does not exist
});
var lang = BuildaSDK.RuntimeLanguage();            // sync APIs return directly: "en" / "zh" / "es-419"
if (BuildaSDK.RuntimeAppVersionAtLeast("1.84.0")) { /* only use this capability when the host is new enough */ }
var safe = BuildaSDK.RuntimeSafeArea();            // safe area (notch / capsule avoidance)
BuildaSDK.AppVisibilityChanged += (visible, source) => {   // callback when the App goes to background / returns to foreground (main thread)
    if (!visible) PauseGame(); else ResumeGame();
};
```

   **You must call** `BuildaSDK.RuntimeReady(...)` **at the very start of the game** (the first thing in the first scene's `Start()`; do not wait for assets to load); if the host does not receive ready within 30 seconds of page load, it force-closes the game. For the full API see `Assets/Builda/Runtime/Builda.cs` and the example `Assets/Builda/Examples/BuildaExample.cs`; for microphone voice control, prefer the built-in `BuildaMic` component (`Assets/Builda/Runtime/BuildaMic.cs`, with a built-in two-gesture state machine; see the Unity section of `./md_sdk_mic.md`); `BuildaSDK.MicStart/MicRead/MicStop` are low-level passthroughs that are not recommended for direct use.
4. In the editor / non-WebGL platforms, all calls return an `UNSUPPORTED` failure state (no exceptions thrown), so write your logic normally; verify behavior with `builda dev`.
5. Local verification: after the WebGL export, run `./.builda-agent/builda dev --web <export dir>` and check in the test shell at `dev-url` (identity / KV / orientation / safe area / payment and ad modals, same as other engines).

The capability topics in the entry `SKILL.md` routing table (saves, payments and ads, leaderboards, safe area / capsule avoidance, localization, text input, etc.) apply to Unity as well — the semantics match `window.Builda.*`, mapped to `BuildaSDK` PascalCase methods (e.g. `pay.showPayPanel` → `PayShowPanel`); ignore the Godot wrapper method names in parentheses. For export settings (compression / memory / fonts), see the "Unity WebGL export" section and `./md_unity_webgl.md`.
