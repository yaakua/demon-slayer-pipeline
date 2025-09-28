import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../pipeline/config.js';
import { runPipeline } from '../pipeline/pipeline.js';
import { loadCsv } from '../pipeline/csv.js';
import type { PipelineRecord } from '../pipeline/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);
const configPath = process.env.PIPELINE_CONFIG || 'pipeline.config.json';

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use('/public', express.static(path.join(__dirname, 'public')));

function buildStats(records: PipelineRecord[]) {
  const total = records.length;
  const pendingUpload = records.filter((record) => !record.remoteUrl).length;
  const withAi = records.filter((record) => record.aiTags && record.aiTags.length > 0).length;
  return { total, pendingUpload, withAi };
}

app.get('/', async (req, res, next) => {
  try {
    const config = await loadConfig(configPath);
    const records = await loadCsv(config.csvPath);
    const targetNames = new Map(config.targets.map((target) => [target.slug, target.name] as const));
    const sorted = records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 25);
    const message = req.query.message as string | undefined;

    res.render('index', {
      config,
      stats: buildStats(records),
      records: sorted,
      targetNames,
      message,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/preview', (req, res) => {
  const filePath = req.query.path;
  if (!filePath || typeof filePath !== 'string') {
    res.status(400).send('Missing path');
    return;
  }
  const resolved = path.resolve(filePath);
  const root = path.resolve('.');
  if (!resolved.startsWith(root)) {
    res.status(403).send('Forbidden');
    return;
  }
  res.sendFile(resolved);
});

app.post('/run', async (req, res, next) => {
  try {
    const config = await loadConfig(configPath);
    const targets = Array.isArray(req.body.targets)
      ? req.body.targets
      : req.body.targets
        ? [req.body.targets]
        : undefined;
    await runPipeline(config, {
      targets,
      skipAi: Boolean(req.body.skipAi),
      skipUpload: Boolean(req.body.skipUpload),
    });
    res.redirect('/?message=Pipeline%20completed');
  } catch (error) {
    next(error);
  }
});

app.post('/upload', async (req, res, next) => {
  try {
    const config = await loadConfig(configPath);
    await runPipeline(config, { skipScrape: true, skipAi: true, skipUpload: false });
    res.redirect('/?message=Upload%20completed');
  } catch (error) {
    next(error);
  }
});

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).send(err.message);
});

app.listen(port, () => {
  console.log(`Pipeline dashboard running at http://localhost:${port}`);
});
