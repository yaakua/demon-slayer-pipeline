import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { perceptualHash } from './img/hash.js';
import { buildVariants } from './img/process.js';
import { ensureDirs, saveBuffer } from './store/fs.js';
import { log } from './utils/logger.js';

const BASE = 'https://4kwallpapers.com/demon-slayer-wallpapers/';
const PAGES = 8;

function fileNameFromUrl(u: string) {
  const last = u.split('/').pop() || 'file';
  return last;
}
function inferResolutionFromName(name: string) {
  const m = name.match(/(\d{3,5}x\d{3,5})/);
  return m?.[1];
}

async function download(page: any, url: string) {
  const resp = await page.request.get(url, { 
    headers: { Referer: BASE },
    timeout: 60000  // 增加超时时间到60秒
  });
  if (!resp.ok()) throw new Error(`HTTP ${resp.status()} ${url}`);
  const buf = Buffer.from(await resp.body());
  return buf;
}

(async () => {
  if (process.env.SOURCE_AUTHORIZED !== 'true') {
    console.error('Missing SOURCE_AUTHORIZED=true — stop for compliance.');
    process.exit(1);
  }
  await ensureDirs();

  const browser = await chromium.launch({
    headless: false,
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (compatible; demon-slayer-crawler/1.0)',
  });
  const page = await context.newPage();

  const all: any[] = [];
  for (let p = 1; p <= PAGES; p++) {
    const url = p === 1 ? BASE : `${BASE}${p}/`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    const links = await page.locator('a:has-text("Download")').all();
    log('page', p, 'items', links.length);
    for (const a of links) {
      const href = await a.getAttribute('href');
      if (!href) continue;

      // 将相对路径转换为绝对 URL
      const absoluteUrl = new URL(href, 'https://4kwallpapers.com').toString();

      const fileName = fileNameFromUrl(href);
      const ext = path.extname(fileName).slice(1) || 'jpg';
      const resolution = inferResolutionFromName(fileName);

      const buf = await download(page, absoluteUrl);
      const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
      const phash = await perceptualHash(buf);
      const dest = path.join('data/raw/4kwallpapers', fileName);

      try { await fs.access(dest); } catch { await saveBuffer(dest, buf); await buildVariants(dest, { series: 'Demon Slayer' }); }

      all.push({
        id: fileName.replace(/\.[^/.]+$/, ''),
        title: fileName.replace(/[-_]/g, ' '),
        source: '4kwallpapers',
        pageUrl: url,
        downloadUrl: absoluteUrl,
        resolution,
        sha256,
        phash,
        bytes: buf.length,
        ext,
      });
    }
    await page.waitForTimeout(Number(process.env.REQUEST_DELAY_MS || 600));
  }

  const prev = JSON.parse(await fs.readFile('data/manifest.json', 'utf-8').catch(() => '[]'));
  const merged = [...prev, ...all];
  await fs.writeFile('data/manifest.json', JSON.stringify(merged, null, 2));
  await browser.close();
  log('Done items', all.length);
})();
