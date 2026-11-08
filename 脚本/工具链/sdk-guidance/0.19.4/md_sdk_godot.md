<!-- builda-sdk-version: 0.19.4 -->
# SDK Integration (Godot)

When a Godot user asks to "integrate the Builda SDK", "cloud variables", or "who am I", first run in the Godot project root:

```bash
./.builda-agent/builda sdk install
./.builda-agent/builda sdk check
```

If `sdk install` reports `project.godot missing`, you are not in the Godot project root. Switch to the real project root and run it again; do not bypass the check from another directory.

This installs:

```text
addons/builda/builda.gd
addons/builda/web/builda-sdk.js
addons/builda/web/builda-sdk.d.ts
addons/builda/examples/example.gd
addons/builda/examples/BuildaClient.gd
scripts/BuildaClient.gd
```

`sdk install` automatically copies the recommended `BuildaClient.gd` to `scripts/BuildaClient.gd`, adds or updates the Autoload in `project.godot`:
`BuildaClient="*res://scripts/BuildaClient.gd"`, and tries to write
`<script src="builda-sdk.js"></script>` into the Web export preset's `html/head_include` (old addons-path references are automatically migrated to the root path). Do not delete other existing entries under the project's
`[autoload]`, and do not overwrite the project's existing Web head include.

## Legacy API Migration (`sdk-compat=failed`)

If `sdk check` reports `sdk-compat=failed`, the project code uses APIs that do not exist in the current SDK (they will error at runtime). Migrate according to the line numbers in the error and the replacement APIs given in the error message, for example
`cloud_get -> private_kv_get`, `cloud_set -> private_kv_set`, `cloud_delete -> private_kv_remove`, `ready -> runtime_ready`.
Note that privateKV values are byte streams (`PackedByteArray`): for old code that stored a Dictionary directly, migrate to
`private_kv_set(key, var_to_bytes(dict))`, and on the read side restore it with `bytes_to_var(builda.private_kv_bytes(result.data))`.
The current Godot SDK uses an asynchronous request/signal model; if old code used calls like `cloud_get` as direct return values, when migrating you must save the
request id and handle the result in the `BuildaClient.builda.sdk_result` callback. Prefer referring to `addons/builda/examples/example.gd` and
the current project's `scripts/BuildaClient.gd`; do not just do mechanical renaming.

## Godot Wrapper Layer and BuildaClient

On the Godot side, calls are wrapped by `addons/builda/builda.gd`, and results are returned via the `sdk_result(request_id, result)` signal; events pushed by the platform are dispatched via the `app_visibility_changed(visible, source)` signal (generic form `sdk_event(name, payload)`). The default integration is to use the Autoload `BuildaClient` that `sdk install` sets up automatically. Only if the project is not suited to an Autoload, attach the same logic to a persistent node in the main scene. Do not call `window.__cysjHost` or `flutter_inappwebview` directly; game code should prefer calling the Builda SDK, which internally handles the local mock and the Builda App runtime.

If you need to repair the Autoload manually, use:

```bash
mkdir -p scripts
cp addons/builda/examples/BuildaClient.gd scripts/BuildaClient.gd
```

Then register `res://scripts/BuildaClient.gd` as an Autoload in the Godot project settings, with the suggested name `BuildaClient`. If the agent edits `project.godot` directly, do not delete existing `[autoload]` entries; if there is no `[autoload]`, add it; if there is, append or update this line:

```ini
[autoload]
BuildaClient="*res://scripts/BuildaClient.gd"
```

Call it from game logic:

```gdscript
func _ready() -> void:
	BuildaClient.player_ready.connect(_on_builda_player)
	BuildaClient.wins_ready.connect(_on_builda_wins)
	BuildaClient.sdk_error.connect(_on_builda_error)

func on_level_win() -> void:
	BuildaClient.add_win()

func on_reset_progress() -> void:
	BuildaClient.reset_wins() # Internally calls Builda.privateKV.remove("wins")

func _on_builda_player(player: Dictionary) -> void:
	print("Builda player: ", player)

func _on_builda_wins(count: int) -> void:
	print("Builda wins: ", count)

func _on_builda_error(action: String, error: Dictionary) -> void:
	push_warning("Builda SDK " + action + " failed: " + str(error))
```

If the project is not suited to an Autoload, instantiate `res://addons/builda/builda.gd` in the main scene root node's `_ready()`, referring to `addons/builda/examples/example.gd`. A complete KV example must cover `whoami -> private_kv_get("wins") -> private_kv_set("wins") -> private_kv_get("wins") -> private_kv_remove("wins")`.

## Local Verification (Godot)

Running in the Godot editor/native is not a full SDK runtime; `builda.gd` returns `UNSUPPORTED`. Local mock verification should export to Web and run in a browser or the Builda App WebView.

SDK verification has two layers:

```bash
./.builda-agent/builda sdk smoke
```

`sdk smoke` only verifies the local mock: `whoami()` and `privateKV.set/get/remove/setMany/getMany/removeMany()` must work without a token and must not access the network. It is suited to authors' local development and quick checks after changing Godot integration code. On success it prints the suggested Autoload file and the local mock URL; this is not a full Godot export test, and you must still continue with the project-level verification below.
If the `BuildaClient` Autoload in `project.godot` points to a nonexistent script, `sdk smoke` fails; rerun `sdk install` first to repair it.

After `sdk smoke` passes, continue with project-level verification:

1. Confirm the project has integrated `BuildaClient.gd` or an equivalent main-scene node.
2. Export the Godot Web build.
3. Start the local runner:

```bash
./.builda-agent/builda dev --web build/web
```

4. Open the `dev-url` (test shell) printed by the command and actually play the game in the browser for acceptance: switch landscape/portrait, toggle the notch to confirm key UI avoids the safe area and the capsule button,
   and trigger payment/ads to confirm both branches of the shell's modal. Expected Godot output includes the mock player and KV results; browser localStorage will contain
   per-player isolated keys such as `builda:privatekv:local-game:local-player:wins` (values are base64). To switch identity, append `&builda_mock_player=<id>&builda_mock_name=<name>` to the URL.
   Also watch the browser console: the mock SDK prints a confirmation when it receives `Builda.runtime.ready()`; if a "still have not received Builda.runtime.ready()" warning appears 15 seconds after page load, ready() was missed or called too late (on real devices the game is force-closed if it is not received within 30 seconds); you must move it to the very start of the game and verify again.
