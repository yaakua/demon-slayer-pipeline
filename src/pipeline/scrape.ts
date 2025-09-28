import { load } from 'cheerio';
import type { CheerioAPI, Element } from 'cheerio';
import { ScrapeTarget, ScrapedImage } from './types.js';
import { createDeterministicId, ensureAbsolute } from './utils.js';

async function fetchPage(url: string, headers?: Record<string, string>): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'demon-slayer-pipeline/1.0 (+https://github.com/)',
      Accept: 'text/html,application/xhtml+xml',
      ...headers,
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return await response.text();
}

function extractField($: CheerioAPI, element: Element, field?: ScrapeTarget['title']): string | undefined {
  if (!field) return undefined;
  const node = $(element).find(field.selector).first();
  if (!node || node.length === 0) {
    if (field.required) {
      throw new Error(`Missing required selector ${field.selector}`);
    }
    return undefined;
  }
  let value: string | undefined;
  if (field.type === 'attr' && field.attr) {
    value = node.attr(field.attr) ?? undefined;
  } else if (field.attr) {
    value = node.attr(field.attr) ?? undefined;
  } else {
    value = node.text();
  }
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed;
}

function resolveValues(value?: string, splitter?: string): string[] | undefined {
  if (!value) return undefined;
  if (!splitter) return [value];
  return value
    .split(splitter)
    .map((part) => part.trim())
    .filter(Boolean);
}

function deriveImageUrl(
  $: CheerioAPI,
  element: Element,
  target: ScrapeTarget,
): string | undefined {
  const selector = target.image.selector ?? 'img';
  const node = $(element).find(selector).first();
  if (!node || node.length === 0) return undefined;
  let src: string | undefined;
  if (target.image.dataAttr) {
    src = node.data(target.image.dataAttr) as string | undefined;
  }
  if (!src && target.image.attr) {
    src = node.attr(target.image.attr) ?? undefined;
  }
  if (!src) {
    src = node.attr('src') ?? node.attr('data-src') ?? undefined;
  }
  if (!src) return undefined;
  const base = target.baseUrl ?? target.url;
  return ensureAbsolute(base, src);
}

export async function scrapeTarget(target: ScrapeTarget): Promise<ScrapedImage[]> {
  const pages: string[] = [];
  if (target.pagination) {
    const step = target.pagination.step ?? 1;
    const param = target.pagination.param ?? 'page';
    if (target.pagination.type === 'pageParam') {
      for (let page = target.pagination.start; page <= target.pagination.end; page += step) {
        const url = new URL(target.url);
        url.searchParams.set(param, String(page));
        pages.push(url.toString());
      }
    } else {
      const base = target.url.endsWith('/') ? target.url : `${target.url}/`;
      for (let page = target.pagination.start; page <= target.pagination.end; page += step) {
        const url = new URL(String(page), base).toString();
        pages.push(url);
      }
    }
  } else {
    pages.push(target.url);
  }

  const results: ScrapedImage[] = [];
  for (const pageUrl of pages) {
    const html = await fetchPage(pageUrl, target.requestHeaders);
    const $ = load(html);
    const items = $(target.itemSelector);

    items.each((_, element) => {
      const imageUrl = deriveImageUrl($, element, target);
      if (!imageUrl) return;
      const titleRaw = extractField($, element, target.title);
      const descriptionRaw = extractField($, element, target.description);

      const categoriesValue = typeof target.category === 'string'
        ? target.category
        : extractField($, element, target.category);
      const tagsValue = extractField($, element, target.tags);

      const categories = resolveValues(categoriesValue, target.category && typeof target.category !== 'string' ? target.category.split : undefined);
      const tags = resolveValues(tagsValue, target.tags?.split);
      const id = `${target.slug}-${createDeterministicId(pageUrl, imageUrl)}`;
      const record: ScrapedImage = {
        id,
        target,
        pageUrl,
        imageUrl,
        title: titleRaw?.trim(),
        description: descriptionRaw?.trim(),
        categories,
        tags,
      };
      results.push(record);
    });
  }

  const deduped = new Map<string, ScrapedImage>();
  for (const item of results) {
    deduped.set(item.id, item);
  }
  return Array.from(deduped.values());
}
