import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import fsExtra from 'fs-extra';
import slugify from 'slugify';

export function createDeterministicId(...parts: string[]): string {
  const hash = crypto.createHash('sha1');
  for (const part of parts) {
    hash.update(part);
  }
  return hash.digest('hex').slice(0, 16);
}

export function sanitizeFileName(input: string): string {
  const base = slugify(input, { lower: true, strict: true });
  return base.length > 0 ? base : crypto.randomUUID();
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fsExtra.ensureDir(dirPath);
}

export function ensureAbsolute(base: string, maybeRelative: string): string {
  try {
    return new URL(maybeRelative, base).toString();
  } catch (error) {
    return maybeRelative;
  }
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function fileNameWithExt(name: string, ext: string): string {
  const clean = sanitizeFileName(name);
  return `${clean}.${ext.replace(/^\./, '')}`;
}

export function guessExtensionFromUrl(url: string): string {
  const pathname = new URL(url).pathname;
  const ext = path.extname(pathname);
  if (ext) {
    return ext.replace('.', '');
  }
  return 'jpg';
}

export function decodeCsvArray(value?: string): string[] | undefined {
  if (!value) return undefined;
  return value
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function encodeCsvArray(values?: string[]): string | undefined {
  if (!values || values.length === 0) return undefined;
  return values.join(' | ');
}
