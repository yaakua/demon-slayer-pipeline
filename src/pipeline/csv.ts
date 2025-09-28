import fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { PipelineRecord } from './types.js';
import { decodeCsvArray, encodeCsvArray, ensureDir } from './utils.js';

const columns = [
  { key: 'id', header: 'id' },
  { key: 'source', header: 'source' },
  { key: 'pageUrl', header: 'pageUrl' },
  { key: 'imageUrl', header: 'imageUrl' },
  { key: 'localPath', header: 'localPath' },
  { key: 'compressedPath', header: 'compressedPath' },
  { key: 'remoteUrl', header: 'remoteUrl' },
  { key: 'title', header: 'title' },
  { key: 'description', header: 'description' },
  { key: 'categories', header: 'categories' },
  { key: 'tags', header: 'tags' },
  { key: 'aiTags', header: 'aiTags' },
  { key: 'aiCategories', header: 'aiCategories' },
  { key: 'aiColors', header: 'aiColors' },
  { key: 'aiCaption', header: 'aiCaption' },
  { key: 'sha256', header: 'sha256' },
  { key: 'bytes', header: 'bytes' },
  { key: 'ext', header: 'ext' },
  { key: 'updatedAt', header: 'updatedAt' },
];

export interface CsvRow {
  id: string;
  source: string;
  pageUrl: string;
  imageUrl: string;
  localPath: string;
  compressedPath?: string;
  remoteUrl?: string;
  title?: string;
  description?: string;
  categories?: string;
  tags?: string;
  aiTags?: string;
  aiCategories?: string;
  aiColors?: string;
  aiCaption?: string;
  sha256: string;
  bytes: number;
  ext: string;
  updatedAt: string;
}

export async function loadCsv(filePath: string): Promise<PipelineRecord[]> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
    }) as CsvRow[];

    return records.map((row) => ({
      id: row.id,
      target: {
        name: row.source,
        slug: row.source,
        url: row.pageUrl,
        itemSelector: '',
        image: {},
      },
      pageUrl: row.pageUrl,
      imageUrl: row.imageUrl,
      fileName: path.basename(row.localPath),
      localPath: row.localPath,
      compressedPath: row.compressedPath,
      remoteUrl: row.remoteUrl,
      title: row.title,
      description: row.description,
      categories: decodeCsvArray(row.categories),
      tags: decodeCsvArray(row.tags),
      aiTags: decodeCsvArray(row.aiTags),
      aiCategories: decodeCsvArray(row.aiCategories),
      aiColors: decodeCsvArray(row.aiColors),
      aiCaption: row.aiCaption,
      sha256: row.sha256,
      bytes: Number(row.bytes),
      ext: row.ext,
      updatedAt: row.updatedAt,
    }));
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function saveCsv(filePath: string, records: PipelineRecord[]): Promise<void> {
  const directory = path.dirname(filePath);
  await ensureDir(directory);
  const rows: CsvRow[] = records.map((record) => ({
    id: record.id,
    source: record.target.slug,
    pageUrl: record.pageUrl,
    imageUrl: record.imageUrl,
    localPath: record.localPath,
    compressedPath: record.compressedPath,
    remoteUrl: record.remoteUrl,
    title: record.title,
    description: record.description,
    categories: encodeCsvArray(record.categories),
    tags: encodeCsvArray(record.tags),
    aiTags: encodeCsvArray(record.aiTags),
    aiCategories: encodeCsvArray(record.aiCategories),
    aiColors: encodeCsvArray(record.aiColors),
    aiCaption: record.aiCaption,
    sha256: record.sha256,
    bytes: record.bytes,
    ext: record.ext,
    updatedAt: record.updatedAt,
  }));

  const csv = stringify(rows, {
    header: true,
    columns,
  });
  await fs.writeFile(filePath, csv, 'utf-8');
}
