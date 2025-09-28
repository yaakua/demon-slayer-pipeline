import path from 'node:path';
import sharp from 'sharp';
import { DownloadedImage, AiAnalysis } from './types.js';
import { ensureDir, fileNameWithExt, pathExists } from './utils.js';

export interface AiAnalyzerOptions {
  outputDir: string;
  maxWidth: number;
  quality: number;
  classifierModel?: string;
  captionModel?: string;
  maxTags?: number;
}

interface TransformersModule {
  pipeline: (task: string, model?: string) => Promise<any>;
}

async function loadTransformers(): Promise<TransformersModule | undefined> {
  try {
    const module = await import('@xenova/transformers');
    return module as TransformersModule;
  } catch (error) {
    console.warn('[AI] Failed to load @xenova/transformers, skipping AI analysis.');
    return undefined;
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`;
}

async function computeDominantColors(imagePath: string): Promise<string[]> {
  const stats = await sharp(imagePath).stats();
  const dominantHex = rgbToHex(stats.dominant.r, stats.dominant.g, stats.dominant.b);
  const average = await sharp(imagePath).resize(1, 1, { fit: 'inside' }).raw().toBuffer();
  const averageHex = rgbToHex(
    average[0] ?? stats.dominant.r,
    average[1] ?? stats.dominant.g,
    average[2] ?? stats.dominant.b,
  );
  return Array.from(new Set([dominantHex, averageHex]));
}

export class AiAnalyzer {
  private readonly options: AiAnalyzerOptions;
  private classifier?: any;
  private captioner?: any;
  private readonly maxTags: number;
  private transformersModule?: TransformersModule;

  constructor(options: AiAnalyzerOptions) {
    this.options = options;
    this.maxTags = options.maxTags ?? 5;
  }

  private async ensureTransformers(): Promise<boolean> {
    if (this.transformersModule) return true;
    const module = await loadTransformers();
    if (!module) return false;
    this.transformersModule = module;
    return true;
  }

  private async getClassifier() {
    if (!this.classifier) {
      if (!(await this.ensureTransformers())) return undefined;
      this.classifier = await this.transformersModule!.pipeline(
        'image-classification',
        this.options.classifierModel ?? 'Xenova/vit-base-patch16-224',
      );
    }
    return this.classifier;
  }

  private async getCaptioner() {
    if (!this.captioner) {
      if (!(await this.ensureTransformers())) return undefined;
      this.captioner = await this.transformersModule!.pipeline(
        'image-to-text',
        this.options.captionModel ?? 'Xenova/blip-image-captioning-base',
      );
    }
    return this.captioner;
  }

  private async compressImage(image: DownloadedImage): Promise<string> {
    const directory = path.join(this.options.outputDir, image.target.slug);
    await ensureDir(directory);
    const compressedFileName = fileNameWithExt(`${image.id}-compressed`, 'jpg');
    const destination = path.join(directory, compressedFileName);
    if (!(await pathExists(destination))) {
      await sharp(image.localPath)
        .resize({ width: this.options.maxWidth, withoutEnlargement: true })
        .jpeg({ quality: this.options.quality })
        .toFile(destination);
    }
    return destination;
  }

  async analyze(image: DownloadedImage): Promise<AiAnalysis> {
    const compressedPath = await this.compressImage(image);
    const colors = await computeDominantColors(compressedPath);

    const analysis: AiAnalysis = {
      compressedPath,
      dominantColors: colors,
    };

    const classifier = await this.getClassifier();
    if (classifier) {
      try {
        const predictions = await classifier(compressedPath, { topk: this.maxTags });
        const labels = Array.isArray(predictions)
          ? predictions.map((item: any) => item.label)
          : [];
        analysis.tags = labels.slice(0, this.maxTags);
        analysis.categories = labels.slice(0, Math.min(3, labels.length));
      } catch (error) {
        console.warn('[AI] Failed to classify image', error);
      }
    }

    const captioner = await this.getCaptioner();
    if (captioner) {
      try {
        const generated = await captioner(compressedPath, { max_new_tokens: 50 });
        if (Array.isArray(generated) && generated.length > 0) {
          analysis.caption = generated[0].generated_text ?? generated[0].caption ?? undefined;
        } else if (generated?.generated_text) {
          analysis.caption = generated.generated_text;
        }
      } catch (error) {
        console.warn('[AI] Failed to caption image', error);
      }
    }

    return analysis;
  }
}
