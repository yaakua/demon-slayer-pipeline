
import { chromium, Browser, Page } from 'playwright';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { perceptualHash } from './img/hash.js';
import { buildVariants } from './img/process.js';
import { ensureDirs, saveBuffer } from './store/fs.js';
import { log, warn } from './utils/logger.js';

// 配置参数
const Q = process.env.WALLHAVEN_QUERY || 'anime'; // 搜索关键词，改为更通用的关键词
const CATEGORIES = process.env.WALLHAVEN_CATEGORIES || '010'; // anime only
const PURITY = process.env.WALLHAVEN_PURITY || '100'; // SFW only
const SORT = process.env.WALLHAVEN_SORT || 'toplist';
const ORDER = process.env.WALLHAVEN_ORDER || 'desc';
const PAGES = Number(process.env.WALLHAVEN_PAGES || 3);
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS || 1000);

function extFromUrl(u: string) {
  try {
    const pathname = new URL(u).pathname;
    const e = path.extname(pathname).toLowerCase();
    return e ? e.slice(1) : 'jpg';
  } catch {
    return 'jpg';
  }
}

// 重试操作函数，增强错误处理
async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 2,  // 减少重试次数从3到2
  baseDelay: number = 500, // 减少延迟从1000ms到500ms
  operationName: string = '操作'
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      warn(`${operationName}失败 (尝试 ${attempt}/${maxRetries}): ${errorMessage}`);
      
      if (isLastAttempt) {
        throw new Error(`${operationName}在 ${maxRetries} 次尝试后仍然失败: ${errorMessage}`);
      }
      
      // 指数退避延迟
      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
      warn(`等待 ${Math.round(delay)}ms 后重试...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error(`${operationName}意外失败`);
}

// 下载图片函数，增强错误处理
async function downloadImage(url: string): Promise<Buffer> {
  return retryOperation(async () => {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: AbortSignal.timeout(10000) // 添加10秒超时
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer);
  }, 2, 1000, `下载图片 ${url}`); // 减少重试次数到2，延迟1秒
}

// 获取壁纸详情页的高分辨率图片URL和分辨率信息，增强错误处理
async function getFullResolutionUrl(page: Page, wallpaperUrl: string): Promise<{url: string | null, resolution: string}> {
  return retryOperation(async () => {
    try {
      await page.goto(wallpaperUrl, { 
        waitUntil: 'networkidle',
        timeout: 10000  // 减少超时从30秒到10秒
      });
      
      // 等待图片加载，增加超时处理
      await page.waitForSelector('#wallpaper', { timeout: 5000 }); // 减少超时从15秒到5秒
      
      // 获取高分辨率图片URL和分辨率信息
      const imageInfo = await page.evaluate(() => {
        const img = document.querySelector('#wallpaper') as HTMLImageElement;
        const resolutionElement = document.querySelector('.showcase-resolution');
        
        if (!img) {
          throw new Error('未找到壁纸图片元素');
        }
        
        return {
          url: img.src || null,
          resolution: resolutionElement?.textContent?.trim() || '未知'
        };
      });
      
      if (!imageInfo.url) {
        throw new Error('无法获取高分辨率图片URL');
      }
      
      return imageInfo;
    } catch (error) {
      if (error instanceof Error && error.message.includes('timeout')) {
        throw new Error(`页面加载超时: ${wallpaperUrl}`);
      }
      throw error;
    }
  }, 1, 1000, `获取高分辨率图片 ${wallpaperUrl}`); // 减少重试次数到1，延迟1秒
}

// 构建搜索URL
function buildSearchUrl(page: number = 1): string {
  const url = new URL('https://wallhaven.cc/search');
  url.searchParams.set('q', Q);
  url.searchParams.set('categories', CATEGORIES);
  url.searchParams.set('purity', PURITY);
  url.searchParams.set('sorting', SORT);
  url.searchParams.set('order', ORDER);
  url.searchParams.set('page', String(page));
  return url.toString();
}

// 从搜索页面获取壁纸信息，增强错误处理
async function getWallpapersFromPage(page: Page, pageNum: number): Promise<{wallpapers: any[], hasNextPage: boolean}> {
  return retryOperation(async () => {
    const searchUrl = buildSearchUrl(pageNum);
    log(`正在访问第 ${pageNum} 页: ${searchUrl}`);
    
    try {
      await page.goto(searchUrl, { 
        waitUntil: 'networkidle',
        timeout: 30000 
      });
      
      // 等待内容加载
      await page.waitForSelector('#thumbs', { timeout: 15000 });
      
      // 检查是否有"没有内容"的提示
      const noContentMessage = await page.$('.pagination-notice');
      if (noContentMessage) {
        const messageText = await noContentMessage.textContent();
        if (messageText?.includes("There's nothing here")) {
          log(`第 ${pageNum} 页没有内容`);
          return { wallpapers: [], hasNextPage: false };
        }
      }
      
      // 滚动到页面底部以触发懒加载
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      
      // 等待懒加载图片
      await page.waitForTimeout(2000);
      
      // 获取壁纸信息
      const wallpapers = await page.evaluate(() => {
        const wallpaperElements = document.querySelectorAll('[data-wallpaper-id]');
        
        if (wallpaperElements.length === 0) {
          throw new Error('未找到壁纸元素');
        }
        
        return Array.from(wallpaperElements).map(element => {
          const id = element.getAttribute('data-wallpaper-id');
          const link = element.querySelector('a');
          const img = element.querySelector('img');
          
          if (!id || !link || !img) {
            return null;
          }
          
          return {
            id,
            url: link.href,
            thumbnailUrl: img.src || img.getAttribute('data-src'),
          };
        }).filter(Boolean);
      });
      
      // 检查是否有下一页
      const hasNextPage = await page.evaluate(() => {
        const nextButton = document.querySelector('.pagination .next');
        return nextButton && !nextButton.classList.contains('disabled');
      });
      
      log(`第 ${pageNum} 页获取到 ${wallpapers.length} 张壁纸`);
      return { wallpapers, hasNextPage: hasNextPage ?? false };
      
    } catch (error) {
      if (error instanceof Error && error.message.includes('timeout')) {
        throw new Error(`第 ${pageNum} 页加载超时`);
      }
      throw error;
    }
  }, 2, 5000, `获取第 ${pageNum} 页壁纸`);
}

(async () => {
  if (process.env.SOURCE_AUTHORIZED !== 'true') {
    console.error('Missing SOURCE_AUTHORIZED=true — stop for compliance.');
    process.exit(1);
  }
  
  await ensureDirs();
  
  let browser: Browser | null = null;
  const items: any[] = [];
  let fetched = 0;
  
  try {
    // 启动浏览器
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 }
    });
    
    const page = await context.newPage();
    
    // 处理多个页面
    for (let p = 1; p <= PAGES; p++) {
      try {
        const result = await getWallpapersFromPage(page, p);
        const { wallpapers, hasNextPage } = result;
        
        if (wallpapers.length === 0) {
          log(`第 ${p} 页没有找到壁纸，停止抓取`);
          break;
        }
        
        // 处理每张壁纸
        for (const wallpaper of wallpapers) {
          try {
            // 获取高分辨率图片URL和分辨率
            const imageInfo = await getFullResolutionUrl(page, wallpaper.url);
            
            if (!imageInfo.url) {
              warn('无法获取高分辨率图片URL:', wallpaper.id);
              continue;
            }
            
            // 下载图片
            const buf = await downloadImage(imageInfo.url);
            
            const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
            const phash = await perceptualHash(buf);
            const ext = extFromUrl(imageInfo.url);
            const base = `wallhaven_${wallpaper.id}`;
            
            const dest = `data/raw/wallhaven/${base}.${ext}`;
            try { 
              await fs.access(dest); 
            } catch {
              await saveBuffer(dest, buf);
              await buildVariants(dest, { series: 'Demon Slayer' });
            }
            
            items.push({
              id: base,
              title: 'Demon Slayer',
              source: 'wallhaven',
              pageUrl: wallpaper.url,
              downloadUrl: imageInfo.url,
              resolution: imageInfo.resolution,
              sha256,
              phash,
              bytes: buf.length,
              ext
            });
            
            fetched++;
            log(`已下载: ${base}.${ext} (${imageInfo.resolution}, ${buf.length} bytes)`);
            
          } catch (e) {
            warn('wallhaven item error', wallpaper.id, String(e));
          }
          
          // 请求间隔
          await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));
        }
        
         // 如果当前页面没有下一页，提前结束
         if (!hasNextPage) {
           log('已到最后一页，停止抓取');
           break;
         }
        
      } catch (e) {
        warn(`第 ${p} 页处理失败:`, String(e));
      }
      
      // 页面间隔
      await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));
    }
    
  } catch (error) {
    console.error('Wallhaven 抓取过程中发生错误:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
  
  // 更新 manifest
  const prev = JSON.parse(await fs.readFile('data/manifest.json', 'utf-8').catch(() => '[]'));
  const all = [...prev, ...items];
  await fs.writeFile('data/manifest.json', JSON.stringify(all, null, 2));
  
  log(`Wallhaven scraping completed. Items: ${fetched}`);
})();
