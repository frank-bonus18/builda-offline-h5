<!-- builda-agent-version: 0.19.4 -->
# Godot / H5 game ↔ platform JS bridge integration guide

> Integration doc for the **game client (the Builda SDK on the Godot side)**.
> Platform-side implementation: `lib/src/comps/h5_runtime/h5_game_bridge.dart` (`H5GameBridge`). This doc is kept in sync with that file; **on conflict, the code wins**.

Godot games are packaged into the App as Web (WASM) and run in a WebView inside the App. The game and the platform (the Flutter host) communicate through a **JS bridge** aligned with the cocos games' "Builda host protocol"; only the transport changes from native JSB to the WebView channel. Whenever the game needs a token, reads host data, receives server messages, quits, etc., it goes **entirely through this mechanism**; future platform capabilities are also extended following the same conventions.

---

## 1. Overview of the three channels

| Direction | Mechanism | Purpose | Return value? |
|---|---|---|---|
| Startup injection | `window.__cysjHost` (injected at document-start) | Host data the game can read synchronously right at startup (shared memory etc., **no token**) | — (synchronous property read) |
| Game → host | `window.flutter_inappwebview.callHandler('cysjBridge', { method, args })` | The game actively calls platform capabilities (read/write memory, get token, quit, analytics…) | Yes (returns a Promise) |
| Host → game | `window.__cysjHost.onEvent(event, args)` | Async events the platform pushes to the game (server messages, app events…) | No |

The game side has to do two things:
1. **Override** `window.__cysjHost.onEvent` to receive events pushed by the host.
2. When it needs a platform capability, **call** `callHandler('cysjBridge', { method, args })`.

---

## 2. Startup injection: `window.__cysjHost`

The platform injects at **document-start** (before any game script runs):

```js
window.__cysjHost = {
  sharedMemory: { "<key>": "<string value>", ... },  // initial shared-memory snapshot (all strings)
  onEvent:      function(event, args) {}              // placeholder no-op; the game must override it
};
```

- `sharedMemory`: initial key/values delivered by the host (role info, server parameters, language, volume switches, etc., being filled in progressively). Values are **always strings**.
  Among them, the four safe area keys `_safeAreaTop` / `_safeAreaRight` / `_safeAreaBottom` / `_safeAreaLeft` (CSS px numeric strings) are injected by the host under
  edge-to-edge cutout fullscreen, read by `Builda.runtime.safeArea()` (the SDK re-reads on every call); when an orientation change alters the insets, the host
  should update these four keys accordingly. Devices without a notch may skip injection; the SDK treats missing values as 0.
  The rectangle of the platform's general settings / pause-quit floating button (the capsule) is injected by the host as four keys `_capsuleMenuRectTop` / `_capsuleMenuRectRight` /
  `_capsuleMenuRectWidth` / `_capsuleMenuRectHeight` (CSS px numeric strings; top/right are insets from the top/right edge), read by
  `Builda.runtime.capsuleMenuRect()` — the SDK has no built-in layout formula and re-reads every time; the host computes and injects it from its own actual layout and updates it when the layout changes.
  The rectangle must cover the whole floating button strip: the 80×32 settings/quit capsule on the right + 8 gap + the 32×32 round chat button + 8 gap + the leftmost
  32×32 multiplayer members button, i.e. the whole strip is 160×32 (current values `top = safeTop + 6`, `right = 10`, `width = 160`, `height = 32`);
  do not inject only the right-hand capsule. The multiplayer members button (opens the host's room members page) is shown only after the player enters a multiplayer room via `enterRoom` and hidden after `leaveRoom`,
  but the rectangle **always reserves** the full 160 and does not change with room state; the game does not need to listen for room changes to re-layout. Without a floating button the host may skip injection;
  the SDK treats missing values as all 0 (the game treats it as nothing to avoid).
  The current UI language is injected by the host as `_language`; the value must be in **BCP 47 hyphenated form**, at the granularity of a **bare language code** (`zh` / `en`,
  no region variant; do not inject values like `zh-CN`), with the single exception of Spanish using `es-419`; if the host internally uses gen-l10n `localeName`
  (underscore form such as `es_419`), it normalizes to the hyphenated form itself before injecting. `Builda.runtime.language()` re-reads on every call and
  passes it through to the game with zero conversion (no parsing, no mapping); the host writes it at startup and updates the key when the user switches language at runtime.
  When missing/empty the SDK falls back to `en`.
  The host App's own version number is injected by the host as `_appVersion` (e.g. `1.84.0`, a string), read by
  `Builda.runtime.appVersion()` — the SDK re-reads on every call and passes it through with zero parsing. **Injected since App 1.84.0**;
  older Apps do not inject this key, and the SDK uniformly falls back to `1.83.0` (the last App version that does not provide the value),
  so the game does not need to distinguish an "old host" from "no host (browser/mock)". On the host side, writing the value once when entering the game is enough;
  it does not change at runtime. When the game does feature detection it compares semantic versions **segment by segment numerically** (`> 1.83.0` means host ≥1.84.0);
  do not compare the strings directly.
  When a player launches the game via a room invite, the host injects four keys `_inviteRoomId` / `_inviteRoleId` / `_inviteName` / `_inviteAvatar`
  (the room id being invited into, and the inviter's roleId/nickname/avatar URL, all strings; `name`/`avatar` may be empty, in which case the Online side fills them in via
  `getRoleInfo`); they are **only for the Builda Online SDK**, read via the Builda SDK internal interface `__online.takeInviteInfo()`, and are not exposed to the game.
  The read is **one-shot**: after the SDK returns the invite the first time, every further call within this page lifecycle returns empty; the host does not need to, and should not,
  rewrite these four keys at runtime. Non-invite launches may skip injection. When the player taps another invite while the game is running, the host must **reload the game page** and re-inject;
  it must not just bring the game back to the foreground. An invite is only a hint; whether the player can enter the room is still decided by the Online side, and the host does no admission. Sending invites is implemented by the host itself:
  the room id comes from `enterRoom` (see section 3), and after `leaveRoom` the host must stop offering the invite entry.
- Startup injection **contains no token at all**: tokens are always obtained dynamically via cmd (see [section 4](#4-token-always-obtained-dynamically-via-cmd)).
- `onEvent`: placeholder no-op implementation; **the game SDK must override it** to receive host events.

> ⚠️ The injection target is document-start, but on old engines (Android WebView < 88 does not support true document-start) `window.__cysjHost`
> and `flutter_inappwebview.callHandler` may appear after the game's main script. The Builda SDK therefore always **re-reads** host data (no snapshot at
> load time), and before the first bridge method call it waits at most **10 seconds** for the bridge to be ready (listening for the `flutterInAppWebViewPlatformReady` event + 50ms polling),
> only concluding there is no host after the timeout; `runtime.ready()` waits as well, so calling `ready()` right at game startup will not get the game killed by the watchdog because of late injection.
> Host-side requirements: `__cysjHost` and `callHandler` must become ready **together** (do not inject only one of them), and when `callHandler` is available dispatch
> `flutterInAppWebViewPlatformReady` per the flutter_inappwebview convention. Game code must not read `window.__cysjHost` synchronously by itself.

---

## 3. Game → host: `callHandler`

Single entry point; **all** active calls go through it:

```js
const reply = await window.flutter_inappwebview.callHandler('cysjBridge', {
  method: '<method name>',
  args: [ /* argument array, may be empty */ ]
});
```

- The second argument is an envelope object `{ method, args }`. `method` is a string, `args` is an array (pass `[]` or omit for no arguments).
- Returns a **Promise** that resolves to the method's return value (string / null).

### Supported methods

| method | args | Returns | Description |
|---|---|---|---|
| `readMemory` | `[key]` | `string` (`""` if absent) | Read shared memory |
| `writeMemory` | `[key, value]` | `null` | Write shared memory (updates the host-side map) |
| `quitGame` | `[]` | `null` | Request to quit: the host opens the platform's general pause/quit page (including settings and music/SFX switches); the player decides on that page whether to stay or leave; the game page is not closed directly |
| `ready` | `[]` | `null` | Game liveness handshake. **Must be called at the very start of the game** (the first thing in the entry script; do not wait for assets to finish loading): if the host has not received `ready` **within 30 seconds** of page load, it **force-closes the game**. The game calls it via `Builda.runtime.ready()` |
| `gameLoadProcess` | `[progress]` | `null` | Report loading progress (not consumed by the host yet, reserved) |
| `trackEvent` | `[...]` | `null` | Analytics (host integration in progress, reserved) |
| `makeNativeRequest` | `[reqId, cmd, paramJsonStr]` | `null` | Generic native request; **fire-and-forget**, the result is pushed back via the `onNativeResponse` event, correlated by `reqId`. `reqId` is generated by the caller (the Builda SDK) and guaranteed unique; `paramJsonStr` is the JSON string of the parameter object. Currently supported `cmd`s: `showPayPanel`, `iapShowPayPanel`, `iapClaimOrder`, `showInputPanel`, `whoami`, `requestToken`, `privateKvGetMany`, `privateKvSetMany`, `privateKvRemoveMany`, `rankSubmitScore`, `rankGetList`, `joinChatGroup`, `quitChatGroup`, `enterRoom`, `leaveRoom`, `setKeepScreenOn` |
| `showRewardAds` | `[posId]` | `null` | Request a rewarded video ad; `posId` is a game-defined ad placement analytics string (any name, analytics only, no ad placement application needed); **fire-and-forget**, the watch result is pushed back via the `onRewardAdsResultV2` event (see [section 5](#5-host--game-onevent)). The platform **only plays the ad and returns the result, and grants no reward at all** — what reward to grant and whether to use `transId` for server-side verification are entirely up to the game (the platform G-coin system is not granted through this) |

**cmds supported by makeNativeRequest**

| cmd | param | result data | Description |
|---|---|---|---|
| `showPayPanel` | `{saleId}` | `{success, orderId}` | **legacy** payment panel: once reconciliation shows the order paid, the host **auto-claims** (Delivered for client orders at reply time) and then replies. Live old games depend on "grant as soon as success arrives, never claim"; the semantics are frozen; it must not be used for pay points with `grantBy=room`. `saleId` is the `payId` in the current game draft's `payPoints`; product config reads and order creation/query/retry are all done by the host directly against the server. Payment completed `success=true`, cancelled or failed `success=false`. Maps to `Builda.pay.showPayPanel(saleId)`. New games use `iapShowPayPanel` |
| `iapShowPayPanel` | `{saleId, grantBy?}` | `{success, orderId, grantBy}` | Payment panel, **no auto-claim**: the host uses the V2 APIs (createOrderV2 → payV2 → getOrder) and replies as soon as reconciliation shows the order paid; the order stays in Paid. Input `grantBy` (optional, `client`\|`room`, invalid values `BAD_PARAMS`) is the granting path the game declares it intends to use; the host passes it along with the order unchanged and the server records any difference from the release config; the declaration does not override the order's frozen config, and a mismatch is not guaranteed to reject order creation. When omitted/empty string the host uses the price list declaration. Output `grantBy` (`client`\|`room`) is this order's frozen granter; the game uses it to decide between local granting plus claim or handing off to Room, and does not need to keep its own saleId→grantBy mapping. The host **creates the order before showing the dialog**: when the same pay point already has an order pending claim the server reuses it directly (status=Paid, no new charge); the host does not show the payment confirmation dialog but instead an "already paid, granting now" prompt, and replies `success=true` with that orderId as usual; only when Init is returned does it show the confirmation dialog with the price, and when the user cancels or balance is insufficient the host best-effort `cancel`s that Init order. The reply must use the frozen `grantBy` obtained from the order query, never inferred from the request declaration or the current price list, including when reusing an order pending claim. Shares the same price inquiry/confirmation dialog/balance/reconciliation flow and single-flight lock with `showPayPanel` (while one is in flight the other also replies `PAY_BUSY`). Maps to `Builda.iap.showPayPanel(saleId)` (see 6.2.2) |
| `iapClaimOrder` | `{orderId}` | `{orderId, status}` | Claim confirmation (claimV2, judged by the order's frozen snapshot): for `grantBy=client` orders Paid→Delivered, idempotent (already Delivered replays success), `status="delivered"`; for `grantBy=room` orders a client claim **does not change the status** and replies `status="paid"` as is; Room `doOrder` closes it out on the server. Call only for client orders, after the game has idempotently granted by `orderId`. Retry strategy matches `showPayPanel`'s auto-claim: the host retries blockingly (3 attempts per round; when exhausted it shows a "retry only" dialog) until it gets a server response, and **never replies with a network error**; server rejection (order not in Paid) replies `CLAIM_REJECTED`. A success response reflects the actual server state; the SDK waits for the host for 120 seconds by default and returns `PENDING` on timeout; a timeout must never be treated as a successful grant or order close. Maps to `Builda.iap.claim(orderId)` |
| `showInputPanel` | `{placeholder, defaultValue, maxLength}` | `{confirmed, text}` | Opens native single-line text input: **only the input box + system keyboard, no title bar**. On user confirm returns `confirmed=true` and the final text — `text` must have passed the host's sensitive-word review and `maxLength` truncation before being returned (on review failure the panel prompts re-entry; unreviewed text is never handed to the game); cancel/close returns `confirmed=false`, `text=""`. Singleton at any moment: while the panel is open the SDK rejects new calls directly (BUSY), so the host does not need to handle concurrency. The game calls it via `Builda.input.showInputPanel(opts)` |
| `whoami` | `{}` | `{id, name, avatar?}` | Current player info. The host is the login-state authority and fetches the profile directly from the server; the game calls it via `Builda.whoami()` |
| `requestToken` | `{}` | `{token, expiresAt}` | The host uses its own login state to have the platform server issue a **game-scoped short-lived token** (bound to current game × current player × limited validity, permission scope defined by the server), handed to the game for connecting directly to Builda services that require auth. **Never returns the full login state/session/long-lived credentials**; `expiresAt` is Unix seconds; the Runtime SDK caches it only in memory for the current lifecycle and lazily refreshes it near expiry; the game must not persist it. The game calls it via `Builda.requestToken()`. |
| `privateKvGetMany` | `{keys: [key...]}` | `{entries: {key: base64\|null}}` | Batch-read private saves (current game × current player); the entry for a nonexistent key is `null`. The value is a base64 string that decodes to a game-defined byte stream; the host does not interpret the content. The game calls it via `Builda.privateKV.get/getMany` |
| `privateKvSetMany` | `{entries: {key: base64}}` | `{}` | Batch-write private saves, last write wins, no version/CAS. The SDK pre-validates key format, single value ≤32KB, ≤32 keys per call; the server authoritatively enforces ≤100 live keys per player per game, with no aggregate byte quota. Any violation rejects the whole batch with an explicit error, no partial writes; the App only forwards requests and results and adds no quota logic. The game calls it via `Builda.privateKV.set/setMany` |
| `privateKvRemoveMany` | `{keys: [key...]}` | `{}` | Batch-delete private saves; idempotent success for nonexistent keys. The game calls it via `Builda.privateKV.remove/removeMany` |
| `rankSubmitScore` | `{rankId, score}` | `{}` | Submit a leaderboard score. The host validates authoritatively against the published `rankBoards` config in the release manifest: an unpublished `rankId` returns `RANK_NOT_FOUND`, a `score` outside the board's `minScore/maxScore` returns `SCORE_OUT_OF_RANGE`; when it passes, the best score per player per cycle (`cycleType`) is kept according to the board's `sortType`. The game calls it via `Builda.rank.submitScore(rankId, score)` |
| `joinChatGroup` | `{groupId, teamId}` | `{}` | Join a chat group (`groupId` string, `teamId` integer). **Only for the Builda Online SDK** (via the Builda SDK internal interface `Builda.__online.joinChatGroup`, not exposed to the game); the host actually performs the IM group join, and failures are pushed back in the unified error shape. Repeated joins of the same group should succeed idempotently |
| `quitChatGroup` | `{groupId, teamId}` | `{}` | Leave a chat group, same parameters as above. **Only for the Builda Online SDK** (`Builda.__online.quitChatGroup`); idempotent success for calls when not in the group. When the page is killed/the WebView is destroyed there is no leave request; the host must clean up on its own as a fallback |
| `enterRoom` | `{roomId}` | `{}` | Notification that the player entered a multiplayer room (`roomId` non-empty string). **Only for the Builda Online SDK** (`Builda.__online.enterRoom`, not exposed to the game); the Online-side room state is the authority, and the host only uses this to maintain room-state UI/analytics and offer the "invite friends" entry (sending invites is implemented by the host, see the invite injection in section 2); it makes no admission decision. The Online SDK sends this notification only after actually entering the room successfully. Repeated notifications for the same room should succeed idempotently; parameters will later only be extended by adding fields |
| `leaveRoom` | `{roomId}` | `{}` | Notification that the player left a multiplayer room, same parameters as above. **Only for the Builda Online SDK** (`Builda.__online.leaveRoom`); idempotent success for calls when not in the room, after which the host must stop offering the invite entry for that room. When the page is killed/the WebView is destroyed there is no leave notification; the host must clean up on its own as a fallback |
| `setKeepScreenOn` | `{enabled}` | `{enabled}` | **Minimum App version 1.84.0** (earlier hosts do not recognize this cmd and reply `UNSUPPORTED_CMD`). Keep-screen-on switch. `enabled=true` prevents the system from auto-dimming the screen (idle/incremental/long-animation/dashboard-style gameplay), `false` restores the system timeout. The returned `enabled` must be the **actual effective state**, not an echo of the input — when the host cannot make it take effect (no permission, system refusal, platform unsupported) it replies `{enabled:false}` instead of an error, and the game uses that to decide whether to notify the player. **Scope is limited to the current game session**: the host must reset it itself when leaving the game page (the game may be destroyed directly with no chance to turn it off), and must never leak the keep-on state to other App pages. While in the background the system takes over; after returning to the foreground the host restores the game's last setting, without requiring the game to set it again. Setting the same state repeatedly should succeed idempotently. The game calls it via `Builda.runtime.setKeepScreenOn(enabled)` |
| `rankGetList` | `{rankId, limit}` | `{list: [{rank, score, player:{id,name,avatar}}], self: {rank, score}\|null}` | Read the top `limit` entries of the current-cycle board (the SDK already clamps to 1–100, default 50) and your own rank; `self` being `null` means not ranked this cycle. The game calls it via `Builda.rank.getRankList(rankId, {limit})` |

> Storage and login state for `whoami`/`privateKv*` are bridged by the existing host channel: official play lands in server cloud variables, trial mode may land in local files; the SDK and game code neither see nor depend on the runtime token. The privateKV `key` constraint is `^[A-Za-z0-9_:-]{1,64}$`; payment `saleId/payId` and leaderboard `rankId` constraints are `^[A-Za-z0-9_-]{1,64}$`. `:` is a legacy-compatibility character for privateKV; illegal characters such as `.`, `+`, `/`, space, `$`, non-ASCII are deterministically rejected and must not be retried at high frequency. privateKV batches are ≤32 keys per call (pre-validated on the SDK side); the SDK does not split batches automatically and returns `BATCH_TOO_LARGE` directly when exceeded; if the game needs to handle more keys, it must explicitly split them into batches of at most 32 and check each batch's result. The total live keys and write-rate limit (60 per min, a batch counts as 1) are enforced authoritatively by the server. Single-key get/set/remove are SDK-level syntactic sugar; only these three batch cmds cross the bridge.

> Any unrecognized `method` always returns `null` without an error — for forward compatibility: a newer game calling a method an older host lacks will not crash.

> **Two capabilities that do not cross the bridge**: `Builda.getServerTime()` and `Builda.getRoleInfo()` do not go through `makeNativeRequest`; the Runtime SDK connects directly to Builda HTTP —
> the former `GET <apiBase>/api/v1/sdk/server-time` (no auth; the result goes into an in-memory clock-calibration cache), the latter `POST <apiBase>/api/v1/sdk/role-info`
> (using the game-scoped token obtained via `requestToken` as `Authorization: Bearer`). **The host does not need to, and should not, implement cmds of the same name**.
> But if the host imposes outbound restrictions on the WebView (CSP `connect-src`, domain allowlist, etc.), it **must allow the Builda API origin**, otherwise these two capabilities
> are silently cut off: the game side only sees `NETWORK`, and the host side has no bridge logs at all (the request never crosses the bridge).

### Motion / gyroscope (does not cross the bridge, but iOS requires host permission)

The game listens directly for the W3C `deviceorientation` / `devicemotion` events to read motion data; **the data plane goes through neither the bridge nor the SDK**,
and the host **does not need to, and should not,** implement any cmd of the same name. But on iOS there is one action the host must take; without it this capability does not work at all:

- **Android**: the WebView has no permission request for sensors; the page gets data as soon as it listens, and the host needs to do nothing.
- **iOS 13+**: the page must first call `DeviceOrientationEvent.requestPermission()`; on iOS 15+ this call reaches the host via `WKUIDelegate`'s
  `requestDeviceOrientationAndMotionPermissionFor`. **The host must silently grant it for its own bundle's origin**
  (`WKPermissionDecision.grant`, no UI shown). There is no corresponding system permission to request for this path — `NSMotionUsageDescription`
  governs CoreMotion and is unrelated to this WebKit path — so the host has nothing to do except say yes; **if it does not grant, not a single `deviceorientation`
  event fires**, and motion gameplay is simply impossible on iOS. The explanation of what the permission is for is given by the game itself on screen; the host does not do it on the game's behalf.
- Minimum host version **App 1.84.0** (earlier versions always deny in this delegate). iOS 14 and lower do not have this delegate method at all;
  the page only gets `denied`, **with no workaround** — the game must prepare a touch fallback gameplay for this.

> **Mandatory game-side pattern** (details and copyable snippets in the "Motion controls / Gyroscope" topic (`md_sdk_gyro.md`)): `requestPermission()` must happen **synchronously**
> on the user gesture's call stack. Moving **the call itself** after an `await` / `.then()` leaves the gesture context, and WebKit throws
> `NotAllowedError` (awaiting its **return value** is fine). Godot / Unity WebGL input is replayed by the engine on the next frame, so calling it
> inside an engine callback is guaranteed to hit this pitfall; you must attach a one-shot DOM listener yourself to move the call back onto the real gesture stack. This failure reproduces only on real iOS devices; desktop and Android
> never show it.

### Audio methods (FMOD, important)

> Scope note: the audio in this section is played natively via the host bridge; large `res/**` assets in assets.zip (3D models, etc.) **do not go through the host bridge**; game code gets the URL with `Builda.assets.url("res/…")` and fetches it itself; for the integration see the SKILL section "res/** dynamic loading of large assets" section of `md_sdk_assets.md`.

Godot's built-in audio is slow/stuttery on device, so **platform audio always goes through native FMOD** (the same stack as cocos games). The host bridge exposes only **4** audio methods; FMOD details (bgm session, channel group routing, stopping the old track on track switch) are implemented natively and the underlying method names are not passed through. **All are fire-and-forget and return `null`**. Games are recommended to call via `Builda.audio.*` rather than assembling `callHandler` directly.

| method | args | Builda SDK entry | Description |
|---|---|---|---|
| `playBgm` | `[url, loop, volume]` | `Builda.audio.playBGM(path, {loop, volume})` | Play BGM. Only one track at a time; calling again switches tracks (the old track stops). `loop` defaults to `true`, `volume` defaults to `1` |
| `stopBgm` | `[]` | `Builda.audio.stopBGM()` | Stop BGM |
| `playSfx` | `[url, sessionId, volume, fadeIn, pitch, loop]` | `Builda.audio.playSFX(path, {sessionId, volume, fadeIn, pitch, loop})` | Play a sound effect. `sessionId` is generated by the SDK when omitted; `volume` defaults to `1`, `fadeIn`/`pitch` default to `0`, `loop` defaults to `false` |
| `setMuted` | `[muted, group]` | `Builda.audio.setMuted(muted, group)` | Mute/unmute per group; `group` is `"bgm"` / `"effect"` (SDK default `"bgm"`). **This is the "game request" side, not the master switch**; the host must maintain it separately from the player preference and combine the two, see "The two sources of mute" below |

> Audio methods other than these 4 (cocos-era names such as `playAudioV3` / `playBGMV2` / `pauseBGM` / `resumeBGM` / `setAllSoundMute` / `stopAllSounds`) **are not recognized by the host**; they return `null` as unknown methods with no effect at all; do not use them. BGM pause/resume is handled by the host itself when going to the background or opening the pause page (a real FMOD pause that keeps progress and resumes on returning to the foreground); the game neither needs to nor can actively pause/resume.

Under the same entry point there is also one non-audio method, likewise fire-and-forget:

| method | args | Builda SDK entry | Description |
|---|---|---|---|
| `vibrate` | `[level]` | `Builda.audio.vibrate(level)` | Vibration, `level` has three levels: `1` light / `2` medium / `3` heavy; the SDK maps invalid values to `2`. Whether it actually vibrates is up to the host (including the vibration switch in App settings) |

**Parameter notes**
- `url`: audio file address. The SDK's `path` is first resolved by `Builda.assets.url()`: when the host has injected `assetsBaseUrl` it becomes an absolute CDN URL; otherwise the relative path is passed through as is. On the host — `http(s)://` or absolute paths starting with `/` are used **as is**; **relative paths** are joined onto the local package extraction directory to form a file path.
- `sessionId`: playback instance id, used to distinguish multiple instances of the same sound effect.
- `volume` 0~1; `pitch` semitone offset integer (0 = unchanged); `fadeIn` fade-in duration; `loop` whether to loop.

> ⚠️ **Audio files must be accessible to native code**: either ship them as **loose files with the game package** (extracted locally, using relative paths), or put them on a **CDN with http URLs**. Audio packed into the Godot `.pck` cannot be read by native FMOD — do not put audio meant for FMOD into the pck.
>
> The host automatically calls `initAudio` / `releaseAudio` when entering/leaving the game; the game side **does not need** to care about initialization.

**The two sources of mute (the host must maintain them separately)**

Mute has two semantic layers with completely different lifecycles; **the host must record them separately and combine them when applying**, and must not share a single flag:

| | Semantics | Lifecycle | Source |
|---|---|---|---|
| Player preference | "I don't want to hear music" | Persistent across sessions and play-throughs | The music/SFX switches on the App settings page |
| Game request | "Suppress the background music during this cutscene" | Within the current session, seconds to minutes | The `setMuted` cmd in this section |

```
effectively muted = player preference muted  ||  game request muted
```

**The player preference is a hard ceiling**: so the semantics of `setMuted(false)` are "the game withdraws its own mute request", **not** "turn the sound on" — music the player turned off on the settings page cannot be turned on by the game no matter what it calls.

Sharing one flag (later writes override earlier ones) lets the game unintentionally stomp on the player's persistent preference: player turns music off → game cutscene `setMuted(true)` → cutscene ends `setMuted(false)` → **music plays**. The game side **cannot avoid** this class of error: `setMuted` is fire-and-forget and returns `null`; the game can neither read the current mute state nor learn through any event when the player changed the setting. So correctness can only be guaranteed by the host. Conversely, once the host does it right, not a single line of game code needs to change.

The two groups are combined independently and do not affect each other. `group` **only accepts** `"bgm"` / `"effect"`; only **omitting** it equals `"bgm"` (the SDK fills it in). On receiving a value outside the contract (e.g. writing sound effects as `"sfx"`) the host should ignore it and log it, and **do not** fold it into `"bgm"` — that would let one slip by the game silence the music with no indication at all.

The scope of a game request is limited to the current session: the host discards it along with the session when leaving the game page, and the game **does not need** to restore it before quitting. The player preference is persisted by the App itself and is not affected by the game.

> Early hosts implemented both as the same flag; the observed behavior was "the last action wins". The combined semantics above only exist once this section is implemented.

---

## 4. Token: always obtained dynamically via cmd

The host **provides no token in the startup injection**: `window.__cysjHost` has no token field; the old `gameToken` injection and the `getGameToken` method have both been removed, and the host must not implement them again.

- The SDK's own requests (`whoami`/`privateKv*`/payment/ads) all go through the host cmd/event channel; auth with the platform server is done by the host itself on the native side, and the SDK and game code never touch the host login state.
- When the game logic layer needs a token (to connect directly to Builda services that require auth), it obtains one dynamically via the `requestToken` cmd of `makeNativeRequest` (see the cmd table in section 3): on receiving the cmd the host **immediately** uses its own login state to have the platform server issue a game-scoped short-lived token and returns it, and may cache it briefly until `expiresAt`.
- The token is never written to disk, never put in URLs, never put in `sharedMemory`; the Runtime SDK lazily rotates it by `expiresAt` in the core token method, calling the host again near expiry.

---

## 5. Host → game: `onEvent`

Async events actively pushed by the platform (no return value). The game overrides `onEvent` to receive them:

```js
window.__cysjHost.onEvent = function (event, args) {
  switch (event) {
    case 'onNetworkEvent':       /* args = [cmd, bonTxt] */ break;
    case 'onAppEvent':           /* args = [cmd, extra]  */ break; // cmd = "background" | "foreground" | "pausePanelShow" | "pausePanelHide"; extra is fixed to "" for now
    case 'onNativeResponse':     /* args = [reqId, cmd, resultJsonStr] */ break;
    case 'onRewardAdsResultV2':  /* args = [success, transId] */ break;
  }
};
```

| event | args | Description |
|---|---|---|
| `onNetworkEvent` | `[cmd, bonTxt]` | Server message forwarding, aligned with cocos's `onNetworkEvent(cmd, bonTxt)` |
| `onAppEvent` | `[cmd, extra]` | App event, aligned with cocos's `onAppEvent(cmd, extra)`. `cmd` values: `"background"` = App minimized/sent to background/covered by another App/screen locked (WebView still alive); `"foreground"` = App back in the foreground; `"pausePanelShow"` = the host's "Paused" panel pops up; `"pausePanelHide"` = that panel closed without quitting. `extra` is fixed to `""` for now. Host contracts in 5.1 / 5.2 below |
| `onNativeResponse` | `[reqId, cmd, resultJsonStr]` | Async reply to `makeNativeRequest`, correlated by `reqId`. `resultJsonStr` is a JSON string: success `{"ok":true,"data":{...}}`, failure `{"ok":false,"error":{"code":"...","message":"..."}}`. **Every `makeNativeRequest` must get exactly one push back** (success, failure and cancellation all count), otherwise the SDK side can only fall back to a timeout |
| `onChatGroupMessage` | `[payloadJsonStr]` | New messages received in chat groups joined via `joinChatGroup` in this session (pushed in batches). **Only for the Builda Online SDK** (subscribed via the Builda SDK internal interface `__online.onChatMessage`, not exposed to the game); contract in 5.3 |
| `onRewardAdsResultV2` | `[success, transId]` | Result push for `showRewardAds`, aligned with cocos. `success` = whether it was watched to completion validly (`bool`); `transId` = platform ad transaction id (`string`, empty string on failure). The host only returns the result and grants no reward; the game grants its in-game reward itself based on `success`. **Whether success, failure, or the host has no ads integrated, it is pushed back exactly once**, so a game-side await never hangs |

### 5.1 App foreground/background event contract (`onAppEvent` background / foreground)

The Builda SDK normalizes this pair of events into the `Builda.events.on("appVisibility", fn)` callback (payload `{visible, source}`);
the game uses it to pause/resume gameplay, timers and BGM. The host pushes according to the contract below; SDK-side dedup and the browser fallback are in place:

| Item | Contract |
|---|---|
| Triggers `background` | App goes to background, is minimized, is covered by another App, screen locked, fully covered by a system overlay (incoming call/notification center) — i.e. every case where the WebView is no longer visible but **still alive**. On the Flutter side this corresponds to `AppLifecycleState.paused`/`inactive → paused` |
| Triggers `foreground` | Pushed after the above state recovers and the WebView is visible again and has resumed rendering (corresponds to `AppLifecycleState.resumed`). The current implementation already pushes `["foreground", ""]`; the shape is unchanged |
| Does **not** trigger | When the host's own native panels (payment panel, rewarded video ad, pause/quit page, input panel) cover the WebView, **do not push** `background`/`foreground` — these are in-App interactions, which the game perceives through the return values of the corresponding APIs (the pause/quit page has its own dedicated events, see 5.2); WebView destruction/game exit does not push either |
| Call shape | `window.__cysjHost.onEvent("onAppEvent", ["background", ""])` / `["foreground", ""]`, called synchronously on the WebView JS main thread via `evaluateJavascript`; `extra` is fixed to `""`; future extensions only append to the end of the array |
| Order and pairing | Come in pairs, `background` first then `foreground`. Repeated pushes in the same direction are allowed (the SDK dedups by state), but do not push multiple times within one transition |
| Timing | Push `background` synchronously **before** the WebView pauses rendering whenever possible (after Android WebView `onPause`, JS timers are frozen and a delayed push is lost); if the platform cannot guarantee this, the SDK's `document.visibilitychange` fallback path fills in, with `source` marked as `"browser"` |
| Initial state | After game startup/`ready` there is **no need** to push the current state; the SDK assumes foreground by default |
| Compatibility | Older SDK versions / games that do not subscribe ignore `background` without error; old hosts that only push `foreground` are unaffected |

### 5.2 Pause panel event contract (`onAppEvent` pausePanelShow / pausePanelHide)

The host's "Paused" panel (Continue / Quit game) has two entry points: the ✕ on the top-right capsule and the game calling `quitGame`; both open the same panel.
When the panel opens the host pauses BGM, stops sound effects and stops timers, but the game logic itself keeps running in the WebView — this pair of events lets the game pause/resume gameplay in sync.
The Builda SDK normalizes it into the `Builda.events.on("pausePanel", fn)` callback (payload `{visible}`).

| Item | Contract |
|---|---|
| Triggers `pausePanelShow` | The panel is about to show; **pushed for both entry points** (also pushed when the game itself calls `quitGame`, so the game needs only one handling path). Sent before the panel is pushed, so the game pauses first and then gets covered |
| Triggers `pausePanelHide` | The panel closes **without quitting**: tapping "Continue", tapping ✕, tapping the scrim, and choosing to stay after a save upload failure. Sent after the panel pops and the host side has resumed (BGM resumes, timers continue) |
| Does **not** trigger | Tapping "Quit game" to actually quit does not push `hide`; the page is destroyed directly; the settings drawer (left of the capsule) is not the pause panel and does not push |
| Call shape | `window.__cysjHost.onEvent("onAppEvent", ["pausePanelShow", ""])` / `["pausePanelHide", ""]`; `extra` is fixed to `""`; future extensions only append to the end of the array |
| Relation to foreground/background | Two orthogonal sets of state. Going to the background while the panel is open delivers both `background` and `pausePanelShow`; the game handles it as "pause if either says pause, resume only when all have resumed"; the SDK does not merge them |
| Order and pairing | In pairs, `show` first then `hide`. Repeats in the same direction are allowed (the SDK dedups by state) |
| Initial state | Not pushed after game startup; the SDK assumes not shown by default |
| Compatibility | Older SDK versions / games that do not subscribe ignore these two cmds without error |

### 5.3 Chat group message contract (`onChatGroupMessage`)

After the player joins a group via `joinChatGroup`, the host pushes that group's new messages to the page; the Builda SDK splits the batch and, via the internal interface
`Builda.__online.onChatMessage(handler)`, calls back the Builda Online SDK one message at a time; `offChatMessage(handler?)` unsubscribes.
This is an internal channel, not part of the public `Builda.events`; game code does not subscribe to it directly.

| Item | Contract |
|---|---|
| Call shape | `window.__cysjHost.onEvent("onChatGroupMessage", [payloadJsonStr])`, `args[0]` is a JSON **string** (the SDK also accepts the object form) |
| payload | `{ groupId: string, teamId: number, messages: [{ senderId: string, text: string }] }`. A batch belongs to only one group; `messages` are sorted chronologically |
| Push scope | Only pushes groups joined in this session and not yet left; after `quitChatGroup` that group is no longer pushed. Includes messages sent by the player themself; the Online SDK distinguishes them by `senderId` |
| SDK-side callback | One `{groupId, teamId, senderId, text}` at a time; the Online SDK is unaware of batches. No dedup, no caching, no resend; messages before subscription are not replayed |
| Semantics | Ordinary chat messages may be lost; the host does not need to ack/re-push; text has already been reviewed by the host, and the SDK and Online SDK do not submit it for review again. Nickname/avatar are fetched from `senderId` via `Builda.getRoleInfo` |
| Compatibility | Older SDK versions ignore this event without error; old hosts do not push this event, and the Online SDK must feature-detect `__online.onChatMessage` |

---

## 6. Godot 4 integration examples

Godot Web interacts with JS through the `JavaScriptBridge` singleton.

### 6.1 Synchronously read shared memory (most common)
```gdscript
# eval to read the property directly; the return value is the JS value
var lang: String  = JavaScriptBridge.eval("window.__cysjHost.sharedMemory['_language'] || ''", true)
```

### 6.2 Override onEvent to receive host events
```gdscript
var _on_event_cb  # must hold the reference to avoid GC

func _ready():
    _on_event_cb = JavaScriptBridge.create_callback(_on_host_event)
    var window = JavaScriptBridge.get_interface("window")
    window.__cysjHost.onEvent = _on_event_cb

func _on_host_event(args):
    var event: String = args[0]
    var payload = args[1]   # JS array
    match event:
        "onNetworkEvent": _on_network(payload[0], payload[1])
        "onAppEvent":     _on_app_event(payload[0], payload[1])  # cmd = "background" | "foreground" | "pausePanelShow" | "pausePanelHide" (prefer Builda.events "appVisibility" / "pausePanel" instead of wiring onEvent yourself)
        "onNativeResponse": _on_native_response(payload)
        "onRewardAdsResultV2": reward_ads_result.emit(payload[0], payload[1])  # [success, transId]
```

### 6.2.1 Watching ads (rewarded video ad, recommended pattern)
Watching an ad is "send request → wait for result event"; the most idiomatic Godot form is a singleton + signal: business code calls `show_rewarded()` and then `await`s a signal, with **no need** for 6.3's per-call callback bridging (the result goes through the `onEvent` dispatcher already set up in 6.2). `pos_id` is a game-defined ad placement analytics string; any name works (e.g. `revive`, `double_reward`); it is not a platform-assigned ad placement ID, and no application or declaration is needed.

```gdscript
# AdManager (autoload) — reuses the onEvent dispatcher from 6.2
signal reward_ads_result(success: bool, trans_id: String)

# Business code:
func try_reward():
    AdManager.show_rewarded("my_pos_id")
    var r = await AdManager.reward_ads_result   # [success, trans_id]
    if r[0]:
        _on_ad_completed(r[1]) # watched validly; the game grants its own in-game reward
    else:
        _on_ad_canceled()     # failed / closed midway / host has no ads integrated

# AdManager:
func show_rewarded(pos_id: String) -> void:
    JavaScriptBridge.eval(
        "window.flutter_inappwebview.callHandler('cysjBridge', { method: 'showRewardAds', args: ['%s'] });" % pos_id,
        true)
```

> `success=true` only means the ad was watched validly. The host **grants no reward at all**: what reward and how much is up to the game; the platform G-coin system is not granted through this. `trans_id` is the platform ad transaction id, which the game may use for its own display or server-side verification. Every call gets **exactly one** `onRewardAdsResultV2` push back, so `await` never hangs.

The two outcomes must be pushed back in this shape:

1. Playback failed / cancelled / no ad / host has no ads integrated: `[false, ""]`.
2. Watched validly: `[true, transId]`.

### 6.2.2 Payment (recommended via the Builda SDK)

Payment has two namespaces; the host cmds differ, the flow is the same, and the only difference is **who claims**. The game must not call the `makeNativeRequest` bridge method directly, and there are no getProducts / createOrder / getOrder style interfaces — product config reads and order creation/query/retry are all done by the host directly against the platform server.

**`Builda.iap` (new games always use this)**

- `Builda.iap.showPayPanel(saleId, { grantBy })` (Godot `builda.iap_show_pay_panel(sale_id, grant_by)`, Unity `IapShowPayPanel(saleId, grantBy, cb)`) → cmd `iapShowPayPanel`. `saleId` comes from the `payId` declared in `payPoints` of the current game draft manifest. `grantBy` is optional but it is **recommended to pass explicitly** the granter this code path intends to use (`client` / `room`): the host passes it through with the order for mismatch diagnostics; it does not override the server's frozen release config, and a mismatch is not guaranteed to reject order creation; when omitted the host uses the price list declaration. Granting should use the frozen `grantBy` in the order reply; do not substitute the request parameter for it.
- Returns `{success, orderId, grantBy}`: `success == true` **only means the payment succeeded**; the order stays in Paid and granting is not complete; `success == false` means cancelled or failed, do not grant. Cancel/failure must also be pushed back once, with `ok` still `true` and `data.success` `false`. `grantBy` is the granter frozen at order creation, which the host obtained from the order query; **it is authoritative**; do not infer it from the current price list.
- Grant according to `grantBy` in the reply:
  - `client` (omitted/`""` is equivalent): the game grants **idempotently** by `orderId`, and after granting calls `Builda.iap.claim(orderId)` (Godot `iap_claim`, Unity `IapClaim`) → cmd `iapClaimOrder`, order Paid→Delivered. claim is idempotent; repeated calls replay success.
  - `room`: hand the `orderId` to Room `doOrder` → `allowed` → `fulfill`; Room closes it out on the server; **the client must not grant and must not claim**. New hosts do not auto-claim either; the server keeps the original state for client claims on room snapshots — do not use this compatibility protection as a substitute for the correct granting flow.
- `Builda.iap.getPendingOrderIds()` (Godot `iap_get_pending_order_ids`, Unity `IapGetPendingOrderIds`) is read-only and returns the current player's undelivered (Paid, not claimed) `{orderIds}` for this game. **Does not go through the host**: the SDK uses the token obtained via `requestToken` to connect directly to Builda `/api/v1/sdk/pending-order-ids`. The list has **no** `payId` / `grantBy`; granting responsibility must not be inferred from the current price list, nor guessed from a bare `orderId` (the reply at payment time already gave `grantBy`; the game just persists an orderId→grantBy mapping). The recover-pending-orders action is **exactly the same** as after a successful `showPayPanel`: client orders are granted idempotently then claimed, room orders are handed to Room. Do not poll, and do not call it right on entering the game.
- The game and SDK do not pass `gameId`; the host uses the authoritative game context bound to the current WebView and ignores any game id passed from the Web side.
- In a browser or without a Builda App host it returns `HOST_UNAVAILABLE`; local development cannot fake a successful payment. Old Apps that do not recognize the `iap*` cmds reply `UNSUPPORTED_CMD` and show an upgrade prompt.

**`Builda.pay` (legacy, kept only for live old games)**

- `Builda.pay.showPayPanel(saleId)` (Godot `pay_show_panel`) → cmd `showPayPanel`. Once reconciliation shows the order paid, the host **auto-claims** and then replies; client orders are Delivered at reply time; the game grants directly on `success` and never claims.
- Live games depend on this semantics, so neither the host nor the SDK **changes** it; but it cannot re-grant (if the game's granting code fails, the order is already Delivered), and it cannot be used for pay points with `grantBy=room`. New code must not integrate it; when an old game migrates to `iap` it must add the claim and recover-pending-orders logic at the same time.
- There is no `claim` / `getPendingOrderIds` under `pay` (room snapshots are not closed by a client auto-claim, so you cannot infer from the legacy entry point that there are no pending orders).

### 6.3 Calling platform capabilities (callHandler returns a Promise; needs callback bridging)
`callHandler` returns a Promise, and `JavaScriptBridge.eval` cannot get the async result, so JS glue is needed to call the result back into Godot:

```gdscript
var _quit_cb

func quit_game():
    JavaScriptBridge.eval("window.flutter_inappwebview.callHandler('cysjBridge', { method: 'quitGame' });", true)

# Methods that need a return value (e.g. readMemory) use callback bridging:
var _reply_cb

func read_memory(key: String) -> void:
    _reply_cb = JavaScriptBridge.create_callback(func(a): _on_reply(a[0]))
    var win = JavaScriptBridge.get_interface("window")
    win.__cysj_reply = _reply_cb
    JavaScriptBridge.eval("""
        window.flutter_inappwebview
          .callHandler('cysjBridge', { method: 'readMemory', args: ['%s'] })
          .then(v => window.__cysj_reply(v));
    """ % key, true)

func _on_reply(value):
    print("readMemory => ", value)
```

> Methods with no return value, such as quit / analytics, can simply be `eval(callHandler(...))`; no callback bridging needed.

---

## 7. Extension rules (important)

Future platform capabilities (audio, sharing, ads, media, screen recording, sensors, vibration, jumping to Flutter pages, more server interactions, etc.) **always go through this bridge**; do not open another channel:

- **Game → host**: add a new `method`, put parameters in the `args` array, call via `callHandler('cysjBridge', { method, args })`.
- **Host → game**: add a new `event`, put parameters in the `args` array, push via `onEvent(event, args)`.
- **Naming convention**: `method`/`event` names are added **append-only**, never reused, never changing semantics; parameters are only appended to the end of the array, guaranteeing forward compatibility.
- **Forward compatibility**: the host returns `null` for unrecognized `method`s; the game side simply ignores unrecognized `event`s in its default branch.
- Any new capability must update this doc's method / event lists accordingly; this doc and `h5_game_bridge.dart` are the two sources of truth for this protocol.

---

## 8. Integration checklist (game side)

- [ ] Override `window.__cysjHost.onEvent` after startup (hold the Godot callback reference to prevent GC).
- [ ] Do not look for a token in the startup injection (`window.__cysjHost` has no token field); when a token is needed always obtain it dynamically via `Builda.requestToken()`; identity/private saves always go through `Builda.whoami()` / `Builda.privateKV.*`.
- [ ] Call `Builda.runtime.ready()` once at the very start of the game (underlying `callHandler('cysjBridge', { method: 'ready' })`), making sure every startup path reaches it; if it is not received within 30 seconds of page load the game is force-closed.
- [ ] Do not build your own quit button or music/SFX switches (the platform has general settings / pause-quit entries and pages); if the game genuinely has an in-game quit entry, use `callHandler('cysjBridge', { method: 'quitGame' })`, and the host opens the general pause/quit page.
- [ ] Switch audio to platform FMOD (`Builda.audio.playBGM` / `playSFX` / `stopBGM` / `setMuted`; the underlying bridge methods are only the four `playBgm` / `stopBgm` / `playSfx` / `setMuted`); **do not use Godot's built-in audio**; put audio files in the game package (relative paths) or on a CDN, never in the `.pck`.
- [ ] For ads prefer `Builda.ad.showRewardAd(posId)` (`posId` any name, analytics only, no ad placement application needed); the underlying result is received in `onEvent` as `onRewardAdsResultV2` (see 6.2.1). The host only returns `[success, transId]` and grants no reward; the game grants its in-game reward itself based on `success`.
- [ ] For payment use only `Builda.iap.showPayPanel(saleId)` (`Builda.pay` is legacy; new code must not integrate it); `success == true` only means the payment succeeded. Only for `grantBy=client` (omitted/empty string is equivalent) does the client grant idempotently by `orderId` and call `Builda.iap.claim(orderId)` after granting; for `grantBy=room` hand the `orderId` to Room `doOrder` → `allowed` → `fulfill`, and the client neither grants nor claims. Recover pending orders for undelivered orders with `Builda.iap.getPendingOrderIds()` (see 6.2.2).
- [ ] Calls that need a return value use callback bridging (see 6.3); calls without a return value just eval.


Merge pause state: track appVisible and pausePanelVisible, and use `!appVisible || pausePanelVisible` to decide pausing in one place. Do not resume directly in each of the two callbacks, otherwise returning to the foreground while the pause panel is still open would wrongly resume the game. The Godot/Unity examples already use the merged state.
