<!-- builda-sdk-version: 0.19.4 -->
# Chinese / CJK font integration (deprecated)

**This approach is deprecated**: the platform no longer provides a shared CJK font (the former NotoSansSC runtime fallback mounting approach); game fonts are handled by the game developer.

Correct approach: prepare and subset fonts yourself and ship them with the game bundle — do not put a full CJK font (about 10~17MB) directly into the bundle; use fontTools to cut a subset containing only the needed characters. For the complete practice (multilingual i18n, subsetting script, missing-glyph filtering for open-set text such as leaderboard player names), see:

`./md_godot_i18n.md`

Do not reference any external font CDN in the game: H5 bundles must be offline and self-contained, and under COEP `require-corp` external links are blocked, resulting in a white screen.
