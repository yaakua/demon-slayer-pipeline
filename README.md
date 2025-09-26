# demon-slayer-pipeline (npm template)

A production-ready crawler + media pipeline for **Demon Slayer wallpapers** with:
- Playwright crawler for authorized sources
- Pinterest API v5 fetcher
- De-dup (sha256 + pHash), multi-size export (mobile/pad/desktop; WebP+JPEG)
- Final `data/manifest.json` for your Next.js SSG site

> Requires Node.js >= 18.17.

## Quick start

```bash
pnpm i  # or npm i / yarn
cp .env.example .env
# Fill your tokens, set SOURCE_AUTHORIZED=true
pnpm run crawl:4kw
pnpm run fetch:pinterest
pnpm run build:manifest
```

## Output layout

```
data/
  raw/4kwallpapers/*.jpg
  raw/pinterest/*.jpg
  variants/{mobile,pad,desktop}/*.(webp|jpg)
  manifest.json
```

## References
- Playwright install & usage: https://playwright.dev/docs/intro
- Sharp install & API: https://sharp.pixelplumbing.com/
- Pinterest API v5 docs: https://developers.pinterest.com/docs/api/v5/
- AWS SDK v3 S3 client: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-s3/
```
