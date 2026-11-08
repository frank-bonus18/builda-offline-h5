export type BuildaResult<T> = { ok: true; data: T; requestId?: string } | { ok: false; error: { code: string; message: string }; requestId?: string };
export type BuildaPlayer = { id: string; name: string; avatar?: string };
export type BuildaAudioResult = { available: boolean; url?: string; sessionId?: string };
export type BuildaSafeArea = { top: number; right: number; bottom: number; left: number };
// setKeepScreenOn result: enabled is the actual effective state after the call, not an echo of the argument.
export type BuildaKeepScreenOn = { enabled: boolean };
export type BuildaCapsuleMenuRect = { top: number; right: number; width: number; height: number };
// legacy pay.showPayPanel: { success, orderId }. iap.showPayPanel additionally carries grantBy
// ("client" | "room"): the grant owner frozen on this order by the host from the published pay
// point. Decide from it — client: grant idempotently by orderId then iap.claim; room: hand the
// orderId to Room doOrder and do not grant or claim on the client.
export type BuildaPayPanelResult = { success: boolean; orderId: string; grantBy?: "client" | "room" };
// iap.claim result: the order's actual state after claim. client orders → "delivered" (idempotent
// replay); a room order is not changed by a client claim and comes back as "paid".
export type BuildaClaimResult = { orderId: string; status: string };
// Undelivered order ids only — no payId or grantBy. Read-only; empty array
// means none. Failures are {ok:false}, never folded into []. Do not infer
// grantBy from the current catalog or from a bare orderId; if unknown, do
// not grant on the client.
export type BuildaPendingOrderIds = { orderIds: string[] };
export type BuildaRewardAdResult = { success: boolean; transId: string };
// Input panel: the host shows only an input box + keyboard (no title bar); confirm returns the final text (moderation/truncation done host-side),
// cancel returns { confirmed: false, text: "" }. Single instance at a time; calling again while the panel is still open returns BUSY.
export type BuildaInputPanelResult = { confirmed: boolean; text: string };
export type BuildaInputPanelOpts = { placeholder?: string; defaultValue?: string; maxLength?: number; timeoutMs?: number };
// mic (docs/decisions/0012): microphone PCM stream primitive. The SDK only turns the microphone into a "pullable mono
// float32 sample stream" ([-1,1]) and does no feature analysis — pitch/volume/timbre etc. are computed by the game from the PCM
// (heavy DSP belongs in the game's own Web Worker; do not hog the main thread). requestMicrophone triggers/queries permission, idempotent;
// available:false = user denied or the device has no mic; the game should show a clear blocking prompt and allow retry (a no-mic alternative
// gameplay is optional, not required). start must be called after a user gesture
// (autoplay policy), is idempotent and re-entrant (calling again after an interruption rebuilds manually); the actual sampleRate is the returned value;
// note "the permission result callback is not a gesture context" — the standard flow is two gestures (1st tap: requestMicrophone;
// when the permission result comes back, stop at a "tap once more" prompt; 2nd tap: start); concurrent/repeated in-flight start calls are deduplicated and merged into
// the same start result, never returning a transient BUSY.
// read is a synchronous call: returns new samples since the last read; samples is an independent copy (can be transferred to a
// Worker); with encoding:"base64" it returns a base64 string of float32 LE bytes instead (for string bridges
// such as GDScript); dropped is the number of samples overwritten by the ring buffer's drop-oldest (a sign of pulling too slowly; usually harmless for real-time control,
// do not treat it as a continuous stream for recording); state:"interrupted" means capture was interrupted (incoming call/backgrounded; on return to foreground the SDK
// rebuilds automatically, best-effort; if it stays interrupted, call start again inside a user gesture). stop is idempotent.
// PCM may only be analyzed locally in real time; never retain or upload recordings — violations are treated as review incidents.
export type BuildaMicPermission = { available: boolean };
export type BuildaMicStart = { sampleRate: number; channels: 1 };
export type BuildaMicRead = { samples: Float32Array | string; sampleRate: number; dropped: number; state: "running" | "interrupted" };
// rank: leaderboards (boards are declared in rankBoards of builda.publish.json and take effect with publish review).
// rankId must match ^[A-Za-z0-9_-]{1,64}$.
// submitScore submits this round's score; the host validates it against the board config (rankId published, min/max range) and, per
// sortType, keeps each player's best score per period; getRankList returns the board's top N + your own rank
// (self null means not ranked this period). Scores are integers; platform-wide range [-9999999999, 9999999999].
export type BuildaRankEntry = { rank: number; score: number; player: BuildaPlayer };
export type BuildaRankList = { rankId: string; list: BuildaRankEntry[]; self: { rank: number; score: number } | null };
// requestToken: exchange with the host for a game-scoped short-lived token (bound to current game × current player × limited lifetime,
// never a full login session), letting the game logic layer call Builda services that require auth directly (specific services defined separately).
// The game holds it in memory only: never write it to privateKV/local files/URLs/saves; re-request it yourself before expiry.
// expiresAt is Unix seconds. The SDK caches the token in memory only for the current lifecycle and lazily refreshes it near expiry; it never persists the token.
export type BuildaTokenResult = { token: string; expiresAt: number };
export type BuildaServerTimeResult = { serverTimeMs: number };
export type BuildaRoleInfo = { userName: string; userImg: string };
export type BuildaRoleInfoMap = Record<string, BuildaRoleInfo>;
// privateKV: private save for current game × current player; value is an opaque byte stream (on the Godot side
// var_to_bytes()/bytes_to_var() recommended). With opts.encoding:"base64", values go in and out as base64 strings
// (for string bridges such as GDScript; on the JS side only Uint8Array is sent/received by default).
// Semantics: last write wins, no versioning/CAS; get returning null means the key does not exist (empty bytes are a valid value);
// setMany validates the whole batch and rejects the whole batch on any violation; writes are best-effort with no transaction guarantee; removeMany is idempotent for missing keys.
// key must match ^[A-Za-z0-9_:-]{1,64}$; new code is still recommended to use only letters, digits, _ and -.
// Limits (by decoded byte count): single value ≤ 32KB,
// ≤ 32 keys per batch, ≤ 100 live keys per player per game; no aggregate byte quota.
// The SDK does not split batches automatically; more than 32 keys returns BATCH_TOO_LARGE.
// events: subscription callbacks (alongside the request-style APIs). appVisibility gives {visible:false} when the App is
// minimized/backgrounded/screen-locked and {visible:true} on return to foreground; fires only on state changes (deduplicated); subscribing does not replay the current
// state (initially treated as foreground). source:"host" means pushed by the Builda App host (precise); "browser" means from the
// WebView's document.visibilitychange fallback (switching tabs under local builda dev triggers it).
// Typical use: pause gameplay/timers/BGM when visible=false, resume when true; do not do network writes or show popups on false.
// pausePanel: when the host's "Paused" panel (top-right ✕ / the same panel the game's quitGame pops up) is shown, gives
// {visible:true}; when closed without quitting, gives {visible:false}; an actual quit does not fire (the page is destroyed directly). Host push only,
// no browser fallback; fires only on state changes, initially treated as not shown. Orthogonal to appVisibility: backgrounding while the panel is open fires
// both; the game handles it as "pause if either is paused". The host pauses/resumes BGM itself; the game only needs to pause gameplay and timers.
// on returns an unsubscribe function; off(name) without a handler clears all subscriptions for that event. A handler throwing does not affect other subscribers.
export type BuildaAppVisibility = { visible: boolean; source: "host" | "browser" };
export type BuildaPausePanel = { visible: boolean };
export type BuildaEventMap = { appVisibility: BuildaAppVisibility; pausePanel: BuildaPausePanel };
export type BuildaEventName = keyof BuildaEventMap;
export interface BuildaEvents {
  on<K extends BuildaEventName>(name: K, handler: (payload: BuildaEventMap[K]) => void): () => void;
  off<K extends BuildaEventName>(name: K, handler?: (payload: BuildaEventMap[K]) => void): void;
}
export type BuildaKVValue = Uint8Array | string;
export type BuildaKVEntries = Record<string, Uint8Array | string | null>;
export type BuildaKVOpts = { timeoutMs?: number; encoding?: "base64" };

export interface BuildaPrivateKV {
  get(key: string, opts?: BuildaKVOpts): Promise<BuildaResult<Uint8Array | string | null>>;
  set(key: string, value: BuildaKVValue, opts?: BuildaKVOpts): Promise<BuildaResult<{ key: string }>>;
  remove(key: string, opts?: { timeoutMs?: number }): Promise<BuildaResult<{ key: string }>>;
  getMany(keys: string[], opts?: BuildaKVOpts): Promise<BuildaResult<{ entries: BuildaKVEntries }>>;
  setMany(entries: Record<string, BuildaKVValue>, opts?: BuildaKVOpts): Promise<BuildaResult<{ keys: string[] }>>;
  removeMany(keys: string[], opts?: { timeoutMs?: number }): Promise<BuildaResult<{ keys: string[] }>>;
}

/** Player Data is a possibly stale stored observation of the current player, not
 * authoritative gameplay state. Neither revision nor source proves freshness.
 * Online game server actions decide rewards, deductions, stealing and payments;
 * never overwrite a save or replay a successful action from a later stale read.
 * Failure is not an empty save or zero balance. Server secrets must not be stored
 * in fields exposed to this read API. privateKV is an independent byte store.
 */
export type BuildaPlayerDataValue =
  | { type: "bool"; data: boolean } | { type: "int64"; data: string }
  | { type: "float64"; data: number } | { type: "string" | "bytes"; data: string }
  | { type: "object"; data: Record<string, BuildaPlayerDataValue> };
export type BuildaPlayerDataEntry = { state: "live" | "tombstone"; valueRevision: string;
  schemaId: string | null; schemaVersion: number | null; value: BuildaPlayerDataValue | null };
export type BuildaPlayerDataKey = { key: string; state: "live" | "tombstone"; valueRevision: string;
  schemaId: string | null; schemaVersion: number | null; type: BuildaPlayerDataValue["type"] | null };
export type BuildaPlayerDataObservation = {
  meta: { gameId: string; roleId: string; gameVarsRevision: string; createAt: number; updateAt: number;
    keys: BuildaPlayerDataKey[] } | null;
  values: Record<string, BuildaPlayerDataEntry | null>;
  source: "redis" | "mongo" | null;
};
export interface BuildaPlayerData {
  /** Non-empty keys; reads only this player's possibly stale stored data.
   * Do not decide rewards/deductions/stealing/payments, overwrite saves, or replay
   * Online server actions from this observation. Failure is not an empty save. */
  getMany(keys: string[], opts?: { timeoutMs?: number }): Promise<BuildaResult<BuildaPlayerDataObservation>>;
  /** Directory in meta.keys, values={}. Same non-authoritative observation contract
   * as getMany: revision/source do not prove freshness; server action results prevail. */
  listKeys(opts?: { timeoutMs?: number }): Promise<BuildaResult<BuildaPlayerDataObservation>>;
}

export interface BuildaSDK {
  playerData: BuildaPlayerData;
  version: string;
  runtime: {
    gameId: string;
    bundleVersion: string;
    // Game liveness handshake: must be called at the very start of the game (first thing in the entry script/first scene; do not wait for assets to finish loading),
    // and make sure every startup path reaches it — if the host does not receive ready within 30 seconds of page load, it force-closes the game.
    ready(): Promise<BuildaResult<{ available: boolean }>>;
    quit(): Promise<BuildaResult<Record<string, never>>>;
    // Keep-screen-on switch: true prevents the system from auto-sleeping the screen (AFK/idle/long animations/dashboard-style gameplay); false restores the system timeout.
    // **Minimum host version: App 1.84.0**. Older hosts do not recognize this cmd and return an UNSUPPORTED_CMD error envelope —
    // just degrade as "unsupported"; no need to probe with appVersionAtLeast("1.84.0") first.
    // The returned enabled is the **actual effective state**: false when the host has not integrated this capability or the system refuses,
    // so the game can decide from it whether to notify the player. Old hosts reply UNSUPPORTED_CMD; just treat it as "unsupported".
    // Scope is this game session only — the host resets it when leaving the game page; the game need not (and cannot reliably) turn it off before quitting;
    // backgrounding is handled by the system; after returning to foreground the host keeps the last setting, so the game need not set it again.
    setKeepScreenOn(enabled: boolean, opts?: { timeoutMs?: number }): Promise<BuildaResult<BuildaKeepScreenOn>>;
    safeArea(): BuildaSafeArea;
    capsuleMenuRect(): BuildaCapsuleMenuRect;
    // Current language (BCP 47 hyphenated form). The host gives only bare language codes ("zh", "en", no region variants,
    // never "zh-CN"); the only exception is Spanish as "es-419". Returned synchronously as a bare value, read fresh on every call (switching language while the host is running
    // updates it); missing/no host falls back to "en"; never returns an empty string.
    // Suggested matching on the game side: exact match → language-prefix fallback (es-419 → es) → game default language.
    language(): string;
    // Version of the host Builda App, like "1.84.0". Returned synchronously as a bare value, read fresh on every call.
    // Injected by the host since App **1.84.0**; when unavailable (older App, browser, mock) it always returns
    // **"1.83.0"** — the last App version that does not provide this value, so "old host" and "no host" need not be distinguished.
    // When you only need to check "is the host new enough", use appVersionAtLeast(); do not compare this string yourself
    // (in string order "1.9.0" > "1.10.0"; hand-written comparisons easily get it wrong). This method is for displaying/reporting the raw value.
    // Never returns an empty string.
    appVersion(): string;
    // Whether the host version >= target (e.g. "1.84.0") — the recommended entry for feature detection of new capabilities. Both sides are
    // compared segment by segment numerically as semantic versions (missing segments count as 0, "1.84" equals "1.84.0"); callers need not parse,
    // and there is no sign convention to get backwards. With no host / App <1.84.0, appVersion() is "1.83.0",
    // so appVersionAtLeast("1.84.0") is false in both cases.
    // Other relations compose from it: less-than is !atLeast(x), a range is atLeast(a) && !atLeast(b).
    appVersionAtLeast(target: string): boolean;
  };
  assets: {
    // assets.zip has two subtrees: audio/** (host audio channel) and res/** (large assets the game fetches itself, e.g. 3D models).
    // For res/**, get the URL fresh with url("res/models/car.glb") and fetch it yourself; never hard-code CDN URLs,
    // assetsBaseUrl changes on every re-upload. Rules and per-engine integration: see "res/** dynamic loading of large assets" in md_sdk_assets.md.
    // The return value is always an absolute URL: on device the host injects the CDN base; under local mock without a base it resolves against the page's directory
    // (builda dev automatically serves audio/** and res/** from ./assets or the --assets source as a fallback at same-origin
    // paths, no need to copy them into the build directory), usable directly by Godot HTTPRequest.
    baseUrl: string;
    url(path: string): string;
  };
  audio: {
    playBGM(path: string, opts?: { loop?: boolean; volume?: number }): Promise<BuildaResult<BuildaAudioResult>>;
    stopBGM(): Promise<BuildaResult<BuildaAudioResult>>;
    playSFX(path: string, opts?: { sessionId?: string; volume?: number; loop?: boolean; fadeIn?: number; pitch?: number }): Promise<BuildaResult<BuildaAudioResult>>;
    /** group omitted equals "bgm" (mutes background music only); the two groups are independent — to mute both, call once for each. */
    setMuted(muted: boolean, group?: "bgm" | "effect"): Promise<BuildaResult<BuildaAudioResult>>;
    vibrate(level?: 1 | 2 | 3): Promise<BuildaResult<BuildaAudioResult>>;
    requestMicrophone(opts?: { timeoutMs?: number }): Promise<BuildaResult<BuildaMicPermission>>;
  };
  mic: {
    start(opts?: { sampleRate?: number; bufferMs?: number }): Promise<BuildaResult<BuildaMicStart>>;
    read(opts?: { maxSamples?: number; encoding?: "base64" }): BuildaResult<BuildaMicRead>;
    stop(): Promise<BuildaResult<Record<string, never>>>;
  };
  // legacy in-app purchase: auto-confirms fulfillment after payment and cannot recover orders whose fulfillment failed. New games must always use iap.
  pay: {
    showPayPanel(saleId: string, opts?: { timeoutMs?: number }): Promise<BuildaResult<BuildaPayPanelResult>>;
  };
  // In-app purchase (no auto claim): success only means the payment succeeded, the order stays Paid; the response grantBy is the granter frozen on this order.
  // For grantBy=client orders the game grants idempotently by orderId, then claims (Paid→Delivered); grantBy=room orders go to
  // Room doOrder and the game does not claim. Query undelivered orders via getPendingOrderIds; recovering pending orders uses exactly the same
  // idempotent grant as after a successful showPayPanel.
  iap: {
    // opts.grantBy: declare which grant path this purchase is coded for. The host sends it with the
    // order for diagnostics. It does not override the frozen published configuration or guarantee
    // rejection on mismatch. Route fulfillment using the returned order grantBy.
    showPayPanel(saleId: string, opts?: { grantBy?: "client" | "room"; timeoutMs?: number }): Promise<BuildaResult<BuildaPayPanelResult>>;
    claim(orderId: string, opts?: { timeoutMs?: number }): Promise<BuildaResult<BuildaClaimResult>>;
    getPendingOrderIds(opts?: { timeoutMs?: number }): Promise<BuildaResult<BuildaPendingOrderIds>>;
  };
  ad: {
    // posId is a game-defined ad slot tracking identifier: any string (e.g. "revive"), only used to distinguish different ad trigger points
    // in the game for analytics; it is not a platform-assigned ad slot ID — no application needed, no need to declare it in the manifest.
    showRewardAd(posId: string, opts?: { timeoutMs?: number }): Promise<BuildaResult<BuildaRewardAdResult>>;
  };
  input: {
    showInputPanel(opts?: BuildaInputPanelOpts): Promise<BuildaResult<BuildaInputPanelResult>>;
  };
  rank: {
    submitScore(rankId: string, score: number, opts?: { timeoutMs?: number }): Promise<BuildaResult<{ rankId: string }>>;
    getRankList(rankId: string, opts?: { limit?: number; timeoutMs?: number }): Promise<BuildaResult<BuildaRankList>>;
  };
  whoami(opts?: { timeoutMs?: number }): Promise<BuildaResult<BuildaPlayer>>;
  requestToken(opts?: { timeoutMs?: number }): Promise<BuildaResult<BuildaTokenResult>>;
  getServerTime(opts?: { timeoutMs?: number }): Promise<BuildaResult<BuildaServerTimeResult>>;
  // Query public profiles of Builda player roles. roleId is a positive decimal integer string; a key present in the returned map
  // means found this time, a missing key means not found this time. The SDK aggregates over a fixed 50ms window and caches successful entries in memory for 30 minutes.
  // timeoutMs is this call's own end-to-end wait limit; other calls in the same 50ms window are not cancelled along with it.
  getRoleInfo(roleIds: string[], opts?: { timeoutMs?: number }): Promise<BuildaResult<BuildaRoleInfoMap>>;
  privateKV: BuildaPrivateKV;
  events: BuildaEvents;
}

declare global {
  interface Window {
    Builda: BuildaSDK;
  }
}
