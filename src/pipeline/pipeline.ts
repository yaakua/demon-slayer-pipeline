import { AiAnalyzer } from './ai.js';
import { loadCsv, saveCsv } from './csv.js';
import { downloadImages } from './download.js';
import { uploadToCos } from './cos.js';
import { scrapeTarget } from './scrape.js';
import {
  PipelineConfig,
  PipelineRecord,
  PipelineRunOptions,
} from './types.js';

function filterTargets(config: PipelineConfig, options: PipelineRunOptions): PipelineConfig['targets'] {
  if (!options.targets || options.targets.length === 0) {
    return config.targets;
  }
  const wanted = new Set(options.targets);
  return config.targets.filter((target) => wanted.has(target.slug));
}

function mergeRecord(base: PipelineRecord | undefined, next: PipelineRecord): PipelineRecord {
  if (!base) return next;
  return {
    ...base,
    ...next,
    categories: next.categories ?? base.categories,
    tags: next.tags ?? base.tags,
    aiTags: next.aiTags ?? base.aiTags,
    aiCategories: next.aiCategories ?? base.aiCategories,
    aiColors: next.aiColors ?? base.aiColors,
    aiCaption: next.aiCaption ?? base.aiCaption,
    remoteUrl: next.remoteUrl ?? base.remoteUrl,
    compressedPath: next.compressedPath ?? base.compressedPath,
    updatedAt: new Date().toISOString(),
  };
}

export async function runPipeline(config: PipelineConfig, options: PipelineRunOptions = {}): Promise<PipelineRecord[]> {
  const targets = filterTargets(config, options);
  const csvRecords = await loadCsv(config.csvPath);
  const recordMap = new Map<string, PipelineRecord>();
  for (const record of csvRecords) {
    recordMap.set(record.id, record);
  }

  const aiAnalyzer = !options.skipAi && config.ai?.enabled
    ? new AiAnalyzer({
        outputDir: config.compression.outputDir,
        maxWidth: config.compression.maxWidth,
        quality: config.compression.quality,
        classifierModel: config.ai.classifierModel,
        captionModel: config.ai.captionModel,
        maxTags: config.ai.maxTags,
      })
    : undefined;

  for (const target of targets) {
    if (options.skipScrape) continue;
    console.log(`[pipeline] Scraping target ${target.name}`);
    const scraped = await scrapeTarget(target);
    console.log(`[pipeline] Found ${scraped.length} assets for ${target.name}`);
    const downloaded = await downloadImages(scraped, { baseDir: config.outputDir });
    console.log(`[pipeline] Downloaded ${downloaded.length} assets for ${target.name}`);

    for (const item of downloaded) {
      const base = recordMap.get(item.id);
      let record = mergeRecord(base, {
        ...item,
        updatedAt: new Date().toISOString(),
      });

      const shouldAnalyze = aiAnalyzer && (!base || !base.aiTags || base.aiTags.length === 0);
      if (shouldAnalyze) {
        try {
          const analysis = await aiAnalyzer!.analyze(item);
          record = mergeRecord(record, {
            ...record,
            compressedPath: analysis.compressedPath ?? record.compressedPath,
            aiTags: analysis.tags ?? record.aiTags,
            aiCategories: analysis.categories ?? record.aiCategories,
            aiColors: analysis.dominantColors ?? record.aiColors,
            aiCaption: analysis.caption ?? record.aiCaption,
            updatedAt: new Date().toISOString(),
          });
        } catch (error) {
          console.warn('[pipeline] AI analysis failed for', item.id, error);
        }
      }

      recordMap.set(record.id, record);
    }
  }

  let mergedRecords = Array.from(recordMap.values());

  if (config.cos?.enabled && !options.skipUpload) {
    console.log('[pipeline] Uploading assets to Tencent COS');
    const pending = mergedRecords.filter((record) => !record.remoteUrl);
    if (pending.length > 0) {
      const uploaded = await uploadToCos(pending, config.cos);
      const uploadedMap = new Map(uploaded.map((item) => [item.id, item] as const));
      mergedRecords = mergedRecords.map((record) => uploadedMap.get(record.id) ?? record);
    }
  }

  await saveCsv(config.csvPath, mergedRecords);
  console.log(`[pipeline] CSV saved to ${config.csvPath}`);
  return mergedRecords;
}
