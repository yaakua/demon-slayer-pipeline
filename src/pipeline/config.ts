import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { PipelineConfig } from './types.js';

const fieldSelectorSchema = z.object({
  selector: z.string(),
  attr: z.string().optional(),
  type: z.enum(['text', 'attr']).optional(),
  split: z.string().optional(),
  required: z.boolean().optional(),
});

const paginationSchema = z.object({
  type: z.enum(['pageParam', 'increment']).default('pageParam'),
  start: z.number().int().default(1),
  end: z.number().int(),
  param: z.string().optional(),
  step: z.number().int().default(1),
});

const targetSchema = z.object({
  name: z.string(),
  slug: z.string().regex(/^[a-z0-9-]+$/i, 'slug must be alphanumeric with dashes'),
  url: z.string().url(),
  baseUrl: z.string().url().optional(),
  itemSelector: z.string(),
  image: z.object({
    selector: z.string().optional(),
    attr: z.string().optional(),
    dataAttr: z.string().optional(),
  }),
  title: fieldSelectorSchema.optional(),
  description: fieldSelectorSchema.optional(),
  category: fieldSelectorSchema.or(z.string()).optional(),
  tags: fieldSelectorSchema.optional(),
  pagination: paginationSchema.optional(),
  requestHeaders: z.record(z.string()).optional(),
});

const configSchema = z.object({
  outputDir: z.string(),
  csvPath: z.string(),
  compression: z.object({
    outputDir: z.string(),
    maxWidth: z.number().positive(),
    quality: z.number().min(1).max(100),
  }),
  ai: z.object({
    enabled: z.boolean().default(false),
    classifierModel: z.string().optional(),
    captionModel: z.string().optional(),
    maxTags: z.number().int().positive().default(5),
  }).optional(),
  cos: z.object({
    enabled: z.boolean().default(false),
    bucket: z.string(),
    region: z.string(),
    folder: z.string().optional(),
    forcePathStyle: z.boolean().optional(),
  }).optional(),
  targets: z.array(targetSchema).min(1),
});

export async function loadConfig(configPath: string): Promise<PipelineConfig> {
  const absolutePath = path.isAbsolute(configPath)
    ? configPath
    : path.join(process.cwd(), configPath);

  const data = await fs.readFile(absolutePath, 'utf-8');
  const parsed = configSchema.parse(JSON.parse(data));

  return parsed;
}

export async function resolveConfigPath(relativePath: string): Promise<string> {
  if (path.isAbsolute(relativePath)) {
    return relativePath;
  }
  const cwd = process.cwd();
  return path.join(cwd, relativePath);
}

export async function importConfigModule(configPath: string): Promise<PipelineConfig> {
  const absolute = await resolveConfigPath(configPath);
  const moduleUrl = pathToFileURL(absolute).href;
  const mod = await import(moduleUrl);
  const candidate = mod.default ?? mod.config ?? mod;
  return configSchema.parse(candidate);
}
