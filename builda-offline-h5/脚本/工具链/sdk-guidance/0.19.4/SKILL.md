---
name: builda-game-sdk
description: Integrate the Builda game SDK, adapt it to the game engine, and verify with the local mock.
---

# Builda Game SDK

SDK version: 0.19.4. Read the project's sdk-version first, then use the guidance for that version. Publishing, authorization and uploads belong to the Builda publishing tool; Online development belongs to the Online toolchain. Never ask the user for a token.

Always reply to the user in the language they use. This guidance is written in English; that does not change the language you talk to the user in.

## How to read this guidance

This file holds only the hard rules every SDK task must follow. Read the details on demand from the topics in the same directory: **read only the row for the current project's engine, plus the rows for the capabilities this task actually touches**. Do not read every topic up front. Topic APIs are written in `window.Builda.*` terms, with the Godot / Unity wrapper method names in parentheses.

| Task / engine | Required topic |
| --- | --- |
| HTML5 integration (pixi / phaser / Cocos Creator / plain canvas) | `./md_sdk_html5.md` |
| Unity integration (C# `BuildaSDK`, WebGL template) | `./md_sdk_unity.md`; for WebGL export and fonts also read `./md_unity_webgl.md` |
| Godot integration (`builda.gd`, `BuildaClient` Autoload, legacy API migration, `sdk smoke`) | `./md_sdk_godot.md` |
| Identity `whoami`, cloud saves `privateKV`, service token `requestToken`, role profile `getRoleInfo`, own-data view `playerData` | `./md_sdk_player.md` |
| Lifecycle `runtime.ready/quit`, App foreground/background and pause panel `events`, platform settings/exit page, keep screen on, host version detection | `./md_sdk_lifecycle.md` |
| Notch/safe area, avoiding the platform floating button, text input, localization and fonts | `./md_sdk_ui.md`; for localization or text rendering as boxes also read `./md_godot_i18n.md` |
| In-app purchase `iap`, rewarded video ads `ad`, `payPoints` | `./md_sdk_iap_ads.md` |
| Leaderboard runtime API and `rankBoards` publish config | `./md_sdk_rank.md` |
| Audio BGM/SFX/vibration, `assets.zip` (`audio/**`, `res/**`), asset URLs, loading large assets on demand | `./md_sdk_assets.md` |
| Bundle too large, upload over limit, asset splitting | `./md_bundle_size.md` |
| Microphone voice control (`BuildaMic`, `mic.*`) | `./md_sdk_mic.md` |
| Motion / gyroscope | `./md_sdk_gyro.md` |
| Mobile performance, stutter, overheating, dynamic DPR | `./md_mobile_perf.md` |
| Persistent identifiers such as cloud save keys, `payId`, `rankId` | `./md_persistent_ids.md` (see the hard rules below) |
| Multiplayer (Builda Online) | The Online integration and deployment contract is in the Builda Online entry document `https://ai.builda.game/online/releases/0.19.4/setup.md`. |
| Game-wide shared data across Rooms (Game Data) | Use the Builda Online entry document `https://ai.builda.game/online/releases/0.19.4/setup.md`; its Room SDK guidance covers shared objects, sorted indexes and counters. |

## Version boundaries

- The CLI, SKILL and SDK share one toolchain version. `builda check` checks and updates the current project's CLI/SKILL and prints `builda-version`, `toolchain-version`, `remote-version` and `sdk-sync=current|behind`.
- When `sdk-sync=behind`, run `sdk install`. It installs or updates the platform-owned `addons/builda/` in the project and writes `.builda-agent/sdk-version`, which records the independent SDK version actually installed.
- After upgrading the SDK you must tell the user what changed: before upgrading, note the `sdk-version` printed by `builda check` (if you did not, use
  `git show HEAD:.builda-agent/sdk-version`); after upgrading, read `.builda-agent/sdk-guidance/<new version>/CHANGELOG.md`
  and summarize, in two or three sentences, each section newer than the old version and not newer than the new one. If there are "Heads-up" items, first explain which code must change and get the user's consent before changing it.
  Never upgrade or migrate silently.
- When the user asks what is new in the SDK or whether to upgrade, read `https://ai.builda.game/game-sdk/CHANGELOG.md` (the changelog of the latest public version)
  and answer by comparing it with the project's `sdk-version`. Only answer; do not upgrade on your own because of the question.
- `sdk install` never overwrites an existing `scripts/BuildaClient.gd`. That file is user project code, and you may modify it as the game needs.
- If `sdk check` reports an SDK version mismatch, rerun `builda sdk install` first. Do not hand-mix addon, JS or `.d.ts` files from different versions.
- If `sdk check` reports `sdk-compat=failed`, the project code uses an API that does not exist in the current SDK (it will fail at runtime). Migrate using the line numbers and the replacement API given in the error; Godot migration examples are in `./md_sdk_godot.md`.

## Hard rules (all SDK tasks)

- **You must call `Builda.runtime.ready()` at the very start of the game** (the first thing in the entry script / first scene; do not wait for assets to load), and make sure every startup path reaches it: if the host does not receive ready within 30 seconds of page load, it force-closes the game. Settings (including music/SFX toggles) and pause/exit are provided by the platform's shared pages; the game must not build its own. The capsule menu already contains an exit entry, so `Builda.runtime.quit()` is optional when the game has no explicit exit flow; calling it opens that shared pause/exit page.
- Game code must not read or depend on any token injected by the host App, and must not bypass the Builda SDK to call the underlying App bridge — always go through the Builda SDK. Do not call `window.__cysjHost` or `flutter_inappwebview` directly; the SDK handles the local mock and the Builda App runtime internally.
- Platform-owned SDK files (`builda-sdk.js`, `builda-sdk.d.ts`, and the wrappers under `addons/builda/` and `Assets/Builda/`) are managed by `sdk install`; do not edit them by hand. To change behavior, change game code. The only project-owned files you may modify are `scripts/BuildaClient.gd` and the microphone analysis Worker directory (see the microphone topic).
- Private byte saves the game maintains itself must use `Builda.privateKV.*`. Do not build your own `localStorage`, IndexedDB, cookie or Godot local-file saves (full rules in `./md_sdk_player.md`). Player Data managed by an Online game server is a separate thing; `playerData` only observes the player's own, possibly stale, save and must not be used for durable business decisions, whole-save overwrites or replaying actions.
- Hold service tokens in memory only. **Never** write them to privateKV, local files, saves, URLs or logs.
- Payments and ads must go through the Builda SDK; do not call the underlying App bridge from game business code. In a browser or without a Builda App host, payments/ads return `HOST_UNAVAILABLE`; never fake a successful purchase or a watched ad.

Whenever a task involves privateKV save keys, payId, rankId, or persistent identifiers derived from them, you must first read `./md_persistent_ids.md`. Since `0.3.1`, privateKV keys accept `^[A-Za-z0-9_:-]{1,64}$`, and `payId` and `rankId` accept `^[A-Za-z0-9_-]{1,64}$`. New code uses only letters, digits, `_` and `-`, but existing privateKV colon keys such as `save:main` may still be read, written and deleted; do not require migration or block a draft just because of the colon. Keep genuinely invalid legacy data by default; never remove it automatically. Changing a `payId` changes the product mapping, and changing a `rankId` is equivalent to a new leaderboard — get the user's explicit confirmation before doing either.

Player Data query keys are exempt from the identifier rules above; use the raw field names defined by the game server and do not rename or migrate them. Their key contract is in `./md_sdk_player.md`.

## Return format

The JS side returns a uniform Result:

```json
{"ok": true, "data": {}}
```

or:

```json
{"ok": false, "error": {"code": "BAD_KEY", "message": "..."}}
```

## Local mock and Builda App runtime

Develop with the mock; the App injects the runtime. The mock and runtime APIs are identical. Local development needs no token. Web URLs can append:

```text
?gameId=local-game&builda_mock_player=alice&builda_mock_name=Alice
```

Local verification stops here: tests against the mock SDK all use mock test users, and there is no flow for hitting the real server locally with a real runtime token. Real identity, KV, payment, ads and similar behavior is verified only in the Builda App runtime (the release SDK) — go through the draft flow and play the draft in the Builda app's pending-release area. Exception: `playerData` is only verified in published games; draft play does not support it.

Builda App runtime semantics:

- In production the identity and KV come from the Builda App: `whoami()` returns the real player, and the platform decides where KV is stored (saves made while playing a draft in the pending-release area may be temporary and are not guaranteed to carry over after release). Game code is unaware of login and never handles any token.

## Error recovery

`BAD_KEY`, server code `200452`, invalid parameters, quota exceeded or value too large are deterministic errors: stop retrying immediately, fix the cause, then try again. Treat a failed batch as entirely unsuccessful; never retry endlessly or at high frequency. Logs must not contain tokens, save contents or payment credentials.
