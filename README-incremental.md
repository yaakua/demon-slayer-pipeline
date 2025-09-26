
# Incremental Update: Wallhaven API Integration

This package contains **only the new/modified files** to merge into your previous template.

## Files
- `PATCHES/002-wallhaven.patch` — updates `package.json` scripts (adds `fetch:wallhaven` and pipeline step)
- `PATCHES/003-env-wallhaven.patch` — appends Wallhaven variables to `.env.example`
- `src/fetch_wallhaven.ts` — new script to fetch original images from Wallhaven API (SFW Anime, query defaults to Kimetsu no Yaiba / Demon Slayer)

## Apply
1. From your project root:
   ```bash
   git apply PATCHES/002-wallhaven.patch
   git apply PATCHES/003-env-wallhaven.patch
   ```
   If you don't use git, just manually copy the snippet changes into the respective files.

2. Copy the new script:
   ```bash
   cp -r src/fetch_wallhaven.ts ./src/
   ```

3. Set environment variables:
   - `WALLHAVEN_API_KEY` (required)
   - Optional: adjust `WALLHAVEN_QUERY`, `WALLHAVEN_CATEGORIES=010`, `WALLHAVEN_PURITY=100`, `WALLHAVEN_PAGES`

4. Run:
   ```bash
   pnpm run fetch:wallhaven
   # or
   npm run fetch:wallhaven
   ```

Artifacts are appended to `data/manifest.json` and files saved under `data/raw/wallhaven/` with multi-size variants generated to `data/variants/`.
