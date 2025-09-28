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

## 自定义站点采集与处理管道

项目新增了一个可配置的采集管道，帮助你针对任意图片站点完成「抓取 → 本地落盘 → CSV 输出 → 本地 AI 识别 → （可选）腾讯云 COS 上传」的全流程处理。

### 1. 准备配置

复制示例配置并根据目标站点修改选择器、分页等信息：

```bash
cp pipeline.config.example.json pipeline.config.json
```

关键字段说明：

- `targets`: 站点列表，使用 CSS 选择器声明如何从页面提取图片地址、标题、分类等信息；
- `compression`: 本地压缩输出路径以及压缩参数；
- `ai`: 是否启用本地 AI（使用 `@xenova/transformers` 模型，首次运行会自动下载权重）；
- `cos`: 腾讯云 COS 上传开关与目标桶配置（需要 `TENCENT_SECRET_ID`/`TENCENT_SECRET_KEY` 环境变量）。

### 2. 运行命令行流程

```bash
# 运行采集 + AI 识别 +（可选）COS 上传
pnpm pipeline:run -- run

# 只对指定站点执行
pnpm pipeline:run -- run --targets 4kw,wallhaven

# 仅重新上传未完成的文件
pnpm pipeline:run -- upload
```

运行后会在 `data/pipeline` 下生成原图、压缩图以及 `metadata.csv` 文件，方便二次加工。

### 3. 可视化界面

使用内置的仪表盘管理任务：

```bash
pnpm pipeline:ui
```

浏览器打开 http://localhost:3000 即可手动触发采集、查看最新记录、确认上传状态。

## References
- Playwright install & usage: https://playwright.dev/docs/intro
- Sharp install & API: https://sharp.pixelplumbing.com/
- Pinterest API v5 docs: https://developers.pinterest.com/docs/api/v5/
- AWS SDK v3 S3 client: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-s3/
```
