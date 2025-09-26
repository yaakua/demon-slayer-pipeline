
# Incremental Update: Steam Wallpaper Engine Integration

This package contains **only the new/modified files** to add Steam Workshop (Wallpaper Engine) fetching via Steam Web API + SteamCMD.

## Files
- `PATCHES/004-steam-scripts.patch` — updates `package.json` to add `fetch:steamWe` and include it in `pipeline:all`.
- `PATCHES/005-env-steam.patch` — appends Steam-related vars to `.env.example`.
- `src/fetch_steam_we.ts` — queries Steam Web API (QueryFiles with `requiredtags` + `search_text`) to collect Workshop IDs for Wallpaper Engine (app 431960), then downloads each item using SteamCMD.

## Apply
1) From your project root:
```bash
git apply PATCHES/004-steam-scripts.patch
git apply PATCHES/005-env-steam.patch
cp src/fetch_steam_we.ts ./src/
```

2) Set environment variables in `.env`:
- `STEAM_API_KEY` (if later you add calls that require key; current `GetPublishedFileDetails` POST is public)
- `STEAM_WE_REQUIRED_TAGS` (JSON array), e.g. `["Type: Scene","4K"]`
- `STEAM_WE_SEARCH` (e.g. `demon slayer`)
- `STEAM_USER` / `STEAM_PASS` for SteamCMD (recommended: account that OWNS app 431960)
- `STEAMCMD_PATH` if not in PATH

3) Run:
```bash
pnpm run fetch:steamWe
```

Outputs:
- `data/steam/wallpaper_engine_ids.json` — details for the fetched Workshop items (IDs, titles, etc.).
- Files downloaded by SteamCMD under its `steamapps/workshop/content/431960/<ID>/...`

> Tip: You can add a post-processor to convert downloaded wallpapers into your pipeline's `data/` structure if needed.
