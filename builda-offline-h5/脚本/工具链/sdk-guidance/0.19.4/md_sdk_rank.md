<!-- builda-sdk-version: 0.19.4 -->
# Leaderboards

Public API:

- `Builda.rank.submitScore(rankId, score)` / `Builda.rank.getRankList(rankId, {limit})` (leaderboards; boards must first be declared in the manifest `rankBoards` and published; see "Leaderboard publish configuration")

## Leaderboard publish configuration

When the user needs to add, modify or clear leaderboards, first read the full publish configuration contract: `./md_rankboards.md`.

- Leaderboard configuration is written only in `rankBoards` of `builda.publish.json`; do not modify the SDK or the game export bundle to store the configuration.
- Before modifying, confirm whether the user intends to **keep, fully replace, or clear**: omitted field = keep; `[]` = clear all; non-empty array = full replacement. It is not a partial patch; even when changing one board you must keep all the other target boards.
- Each board must explicitly fill in `rankId/displayName/sortType/cycleType/minScore/maxScore`; at most 100 boards. `sortType` only uses `asc|desc`, and `cycleType` only uses `day|week|month|forever`.
- New or modified `rankId`s use only letters, digits, `_`, `-`; do not casually change an existing `rankId` — changing the ID is equivalent to switching boards and may lose historical scores.
- Changing only `displayName` keeps historical scores; changing sort order, cycle or score range, as well as deleting boards, clears scores after review and release. When score clearing is involved, you must first tell the user the impact and get explicit confirmation.
- After modifying the manifest, check that the `rankId`s used in game code match the target boards. After the draft syncs successfully, you must still remind the user to republish in the Builda App and pass review before the live configuration changes.

## Game runtime API

Game runtime API: `Builda.rank.submitScore(rankId, score)` (Godot side `builda.rank_submit_score(rank_id, score)`) submits an integer score — the host validates `rankId` and the score range against the published boards (unpublished returns `RANK_NOT_FOUND`, out of range returns `SCORE_OUT_OF_RANGE`), and keeps each player's best score per cycle according to `sortType`; the game just submits at event points such as settlement, without comparing scores itself. `Builda.rank.getRankList(rankId, {limit})` (`builda.rank_get_list(rank_id, limit)`) returns the top N of the current cycle (default 50, at most 100) and your own rank (`self` being `null` means not on the board). The mock in local `builda dev` **does not validate board configuration** (it cannot read the manifest); it only keeps the most recent submission and returns fixed fake opponents for UI debugging. Real semantics such as range validation, best-score retention and cycle rotation must be verified via draft playtesting in the Builda App runtime.
