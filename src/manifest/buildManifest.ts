import fs from 'node:fs/promises';

(async () => {
  const items = JSON.parse(await fs.readFile('data/manifest.json','utf-8').catch(()=> '[]'));
  const manifest = items.map((it:any) => ({
    id: it.id,
    title: it.title,
    series: 'Demon Slayer: Kimetsu no Yaiba',
    characters: [],
    source: { site: it.source, landingPage: it.pageUrl, permalink: it.downloadUrl },
    original: {
      file: `raw/${it.source}/${it.id}.${it.ext}`,
      resolution: it.resolution,
      sha256: it.sha256,
      phash: it.phash
    },
    variants: {
      mobile:  { webp: `variants/mobile/${it.id}.webp`,  jpg: `variants/mobile/${it.id}.jpg` },
      pad:     { webp: `variants/pad/${it.id}.webp`,     jpg: `variants/pad/${it.id}.jpg` },
      desktop: { webp: `variants/desktop/${it.id}.webp`, jpg: `variants/desktop/${it.id}.jpg` },
    },
    tags: ['4K','5K','Anime','Demon Slayer'],
    safe: true,
    license: 'Authorized by source & authors',
  }));

  await fs.writeFile('data/manifest.json', JSON.stringify(manifest, null, 2));
  console.log('Manifest normalized:', manifest.length);
})();
