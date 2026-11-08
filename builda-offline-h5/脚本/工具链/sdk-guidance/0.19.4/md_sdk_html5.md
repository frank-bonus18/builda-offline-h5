<!-- builda-sdk-version: 0.19.4 -->
# SDK Integration (HTML5)

HTML5 projects (pixi.js / phaser.js / Cocos Creator / plain canvas, etc.) call the `window.Builda.*` JS API directly, with no engine bridge layer (Cocos build configuration constraints and how the SDK is injected are in the Cocos Creator section of "HTML5 packaging"). Integration steps:

1. First run `./.builda-agent/builda sdk check` to confirm the installed, pinned version; if dependencies are missing, restore them with `sdk install` (it does not upgrade an existing pin). The mock, type definitions and test shell live in `.builda-agent/sdk/web/`.
2. Reference the SDK in the game HTML's `<head>` with a **root-relative path** (the built `index.html` must keep this reference):

```html
<script src="builda-sdk.js"></script>
```

   Note: the zip does not package the SDK file itself. Locally, `builda dev` automatically falls back to serving the mock build from `.builda-agent/sdk/web/`; in production the Builda App injects the release build from the CDN according to the manifest `sdk` contract. Build tools (vite/webpack) must not bundle it as a module; keep it as an external `<script>`.
3. Game code calls `window.Builda.*` directly (APIs are grouped by capability under each topic's "Public API" list; see the routing table in the entry `SKILL.md`) and gets a uniform Result (`{ok, data}` / `{ok:false, error}`). **You must call `Builda.runtime.ready()` at the very start of the game** (the first thing in the entry script; do not wait for assets to load); if the host does not receive ready within 30 seconds of page load, it force-closes the game.
4. TypeScript projects may add `.builda-agent/sdk/web/builda-sdk.d.ts` to the tsconfig include for type hints (optional).
5. Local verification: `./.builda-agent/builda dev --web dist`, then check in the test shell at `dev-url` (identity / KV / orientation / safe area / payment and ad modals, same as the Godot flow).

The capability topics in the entry `SKILL.md` routing table (saves, payments and ads, leaderboards, safe area / capsule avoidance, localization, text input, etc.) apply to HTML5 as well — they are already written in `window.Builda.*` JS terms, so call them directly and ignore the Godot wrapper method names in parentheses.
