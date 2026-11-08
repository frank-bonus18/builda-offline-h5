(function () {
  const params = new URLSearchParams(window.location.search || "");
  // Dev-build identity/environment comes only from URL params (injected by builda dev). This file never hits any real server:
  // whoami/privateKV are all faked locally; the real host bridge protocol (__cysjHost/makeNativeRequest)
  // exists only in the production runtime (agent/sdk/runtime/builda-sdk.js); the mock never uses a real token.
  const gameId = String(params.get("gameId") || params.get("game_id") || "local-game");
  const bundleVersion = String(params.get("bundleVersion") || params.get("bundle_version") || "local");
  const assetsBaseUrl = String(params.get("assetsBaseUrl") || params.get("assets_base_url") || "");
  const mockPlayerId = params.get("builda_mock_player") || "local-player";
  const mockPlayerName = params.get("builda_mock_name") || mockPlayerId;
  let mockRuntimeToken = null;
  let mockServerClock = null;
  // Default avatar for the mock user (platform default avatar asset), so CPs can debug avatar loading/cropping locally
  const mockAvatar = "https://cysj2-res.hortorinteractive.com/GameCreatorTest/test/image/icon_touxiang_moren.png!mfit_400";
  const mockSafeArea = String(params.get("builda_mock_safearea") || "");
  // Current multiplayer room (maintained via the internal enterRoom/leaveRoom, see roomMock at the end); the shell shows/hides the room members button from it.
  let mockRoomId = "";
  const mockLanguage = String(params.get("builda_mock_lang") || "").trim();
  // The mock's own UI and console text: Chinese if the browser's preferred language is Chinese, otherwise always English.
  // Unrelated to builda_mock_lang (that one only simulates what the game gets from runtime.language()).
  const mockUiZh = (function () {
    try {
      const nav = typeof navigator !== "undefined" ? navigator : {};
      return /^zh\b/i.test(String((nav.languages && nav.languages[0]) || nav.language || ""));
    } catch (e) { return false; }
  })();
  function mockText(zh, en) { return mockUiZh ? zh : en; }
  // Host App version: the mock has no real host and reports "1.83.0" by default (= the last App version that does not inject
  // _appVersion, matching the runtime's no-host fallback), so local dev takes the "old host" branch by default;
  // builda_mock_app_version can override it with any value to verify new-capability branches locally.
  const mockAppVersion = String(params.get("builda_mock_app_version") || "").trim();
  const APP_VERSION_FALLBACK = "1.83.0";
  function hostAppVersion() { return mockAppVersion || APP_VERSION_FALLBACK; }
  // Keep-screen-on mock: approximates real-device behavior with the browser Screen Wake Lock API (needs a secure context https/localhost
  // and a visible page). When unsupported/refused it returns enabled:false, the same as the real-device "host does not support it",
  // so local dev can also exercise the fallback branch. When the page goes to the background the browser releases it automatically and does not re-acquire on return —
  // this is a mock approximation; on real devices the host maintains it, so do not write re-acquire logic in the game based on this.
  let mockWakeLock = null;
  let mockWakeLockWarned = false;
  // The contract requires returning {enabled:false} rather than an error when it does not take effect, so the failure reason is invisible in the return value.
  // The mock prints it to the console (once only), so authors do not mistake a browser-side restriction for "host does not support it".
  function warnWakeLockUnavailable(reason) {
    if (mockWakeLockWarned) return;
    mockWakeLockWarned = true;
    try {
      console.warn("[Builda SDK mock] " + mockText(
        "runtime.setKeepScreenOn(true) 未生效：" + reason +
        "。这是本地 mock 环境的限制，真机宿主用原生实现（Android FLAG_KEEP_SCREEN_ON / iOS idleTimerDisabled），不受此限。" +
        "游戏侧无论如何都要按返回的 enabled 分支处理——真机上也可能因为平台不支持而拿到 false。",
        "runtime.setKeepScreenOn(true) did not take effect: " + reason +
        ". This is a limitation of the local mock; the real host uses a native implementation (Android FLAG_KEEP_SCREEN_ON / iOS idleTimerDisabled) and is not affected. " +
        "The game must handle the returned enabled branch either way - on a real device it may also be false when the platform does not support it."));
    } catch (e) {}
  }
  async function mockSetKeepScreenOn(enabled) {
    if (!enabled) {
      if (mockWakeLock) {
        try { await mockWakeLock.release(); } catch (e) {}
        mockWakeLock = null;
      }
      return ok({ enabled: false });
    }
    if (mockWakeLock) return ok({ enabled: true });
    if (typeof navigator === "undefined" || !navigator.wakeLock || typeof navigator.wakeLock.request !== "function") {
      warnWakeLockUnavailable(mockText("当前浏览器没有 Screen Wake Lock API，或页面不在安全上下文（需 https 或 localhost）",
        "this browser has no Screen Wake Lock API, or the page is not in a secure context (https or localhost required)"));
      // Note: an existing API that is refused goes through the catch below; the two cases need separate hints, or authors have nowhere to start.
      return ok({ enabled: false });
    }
    try {
      mockWakeLock = await navigator.wakeLock.request("screen");
      if (mockWakeLock && typeof mockWakeLock.addEventListener === "function") {
        mockWakeLock.addEventListener("release", function () { mockWakeLock = null; });
      }
      return ok({ enabled: true });
    } catch (e) {
      mockWakeLock = null;
      // The most common pitfall in practice is an invisible page: Screen Wake Lock requires document.visibilityState === "visible";
      // headless/automation/minimized/background tabs always get NotAllowedError("The requesting page is not visible"),
      // and top-level pages are refused the same as iframes. Print the current visibility too, so authors need not guess whether it is a permission problem.
      const vis = (typeof document !== "undefined" && document.visibilityState) || "unknown";
      warnWakeLockUnavailable(String((e && e.name) || e) +
        mockText("（document.visibilityState=" + vis + "）", " (document.visibilityState=" + vis + ")") +
        (vis === "visible"
          ? mockText("；页面可见仍被拒，检查承载页是否通过 Permissions Policy 关掉了 screen-wake-lock",
            "; rejected even though the page is visible - check whether the hosting page disables screen-wake-lock via Permissions Policy")
          : mockText("；页面不可见时浏览器一定拒绝，这条能力没法在无头/后台窗口里验证，请用可见的前台窗口",
            "; browsers always reject it while the page is hidden, so it cannot be verified in a headless/background window - use a visible foreground window")));
      return ok({ enabled: false });
    }
  }
  // Same implementation as the production runtime (versionAtLeast in sdk/runtime/builda-sdk.js);
  // behavior must match exactly: missing segments count as 0, non-numeric segments count as 0, cur >= target is true.
  function versionAtLeast(cur, target) {
    const a = String(cur || "").split(".");
    const b = String(target || "").split(".");
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
      const x = parseInt(a[i], 10) || 0;
      const y = parseInt(b[i], 10) || 0;
      if (x !== y) return x > y;
    }
    return true;
  }
  // Injected by the dev shell "Deny mic" switch: simulates the user denying permission to test the no-mic fallback path
  const mockMicDenied = params.get("builda_mock_mic") === "deny";
  // The builda dev test shell (builda-dev-shell.html) injects builda_mock_shell=1 when loading the game:
  // pay/ad modals are delegated to the shell via postMessage, simulating host App panels over the WebView.
  const shellHosted = params.get("builda_mock_shell") === "1" && typeof window.parent !== "undefined" && window.parent !== window;
  let shellDialogSeq = 0;
  // Session-only mock order ledger, not persisted: iap.showPayPanel success → pending;
  // iap.claim moves pending → claimed (idempotent replay). legacy pay never enters pending.
  const mockPendingOrderIds = [];
  const mockClaimedOrderIds = [];
  let readyCalled = false;
  const audioSessions = {};
  let bgm = null;

  function ok(data) { return { ok: true, data }; }
  function fail(code, message) { return { ok: false, error: { code, message } }; }
  function persistentIdOk(key) { return typeof key === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(key); }
  function orderIdOk(id) { return typeof id === "string" && id.length > 0 && id.length <= 128; }
  function grantByOk(v) { return v === "client" || v === "room"; }
  function privateKVKeyOk(key) { return typeof key === "string" && /^[A-Za-z0-9_:-]{1,64}$/.test(key); }
  function keyOk(key) { return privateKVKeyOk(key); }
  // privateKV hard limits (consistent with the real-device host contract; all by decoded byte count)
  const KV_SINGLE_MAX = 32 * 1024;
  const KV_KEYS_MAX = 100;
  const KV_BATCH_MAX = 32;
  const KV_PREFIX = "builda:privatekv:" + gameId + ":" + mockPlayerId + ":";
  function storageKey(key) { return KV_PREFIX + key; }
  function b64FromBytes(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function bytesFromB64(b64) {
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  // Fallback to constructor-name check when instanceof fails: value may come from another realm (iframe/worker/Node vm)
  function isBytes(value) {
    return value instanceof Uint8Array || (ArrayBuffer.isView(value) && value.constructor && value.constructor.name === "Uint8Array");
  }
  // privateKV value normalization: JS accepts only Uint8Array by default; with opts.encoding==="base64" it accepts a base64
  // string (string-bridge entry points like GDScript; base64 passes straight through without a decode round-trip). Returns {b64,len}, null if invalid.
  function normalizeKvValue(value, encoding) {
    if (isBytes(value)) return { b64: b64FromBytes(value), len: value.length };
    if (encoding === "base64" && typeof value === "string") {
      try { return { b64: value, len: bytesFromB64(value).length }; } catch (_) { return null; }
    }
    return null;
  }
  function kvOut(b64, encoding) { return encoding === "base64" ? b64 : bytesFromB64(b64); }
  function checkKvKeys(keys) {
    if (!Array.isArray(keys) || keys.length === 0) return fail("BAD_KEY", "privateKV keys must be a non-empty array.");
    if (keys.length > KV_BATCH_MAX) return fail("BATCH_TOO_LARGE", "privateKV batch is limited to " + KV_BATCH_MAX + " keys.");
    for (let i = 0; i < keys.length; i++) {
      if (!keyOk(keys[i])) return fail("BAD_KEY", "privateKV key must match ^[A-Za-z0-9_:-]{1,64}$");
    }
    return null;
  }
  // {key -> decoded byte count} of existing private data; when localStorage cannot enumerate (e.g. a stripped-down Node smoke-test stub)
  // returns null and skips quota accounting (per-value/batch/key validation unaffected).
  function kvUsage() {
    const ls = window.localStorage;
    if (typeof ls.length !== "number" || typeof ls.key !== "function") return null;
    const usage = {};
    for (let i = 0; i < ls.length; i++) {
      const name = ls.key(i);
      if (typeof name !== "string" || name.indexOf(KV_PREFIX) !== 0) continue;
      const raw = ls.getItem(name) || "";
      let len = 0;
      try { len = bytesFromB64(raw).length; } catch (_) { len = raw.length; }
      usage[name.slice(KV_PREFIX.length)] = len;
    }
    return usage;
  }
  // setMany semantics match real devices: validate the whole batch (key/per-value/quota); any violation rejects the whole batch, no partial writes.
  function mockKvSetMany(entries, encoding) {
    if (!entries || typeof entries !== "object" || Array.isArray(entries)) return fail("BAD_VALUE", "privateKV entries must be a plain object.");
    const keys = Object.keys(entries);
    const bad = checkKvKeys(keys);
    if (bad) return bad;
    const normalized = {};
    for (let i = 0; i < keys.length; i++) {
      const item = normalizeKvValue(entries[keys[i]], encoding);
      if (!item) return fail("BAD_VALUE", "privateKV value must be a Uint8Array (or base64 string with encoding:\"base64\"): " + keys[i]);
      if (item.len > KV_SINGLE_MAX) return fail("VALUE_TOO_LARGE", "privateKV single value is limited to " + KV_SINGLE_MAX + " bytes: " + keys[i]);
      normalized[keys[i]] = item;
    }
    const usage = kvUsage();
    if (usage) {
      let count = 0;
      Object.keys(usage).forEach(function (k) {
        if (!(k in normalized)) count += 1;
      });
      keys.forEach(function () { count += 1; });
      if (count > KV_KEYS_MAX) return fail("QUOTA_EXCEEDED", "privateKV is limited to " + KV_KEYS_MAX + " keys per player per game.");
    }
    keys.forEach(function (k) { window.localStorage.setItem(storageKey(k), normalized[k].b64); });
    return ok({ keys: keys });
  }
  function mockKvGetMany(keys, encoding) {
    const bad = checkKvKeys(keys);
    if (bad) return bad;
    const entries = {};
    keys.forEach(function (k) {
      const raw = window.localStorage.getItem(storageKey(k));
      entries[k] = raw === null ? null : kvOut(raw, encoding);
    });
    return ok({ entries: entries });
  }
  function mockKvRemoveMany(keys) {
    const bad = checkKvKeys(keys);
    if (bad) return bad;
    keys.forEach(function (k) { window.localStorage.removeItem(storageKey(k)); });
    return ok({ keys: keys });
  }
  // This file is the [dev/mock build] (installed into projects by sdk install, served by builda dev); it runs only in the browser,
  // for CP development and testing: audio/vibration use native browser capabilities, pay/ad pop mock modals where results are picked by hand,
  // identity/KV are faked locally. It contains no real host bridge (flutter_inappwebview) code. After release, real devices load
  // the production runtime agent/sdk/runtime/builda-sdk.js (served from CDN, host bridge only, no browser fallback).
  // Both must have the same API surface (locked by the Go test TestSDKAPISurfaceConsistency).
  // Game projects must not edit this file directly — sdk install / builda check overwrite the whole file on upgrade.
  // When local dev has no assetsBaseUrl, resolve to an absolute URL using the page's directory as base:
  // browser pipelines (three/pixi relative paths) already work, but Godot HTTPRequest / Unity
  // UnityWebRequest require a full URL and bare relative paths fail with a parameter error. builda dev serves the project's
  // assets source (./assets or --assets) audio/** and res/** as a fallback at the same path,
  // so there is no need to copy them into the build directory. The real-device runtime does not do this resolution (the host injects it).
  const effectiveAssetsBase = assetsBaseUrl ||
    (typeof document !== "undefined" && document.baseURI ? new URL(".", document.baseURI).toString() : "./");
  function assetUrl(assetPath) {
    const p = String(assetPath || "").replace(/^\/+/, "");
    if (/^https?:\/\//i.test(p)) return p;
    return effectiveAssetsBase.replace(/\/?$/, "/") + p;
  }
  function audioOk(data) {
    return ok(Object.assign({ available: true }, data || {}));
  }
  // When an audio file 404s/fails to decode, browser Audio just stays silent; warn the full URL here for troubleshooting:
  // builda dev serves the project's assets source (./assets or --assets) audio/** as a fallback at the same-origin path
  function warnAudioLoadFailure(kind, url) {
    console.warn("[Builda SDK mock] " + kind + mockText(
      " 加载失败：" + url + "。确认 assets 源目录里存在该文件（builda dev 自动兜底伺服 ./assets 下的 audio/**，或用 --assets <dir|zip> 指定）。",
      " failed to load: " + url + ". Make sure the file exists in the assets source directory (builda dev serves audio/** under ./assets automatically, or pass --assets <dir|zip>)."));
  }
  // Browser autoplay policy: HTMLMediaElement.play() rejects with NotAllowedError when the page has not been activated by the user.
  // The declared type is Promise<BuildaResult>, so the rejection must not leak (if the game forgets try/catch it becomes
  // an unhandled rejection, in an inconspicuous place like "play some BGM"); fold it into available:false,
  // consistent with the "no Audio constructor" branch in the same function, and print the reason to the console. Real devices do not have this problem:
  // runtime audio goes over the bridge to native FMOD, with no autoplay policy gate.
  function warnAudioPlayRejected(kind, url, e) {
    console.warn("[Builda SDK mock] " + kind + mockText(
      " 未能播放：" + String((e && e.name) || e) +
      "（" + url + "）。浏览器自动播放策略要求页面先被用户激活——在按钮/触摸回调里触发首次播放即可。" +
      "本次按 available:false 返回。真机宿主走原生 FMOD，没有这个限制。",
      " could not play: " + String((e && e.name) || e) +
      " (" + url + "). The browser autoplay policy requires a user activation first - trigger the first playback from a button/touch callback. " +
      "Returned available:false this time. The real host uses native FMOD and has no such limit."));
  }
  // L1 microphone PCM stream primitive (docs/decisions/0012): getUserMedia → inline AudioWorklet (Blob URL,
  // worklet does zero analysis, only moves data) → postMessage(transfer) → main-thread ring buffer, pulled synchronously via mic.read().
  // No SharedArrayBuffer dependency; old WebKit without AudioWorklet falls back to ScriptProcessorNode (higher latency, still works).
  // Interruption recovery (0012 §3.3): internal listeners on track ended/mute + visibilitychange; best-effort
  // auto-rebuild on returning to foreground; if recovery fails read().state stays "interrupted", and the game re-calls the idempotent start() inside a user gesture.
  // This section is nearly identical to the production runtime (both use the browser mic); the only difference is before start: runtime does the L0
  // host handshake first, the mock asks the browser for permission directly.
  const MIC_BUFFER_MS_DEFAULT = 1000;
  const MIC_BUFFER_MS_MIN = 100;
  const MIC_BUFFER_MS_MAX = 5000;
  const MIC_WORKLET_JS =
    "class BuildaMicTap extends AudioWorkletProcessor{constructor(){super();this._chunks=[];this._len=0;}" +
    "process(inputs){var ch=inputs[0]&&inputs[0][0];if(!ch||!ch.length)return true;" +
    "this._chunks.push(new Float32Array(ch));this._len+=ch.length;" +
    "if(this._len>=512){var out=new Float32Array(this._len),o=0;" +
    "for(var i=0;i<this._chunks.length;i++){out.set(this._chunks[i],o);o+=this._chunks[i].length;}" +
    "this._chunks=[];this._len=0;this.port.postMessage(out,[out.buffer]);}return true;}}" +
    "registerProcessor('builda-mic-tap',BuildaMicTap);";
  const mic = {
    state: "idle", // idle | starting | running | interrupted
    ctx: null, stream: null, source: null, node: null,
    ring: null, cap: 0, writePos: 0, unread: 0, dropped: 0,
    sampleRate: 0, opts: null, pending: null, gen: 0, started: false, watching: false
  };
  function micWrite(block) {
    if (!mic.ring || !block || !block.length) return;
    for (let i = 0; i < block.length; i++) {
      mic.ring[mic.writePos] = block[i];
      mic.writePos = (mic.writePos + 1) % mic.cap;
      if (mic.unread < mic.cap) mic.unread += 1;
      else mic.dropped += 1; // drop-oldest: overwrite the oldest unread samples
    }
  }
  function micTeardown() {
    if (mic.stream) { mic.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (_) {} }); mic.stream = null; }
    if (mic.node) {
      if (mic.node.port) mic.node.port.onmessage = null;
      if ("onaudioprocess" in mic.node) mic.node.onaudioprocess = null;
      try { mic.node.disconnect(); } catch (_) {}
      mic.node = null;
    }
    if (mic.source) { try { mic.source.disconnect(); } catch (_) {} mic.source = null; }
    if (mic.ctx) { try { mic.ctx.close(); } catch (_) {} mic.ctx = null; }
  }
  function micInterrupted() {
    if (mic.state === "running") mic.state = "interrupted";
  }
  function micRebuild() {
    if (mic.pending || mic.state !== "interrupted") return;
    const live = (mic.stream ? mic.stream.getTracks() : []).filter(function (t) { return t.readyState === "live"; });
    if (live.length) {
      // mute-type interruption: the track is not dead, unmute returns to running by itself, no rebuild
      if (live.some(function (t) { return !t.muted; })) mic.state = "running";
      return;
    }
    // Rebuild also holds pending: a CP gesture re-calling start meanwhile merges into this rebuild's result, never opening two capture streams
    const gen = mic.gen;
    mic.pending = micBuild(mic.opts || {}).then(function (r) {
      mic.pending = null;
      if (mic.gen !== gen) { micTeardown(); return r; } // stopped during rebuild: tear down the newly built stream
      if (r.ok) { mic.state = "running"; }
      return r;
    }, function (e) {
      mic.pending = null;
      return fail("MIC_UNAVAILABLE", String(e && e.message || e || "mic rebuild failed."));
    });
  }
  function micWatchLifecycle() {
    if (mic.watching || typeof document === "undefined" || typeof document.addEventListener !== "function") return;
    mic.watching = true;
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState !== "visible") return;
      if (mic.ctx && mic.ctx.state !== "running") { try { mic.ctx.resume(); } catch (_) {} }
      micRebuild();
    });
  }
  async function micBuild(opts) {
    const md = (typeof navigator !== "undefined" && navigator.mediaDevices) || null;
    if (!md || typeof md.getUserMedia !== "function") return fail("MIC_UNAVAILABLE", "getUserMedia is unavailable (no secure context or unsupported).");
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return fail("MIC_UNAVAILABLE", "AudioContext is unavailable in this environment.");
    let stream;
    try {
      // The three WebRTC processing options must be explicitly disabled (Chromium enables all by default): when the game plays BGM, AEC cancels the voice along with
      // the "echo" and noise suppression flattens what is left, producing near silence (real-device A/B: peak 0.0005 → 0.709).
      // Voice-controlled gameplay needs raw loudness; BGM bleed is handled by the CP on the analysis side (0012 §4.5), not configurable by CPs.
      stream = await md.getUserMedia({
        audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        video: false
      });
    } catch (e) {
      const denied = e && (e.name === "NotAllowedError" || e.name === "SecurityError");
      return fail(denied ? "PERMISSION_DENIED" : "MIC_UNAVAILABLE", String(e && e.message || e || "getUserMedia failed."));
    }
    micTeardown(); // re-entry/rebuild: tear down the old graph first
    let ctx;
    try { ctx = opts.sampleRate ? new AC({ sampleRate: opts.sampleRate }) : new AC(); } catch (_) { ctx = new AC(); }
    try { await ctx.resume(); } catch (_) {}
    mic.ctx = ctx;
    mic.stream = stream;
    mic.sampleRate = ctx.sampleRate; // actual sample rate follows the AudioContext (the requested value is not guaranteed)
    const ms = parseInt(opts.bufferMs, 10);
    const bufferMs = Math.min(Math.max(isFinite(ms) && ms > 0 ? ms : MIC_BUFFER_MS_DEFAULT, MIC_BUFFER_MS_MIN), MIC_BUFFER_MS_MAX);
    mic.cap = Math.max(1, Math.round(ctx.sampleRate * bufferMs / 1000));
    mic.ring = new Float32Array(mic.cap);
    mic.writePos = 0;
    mic.unread = 0;
    stream.getTracks().forEach(function (t) {
      t.addEventListener("ended", micInterrupted);
      t.addEventListener("mute", micInterrupted);
      t.addEventListener("unmute", function () { if (mic.state === "interrupted" && mic.stream === stream) mic.state = "running"; });
    });
    mic.source = ctx.createMediaStreamSource(stream);
    let workletReady = false;
    if (ctx.audioWorklet && typeof AudioWorkletNode === "function" && typeof Blob === "function" && typeof URL !== "undefined" && URL.createObjectURL) {
      const blobUrl = URL.createObjectURL(new Blob([MIC_WORKLET_JS], { type: "application/javascript" }));
      try {
        await ctx.audioWorklet.addModule(blobUrl);
        const node = new AudioWorkletNode(ctx, "builda-mic-tap", { numberOfInputs: 1, numberOfOutputs: 0 });
        node.port.onmessage = function (ev) { micWrite(ev.data); };
        mic.source.connect(node);
        mic.node = node;
        workletReady = true;
      } catch (_) {
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
    }
    if (!workletReady) {
      // old WebKit fallback: ScriptProcessorNode (output stays silent, only drives the capture callback)
      const sp = ctx.createScriptProcessor(2048, 1, 1);
      sp.onaudioprocess = function (ev) { micWrite(ev.inputBuffer.getChannelData(0)); };
      mic.source.connect(sp);
      sp.connect(ctx.destination);
      mic.node = sp;
    }
    micWatchLifecycle();
    return ok({ sampleRate: mic.sampleRate, channels: 1 });
  }
  function micRead(opts) {
    opts = opts || {};
    if (!mic.started || !mic.ring) return fail("MIC_NOT_STARTED", "call mic.start() first.");
    let n = mic.unread;
    const max = parseInt(opts.maxSamples, 10);
    if (isFinite(max) && max >= 0 && max < n) n = max;
    const out = new Float32Array(n); // independent copy (not a ring-buffer view); the caller may postMessage(transfer) it
    const startPos = (mic.writePos - mic.unread + mic.cap) % mic.cap;
    for (let i = 0; i < n; i++) out[i] = mic.ring[(startPos + i) % mic.cap];
    mic.unread -= n;
    const dropped = mic.dropped;
    mic.dropped = 0;
    return ok({
      samples: opts.encoding === "base64" ? b64FromBytes(new Uint8Array(out.buffer)) : out,
      sampleRate: mic.sampleRate,
      dropped: dropped,
      state: mic.state === "running" ? "running" : "interrupted"
    });
  }
  async function micStop() {
    mic.gen += 1; // invalidate in-flight start/rebuild (its new stream is torn down by the gen guard)
    micTeardown();
    mic.state = "idle";
    mic.started = false;
    mic.ring = null;
    mic.cap = 0;
    mic.writePos = 0;
    mic.unread = 0;
    mic.dropped = 0;
    mic.opts = null;
    return ok({});
  }
  function micStart(opts) {
    opts = opts || {};
    if (mic.state === "running") return Promise.resolve(ok({ sampleRate: mic.sampleRate, channels: 1 }));
    // In-flight dedupe: concurrent/repeated start (including during auto-rebuild) merges into the same startup result, never returning a transient
    // BUSY — proven in the first CP integration: a transient BUSY gets treated as a permanent denial; error codes express only real failures.
    if (mic.pending) return mic.pending;
    mic.pending = (async function () {
      const prev = mic.state;
      const gen = mic.gen;
      try {
        if (mockMicDenied) return fail("MIC_UNAVAILABLE", "microphone unavailable (denied or missing); show a blocking prompt with retry.");
        mic.state = "starting";
        mic.opts = { sampleRate: opts.sampleRate, bufferMs: opts.bufferMs };
        const result = await micBuild(mic.opts);
        if (mic.gen !== gen) { micTeardown(); mic.state = "idle"; return fail("MIC_NOT_STARTED", "mic.stop() was called during start."); }
        if (result.ok) { mic.state = "running"; mic.started = true; mic.dropped = 0; }
        else { mic.state = prev; }
        return result;
      } finally {
        mic.pending = null;
      }
    })();
    return mic.pending;
  }
  // L0 permission probe mock: probe with getUserMedia and release immediately, passing through the browser's permission result
  // opts.timeoutMs must really take effect: getUserMedia **never settles** when the permission prompt cannot show or the user never chooses,
  // and UI awaiting it hangs forever (button stuck disabled, no feedback at all).
  // Timeout semantics match the runtime's nativeRequest exactly — default 120000ms, timeout returns fail("PENDING", ...).
  // Not "TIMEOUT": if the two sides used different error codes, game code branching on code would behave differently on mock and real devices.
  async function mockRequestMicrophone(opts) {
    opts = opts || {};
    if (mockMicDenied) return ok({ available: false });
    const md = (typeof navigator !== "undefined" && navigator.mediaDevices) || null;
    if (!md || typeof md.getUserMedia !== "function") return ok({ available: false });
    const ms = typeof opts.timeoutMs === "number" && opts.timeoutMs > 0 ? opts.timeoutMs : 120000;
    const stopTracks = function (stream) {
      if (!stream || typeof stream.getTracks !== "function") return;
      stream.getTracks().forEach(function (t) { try { t.stop(); } catch (_) {} });
    };
    const gum = md.getUserMedia({ audio: true, video: false });
    let timer = null;
    let timedOut = false;
    try {
      const probe = await Promise.race([
        gum,
        new Promise(function (_, reject) {
          timer = setTimeout(function () { timedOut = true; reject(null); }, ms);
        })
      ]);
      stopTracks(probe);
      return ok({ available: true });
    } catch (e) {
      if (timedOut) {
        // A late resolve must be cleaned up too: if the track is not stopped, the mic stays occupied and the system recording indicator stays on.
        Promise.resolve(gum).then(stopTracks, function () {});
        console.warn("[Builda SDK mock] " + mockText(
          "requestMicrophone 等待权限决定超时（" + ms +
          "ms）。浏览器 getUserMedia 在弹窗无法呈现或用户不做选择时不会 settle；" +
          "已按 PENDING 返回，避免调用方永久挂起。",
          "requestMicrophone timed out waiting for the permission decision (" + ms +
          "ms). Browser getUserMedia never settles when the prompt cannot show or the user makes no choice; " +
          "returned PENDING so the caller does not hang forever."));
        return fail("PENDING", "Timed out waiting for the microphone permission decision.");
      }
      return ok({ available: false });
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  }
  // Dev shell "Mic interruption" switch (protocol builda:mock-mic): interrupt stops the track to simulate an incoming call/session
  // preemption; recover simulates auto-rebuild on returning to foreground (same as the 0012 §3.3 visibilitychange path).
  if (shellHosted && typeof window.addEventListener === "function") {
    window.addEventListener("message", function (ev) {
      if (ev.origin !== window.location.origin) return;
      const msg = ev.data;
      if (!msg || msg.type !== "builda:mock-mic") return;
      if (msg.action === "interrupt" && mic.state === "running") {
        micTeardown();
        mic.state = "interrupted";
      }
      if (msg.action === "recover") micRebuild();
    });
  }
  // ---- events: host/browser events → game callbacks (subscription style, alongside the request-style APIs) ----
  // Currently only appVisibility: App minimized/backgrounded/screen locked → {visible:false}, back to foreground → {visible:true}.
  // On real devices two sources are unified (host onAppEvent push source:"host" + browser visibilitychange fallback
  // source:"browser", deduped by visible state); the mock's browser path is the same (switching tabs/minimizing the window fires it),
  // the host push is simulated by the test shell "Background" button via postMessage (protocol builda:mock-app), also reporting source "host",
  // so games can see both sources locally. Handler exceptions are swallowed and do not affect other subscribers; unknown event names may be subscribed
  // (forward compatible: older SDKs silently never fire). on returns an unsubscribe function. Logic kept identical to the production runtime.
  // pausePanel: host "Paused" panel (the same panel shown by capsule ✕ / game quitGame) shown → {visible:true},
  // closed without exiting → {visible:false}; on real devices it comes only from host pushes (onAppEvent pausePanelShow/Hide), no browser
  // fallback. The mock simulates it via the test shell's capsule button / "Continue game" over the same builda:mock-app protocol. Orthogonal to appVisibility;
  // games pause if any source pauses and resume only when all have resumed.
  const eventListeners = {};
  let appVisible = true;
  let appVisibilityWatching = false;
  let pausePanelVisible = false;
  let shellAppListenerInstalled = false;
  function eventHandlers(name) {
    return eventListeners[name] || (eventListeners[name] = []);
  }
  function emitEvent(name, payload) {
    eventHandlers(name).slice().forEach(function (handler) {
      try { handler(payload); } catch (e) { try { console.error("[Builda SDK mock] events." + name + " handler failed:", e); } catch (_) {} }
    });
  }
  function setAppVisible(visible, source) {
    visible = !!visible;
    if (visible === appVisible) return;
    appVisible = visible;
    emitEvent("appVisibility", { visible: visible, source: source });
  }
  function setPausePanelVisible(visible) {
    visible = !!visible;
    if (visible === pausePanelVisible) return;
    pausePanelVisible = visible;
    emitEvent("pausePanel", { visible: visible });
  }
  // Host push simulated by the test shell (protocol builda:mock-app): action has the same name as the real-device onAppEvent cmd
  function watchShellAppEvents() {
    if (shellAppListenerInstalled || !shellHosted || typeof window.addEventListener !== "function") return;
    shellAppListenerInstalled = true;
    window.addEventListener("message", function (ev) {
      if (ev.origin !== window.location.origin) return;
      const msg = ev.data;
      if (!msg || msg.type !== "builda:mock-app") return;
      if (msg.action === "background") setAppVisible(false, "host");
      else if (msg.action === "foreground") setAppVisible(true, "host");
      else if (msg.action === "pausePanelShow") setPausePanelVisible(true);
      else if (msg.action === "pausePanelHide") setPausePanelVisible(false);
    });
  }
  function watchAppVisibility() {
    if (appVisibilityWatching) return;
    appVisibilityWatching = true;
    if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
      appVisible = document.visibilityState !== "hidden";
      document.addEventListener("visibilitychange", function () {
        setAppVisible(document.visibilityState !== "hidden", "browser");
      });
    }
    watchShellAppEvents();
  }
  function eventsOn(name, handler) {
    if (typeof name !== "string" || !name || typeof handler !== "function") return function () {};
    const list = eventHandlers(name);
    if (list.indexOf(handler) < 0) list.push(handler);
    if (name === "appVisibility") watchAppVisibility();
    if (name === "pausePanel") watchShellAppEvents();
    return function () { eventsOff(name, handler); };
  }
  function eventsOff(name, handler) {
    const list = eventListeners[name];
    if (!list) return;
    if (typeof handler !== "function") { list.length = 0; return; }
    const idx = list.indexOf(handler);
    if (idx >= 0) list.splice(idx, 1);
  }
  // Leaderboard pre-checks: rankId constraints match manifest rankBoards; score is an integer within the platform-wide range
  // (each board's own min/max is validated authoritatively by the host against the published config); limit defaults to 50, max 100.
  const RANK_SCORE_MIN = -9999999999;
  const RANK_SCORE_MAX = 9999999999;
  function rankIdOk(rankId) { return persistentIdOk(rankId); }
  function rankScoreOk(score) { return typeof score === "number" && Number.isInteger(score) && score >= RANK_SCORE_MIN && score <= RANK_SCORE_MAX; }
  function clampRankLimit(v) {
    v = parseInt(v, 10);
    if (!isFinite(v) || v < 1) v = 50;
    return Math.min(v, 100);
  }
  function rankStorageKey(rankId) { return "builda:rank:" + gameId + ":" + mockPlayerId + ":" + rankId; }
  // Input panel maxLength: default 64, SDK clamps to 256 (the host/mock then truncates authoritatively)
  function clampInputMaxLen(v) {
    v = parseInt(v, 10);
    if (!isFinite(v) || v < 1) v = 64;
    return Math.min(v, 256);
  }
  let inputPanelOpen = false;

  // The getRoleInfo mock keeps the same 50ms fixed aggregation window, 32-item batches and
  // 30-minute / 512-item LRU as the runtime; only the data source differs, and it never touches real Builda services locally.
  const ROLE_INFO_BATCH_MAX = 32;
  const ROLE_INFO_WINDOW_MS = 50;
  const ROLE_INFO_CACHE_TTL_MS = 30 * 60 * 1000;
  const ROLE_INFO_CACHE_MAX = 512;
  const roleInfoCache = new Map();
  const roleInfoQueue = new Set();
  let roleInfoWaiters = [];
  let roleInfoTimer = null;
  function roleIdOk(roleId) {
    return typeof roleId === "string" && /^[1-9][0-9]*$/.test(roleId) &&
      (roleId.length < 19 || (roleId.length === 19 && roleId <= "9223372036854775807"));
  }
  function roleInfoCacheGet(roleId) {
    const entry = roleInfoCache.get(roleId);
    if (!entry) return null;
    if (Date.now() >= entry.expiresAt) { roleInfoCache.delete(roleId); return null; }
    roleInfoCache.delete(roleId);
    roleInfoCache.set(roleId, entry);
    return entry.value;
  }
  function roleInfoCacheSet(roleId, value) {
    roleInfoCache.delete(roleId);
    roleInfoCache.set(roleId, { value: value, expiresAt: Date.now() + ROLE_INFO_CACHE_TTL_MS });
    while (roleInfoCache.size > ROLE_INFO_CACHE_MAX) roleInfoCache.delete(roleInfoCache.keys().next().value);
  }
  function mockRoleInfoSchedule() {
    if (roleInfoTimer !== null || roleInfoQueue.size === 0) return;
    roleInfoTimer = window.setTimeout(mockRoleInfoFlush, ROLE_INFO_WINDOW_MS);
  }
  function mockRoleInfoSettle(waiter, result) {
    if (waiter.done) return;
    waiter.done = true;
    if (waiter.timer !== null) window.clearTimeout(waiter.timer);
    waiter.resolve(result);
  }
  function mockRoleInfoFlush() {
    roleInfoTimer = null;
    const batch = Array.from(roleInfoQueue).slice(0, ROLE_INFO_BATCH_MAX);
    if (batch.length === 0) return;
    const profiles = {};
    batch.forEach(function (roleId) {
      roleInfoQueue.delete(roleId);
      const profile = {
        userName: roleId === mockPlayerId ? mockPlayerName : "Mock Player " + roleId,
        userImg: mockAvatar
      };
      profiles[roleId] = profile;
      roleInfoCacheSet(roleId, profile);
    });
    roleInfoWaiters.forEach(function (waiter) {
      batch.forEach(function (roleId) {
        if (!waiter.remaining.has(roleId)) return;
        waiter.remaining.delete(roleId);
        waiter.data[roleId] = profiles[roleId];
      });
      if (waiter.remaining.size === 0) {
        mockRoleInfoSettle(waiter, ok(waiter.data));
      }
    });
    roleInfoWaiters = roleInfoWaiters.filter(function (waiter) { return !waiter.done; });
    if (roleInfoQueue.size > 0) mockRoleInfoSchedule();
  }
  function getRoleInfo(roleIds, opts) {
    opts = opts || {};
    if (!Array.isArray(roleIds) || roleIds.length === 0) return Promise.resolve(fail("INVALID_REQUEST", "roleIds must be a non-empty array"));
    if (roleIds.length > ROLE_INFO_BATCH_MAX) return Promise.resolve(fail("BATCH_TOO_LARGE", "role info batch is limited to " + ROLE_INFO_BATCH_MAX + " roleIds"));
    const unique = [];
    const seen = new Set();
    for (let i = 0; i < roleIds.length; i++) {
      if (!roleIdOk(roleIds[i])) return Promise.resolve(fail("INVALID_REQUEST", "roleIds must be positive decimal strings"));
      if (!seen.has(roleIds[i])) { seen.add(roleIds[i]); unique.push(roleIds[i]); }
    }
    const data = {};
    const missing = [];
    unique.forEach(function (roleId) {
      const cached = roleInfoCacheGet(roleId);
      if (cached) data[roleId] = cached;
      else missing.push(roleId);
    });
    if (missing.length === 0) return Promise.resolve(ok(data));
    return new Promise(function (resolve) {
      const waiter = { remaining: new Set(missing), data: data, resolve: resolve, done: false, timer: null };
      if (typeof opts.timeoutMs === "number" && opts.timeoutMs > 0) {
        waiter.timer = window.setTimeout(function () {
          mockRoleInfoSettle(waiter, fail("TIMEOUT", "getRoleInfo timed out"));
          roleInfoWaiters = roleInfoWaiters.filter(function (item) { return !item.done; });
          roleInfoQueue.forEach(function (roleId) {
            let needed = false;
            for (let i = 0; i < roleInfoWaiters.length; i++) {
              if (roleInfoWaiters[i].remaining.has(roleId)) { needed = true; break; }
            }
            if (!needed) roleInfoQueue.delete(roleId);
          });
        }, opts.timeoutMs);
      }
      roleInfoWaiters.push(waiter);
      missing.forEach(function (roleId) { roleInfoQueue.add(roleId); });
      mockRoleInfoSchedule();
    });
  }
  // Mock input panel: renders "input box + Confirm/Cancel" docked at the bottom (no title bar, same shape as the real-device host), focusing a real
  // <input> to bring up the system keyboard — this is the local equivalent of real-device behavior, so it is not delegated to dev-shell (shell delegation is
  // for pay/ad panels that need no input focus). Without a DOM (Node smoke test) it returns as confirmed + defaultValue.
  function mockInputPanel(opts) {
    const maxLen = clampInputMaxLen(opts.maxLength);
    const fallback = String(opts.defaultValue || "").slice(0, maxLen);
    if (typeof document === "undefined" || !document.body) return Promise.resolve({ confirmed: true, text: fallback });
    return new Promise(function (resolve) {
      const overlay = document.createElement("div");
      overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:2147483647;display:flex;align-items:flex-end;font-family:system-ui,sans-serif;";
      const bar = document.createElement("div");
      bar.style.cssText = "background:#fff;width:100%;padding:10px 12px;display:flex;gap:8px;align-items:center;box-shadow:0 -4px 16px rgba(0,0,0,.2);";
      const field = document.createElement("input");
      field.type = "text";
      field.value = fallback;
      field.placeholder = String(opts.placeholder || "");
      field.maxLength = maxLen;
      field.style.cssText = "flex:1;font-size:15px;padding:8px 10px;border:1px solid #d1d5db;border-radius:8px;outline:none;";
      function finish(confirmed) {
        overlay.remove();
        resolve({ confirmed: confirmed, text: confirmed ? field.value.slice(0, maxLen) : "" });
      }
      function button(label, confirmed, style) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = label;
        b.style.cssText = "padding:8px 16px;border-radius:8px;border:0;cursor:pointer;font-size:14px;white-space:nowrap;" + style;
        b.addEventListener("click", function () { finish(confirmed); });
        return b;
      }
      field.addEventListener("keydown", function (ev) { if (ev.key === "Enter") finish(true); });
      bar.appendChild(field);
      bar.appendChild(button(mockText("确认", "Confirm"), true, "background:#16a34a;color:#fff;"));
      bar.appendChild(button(mockText("取消", "Cancel"), false, "background:#e5e7eb;color:#374151;"));
      overlay.appendChild(bar);
      document.body.appendChild(overlay);
      field.focus();
    });
  }
  // Modal: clicking "Success/Failure" by hand decides the mock result of pay/ad; resolve(true|false).
  // When running inside the test shell it is delegated to the shell (protocol builda:mock-dialog / builda:mock-dialog-result,
  // same-origin checked; the shell and this file ship in the same sdk zip with the same protocol version); when the game URL is opened directly it falls back to
  // an in-page dimmed modal; without a DOM (e.g. a CLI smoke script loading this file in Node) it returns success automatically.
  function mockDialog(kind, title, detail) {
    if (shellHosted) {
      return new Promise(function (resolve) {
        const id = "builda_dialog_" + (++shellDialogSeq);
        function onMessage(ev) {
          const msg = ev.data;
          if (ev.origin !== window.location.origin || !msg || msg.type !== "builda:mock-dialog-result" || msg.id !== id) return;
          window.removeEventListener("message", onMessage);
          resolve(!!msg.success);
        }
        window.addEventListener("message", onMessage);
        window.parent.postMessage({ type: "builda:mock-dialog", id: id, kind: kind, title: title, detail: detail }, window.location.origin);
      });
    }
    if (typeof document === "undefined" || !document.body) return Promise.resolve(true);
    return new Promise(function (resolve) {
      const overlay = document.createElement("div");
      overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;";
      const box = document.createElement("div");
      box.style.cssText = "background:#fff;color:#222;border-radius:12px;padding:20px 24px;min-width:260px;max-width:80vw;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.35);";
      const heading = document.createElement("div");
      heading.style.cssText = "font-size:16px;font-weight:600;margin-bottom:8px;";
      heading.textContent = title;
      const desc = document.createElement("div");
      desc.style.cssText = "font-size:13px;color:#666;margin-bottom:16px;word-break:break-all;";
      desc.textContent = detail;
      const row = document.createElement("div");
      row.style.cssText = "display:flex;gap:12px;justify-content:center;";
      function button(label, result, style) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = label;
        b.style.cssText = "padding:8px 20px;border-radius:8px;border:0;cursor:pointer;font-size:14px;" + style;
        b.addEventListener("click", function () {
          overlay.remove();
          resolve(result);
        });
        return b;
      }
      row.appendChild(button(mockText("成功", "Success"), true, "background:#16a34a;color:#fff;"));
      row.appendChild(button(mockText("失败", "Failure"), false, "background:#e5e7eb;color:#374151;"));
      box.appendChild(heading);
      box.appendChild(desc);
      box.appendChild(row);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
    });
  }

  function playerDataKeysError(keys) {
    if (!Array.isArray(keys) || !keys.length) return fail("BAD_KEY", "playerData.getMany requires a non-empty key array.");
    for (const key of keys) {
      if (typeof key !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(key) ||
          key.split("/").some(function (part) { return !part || part === "." || part === ".."; }))
        return fail("BAD_KEY", "Invalid Player Data key.");
    }
    return null;
  }
  // Dedicated immutable Player Data fixture, never privateKV or a real HTTP request.
  function mockPlayerData(keys) {
    const fixture = {
      coins: { state: "live", valueRevision: "1", schemaId: null, schemaVersion: null, value: { type: "int64", data: "0" } }
    };
    const values = Object.create(null);
    keys.forEach(function (key) { values[key] = Object.prototype.hasOwnProperty.call(fixture, key) ? fixture[key] : null; });
    return ok(JSON.parse(JSON.stringify({ meta: { gameId: gameId, roleId: "mock-role", gameVarsRevision: "1", createAt: 0, updateAt: 0,
      keys: [{ key: "coins", state: "live", valueRevision: "1", schemaId: null, schemaVersion: null, type: "int64" }] }, values: values, source: "redis" })));
  }
  window.Builda = {
    version: "0.19.4",
    runtime: {
      gameId: gameId,
      bundleVersion: bundleVersion,
      ready: async function () {
        if (!readyCalled) {
          readyCalled = true;
          console.info("[Builda SDK mock] " + mockText("收到 Builda.runtime.ready()。", "Received Builda.runtime.ready()."));
        }
        return ok({ available: false });
      },
      quit: async function () {
        return fail("HOST_UNAVAILABLE", "Builda App host bridge is unavailable.");
      },
      setKeepScreenOn: async function (enabled) {
        // Keep-screen-on switch; data.enabled is the actual effective state (semantics in the production runtime comments).
        // Real-device minimum host version is App 1.84.0 (older ones return UNSUPPORTED_CMD); the mock does not simulate this gate.
        // Scope is this game session only; the host resets it when leaving the game page, the game need not turn it off before exiting.
        return mockSetKeepScreenOn(!!enabled);
      },
      safeArea: function () {
        // Safe-area insets on four sides (CSS px), returned synchronously and bare (like assets.url, pure local data is not wrapped in Result).
        // Mock values come from the URL param injected by builda dev --safearea
        // builda_mock_safearea=top,right,bottom,left; all 0 by default (no notch).
        const parts = mockSafeArea.split(",").map(function (s) { return parseFloat(s); });
        const n = function (i) { return isFinite(parts[i]) && parts[i] > 0 ? parts[i] : 0; };
        return { top: n(0), right: n(1), bottom: n(2), left: n(3) };
      },
      capsuleMenuRect: function () {
        // Rect of the platform floating entry (general settings/pause-exit button), returned synchronously and bare: top/right are insets from the viewport's
        // top/right edges (CSS px, same semantics as safeArea), plus width/height.
        // Mock version: top = safeArea.top + 6, right 10, 160x32 — same as real devices: on the right an 80x32
        // settings/exit capsule + 8 gap + a 32x32 round chat button + 8 gap + leftmost a 32x32 room members button.
        // The members button shows only after entering a multiplayer room, but the rect **always reserves** the full 160 and does not change with room state,
        // so games need not re-layout on room changes (the shell draws these segments too).
        const saTop = parseFloat(mockSafeArea.split(",")[0]);
        return { top: (isFinite(saTop) && saTop > 0 ? saTop : 0) + 6, right: 10, width: 160, height: 32 };
      },
      language: function () {
        // Current language (BCP 47 hyphenated form), returned synchronously and bare, never an empty string. Real-device hosts give only bare language codes
        // (zh / en, no region variants), the single exception being Spanish as es-419 — the mock narrows navigator.language
        // to the same granularity (takes the primary language subtag, es* → es-419), matching the real-device value range; the URL param
        // builda_mock_lang can override it with any value (for testing language fallback logic locally) and has the highest priority.
        if (mockLanguage) return mockLanguage;
        const nav = String((typeof navigator !== "undefined" && navigator.language) || "").trim().toLowerCase();
        const primary = nav.split("-")[0];
        if (primary === "es") return "es-419";
        return primary || "en";
      },
      appVersion: function () {
        // Host Builda App version (like "1.84.0"). On real devices the host injects `_appVersion` (since App 1.84.0);
        // when missing it reports [APP_VERSION_FALLBACK]="1.83.0" (the last version that does not inject the key).
        // The mock has no host and always returns the fallback by default; the URL param builda_mock_app_version can override it,
        // to walk both branches locally. To check only whether "the host is new enough" use appVersionAtLeast().
        return hostAppVersion();
      },
      appVersionAtLeast: function (target) {
        // Whether the host version >= target; the recommended entry point for feature detection (semantics in the production runtime comments).
        // The mock is always false by default (the default version is the fallback); add builda_mock_app_version=1.84.0 to make it true.
        return versionAtLeast(hostAppVersion(), target);
      }
    },
    assets: {
      baseUrl: effectiveAssetsBase,
      url: function (path) { return assetUrl(path); }
    },
    audio: {
      playBGM: async function (path, opts) {
        opts = opts || {};
        const url = assetUrl(path);
        const loop = opts.loop !== false;
        const volume = typeof opts.volume === "number" ? opts.volume : 1;
        if (typeof Audio === "undefined") return ok({ available: false, url });
        if (bgm) { bgm.pause(); bgm = null; }
        bgm = new Audio(url);
        bgm.addEventListener("error", function () { warnAudioLoadFailure("BGM", url); });
        bgm.loop = loop;
        bgm.volume = Math.max(0, Math.min(1, volume));
        try {
          await bgm.play();
        } catch (e) {
          warnAudioPlayRejected("BGM", url, e);
          return ok({ available: false, url });
        }
        return audioOk({ url });
      },
      stopBGM: async function () {
        if (bgm) { bgm.pause(); bgm = null; }
        return audioOk({});
      },
      playSFX: async function (path, opts) {
        opts = opts || {};
        const url = assetUrl(path);
        const sessionId = String(opts.sessionId || ("sfx_" + Date.now() + "_" + Math.random().toString(16).slice(2)));
        const volume = typeof opts.volume === "number" ? opts.volume : 1;
        const loop = opts.loop === true;
        if (typeof Audio === "undefined") return ok({ available: false, url, sessionId });
        const audio = new Audio(url);
        audio.addEventListener("error", function () { warnAudioLoadFailure("SFX", url); });
        audio.loop = loop;
        audio.volume = Math.max(0, Math.min(1, volume));
        audioSessions[sessionId] = audio;
        audio.addEventListener("ended", function () { delete audioSessions[sessionId]; });
        try {
          await audio.play();
        } catch (e) {
          delete audioSessions[sessionId]; // if it did not start playing, drop the session, or stopSFX/setMuted would operate on a dead session
          warnAudioPlayRejected("SFX", url, e);
          return ok({ available: false, url, sessionId });
        }
        return audioOk({ url, sessionId });
      },
      setMuted: async function (muted, group) {
        // group defaults to "bgm" when omitted (exactly matching the production runtime). The two groups are independent:
        // SFX sessions used to be muted unconditionally along with it, making the mock much quieter than real devices — locally it looked like
        // setMuted(true, "bgm") also silenced SFX, but on real devices SFX kept playing. Each group must manage only itself.
        group = group || "bgm";
        if (bgm && group === "bgm") bgm.muted = !!muted;
        if (group === "effect") {
          Object.keys(audioSessions).forEach(function (id) { audioSessions[id].muted = !!muted; });
        }
        return audioOk({});
      },
      vibrate: async function (level) {
        // Three vibration strengths: 1 light / 2 medium / 3 strong, invalid values become 2; the browser Vibration API has no notion of strength,
        // so strengths are approximated by mapped durations (only available in some environments such as Android, and only after a user gesture).
        // Chrome blocks calls from cross-origin iframes never activated by the user and prints an Intervention; the mock just degrades.
        level = level === 1 || level === 3 ? level : 2;
        if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return ok({ available: false });
        if (navigator.userActivation && navigator.userActivation.hasBeenActive === false) return ok({ available: false });
        navigator.vibrate({ 1: 20, 2: 50, 3: 100 }[level]);
        return audioOk({});
      },
      requestMicrophone: async function (opts) {
        // L0 permission negotiation (0012 §3.1) mock: passes through the browser permission (probe then release immediately); idempotent, may be called repeatedly.
        // available:false = user denied or device has no mic (simulated by the dev shell "Deny mic" switch); the game should
        // show a clear blocking prompt and allow retry (an alternative gameplay is optional).
        if (mic.state === "running") return ok({ available: true });
        return mockRequestMicrophone(opts); // opts must be passed through: timeoutMs is publicly declared in the .d.ts
      }
    },
    mic: {
      // L1 PCM stream primitive (0012 §3.2/§3.3): mono float32 ([-1,1]), ring buffer with drop-oldest.
      // start must be called after a user gesture (autoplay policy); idempotent and re-entrant (re-calling after an interruption is a manual rebuild);
      // note that "the permission result callback is not a gesture context" (Godot polling for the result is always outside the gesture) — the standard flow is
      // two gestures: 1st tap calls requestMicrophone, 2nd tap calls start; concurrent in-flight starts are deduped and
      // merged, never returning a transient BUSY;
      // read is a synchronous bare call returning new samples since the last read (an independent copy, transferable to a Worker),
      // dropped reports the number of overwritten samples, state:"interrupted" means capture was interrupted (the SDK auto-rebuilds on returning to foreground);
      // stop is idempotent. Put heavy DSP (pitch/timbre) in the CP's own Web Worker; do not hog the main thread (0012 §4.3).
      // PCM is for local real-time analysis only; recording retention/upload is forbidden (review red line).
      start: async function (opts) {
        return micStart(opts);
      },
      read: function (opts) {
        return micRead(opts);
      },
      stop: async function () {
        return micStop();
      }
    },
    // legacy in-app purchase: auto-confirms delivery after payment and cannot recover orders whose delivery failed (never enters the pending list). New games use iap.
    pay: {
      showPayPanel: async function (saleId, opts) {
        if (!persistentIdOk(saleId)) return fail("BAD_PAY_ID", "pay id must match ^[A-Za-z0-9_-]{1,64}$");
        // Mock pay panel: shell/in-page modal; clicking "Success/Failure" by hand decides the result,
        // so CPs can run through both branches of idempotent delivery by orderId locally. The real-device pay panel is in the production runtime.
        const success = await mockDialog("pay", mockText("Mock 支付面板（legacy pay）", "Mock payment panel (legacy pay)"), "saleId: " + String(saleId || ""));
        if (!success) return ok({ success: false, orderId: "" });
        return ok({ success: true, orderId: "mock_order_" + Date.now().toString(36) });
      }
    },
    // In-app purchase (no auto-claim): successful orders enter pending and are removed after the game delivers and claims; same semantics as the runtime.
    iap: {
      showPayPanel: async function (saleId, opts) {
        opts = opts || {};
        if (!persistentIdOk(saleId)) return fail("BAD_PAY_ID", "pay id must match ^[A-Za-z0-9_-]{1,64}$");
        // The mock does not read the manifest and cannot check the declaration against config: if the game declares one it is echoed, otherwise client is simulated.
        // This echo does not verify the published config or the real order's frozen value; on real devices the order's grantBy returned by the host prevails.
        let grantBy = "client";
        if (opts.grantBy !== undefined && opts.grantBy !== null && opts.grantBy !== "") {
          if (!grantByOk(opts.grantBy)) return fail("BAD_GRANT_BY", "grantBy must be \"client\" or \"room\"");
          grantBy = opts.grantBy;
        }
        const success = await mockDialog("pay", mockText("Mock 支付面板（iap · " + grantBy + "）", "Mock payment panel (iap · " + grantBy + ")"), "saleId: " + String(saleId || ""));
        if (!success) return ok({ success: false, orderId: "" });
        const orderId = "mock_order_" + Date.now().toString(36) + "_" + mockPendingOrderIds.length;
        mockPendingOrderIds.push(orderId);
        return ok({ success: true, orderId: orderId, grantBy: grantBy });
      },
      claim: async function (orderId, opts) {
        if (!orderIdOk(orderId)) return fail("BAD_ORDER_ID", "order id must be a non-empty string of at most 128 chars");
        const idx = mockPendingOrderIds.indexOf(orderId);
        if (idx >= 0) {
          mockPendingOrderIds.splice(idx, 1);
          mockClaimedOrderIds.push(orderId);
          return ok({ orderId: orderId, status: "delivered" });
        }
        if (mockClaimedOrderIds.indexOf(orderId) >= 0) return ok({ orderId: orderId, status: "delivered" }); // idempotent replay
        return fail("UNKNOWN_ORDER", "order id is not a pending or delivered mock order");
      },
      getPendingOrderIds: async function (opts) {
        opts = opts || {};
        return ok({ orderIds: mockPendingOrderIds.slice() });
      }
    },
    ad: {
      showRewardAd: async function (posId, opts) {
        // posId is a game-defined ad slot tracking identifier (any name; no application or manifest declaration needed).
        // Mock rewarded video: shell/in-page modal; clicking "Success/Failure" by hand decides the result.
        // The real-device rewarded video and the onRewardAdsResultV2 callback are in the production runtime; the host only returns the result and grants no reward,
        // so the game grants in-game rewards itself based on success.
        const success = await mockDialog("ad", mockText("Mock 激励视频", "Mock rewarded video"), "posId: " + String(posId || ""));
        return ok({ success: !!success, transId: success ? "mock_trans_" + Date.now().toString(36) : "" });
      }
    },
    input: {
      // Opens the mock input panel (input box + keyboard, no title bar). Single instance at a time: calling again while the panel is open returns BUSY.
      showInputPanel: async function (opts) {
        opts = opts || {};
        if (inputPanelOpen) return fail("BUSY", "input panel is already open.");
        inputPanelOpen = true;
        try {
          const result = await mockInputPanel(opts);
          return ok({ confirmed: !!result.confirmed, text: String(result.text || "") });
        } finally {
          inputPanelOpen = false;
        }
      }
    },
    rank: {
      // Mock leaderboard: the board config in builda.publish.json is not available locally, so it does not check whether rankId is published,
      // does not check per-board min/max, and does not distinguish sortType/cycle — it keeps only the most recently submitted score, and the board shows
      // fixed fake opponents in descending order, so CPs can exercise the API shape and UI; real validation and best-per-cycle semantics exist only on the real-device host.
      submitScore: async function (rankId, score) {
        if (!rankIdOk(rankId)) return fail("BAD_RANK_ID", "rank id must match ^[A-Za-z0-9_-]{1,64}$");
        if (!rankScoreOk(score)) return fail("BAD_SCORE", "rank score must be an integer within [" + RANK_SCORE_MIN + ", " + RANK_SCORE_MAX + "].");
        window.localStorage.setItem(rankStorageKey(rankId), String(score));
        return ok({ rankId: rankId });
      },
      getRankList: async function (rankId, opts) {
        opts = opts || {};
        if (!rankIdOk(rankId)) return fail("BAD_RANK_ID", "rank id must match ^[A-Za-z0-9_-]{1,64}$");
        const limit = clampRankLimit(opts.limit);
        const rival = function (rank, score, n) { return { rank: rank, score: score, player: { id: "mock_rival_" + n, name: "Rival " + n, avatar: mockAvatar } }; };
        const raw = window.localStorage.getItem(rankStorageKey(rankId));
        if (raw === null) {
          return ok({ rankId: rankId, list: [rival(1, 300, 1), rival(2, 200, 2), rival(3, 100, 3)].slice(0, limit), self: null });
        }
        const score = parseInt(raw, 10) || 0;
        const list = [
          rival(1, score + 20, 1),
          rival(2, score + 10, 2),
          { rank: 3, score: score, player: { id: mockPlayerId, name: mockPlayerName, avatar: mockAvatar } },
          rival(4, score - 10, 4)
        ].slice(0, limit);
        return ok({ rankId: rankId, list: list, self: { rank: 3, score: score } });
      }
    },
    whoami: async function () {
      return ok({ id: mockPlayerId, name: mockPlayerName, avatar: mockAvatar });
    },
    requestToken: async function () {
      // Mock token: a purely locally faked shape that real services will not accept; only simulates the Runtime SDK's in-memory caching and lazy refresh.
      const now = Math.floor(Date.now() / 1000);
      if (mockRuntimeToken && now < mockRuntimeToken.expiresAt - 60) return ok(mockRuntimeToken);
      mockRuntimeToken = { token: "mock_token_" + Date.now().toString(36) + Math.random().toString(16).slice(2), expiresAt: now + 600 };
      return ok(mockRuntimeToken);
    },
    getServerTime: async function () {
      const now = Date.now();
      if (!mockServerClock || now >= mockServerClock.expiresAtMs) {
        mockServerClock = { epochMs: now, localMonoMs: now, expiresAtMs: now + 5 * 60 * 1000 };
      }
      return ok({ serverTimeMs: mockServerClock.epochMs + (Date.now() - mockServerClock.localMonoMs) });
    },
    getRoleInfo: getRoleInfo,
    // Local fixture only; stale observations never decide rewards/deductions/payments,
    // overwrite saves or replay Online server actions.
    playerData: {
      getMany: async function (keys) { return playerDataKeysError(keys) || mockPlayerData(keys); },
      listKeys: async function () { return mockPlayerData([]); }
    },
    privateKV: {
      // Private saves (current game × current player); value is an opaque byte stream (var_to_bytes recommended on the Godot side),
      // stored in localStorage as base64. Limits match the real-device host, so CPs hit quota errors already during builda dev;
      // the write-rate limit (60/min) is enforced by the real-device host and not simulated by the mock. last write wins, no versioning/CAS;
      // get returning null means the key does not exist (empty bytes are a valid value); deletion must use explicit remove/removeMany.
      get: async function (key, opts) {
        opts = opts || {};
        const result = mockKvGetMany([key], opts.encoding);
        return result.ok ? ok(result.data.entries[key]) : result;
      },
      set: async function (key, value, opts) {
        opts = opts || {};
        if (!keyOk(key)) return fail("BAD_KEY", "privateKV key must match ^[A-Za-z0-9_:-]{1,64}$");
        const entries = {};
        entries[key] = value;
        const result = mockKvSetMany(entries, opts.encoding);
        return result.ok ? ok({ key: key }) : result;
      },
      remove: async function (key) {
        const result = mockKvRemoveMany([key]);
        return result.ok ? ok({ key: key }) : result;
      },
      getMany: async function (keys, opts) {
        opts = opts || {};
        return mockKvGetMany(keys, opts.encoding);
      },
      setMany: async function (entries, opts) {
        opts = opts || {};
        return mockKvSetMany(entries, opts.encoding);
      },
      removeMany: async function (keys) {
        return mockKvRemoveMany(keys);
      }
    },
    events: {
      // Subscribe to host/browser events. on(name, handler) returns an unsubscribe function; off(name) without handler clears all subscriptions for that event.
      // appVisibility payload = {visible, source:"host"|"browser"}: when visible=false pause gameplay/timers/BGM,
      // resume when true. Fires only on state changes (deduped); no current-state replay on subscribe (initially treated as foreground).
      // pausePanel payload = {visible}: host "Paused" panel shown true / closed without exiting false;
      // games pause/resume gameplay accordingly (the host stops/resumes BGM itself). Fires only on state changes; initially treated as not shown.
      on: eventsOn,
      off: eventsOff
    }
  };
  // ---- __online: internal interface only for the Builda Online SDK, not part of the public API surface ----
  // Same shape as the production runtime (non-enumerable, not in the literal, same argument validation); the mock does not call the host — once validation passes it
  // logs to the console and returns ok, so the Online SDK can exercise the call shapes under builda dev. The internal surface is
  // locked consistent across both builds by TestSDKInternalOnlineSurface.
  function chatGroupParams(opts) {
    opts = opts || {};
    if (typeof opts.groupId !== "string" || !opts.groupId) return fail("INVALID_REQUEST", "groupId must be a non-empty string.");
    if (typeof opts.teamId !== "number" || !Number.isInteger(opts.teamId)) return fail("INVALID_REQUEST", "teamId must be an integer.");
    return ok({ groupId: opts.groupId, teamId: opts.teamId });
  }
  // enterRoom / leaveRoom: same shape as the runtime; the Online SDK notifies the host when entering/leaving a multiplayer room, params {roomId}.
  function roomParams(opts) {
    opts = opts || {};
    if (typeof opts.roomId !== "string" || !opts.roomId) return fail("INVALID_REQUEST", "roomId must be a non-empty string.");
    return ok({ roomId: opts.roomId });
  }
  // takeInviteInfo: same shape as the runtime and likewise one-shot (the first call returns the invite, then {invite:null}). The mock has no host injection;
  // the invite comes from the URL param builda_mock_invite (passed through unchanged by the shell): the value is JSON {"roomId","roleId","name","avatar"},
  // or just a roomId string (the inviter uses a fixed mock identity). Omit it for no invite.
  let mockInviteTaken = false;
  function readMockInvite() {
    const raw = String(params.get("builda_mock_invite") || "");
    if (!raw) return null;
    let v = null;
    try { v = JSON.parse(raw); } catch (_) { v = null; }
    if (!v || typeof v !== "object") v = { roomId: raw, roleId: "mock-inviter", name: "Mock Inviter", avatar: "" };
    const roomId = String(v.roomId || "");
    const roleId = String(v.roleId || v.id || "");
    if (!roomId || !roleId) return null;
    return { roomId: roomId, inviter: { id: roleId, name: String(v.name || ""), avatar: String(v.avatar || "") } };
  }
  function takeInviteInfoMock() {
    if (mockInviteTaken) return Promise.resolve(ok({ invite: null }));
    mockInviteTaken = true;
    const invite = readMockInvite();
    console.info("[Builda SDK mock] __online.takeInviteInfo " + JSON.stringify({ invite: invite }));
    return Promise.resolve(ok({ invite: invite }));
  }
  // Chat group messages: per-message callbacks {groupId, teamId, senderId, text}, same shape as the runtime. The mock has no host; messages are injected by the test
  // shell/debug code via postMessage (protocol builda:mock-chat, payload shaped like the real-device onChatGroupMessage:
  // {groupId, teamId, messages:[{senderId, text}]}), and the SDK likewise splits batches into per-message callbacks.
  const chatMessageHandlers = [];
  let chatMessageWatching = false;
  function emitChatMessage(payload) {
    chatMessageHandlers.slice().forEach(function (handler) {
      try { handler(payload); } catch (e) { try { console.error("[Builda SDK mock] __online.onChatMessage handler failed:", e); } catch (_) {} }
    });
  }
  function dispatchChatBatch(payload) {
    if (!payload || typeof payload !== "object") return;
    const groupId = String(payload.groupId || "");
    const teamId = Number(payload.teamId) || 0;
    (Array.isArray(payload.messages) ? payload.messages : []).forEach(function (m) {
      if (!m || typeof m !== "object") return;
      emitChatMessage({ groupId: groupId, teamId: teamId, senderId: String(m.senderId || ""), text: String(m.text || "") });
    });
  }
  function watchChatMessage() {
    if (chatMessageWatching || !shellHosted || typeof window.addEventListener !== "function") return;
    chatMessageWatching = true;
    window.addEventListener("message", function (ev) {
      if (ev.origin !== window.location.origin) return;
      const msg = ev.data;
      if (!msg || msg.type !== "builda:mock-chat") return;
      let payload = msg.payload;
      try { payload = typeof payload === "string" ? JSON.parse(payload) : payload; } catch (_) { payload = null; }
      dispatchChatBatch(payload);
    });
  }
  function onChatMessage(handler) {
    if (typeof handler !== "function") return function () {};
    if (chatMessageHandlers.indexOf(handler) < 0) chatMessageHandlers.push(handler);
    watchChatMessage();
    return function () { offChatMessage(handler); };
  }
  function offChatMessage(handler) {
    if (typeof handler !== "function") { chatMessageHandlers.length = 0; return; }
    const idx = chatMessageHandlers.indexOf(handler);
    if (idx >= 0) chatMessageHandlers.splice(idx, 1);
  }
  function onlineMock(params, cmd) {
    if (!params.ok) return Promise.resolve(params);
    console.info("[Builda SDK mock] __online." + cmd + " " + JSON.stringify(params.data));
    return Promise.resolve(ok({}));
  }
  function chatGroupMock(cmd, opts) { return onlineMock(chatGroupParams(opts), cmd); }
  // Multiplayer room state: same semantics as the real-device host — only one room at a time, enterRoom overwrites the current room, leaveRoom clears only
  // when the room id matches (succeeds idempotently if not in that room). The shell (shellHosted) via postMessage (protocol builda:mock-room)
  // shows/hides the room members button accordingly; capsuleMenuRect always reserves 160 regardless of room state.
  function roomMock(cmd, opts) {
    const p = roomParams(opts);
    if (p.ok) {
      if (cmd === "enterRoom") mockRoomId = p.data.roomId;
      else if (cmd === "leaveRoom" && mockRoomId === p.data.roomId) mockRoomId = "";
      if (shellHosted && window.parent && typeof window.parent.postMessage === "function") {
        window.parent.postMessage({ type: "builda:mock-room", roomId: mockRoomId }, window.location.origin);
      }
    }
    return onlineMock(p, cmd);
  }
  Object.defineProperty(window.Builda, "__online", {
    enumerable: false, configurable: false, writable: false,
    value: Object.freeze({
      joinChatGroup: function (opts) { return chatGroupMock("joinChatGroup", opts); },
      quitChatGroup: function (opts) { return chatGroupMock("quitChatGroup", opts); },
      enterRoom: function (opts) { return roomMock("enterRoom", opts); },
      leaveRoom: function (opts) { return roomMock("leaveRoom", opts); },
      takeInviteInfo: takeInviteInfoMock,
      onChatMessage: onChatMessage,
      offChatMessage: offChatMessage
    })
  });

  // Dev-time ready check: runtime.ready() must be called at the very start of the game (the real-device host force-closes the game if it has not
  // received it within 30 seconds of page load). The mock console.warns once if ready has not been received 15 seconds after load —
  // a hint only, not blocking; 15 seconds is half the real-device 30-second budget; not having called it by then means ready is too late or missing.
  // unref the timer when Node smoke tests load this file, so it does not keep the process alive.
  const readyWatchdog = setTimeout(function () {
    if (readyCalled) return;
    console.warn("[Builda SDK mock] " + mockText(
      "页面加载 15 秒后仍未收到 Builda.runtime.ready()。ready() 必须在游戏最开始调用（入口脚本/首个场景第一件事，不要等资源加载完；Godot 侧 BuildaClient.runtime_ready()），真机宿主页面加载 30 秒内没收到会强制关闭游戏。",
      "Builda.runtime.ready() still not received 15 seconds after page load. ready() must be called at the very start of the game (the first thing in the entry script / first scene; do not wait for assets to load; Godot side BuildaClient.runtime_ready()); the real host force-closes the game if it does not receive it within 30 seconds of page load."));
  }, 15000);
  if (readyWatchdog && typeof readyWatchdog.unref === "function") readyWatchdog.unref();
})();
