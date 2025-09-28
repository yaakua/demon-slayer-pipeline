import type { Stats } from 'sharp';

export interface FieldSelector {
  selector: string;
  attr?: string;
  type?: 'text' | 'attr';
  split?: string;
  required?: boolean;
}

export interface ScrapeTarget {
  name: string;
  slug: string;
  url: string;
  baseUrl?: string;
  itemSelector: string;
  image: {
    selector?: string;
    attr?: string;
    dataAttr?: string;
  };
  title?: FieldSelector;
  description?: FieldSelector;
  category?: FieldSelector | string;
  tags?: FieldSelector;
  pagination?: {
    type: 'pageParam' | 'increment';
    start: number;
    end: number;
    param?: string;
    step?: number;
  };
  requestHeaders?: Record<string, string>;
}

export interface PipelineConfig {
  outputDir: string;
  csvPath: string;
  compression: {
    outputDir: string;
    maxWidth: number;
    quality: number;
  };
  ai?: {
    enabled: boolean;
    classifierModel?: string;
    captionModel?: string;
    maxTags?: number;
  };
  cos?: {
    enabled: boolean;
    bucket: string;
    region: string;
    folder?: string;
    forcePathStyle?: boolean;
  };
  targets: ScrapeTarget[];
}

export interface ScrapedImage {
  id: string;
  target: ScrapeTarget;
  pageUrl: string;
  imageUrl: string;
  title?: string;
  description?: string;
  categories?: string[];
  tags?: string[];
}

export interface DownloadedImage extends ScrapedImage {
  fileName: string;
  localPath: string;
  sha256: string;
  bytes: number;
  ext: string;
}

export interface AiAnalysis {
  compressedPath?: string;
  tags?: string[];
  categories?: string[];
  dominantColors?: string[];
  caption?: string;
}

export interface PipelineRecord extends DownloadedImage {
  compressedPath?: string;
  remoteUrl?: string;
  aiTags?: string[];
  aiCategories?: string[];
  aiColors?: string[];
  aiCaption?: string;
  updatedAt: string;
}

export interface PipelineRunOptions {
  targets?: string[];
  skipAi?: boolean;
  skipUpload?: boolean;
  skipScrape?: boolean;
}

export interface ScrapeContext {
  html: string;
  requestUrl: string;
}

export type ColorStats = Stats['dominant'];
