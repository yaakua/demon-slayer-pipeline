import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs/promises';

type Opt = { series: string };

const targets = [
  { key: 'mobile',   maxW: 1242, maxH: 2688 },
  { key: 'pad',      maxW: 2048, maxH: 2732 },
  { key: 'desktop',  maxW: 3840, maxH: 2160 },
] as const;

export async function buildVariants(srcPath: string, _opt: Opt) {
  const base = path.basename(srcPath).replace(/\.[^/.]+$/, '');
  for (const t of targets) {
    const outDir = path.join('data/variants', t.key);
    await fs.mkdir(outDir, { recursive: true });
    const pipeline = sharp(srcPath).resize({ fit: 'inside', width: t.maxW, height: t.maxH, withoutEnlargement: true });
    await pipeline.clone().webp({ quality: 90 }).toFile(path.join(outDir, `${base}.webp`));
    await pipeline.clone().jpeg({ quality: 92, mozjpeg: true }).toFile(path.join(outDir, `${base}.jpg`));
  }
}
