<!-- builda-sdk-version: 0.19.4 -->
# Identity, Cloud Save and Service Token

Public API:

- `Builda.playerData.getMany(keys)` / `listKeys()` (non-authoritative read-only observation of your own Player Data, see below)
- `Builda.whoami()`
- `Builda.requestToken()` (exchange for a short-lived service token, see "Service token" below)
- `Builda.getRoleInfo(roleIds)` (batch-query public nicknames/avatars of Cy play roles; returns a roleId map)
- `Builda.privateKV.get(key)` / `getMany(keys)` (the value is a byte stream; a missing key returns `null`)
- `Builda.privateKV.set(key, value)` / `setMany(entries)` (`setMany` validates the whole batch; any violation rejects the whole batch)
- `Builda.privateKV.remove(key)` / `removeMany(keys)` (idempotent for missing keys)

privateKV is the private save for the current game × current player; the value is an opaque byte stream (Godot side `PackedByteArray`; `var_to_bytes()` to encode and `bytes_to_var()` to restore are recommended). Limits: single value ≤ 32KB, ≤ 32 keys per batch, ≤ 100 live keys per player per game (no aggregate byte quota; theoretical capacity ceiling 3.125MiB); exceeding a limit returns an explicit error, never silent truncation; concurrency is last write wins, with no version number. Note that the SDK **does not split batches automatically**: each `getMany`/`setMany`/`removeMany` takes at most 32 keys and returns `BATCH_TOO_LARGE` beyond that; when you really need to handle more keys, the game code must explicitly split them into batches of at most 32, `await` each batch in turn and check each batch's result, and must not assume multiple batches succeed atomically. When reading no more than 32 keys at startup, use a single `getMany`; do not call `get` serially key by key.

Save rules: private byte saves maintained by the game itself must be read and written through `Builda.privateKV.*`; do not build your own `localStorage`, IndexedDB, Cookie or Godot local-file saves. Such private byte saves can only be managed uniformly by the platform (for example, the player resetting the save in the Builda app) if they go through privateKV; data saved by bypassing it is out of the platform's reach, and leftover data remains after the player resets the save. Always use `var_to_bytes()`/`bytes_to_var()` as the save format; do not invent your own binary format. Trigger writes at event milestones (level cleared, settlement, purchase completed, etc.); when multiple keys change together, merge them into one write with `setMany`; do not write every frame/every second on a timer or use privateKV for real-time state sync — the real-device host rate-limits writes, and high-frequency writes are rejected.

Service token: services that the game logic layer connects to directly, such as Builda Online, use `Builda.requestToken()` (Godot side `builda.request_token()`, Unity side `Builda.RequestToken(callback)`) to exchange for a short-lived credential, which returns `{token, expiresAt}` (`expiresAt` is Unix seconds). The token is bound to the current game × current player, issued by the Builda platform extGame, and validated by Online through the platform API; hold it only in memory and **never** write it to privateKV, local files, saves, URLs or logs. Request a new one when `expiresAt` approaches. The mock token in local `builda dev` is only for exercising the expiry-refresh logic. For multiplayer integration and the deployment contract, see the Builda Online entry document `https://ai.builda.game/online/releases/0.19.4/setup.md`.

Public role profiles: `Builda.getRoleInfo(["11299825", "11299826"])` (Godot side `builda.get_role_info(role_ids)`, Unity side `BuildaSDK.GetRoleInfo(roleIds, callback)`) returns a `{roleId: {userName, userImg}}` map; a present key means it was found this time, a missing key means it was not found this time, and the nickname or avatar may be an empty string. roleIds must be positive-integer decimal strings, at most 32 per call. The SDK merges and deduplicates queries within 50ms, and caches successful profiles within the current game page for 30 minutes, up to 512 entries; the game must not poll at high frequency itself or treat a missing key as a network error and retry in an endless loop. The local mock returns deterministic fake profiles; only the real-device runtime accesses Builda.

Local mock semantics:

- `whoami()` returns a mock player.
- KV writes go to the browser's `localStorage`.
- privateKV keys must match `^[A-Za-z0-9_:-]{1,64}$`; `.`, `+`, `/`, spaces, `$` and non-ASCII characters are all illegal. New code is still recommended to use only letters, digits, `_` and `-`.
- The value must be JSON-serializable, and the top level cannot be `null`.

## Observing your own Player Data

Builda maintains the Player Data storage; business operations are executed by the developer's game server logic in Builda Online.
When a released game is online and logged in, you can query your own stored Player Data without entering a room; draft trial play is not supported (`RELEASE_ONLY`).
It is independent of privateKV's private byte save and has no write method or arbitrary-player query method. The local mock has only a separate `coins=0` fixture,
which is not stored together with privateKV, does not access the real network, and does not represent online state or identity; the returned object can be modified but does not change later fixtures.

`getMany` requires a non-empty key array and does not split batches automatically; `listKeys` reads the directory explicitly. Keys preserve case and allow path segments,
1..128 ASCII bytes, starting with a letter or digit, with the rest allowing letters, digits, `.`, `_`, `:`, `/`, `-`;
there must be no empty segments, `.`/`..` segments or a trailing `/`, and privateKV's 32-entry quota and key regex cannot be reused.

The `coins` and `inventory/items` below are example field names; actual queries use the raw keys defined and stored by the game server,
and the platform does not create these fields automatically. The mock fixture is only for local integration verification and does not mean the corresponding data already exists online.

```js
const result = await Builda.playerData.getMany(["coins", "inventory/items"], {timeoutMs: 5000});
if (!result.ok) {
  // Temporarily unavailable; when keeping the old display, mark it "may be stale / this refresh failed"; do not treat the error as an empty save or zero balance.
} else {
  const entry = result.data.values.coins;
  // Display only; do not grant rewards, deduct, trade, pay or steal crops based on this.
  const displayedCoins = entry && entry.state === "live" && entry.value?.type === "int64" ? entry.value.data : null;
}
const directory = await Builda.playerData.listKeys(); // the directory is in directory.data.meta?.keys, values={}
```

Godot: `builda.player_data_get_many(keys)` / `player_data_list_keys()` return a request id; results arrive via the `sdk_result` signal.
Unity: `BuildaSDK.PlayerDataGetMany(keys, callback)` / `PlayerDataListKeys(callback)` keep the async callback style.

Successful data is `{meta, values, source}`. meta being null means there is no save; otherwise it contains string gameId/roleId/gameVarsRevision,
Unix-millisecond createAt/updateAt and the keys directory. values returns, per requested key, null (does not exist) or
`{state,valueRevision,schemaId,schemaVersion,value}`; a tombstone is a non-null entry with state="tombstone" and value=null.
value is `{type,data}`: bool/float64/string keep their original values, int64 is a decimal string, bytes is a Base64 string,
and object is a recursive field→typed value map. revision stays a string, schemaVersion is a uint32 number or null;
int64 is not automatically converted to Number, and arbitrary strings are not interpreted as JSON. Directory entries contain key/state/valueRevision/schemaId/schemaVersion/type.
source is redis, mongo or null and only describes the observation source; failures, corruption or type-validation failures return an error and must not masquerade as no save.

**Results may lag behind the Online game server's current state and do not include operations not yet synced. Neither revision nor source=redis guarantees freshness.**
Never use them to confirm reward grants, sufficient balance, payment/order status, successful crop stealing or other persistent business operations, and do not write the whole observation back to overwrite the save.
The client takes the formal result of the Online game server action as authoritative; a later stale read must not be interpreted as that action failing or trigger a replay.
Server-side secrets must never be placed in fields readable through this API. General multiplayer guidance lets authors choose client-authoritative/relay, but that option must not be used to bypass
the server's ruling on Player Data actions; this boundary does not change the authority model of other multiplayer gameplay.

On-demand prompt for the developer's Agent:

```text
Builda.playerData.getMany/listKeys is a non-authoritative read-only observation of the current player's save.
Builda handles storage; the game server logic in Builda Online handles business operations and rulings.
Read results can display inventory, farms or historical progress, and may be refreshed later; a failure is not an empty save or zero balance.
Persistent business effects such as granting rewards, deducting, trading, stealing crops and payment must request a server action.
Do not use revision/source as final proof of an action's precondition, and do not construct whole-save overwrite writes.
After receiving the formal action result, update the display from that result; a later stale read must not overturn a success or trigger a replay.
When keeping the old display, mark it as possibly stale / this refresh failed; do not fabricate a server state time.
```
