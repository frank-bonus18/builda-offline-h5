# Builda SDK Changelog

For game makers: what each public SDK version adds and which changes require game code changes. One version number covers
everything released in that version: the base SDK (HTML5 / Godot / Unity and the runtime), the integration Skill, and the Builda Online multiplayer deliverables.

Projects pin their version in `.builda-agent/sdk-version` and are never upgraded automatically; only running `builda sdk upgrade` moves to the latest version.
Before upgrading, read every section between the current version and the target version, especially "Heads-up".

Maintenance convention: when bumping the root `VERSION`, add a section for that version at the very top; `go test ./...` checks that the first section's version equals
`VERSION`, and that the first section's "Multiplayer SDK versions" table matches the versions of the multiplayer packages in the repository. Version numbers that were never publicly released do not get their own section;
their content is merged into the next public version. This file is written in English.

## 0.19.4 - 2026-11-06

### Documentation fixes

- Add Game Data discovery and storage-selection guidance to the Chinese and English SDK guides.
- Clarify the difference between client Player Data observation and authoritative Room operations, and document local Mock persistence accurately.
- Remove the stale, hard-coded update date from both SDK guides. No API or game code changes are required.

### Multiplayer SDK versions

| Component | Version |
| --- | --- |
| builda-online Skill | 0.46.2 |
| Godot client | 0.20.1 |
| H5 client | 0.18.0 |
| Cocos client | 0.11.0 |
| Unity client | 0.19.1 |
| TypeScript Room SDK | 0.23.4 |
| Rust Room SDK | 0.23.4 |
| TypeScript Room Mock | 0.13.1 |
| Rust Room Mock | 0.12.1 |


## 0.19.3 - 2026-11-05

### Improvements

- The Godot and Unity localization examples now list all 11 languages the Builda App supports. These are examples, not a required set: a game can ship fewer languages and use the fallback for the rest. No game code changes are required.
- The localization guides now explain font checks for Thai and Vietnamese and how to test each language.

### Multiplayer SDK versions

| Component | Version |
| --- | --- |
| builda-online Skill | 0.46.2 |
| Godot client | 0.20.1 |
| H5 client | 0.18.0 |
| Cocos client | 0.11.0 |
| Unity client | 0.19.1 |
| TypeScript Room SDK | 0.23.4 |
| Rust Room SDK | 0.23.4 |
| TypeScript Room Mock | 0.13.1 |
| Rust Room Mock | 0.12.1 |

## 0.19.2 - 2026-11-05

### Improvements

- Maintenance release with no SDK behavior, API or guidance changes from 0.19.1. Upgrading is optional.

### Multiplayer SDK versions

| Component | Version |
| --- | --- |
| builda-online Skill | 0.46.2 |
| Godot client | 0.20.1 |
| H5 client | 0.18.0 |
| Cocos client | 0.11.0 |
| Unity client | 0.19.1 |
| TypeScript Room SDK | 0.23.4 |
| Rust Room SDK | 0.23.4 |
| TypeScript Room Mock | 0.13.1 |
| Rust Room Mock | 0.12.1 |

## 0.19.1 - 2026-11-05

### Improvements

- Game Data `rate_limited` errors now carry readable messages for traffic allowance limits. No game code changes are required; keep handling errors by `reason` and treat unknown reasons as a general retry-later case.

### Heads-up

- `fresh` on Game Data reads is now marked deprecated in the TypeScript and Rust Room SDKs. It stays accepted for compatibility, has no guaranteed effect and should not be set. Use `update` when a change depends on the latest value.

### Multiplayer SDK versions

| Component | Version |
| --- | --- |
| builda-online Skill | 0.46.2 |
| Godot client | 0.20.1 |
| H5 client | 0.18.0 |
| Cocos client | 0.11.0 |
| Unity client | 0.19.1 |
| TypeScript Room SDK | 0.23.4 |
| Rust Room SDK | 0.23.4 |
| TypeScript Room Mock | 0.13.1 |
| Rust Room Mock | 0.12.1 |

## 0.19.0 - 2026-11-04

### Added

- Game Data: per-game objects, sorted indexes and counters shared across Rooms, available in the TypeScript and Rust Room SDKs. See the Online Skill's Game Data guide.
- Asynchronous Room tasks: use `runAsync` / `spawn_local` with `*Async` / `*_async` calls.
- The local Room Mocks now keep confirmed Game Data between restarts.
- After changing multiplayer behavior, the Online Skill now tells you how to test the change locally before deploying, with the Mock command for your project. No game code changes are required.
- The Online Skill now joins the Builda App Room chat by default when adding multiplayer, using `team_id` 0 for room-wide chat. Tell your agent if you want team-only chat or no chat. Existing games are unchanged until your agent next works on multiplayer.
- The SDK guides now list the 11 languages the Builda App supports for `Builda.runtime.language()`. No game code changes are required; keep falling back for languages your game does not translate.

### Improvements

- The Game Data guide now lists the `rate_limited` reasons for traffic allowance limits: `quota_wait_too_long`, `quota_queue_full`, `quota_deadline_short`, `quota_replica_memory`, `quota_shutdown` and `attempt_budget_exhausted`.
- The Game Data guide now covers traffic allowance across all Rooms, leaderboard write limits, and estimated values from very frequent counter adds.

### Heads-up

- Do not set `fresh` on Game Data reads. The option remains for compatibility, has no guaranteed effect and cannot give a newer value. To show a player their own change, use the written value or write result; for correctness use `update` or `compareExchange`.
- Allowance is calculated per game across all Rooms and counts reads as well as writes. Code that handles `rate_limited` by `reason` should treat unknown reasons as a generic limit.
- Game Data message queues remain paused.

### Multiplayer SDK versions

| Component | Version |
| --- | --- |
| builda-online Skill | 0.46.2 |
| Godot client | 0.20.1 |
| H5 client | 0.18.0 |
| Cocos client | 0.11.0 |
| Unity client | 0.19.1 |
| TypeScript Room SDK | 0.23.3 |
| Rust Room SDK | 0.23.3 |
| TypeScript Room Mock | 0.13.0 |
| Rust Room Mock | 0.12.0 |

## 0.17.6 - 2026-10-30

### Improvements

- Preserve local Mock persistence and Game Data error guidance from SDK 0.15.3 while adding local resource diagnostics and the staged multiplayer integration workflow.
- Check online client, source compiler and runtime compatibility before publishing changed multiplayer packages. Existing published Room artifacts remain independent of later source uploads.
- Report incompatible source uploads clearly and preserve the previous deployment receipt when recording a new receipt fails.
- Retire author-initiated Room migration commands. Normal gameplay, source deployment and platform-managed recovery remain available.

### Heads-up

- Rebuild Room source only in an environment supporting Room Contract 0.16.0. Unknown writes must retain their original recovery handles; do not repeat them as new writes.
- Local Mock persistence and resource checks do not prove online permissions, durability or runtime compatibility.

### Multiplayer SDK versions

| Component | Version |
| --- | --- |
| builda-online Skill | 0.45.0 |
| Godot client | 0.20.1 |
| H5 client | 0.18.0 |
| Cocos client | 0.11.0 |
| Unity client | 0.19.1 |
| TypeScript Room SDK | 0.23.3 |
| Rust Room SDK | 0.23.3 |
| TypeScript Room Mock | 0.13.0 |
| Rust Room Mock | 0.12.0 |

## 0.17.5 - 2026-10-29

### Release compatibility checks

- Combine current public Game Data guidance with local resource diagnostics and preserve paused queue behavior.

- Report incompatible Room source uploads with an explicit error code and an approved upgrade, local test and redeploy workflow.
- Preserve existing published server releases when a new source upload fails.
- Retry temporary Windows file locks when recording a deployment receipt, preserving the last complete receipt on failure.

- Share one client API contract across Godot, H5, Cocos and Unity.
- Keep base SDK releases independent of Online deployment when Online contracts and Room build inputs are unchanged.
- Require accepted platform compatibility before publishing changed client contracts or Room build inputs.

### Integrated release updates

- Include current target Player Data and asynchronous Room support and retryable client leave fixes.
- Preserve local resource warnings, first-time installation checks and the staged multiplayer integration workflow.
- Room Contract 0.16.0 requires a compatible online runtime before rebuilding and deploying Room artifacts.

### Multiplayer SDK versions

| Component | Version |
| --- | --- |
| builda-online Skill | 0.43.2 |
| Godot client | 0.20.1 |
| H5 client | 0.18.0 |
| Cocos client | 0.11.0 |
| Unity client | 0.19.1 |
| TypeScript Room SDK | 0.22.4 |
| Rust Room SDK | 0.22.6 |
| TypeScript Room Mock | 0.11.1 |
| Rust Room Mock | 0.10.1 |

## 0.17.1 - 2026-10-27

### Guidance and first-time setup

- Preserve the installation source when retrying language selection, and prepare project-local TypeScript Mock dependencies before claiming readiness.
- Separate tool installation from gameplay configuration and online game binding.
- Keep the first client draft unpublished while deploying and verifying its matching Room; validate only the selected game engine.

### Multiplayer SDK versions

| Component | Version |
| --- | --- |
| builda-online Skill | 0.39.1 |
| Godot client | 0.19.2 |
| H5 client | 0.17.2 |
| Cocos client | 0.10.2 |
| Unity client | 0.18.3 |
| TypeScript Room SDK | 0.14.11 |
| Rust Room SDK | 0.14.11 |
| TypeScript Room Mock | 0.7.0 |
| Rust Room Mock | 0.6.1 |

## 0.17.0 - 2026-10-27

### Guidance and local development

- Add read-only `builda-online updates`: discover published releases at the start of development and recommend upgrades without changing the pinned SDK until authorized. Read-only reviews never repair dependencies.
- Fix Windows prerequisite invocation for project paths containing spaces and launch PowerShell independently of PATH.
- Add `check --local` for first-time local development without online game binding; online checks and deployment still require a real binding.
- Harden the shared Room examples against malformed messages and schedule final closure on a later tick, with recovery-safe state and regression coverage for both languages.

### Multiplayer SDK versions

| Component | Version |
| --- | --- |
| builda-online Skill | 0.39.0 |
| Godot client | 0.19.2 |
| H5 client | 0.17.2 |
| Cocos client | 0.10.2 |
| Unity client | 0.18.3 |
| TypeScript Room SDK | 0.14.11 |
| Rust Room SDK | 0.14.11 |
| TypeScript Room Mock | 0.7.0 |
| Rust Room Mock | 0.6.1 |

## 0.16.2 - 2026-10-27

### Guidance

- Correct TypeScript message and player identity examples, reuse the tested shipped Room, and document shared-module upload boundaries with isolated source validation.
- Centralize performance analysis across server compute, latency, client frame rate, capacity/cost and stability. Refine language recommendations by code reuse and maintenance needs; prioritize Rust for explicit server-compute goals, including H5, without automatic migration or unmeasured performance claims.

### Multiplayer SDK versions

| Component | Version |
| --- | --- |
| builda-online Skill | 0.38.2 |
| Godot client | 0.19.2 |
| H5 client | 0.17.2 |
| Cocos client | 0.10.2 |
| Unity client | 0.18.3 |
| TypeScript Room SDK | 0.14.11 |
| Rust Room SDK | 0.14.11 |
| TypeScript Room Mock | 0.7.0 |
| Rust Room Mock | 0.6.1 |

## 0.16.1 - 2026-10-27

### Guidance

- For a new Room without an existing language choice, recommend Rust by default and TypeScript for H5 games. Preserve existing Rooms and explicit choices; clarify that JavaScript H5 clients can reuse portable logic with a TypeScript Room, while browser dependencies and authoritative state stay separate.

### Multiplayer SDK versions

| Component | Version |
| --- | --- |
| builda-online Skill | 0.38.1 |
| Godot client | 0.19.2 |
| H5 client | 0.17.2 |
| Cocos client | 0.10.2 |
| Unity client | 0.18.3 |
| TypeScript Room SDK | 0.14.11 |
| Rust Room SDK | 0.14.11 |
| TypeScript Room Mock | 0.7.0 |
| Rust Room Mock | 0.6.1 |

## 0.16.0 - 2026-10-27

### Heads-up

- Multiplayer guidance now follows a staged two-client integration workflow with resumable project evidence. Correct Rust API examples, Cocos coverage, offline locked-install behavior, and the distinction between static checks and online verification.

- Rust Room guidance now requires explicit collection and allocation bounds, peak-memory review, lifecycle cleanup, and repeat-cycle/restore evidence. Local Mock warnings do not certify online WASM memory usage.

- Local Room Mocks now report nonfatal resource warnings to the terminal and a persistent AI-readable health report. Exact byte/count checks and 25% time-window headroom help find costly gameplay without shutting down the local Room. Agents must inspect the report after testing. CPU/fuel and WASM memory remain online-only verification.

- Multiplayer development now requires proactive local Mock acceptance with two distinct clients before completion or upload. Agents report reproducible results and blockers separately from online verification; builds and Mock startup alone are not acceptance.

- Removed the author-facing Room migration and migration-status commands. Room placement and checkpoint scheduling are managed by the platform. Existing Room checkpoint/restore callbacks and automatic client reconnection remain supported. Remove these commands from custom maintenance scripts when upgrading.

### Maintenance

- Packaging and release coordination improvements.

### Multiplayer SDK versions

| Component | Version |
| --- | --- |
| builda-online Skill | 0.38.0 |
| Godot client | 0.19.2 |
| H5 client | 0.17.2 |
| Cocos client | 0.10.2 |
| Unity client | 0.18.3 |
| TypeScript Room SDK | 0.14.11 |
| Rust Room SDK | 0.14.11 |
| TypeScript Room Mock | 0.7.0 |
| Rust Room Mock | 0.6.1 |

## 0.15.3 - 2026-10-29

### Added

- Local TypeScript and Rust Room Mocks save completed Game Data, player data and mock orders so local tests can continue after restarting. Live Room state and recovery handles are not restored.
- Game Data errors include readable explanations for rate limits and access blocks; report the error code, reason and retry delay alongside the explanation, and use code and reason for program logic.
- Game Data lets Rooms in the same game share objects, sorted indexes and counters. The Online Skill can suggest it when it fits the game, and the Room SDK guides describe how to use it. Message queues remain paused.
- Room code can use asynchronous target Player Data for players in the same game, including players in other Rooms or offline. Conditional updates use a synchronous, pure callback and keep recovery handles for unknown writes.
- Ready asynchronous tasks can progress between gameplay ticks. Review code that assumes continuations run only during ticks; lifecycle hooks remain synchronous.

### Heads-up

- When the online service exhausts retries after confirmed rate-limit rejections, Game Data may now return `rate_limited` and a reason instead of `timeout`. Update code that branches only on `timeout`; use `retryAfterMs` / `retry_after_ms` for bounded retries. For `outcome_unknown`, resume with the original recovery handle if present; otherwise stop automatic retries and report the unknown result. Do not repeat the business write as a new operation.
- Rebuild Room artifacts only in a compatible environment supporting Room Contract 0.16.0. Keep recovery handles for unknown writes and do not repeat a business operation as a new write.
- Local Mocks do not prove online permissions, durability, or runtime compatibility. SDK APIs remain source-compatible.

### Fixes

- Local Mock writes no longer report success after saving fails; Rust Mock saves order completion and rewards together.

- Clarify synchronous and asynchronous Room data calls, permission errors and gameplay message bandwidth; remove obsolete examples from user guidance.
- Keep the machine-readable Room contracts in Mock packages while excluding implementation notes intended for platform maintainers. No game code changes are required for this documentation cleanup.

### Multiplayer SDK versions

| Component | Version |
| --- | --- |
| builda-online Skill | 0.44.2 |
| Godot client | 0.20.1 |
| H5 client | 0.18.0 |
| Cocos client | 0.11.0 |
| Unity client | 0.19.1 |
| TypeScript Room SDK | 0.23.2 |
| Rust Room SDK | 0.23.2 |
| TypeScript Room Mock | 0.12.1 |
| Rust Room Mock | 0.11.1 |

## 0.14.7 - 2026-10-28

### Added

- Game Data lets Rooms in the same game share objects, sorted indexes and counters. The Online Skill can suggest it when it fits the game, and the Room SDK guides describe how to use it. Message queues remain paused.
- Room code can use asynchronous target Player Data for players in the same game, including players in other Rooms or offline. Conditional updates use a synchronous, pure callback and keep recovery handles for unknown writes.
- Ready asynchronous tasks can progress between gameplay ticks. Review code that assumes continuations run only during ticks; lifecycle hooks remain synchronous.

### Heads-up

- Rebuild Room artifacts only in a compatible environment supporting Room Contract 0.16.0. Keep recovery handles for unknown writes and do not repeat a business operation as a new write.
- Local Mocks do not prove online permissions, durability, or runtime compatibility. SDK APIs remain source-compatible.

### Fixes

- Clarify synchronous and asynchronous Room data calls, permission errors and gameplay message bandwidth; remove obsolete examples from user guidance.
- Keep the machine-readable Room contracts in Mock packages while excluding implementation notes intended for platform maintainers. No game code changes are required for this documentation cleanup.

### Multiplayer SDK versions

| Component | Version |
| --- | --- |
| builda-online Skill | 0.43.0 |
| Godot client | 0.20.1 |
| H5 client | 0.18.0 |
| Cocos client | 0.11.0 |
| Unity client | 0.19.1 |
| TypeScript Room SDK | 0.22.3 |
| Rust Room SDK | 0.22.5 |
| TypeScript Room Mock | 0.10.3 |
| Rust Room Mock | 0.9.5 |

## 0.14.6 - 2026-10-27

### Added

- Room code can use asynchronous target Player Data for players in the same game, including players in other Rooms or offline. Conditional updates use a synchronous, pure callback and keep recovery handles for unknown writes.
- Ready asynchronous tasks can progress between gameplay ticks. Review code that assumes continuations run only during ticks; lifecycle hooks remain synchronous.

### Heads-up

- Rebuild Room artifacts only in a compatible environment supporting Room Contract 0.16.0. Keep recovery handles for unknown writes and do not repeat a business operation as a new write.
- Local Mocks do not prove online permissions, durability, or runtime compatibility. SDK APIs remain source-compatible.

### Fixes

- Clarify synchronous and asynchronous Room data calls, permission errors and gameplay message bandwidth; remove obsolete examples from user guidance.
- Keep the machine-readable Room contracts in Mock packages while excluding implementation notes intended for platform maintainers. No game code changes are required for this documentation cleanup.

### Multiplayer SDK versions

| Component | Version |
| --- | --- |
| builda-online Skill | 0.42.5 |
| Godot client | 0.20.1 |
| H5 client | 0.18.0 |
| Cocos client | 0.11.0 |
| Unity client | 0.19.1 |
| TypeScript Room SDK | 0.22.2 |
| Rust Room SDK | 0.22.4 |
| TypeScript Room Mock | 0.10.2 |
| Rust Room Mock | 0.9.4 |

## 0.12.4 - 2026-10-27

### Fixes

- Unity now safely starts an immediate Room leave retry after a failed attempt, preserving the original operation and concurrent-call behavior.

- Godot now recognizes successful Room leave receipts and allows gameplay to continue after a confirmed leave. Invalid or mismatched receipts still keep the leave pending. No game code changes are required.

### Multiplayer SDK versions

| Component | Version |
| --- | --- |
| builda-online Skill | 0.36.0 |
| Godot client | 0.20.1 |
| H5 client | 0.18.0 |
| Cocos client | 0.11.0 |
| Unity client | 0.19.1 |
| TypeScript Room SDK | 0.14.11 |
| Rust Room SDK | 0.14.11 |
| TypeScript Room Mock | 0.6.18 |
| Rust Room Mock | 0.5.19 |

## 0.12.3 - 2026-10-26

### Fixes and improvements

- Spine binary skeletons (`.skel`) and texture atlases (`.atlas`) are now allowed under `res/**` in `assets.zip`, and `.skel` is now allowed in the H5 main bundle (`.atlas` already was).
  Large Spine projects can move skeletons, atlases and their `.png` pages out of the main bundle into `res/**` and load them with `Builda.assets.url()`. This needs Builda CLI 0.4.109 or later; existing games need no code changes.

### Multiplayer SDK versions

| Component | Version |
| --- | --- |
| builda-online Skill | 0.36.0 |
| Godot client | 0.20.0 |
| H5 client | 0.18.0 |
| Cocos client | 0.11.0 |
| Unity client | 0.19.0 |
| TypeScript Room SDK | 0.14.11 |
| Rust Room SDK | 0.14.11 |
| TypeScript Room Mock | 0.6.18 |
| Rust Room Mock | 0.5.19 |

## 0.12.1 - 2026-10-23

### Fixes and heads-up

- Failed or timed-out Room leave keeps its handle and reuses the same operation on retry. Concurrent calls share one attempt; gameplay, reconnect and new admissions pause until release is confirmed.
- On services supporting retryable leave, Room data connection loss does not prevent confirmation. Older services keep the live-data-channel fallback and cannot confirm after that channel is lost.
- A pending leave reports `ROOM_LEAVE_PENDING`; success closes the Room once. Keep the handle and retry leave; an unknown or expired receipt is not a successful leave.

### Multiplayer SDK versions

| Component | Version |
| --- | --- |
| builda-online Skill | 0.36.0 |
| Godot client | 0.20.0 |
| H5 client | 0.18.0 |
| Cocos client | 0.11.0 |
| Unity client | 0.19.0 |
| TypeScript Room SDK | 0.14.11 |
| Rust Room SDK | 0.14.11 |
| TypeScript Room Mock | 0.6.18 |
| Rust Room Mock | 0.5.19 |

## 0.12.0 - 2026-10-22

### New capabilities

- Query important resource and Room failure alerts with `builda-online alerts --since 30m --json`, optionally filtered by `--room-id`. Alerts are saved separately from user logs, include measured limits and actions, and aggregate repeated observations with first/last times and counts. Delivery is best effort; empty results do not prove health. Existing log commands remain compatible.

- Query your current game's recent multiplayer logs with `builda-online logs --since 30m`; you no longer need to know a Room ID. Results identify each Room and Artifact and include bounded drop statistics and exit summaries. `builda-online logs <room-id>` remains supported with its existing response.
- Game-wide results explicitly report `partial` or `has_more` when a query reaches its limits. Narrow the time range or use a returned Room ID for detail; no output does not prove that the game is healthy.

### Fixes and improvements

- Increased the online Room fuel warning threshold to 200,000,000 and the hard limit to 2,000,000,000 per lifecycle callback. Elapsed-time protection still applies independently; fuel is not a CPU-time unit. Existing games need no code changes.
- Raised online per-user bandwidth limits to a 5-second average of 20 KB/s upstream and 80 KB/s downstream, with 1-second bursts up to 40 KB and 160 KB. The 5-second warning averages are 10 KB/s and 40 KB/s; Room quotas scale with active users. Excess gameplay frames are dropped while connections remain available.
- Updated the public resource limits contract to 1.1.0 and the resource guidance included with the multiplayer Skill and local Mock packages. Local source Mocks do not enforce WASM fuel.

### Multiplayer SDK versions

| Component | Version |
| --- | --- |
| builda-online Skill | 0.35.0 |
| Godot client | 0.19.2 |
| H5 client | 0.17.2 |
| Cocos client | 0.10.2 |
| Unity client | 0.18.3 |
| TypeScript Room SDK | 0.14.11 |
| Rust Room SDK | 0.14.11 |
| TypeScript Room Mock | 0.6.18 |
| Rust Room Mock | 0.5.19 |

## 0.11.2 - 2026-10-22

### Fixes

- Private room creation can wait up to 60 seconds without prematurely closing the connection. Other request deadlines are unchanged.

### Multiplayer SDK versions

| Component | Version |
| --- | --- |
| builda-online Skill | 0.34.0 |
| Godot client | 0.19.2 |
| H5 client | 0.17.2 |
| Cocos client | 0.10.2 |
| Unity client | 0.18.3 |
| TypeScript Room SDK | 0.14.11 |
| Rust Room SDK | 0.14.10 |
| TypeScript Room Mock | 0.6.17 |
| Rust Room Mock | 0.5.18 |

## 0.9.7 - 2026-10-19

### Fixes and improvements

- The SDK integration guidance (the entry `SKILL.md` and all engine and capability topics) is now in English, so the many AIs used by game makers worldwide can understand the integration rules precisely;
  the AI still talks to you in your own language. The integration rules themselves are unchanged; existing games need no code changes.
- Corrected the file-count limit for `assets.zip` in the integration guidance and the developer guide: the actual limit is 10000 files (the docs previously still said 500).
- The full description of the leaderboard publish config (`rankBoards` field constraints, full-update semantics, which changes clear historical scores) has been merged into the SDK's `md_rankboards.md`,
  so the AI can fully configure leaderboards from the SDK guidance alone; the configuration rules themselves are unchanged.
- UI text in the `builda dev` test shell and the Web mock (buttons, payment/ad/input mock panels, console hints) now follows the browser language:
  Chinese when the browser's preferred language is Chinese, English otherwise. `builda_mock_lang` still only affects the `runtime.language()` the game reads.
- This changelog and the comments in the SDK interface files (`builda-sdk.d.ts`, the Godot `builda.gd` / `BuildaClient.gd` / `BuildaMic`,
  and the Unity C# and `.jslib` wrappers) are now in English. Only comments changed; no API or behavior changes.
  `sdk install` does not overwrite an existing `scripts/BuildaClient.gd`, so a project's own copy keeps its current comments.
- The Builda Online multiplayer Skill (`builda-online` 0.34.0) and the log diagnostics Skill (`builda-online-diagnostics` 0.4.2) are now in English,
  including the installation guide and all references. The multiplayer workflow and rules are unchanged; the AI still talks to you in your own language.
- The Builda Online client SDKs (Godot, H5, Cocos, Unity), the TypeScript and Rust Room SDKs and their local Mocks, and the
  example projects now have English code comments, READMEs and changelogs. Only comments and documentation changed; no API or
  behavior changes, and existing games need no code changes. Each package gets a patch release (see the table below).

### Multiplayer SDK versions

| Component | Version |
| --- | --- |
| builda-online Skill | 0.34.0 |
| Godot client | 0.19.1 |
| H5 client | 0.17.1 |
| Cocos client | 0.10.1 |
| Unity client | 0.18.2 |
| TypeScript Room SDK | 0.14.11 |
| Rust Room SDK | 0.14.10 |
| TypeScript Room Mock | 0.6.17 |
| Rust Room Mock | 0.5.18 |

## 0.9.6 - 2026-10-10

### Added

- `playerData.getMany` / `listKeys`: published games can read the current player's own Player Data without joining a multiplayer room; supported in H5, Godot, and Unity.

### Heads-up

- Player Data results may lag, and revision/source are not guaranteed to be up to date; use them for display only, never to decide rewards, deductions, payments, or crop stealing, and never write a whole save back to overwrite.
  Business actions belong to the Online game server; a later stale read must not override the result of an authoritative action or trigger a replay. privateKV remains a separate private byte save.
- int64 and revision are strings, bytes is a Base64 type tree; schemaVersion is a uint32 number or null. Draft playtesting does not provide this read.
- Player Data queries use the raw field names defined by the game server and do not apply the identifier rules of privateKV/payId/rankId; example fields and the mock do not mean the data already exists in production.
- Existing games need no code changes.

### Multiplayer SDK versions

| Component | Version |
| --- | --- |
| builda-online Skill | 0.33.0 |
| Godot client | 0.19.0 |
| H5 client | 0.17.0 |
| Cocos client | 0.10.0 |
| Unity client | 0.18.1 |
| TypeScript Room SDK | 0.14.10 |
| Rust Room SDK | 0.14.9 |
| TypeScript Room Mock | 0.6.16 |
| Rust Room Mock | 0.5.17 |

## 0.8.21 - 2026-09-29

### Added

- English versions of the SDK developer guide and the Builda Online user docs: `game-sdk/sdk-guide.en.html`, `online/index.en.html`;
  a link in the top-right corner switches between Chinese and English, and the content matches the Chinese version.
- The "iap: in-app purchase payment" and "ad: rewarded video" sections of the SDK developer guide can be linked directly: `sdk-guide.html#iap`, `sdk-guide.html#ad`.
- The Builda Online multiplayer notes in the SDK developer guide moved from the top of the page to the last section of "Capability details and usage rules" (`sdk-guide.html#online`).
- The Builda Online user docs now cover rank score (`rankScore`), Room player data, payment fulfillment (`grantBy`,
  `doOrder` / `fulfill`), and how the local Mock can simulate player data and fake-order fulfillment.
- The gameplay design advice in the multiplayer development Skill no longer implies that action/shooter games must be server-authoritative: client reporting plus Room validation also works; when ranking or
  rewards are introduced, the AI re-evaluates the anti-cheat approach together with you instead of requiring a rework by default.
- The SDK integration guidance is split into a short entry plus topics per engine (HTML5 / Unity / Godot) and per capability (save, payments and ads, leaderboards, audio assets,
  microphone, motion sensing, etc.): the AI reads only your engine and the capabilities used this time, so it reads less and faster; the integration rules themselves are unchanged.
- The multiplayer development Skill is likewise split by stage and engine: solution discussion, writing the client, writing the Room, local integration testing, and going live each read their own docs;
  client examples cover only your engine (Godot / H5 and Cocos / Unity), and Room examples cover only your chosen TypeScript or Rust. The AI reads noticeably
  less; multiplayer rules, solution confirmation, and release order are unchanged.

### Multiplayer SDK versions

| Component | Version |
| --- | --- |
| builda-online Skill | 0.33.0 |
| Godot client | 0.19.0 |
| H5 client | 0.17.0 |
| Cocos client | 0.10.0 |
| Unity client | 0.18.1 |
| TypeScript Room SDK | 0.14.10 |
| Rust Room SDK | 0.14.9 |
| TypeScript Room Mock | 0.6.16 |
| Rust Room Mock | 0.5.17 |

## 0.8.19 - 2026-09-24

### Added

- The SDK package now ships this changelog: after upgrading it is at `.builda-agent/sdk-guidance/<version>/CHANGELOG.md`, and the changelog for the latest public version
  is at `<SDK download URL>/game-sdk/CHANGELOG.md`.
- The integration Skill requires the Agent to proactively tell the user what changed after upgrading the SDK; when there are items that require code changes, it must get the user's consent before changing code.
  When the user asks about a new version, the Agent reads the latest changelog to answer and does not upgrade on its own.
- The SDK developer guide (`game-sdk/sdk-guide.html`) and the Builda Online user docs now use the same colors, fonts, and component styles as the Builda main site; content unchanged.

### Multiplayer SDK versions

| Component | Version |
| --- | --- |
| builda-online Skill | 0.32.0 |
| Godot client | 0.19.0 |
| H5 client | 0.17.0 |
| Cocos client | 0.10.0 |
| Unity client | 0.18.1 |
| TypeScript Room SDK | 0.14.10 |
| Rust Room SDK | 0.14.9 |
| TypeScript Room Mock | 0.6.16 |
| Rust Room Mock | 0.5.17 |

## 0.8.18 - 2026-09-24

### Added

- Multiplayer ranked matchmaking can submit rank scores: a solo player joining the queue passes `rankScore`, and a Party leader passes `memberRankScores` for all members
  (Godot: `rank_score` / `member_rank_scores`; Unity: `MatchJoinOptions.RankScore` / `MemberRankScores`).
  Scores are provided by the game; the platform only validates shape and range (0 to 2^53−1), not authenticity.

### Fixes and improvements

- When a matchmaking Room is connected but still waiting for all players to activate, the SDK extends the room-entry wait once and renews the Ticket, so long waits no longer falsely report a connection timeout.
- The Unity multiplayer SDK's runtime tests now compile with the NUnit bundled in Unity 2021.3; runtime behavior is unchanged.

### Multiplayer SDK versions

| Component | Version |
| --- | --- |
| builda-online Skill | 0.32.0 |
| Godot client | 0.19.0 |
| H5 client | 0.17.0 |
| Cocos client | 0.10.0 |
| Unity client | 0.18.1 |
| TypeScript Room SDK | 0.14.10 |
| Rust Room SDK | 0.14.9 |
| TypeScript Room Mock | 0.6.16 |
| Rust Room Mock | 0.5.17 |

## 0.8.16 - 2026-09-24

### Added

- `Builda.runtime.appVersionAtLeast("1.84.0")` checks whether the host App is new enough to support a capability; it returns a boolean synchronously,
  comparing semantic versions segment by segment (Godot `builda.runtime_app_version_at_least`, Unity `BuildaSDK.RuntimeAppVersionAtLeast`).
  Do not fetch the version string and compare it yourself: `"1.9.0"` and `"1.10.0"` would compare the wrong way.
- `Builda.runtime.appVersion()` returns the host App's raw version, for display or reporting only. Hosts older than App 1.84.0 and the local
  mock always return `"1.83.0"`; locally, use the URL parameter `builda_mock_app_version=1.84.0` to take the other branch.
- `Builda.runtime.setKeepScreenOn(enabled)` toggles keeping the screen on; requires host App 1.84.0 or later. The returned `enabled` is the state actually
  in effect; older hosts return `UNSUPPORTED_CMD`, which you can simply treat as "not supported". It is scoped to the current game session; no need to reset it on exit.
- The integration guidance now covers motion sensing / gyroscope: the game listens to `deviceorientation` directly; it is not an SDK API; iOS requires App 1.84.0.

### Fixes and improvements

- Local mock: `setMuted(true, "bgm")` no longer mutes sound effects too, matching real devices; omitting group is equivalent to `"bgm"`.
- Local mock: when `playBGM` / `playSFX` hit the browser's autoplay block, they return `{ok: true, data: {available: false}}`
  instead of throwing an unhandled rejection.
- Local mock: `timeoutMs` of `requestMicrophone` now actually takes effect, so it no longer hangs when the permission prompt is never answered.
- Local mock: when `setKeepScreenOn` does not take effect, the reason is printed to the console; keep-screen-on cannot be verified while the page is not visible (headless, minimized, background tab).
- The integration guidance now states the mute layering rule: sound the player turned off in the App cannot be brought back by the game's `setMuted(false)`; after temporarily ducking audio, the game must remember to undo it.

### Multiplayer SDK versions

Same as 0.8.15.

## 0.8.15 - 2026-09-23

Compared with the previous public version 0.7.1, includes all changes from internal versions 0.8.0 - 0.8.14.

### Heads-up

- In-app purchases move to the new `Builda.iap` namespace; `Builda.pay` is frozen as legacy: existing games keep working, but new code must not integrate it.
  The difference is that `iap.showPayPanel` **does not claim automatically**: `success` only means the payment succeeded, and the order stays in the paid state.
  For orders whose granter is `client`, after the game idempotently grants the items by `orderId` it must call `Builda.iap.claim(orderId)`.
  When migrating from `pay` to `iap`, add this step.
- Each `payPoints` pay point in `builda.publish.json` carries the granter `grantBy`: `"client"` (omitted or empty string means the same) or `"room"`.
  `"room"` must be declared explicitly, and the `orderId` handed to Room `doOrder`; the client neither grants nor claims.

### Added

- `Builda.iap.showPayPanel(saleId, { grantBy })`: responds with `{success, orderId, grantBy}`; `grantBy` is the granter frozen for this order,
  and the game relies on it to decide between granting locally and handing off to the Room (Godot `iap_show_pay_panel`, Unity `IapShowPayPanel`).
- `Builda.iap.claim(orderId)` returns `{orderId, status}`; a client claim on a `room` order does not change its status.
- `Builda.iap.getPendingOrderIds()` queries the current player's orders that are paid but not yet delivered; recovering pending orders uses the same idempotent granting logic as a successful payment.
- Multiplayer Room adds player data (`cloudEnqueue` / `cloudFlush`): a successful `cloudEnqueue` means the write is queued; when you need to confirm it took effect,
  call `cloudFlush` and wait for applied.
- Multiplayer Room adds payment fulfillment: the `doOrder` callback decides, then calls `fulfill` to grant; `cloudEnqueue` / `cloudFlush` cannot be called inside the payment callback.
- The TypeScript / Rust Room Mock can simulate player data and fake payment fulfillment locally, so the full loop runs without going live.

### Fixes and improvements

- Writing a negative int64, negative float64, or negative increment in a TypeScript Room no longer causes the Room to be closed.

### Multiplayer SDK versions

| Component | Version |
| --- | --- |
| builda-online Skill | 0.31.5 |
| Godot client | 0.18.1 |
| H5 client | 0.16.1 |
| Cocos client | 0.9.1 |
| Unity client | 0.17.1 |
| TypeScript Room SDK | 0.14.10 |
| Rust Room SDK | 0.14.9 |
| TypeScript Room Mock | 0.6.16 |
| Rust Room Mock | 0.5.17 |

## 0.7.1 and earlier

No changelog was compiled. For the history of each multiplayer component, see the `CHANGELOG.md` of each package under `online/users/sdk/`.
