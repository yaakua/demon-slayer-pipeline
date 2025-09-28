import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import pLimit from 'p-limit';
import { DownloadedImage, ScrapedImage } from './types.js';
import { ensureDir, fileNameWithExt, guessExtensionFromUrl } from './utils.js';

export interface DownloadOptions {
  baseDir: string;
  concurrency?: number;
}

async function downloadBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'demon-slayer-pipeline/1.0 (+https://github.com/)',
      Referer: url,
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function downloadImages(
  items: ScrapedImage[],
  options: DownloadOptions,
): Promise<DownloadedImage[]> {
  const concurrency = options.concurrency ?? 4;
  const limit = pLimit(concurrency);
  const downloads: Promise<DownloadedImage | undefined>[] = items.map((item) =>
    limit(async () => {
      const ext = guessExtensionFromUrl(item.imageUrl);
      const directory = path.join(options.baseDir, item.target.slug, 'raw');
      await ensureDir(directory);
      const fileName = fileNameWithExt(item.id, ext);
      const destination = path.join(directory, fileName);

      try {
        await fs.access(destination);
        const buffer = await fs.readFile(destination);
        const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
        return {
          ...item,
          fileName,
          localPath: destination,
          sha256,
          bytes: buffer.byteLength,
          ext,
        } satisfies DownloadedImage;
      } catch {
        // continue to download
      }

      const buffer = await downloadBuffer(item.imageUrl);
      const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
      await fs.writeFile(destination, buffer);
      return {
        ...item,
        fileName,
        localPath: destination,
        sha256,
        bytes: buffer.byteLength,
        ext,
      } satisfies DownloadedImage;
    }),
  );

  const settled = await Promise.all(downloads);
  return settled.filter((item): item is DownloadedImage => Boolean(item));
}
