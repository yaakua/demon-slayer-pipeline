import fs from 'node:fs/promises';
import path from 'node:path';

export async function ensureDirs() {
  await fs.mkdir('data/raw/4kwallpapers', { recursive: true });
  await fs.mkdir('data/raw/pinterest', { recursive: true });
  await fs.mkdir('data/variants/mobile', { recursive: true });
  await fs.mkdir('data/variants/pad', { recursive: true });
  await fs.mkdir('data/variants/desktop', { recursive: true });
}

export async function saveBuffer(fp: string, buf: Buffer) {
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(fp, buf);
}
