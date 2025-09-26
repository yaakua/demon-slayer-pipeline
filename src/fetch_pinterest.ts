import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { perceptualHash } from './img/hash.js';
import { buildVariants } from './img/process.js';
import { ensureDirs, saveBuffer } from './store/fs.js';
import { log } from './utils/logger.js';

const BASE_URL = 'https://www.pinterest.com/search/pins/?q=demon%20slayer';
const MAX_PAGES = 5; // 限制抓取页数

function fileNameFromUrl(url: string) {
  const last = url.split('/').pop() || 'file';
  return last.split('?')[0]; // 移除查询参数
}

function inferResolutionFromUrl(url: string) {
  const match = url.match(/(\d{3,5})x(\d{3,5})/);
  return match ? `${match[1]}x${match[2]}` : '';
}

async function download(page: any, url: string, retries = 2): Promise<Buffer> { // 减少重试次数从3到2
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const resp = await page.request.get(url, { 
        headers: { 
          Referer: 'https://www.pinterest.com/',
          'User-Agent': 'Mozilla/5.0 (compatible; demon-slayer-crawler/1.0)'
        },
        timeout: 10000 // 减少超时从60秒到10秒
      });
      if (!resp.ok()) throw new Error(`HTTP ${resp.status()} ${url}`);
      const buf = Buffer.from(await resp.body());
      return buf;
    } catch (error) {
      log(`Download attempt ${attempt} failed for ${url}:`, error);
      if (attempt === retries) throw error;
      await new Promise(resolve => setTimeout(resolve, 500 * attempt)); // 减少延迟从1000ms到500ms
    }
  }
  throw new Error('Download failed after all retries');
}

async function retryOperation<T>(operation: () => Promise<T>, retries = 2, delay = 500): Promise<T> { // 减少重试次数和延迟
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      log(`Operation attempt ${attempt} failed:`, error);
      if (attempt === retries) throw error;
      await new Promise(resolve => setTimeout(resolve, delay * attempt));
    }
  }
  throw new Error('All retry attempts failed');
}

async function scrollToLoadMore(page: any) {
  // 滚动到页面底部以加载更多内容
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
  });
  // 等待新内容加载，减少等待时间从2秒到1秒
  await page.waitForTimeout(1000);
}

async function waitForNewContent(page: any, previousCount: number) {
  // 等待新内容加载，减少最大等待时间从10秒到5秒
  let attempts = 0;
  const maxAttempts = 5; // 减少最大尝试次数从10到5
  
  while (attempts < maxAttempts) {
    const currentCount = await page.locator('[data-test-id="pin"]').count();
    if (currentCount > previousCount) {
      return currentCount;
    }
    await page.waitForTimeout(500); // 减少等待间隔从1秒到0.5秒
    attempts++;
  }
  
  return previousCount;
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
  let processedUrls = new Set<string>(); // 避免重复处理

  try {
    await retryOperation(async () => {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      // 等待页面加载完成，减少超时从10秒到5秒
      await page.waitForSelector('[data-test-id="pin"]', { timeout: 5000 });
    });

    for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
      log('Processing page', pageNum);
      
      // 获取当前页面的pin数量
      let currentPinCount = await page.locator('[data-test-id="pin"]').count();
      
      // 滚动加载更多内容
      if (pageNum > 1) {
        await retryOperation(async () => {
          await scrollToLoadMore(page);
          // 等待新内容加载
          const newCount = await waitForNewContent(page, currentPinCount);
          if (newCount === currentPinCount) {
            throw new Error('No more content to load');
          }
          currentPinCount = newCount;
        }).catch(() => {
          log('No more content to load, stopping at page', pageNum - 1);
          return; // 退出循环
        });
        
        if (currentPinCount === await page.locator('[data-test-id="pin"]').count()) {
          break; // 没有新内容，退出循环
        }
      }

      // 获取所有图片容器
      const pinElements = await page.locator('[data-test-id="pin"]').all();
      log('Found pins on page', pageNum, ':', pinElements.length);

      for (const pinElement of pinElements) {
        try {
          // 获取图片元素
          const imgElement = pinElement.locator('img').first();
          const imgSrc = await imgElement.getAttribute('src');
          const imgAlt = await imgElement.getAttribute('alt') || 'Demon Slayer';
          
          if (!imgSrc || processedUrls.has(imgSrc)) continue;
          processedUrls.add(imgSrc);

          // 获取高分辨率图片URL
          let downloadUrl = imgSrc;
          if (imgSrc.includes('236x')) {
            downloadUrl = imgSrc.replace('236x', '736x');
          } else if (imgSrc.includes('474x')) {
            downloadUrl = imgSrc.replace('474x', '736x');
          }

          // 尝试点击获取更多信息
          let pageUrl = BASE_URL;
          try {
            const linkElement = pinElement.locator('a').first();
            const href = await linkElement.getAttribute('href');
            if (href) {
              pageUrl = href.startsWith('http') ? href : `https://www.pinterest.com${href}`;
            }
          } catch (e) {
            // 忽略链接获取错误
          }

          // 下载图片
          const buf = await download(page, downloadUrl);
          const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
          const phash = await perceptualHash(buf);
          
          // 生成文件名
          const fileName = `pinterest_${sha256.substring(0, 12)}.jpg`;
          const dest = path.join('data/raw/pinterest', fileName);

          // 检查文件是否已存在
          try { 
            await fs.access(dest); 
          } catch { 
            await saveBuffer(dest, buf); 
            await buildVariants(dest, { series: 'Demon Slayer' }); 
          }

          const resolution = inferResolutionFromUrl(downloadUrl) || '736x736';

          all.push({
            id: sha256.substring(0, 12),
            title: imgAlt.replace(/[-_]/g, ' '),
            source: 'pinterest',
            pageUrl,
            downloadUrl,
            resolution,
            sha256,
            phash,
            bytes: buf.length,
            ext: 'jpg',
          });

          log('Downloaded:', fileName, 'Size:', buf.length);
        } catch (error) {
          log('Error processing pin:', error);
          continue;
        }
      }

      // 延迟以避免被检测为机器人
      await page.waitForTimeout(Number(process.env.REQUEST_DELAY_MS || 1000));
    }

  } catch (error) {
    log('Error during scraping:', error);
  } finally {
    await browser.close();
  }

  // 合并到现有manifest
  const prev = JSON.parse(await fs.readFile('data/manifest.json', 'utf-8').catch(() => '[]'));
  const merged = [...prev, ...all];
  await fs.writeFile('data/manifest.json', JSON.stringify(merged, null, 2));
  
  log('Pinterest scraping completed. Items:', all.length);
})();
