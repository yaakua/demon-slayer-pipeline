import path from 'node:path';
import COS from 'cos-nodejs-sdk-v5';
import pLimit from 'p-limit';
import { PipelineRecord } from './types.js';

export interface CosUploadOptions {
  bucket: string;
  region: string;
  folder?: string;
  forcePathStyle?: boolean;
  concurrency?: number;
}

function createCosClient(options: CosUploadOptions) {
  const secretId = process.env.TENCENT_SECRET_ID;
  const secretKey = process.env.TENCENT_SECRET_KEY;
  if (!secretId || !secretKey) {
    throw new Error('Missing TENCENT_SECRET_ID or TENCENT_SECRET_KEY environment variables.');
  }
  return new COS({
    SecretId: secretId,
    SecretKey: secretKey,
    ForcePathStyle: options.forcePathStyle ?? false,
  });
}

function resolveKey(record: PipelineRecord, folder?: string): string {
  const fileName = path.basename(record.compressedPath ?? record.localPath);
  if (!folder) return fileName;
  return path.posix.join(folder.replace(/\\/g, '/'), fileName);
}

function buildCosUrl(bucket: string, region: string, key: string): string {
  const normalizedKey = key.replace(/\\/g, '/');
  return `https://${bucket}.cos.${region}.myqcloud.com/${normalizedKey}`;
}

export async function uploadToCos(records: PipelineRecord[], options: CosUploadOptions): Promise<PipelineRecord[]> {
  const client = createCosClient(options);
  const concurrency = options.concurrency ?? 3;
  const limit = pLimit(concurrency);

  const uploads = records.map((record) =>
    limit(async () => {
      if (record.remoteUrl) return record;
      const filePath = record.compressedPath ?? record.localPath;
      const key = resolveKey(record, options.folder);
      await new Promise<void>((resolve, reject) => {
        client.uploadFile({
          Bucket: options.bucket,
          Region: options.region,
          Key: key,
          FilePath: filePath,
          SliceSize: 1024 * 1024,
        }, (err, data) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });

      const remoteUrl = buildCosUrl(options.bucket, options.region, key);
      return {
        ...record,
        remoteUrl,
        updatedAt: new Date().toISOString(),
      } satisfies PipelineRecord;
    }),
  );

  const updated = await Promise.all(uploads);
  return updated;
}
