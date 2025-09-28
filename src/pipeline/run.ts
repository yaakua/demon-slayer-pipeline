import { Command } from 'commander';
import { loadConfig } from './config.js';
import { runPipeline } from './pipeline.js';
import { PipelineRunOptions } from './types.js';

const program = new Command();

program
  .name('demon-slayer-pipeline')
  .description('Scrape wallpapers, enrich metadata and manage uploads.');

program
  .command('run')
  .description('Run the scraping, AI analysis and upload pipeline')
  .option('-c, --config <path>', 'Path to pipeline config', 'pipeline.config.json')
  .option('-t, --targets <list>', 'Comma separated target slugs')
  .option('--skip-ai', 'Skip AI analysis step')
  .option('--skip-upload', 'Skip Tencent COS upload step')
  .option('--skip-scrape', 'Skip scraping and downloading (useful for re-running AI/upload)')
  .action(async (options) => {
    const config = await loadConfig(options.config);
    const runOptions: PipelineRunOptions = {
      targets: options.targets ? String(options.targets).split(',').map((item) => item.trim()).filter(Boolean) : undefined,
      skipAi: options.skipAi ?? false,
      skipUpload: options.skipUpload ?? false,
      skipScrape: options.skipScrape ?? false,
    };

    await runPipeline(config, runOptions);
  });

program
  .command('upload')
  .description('Upload existing items to Tencent COS and update the CSV')
  .option('-c, --config <path>', 'Path to pipeline config', 'pipeline.config.json')
  .action(async (options) => {
    const config = await loadConfig(options.config);
    await runPipeline(config, { skipScrape: true, skipAi: true, skipUpload: false });
  });

program.parseAsync(process.argv).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
