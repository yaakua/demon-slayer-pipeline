import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const {
  S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
} = process.env;

export const s3 = new S3Client({
  region: S3_REGION,
  credentials: S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY ? {
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY
  } : undefined
});

export async function putObject(key: string, body: Buffer, contentType?: string) {
  if (!S3_BUCKET) throw new Error('Missing S3_BUCKET');
  await s3.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable'
  }));
  return `s3://${S3_BUCKET}/${key}`;
}
