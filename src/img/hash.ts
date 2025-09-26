import { imageHash } from 'image-hash';
import sharp from 'sharp';

export async function perceptualHash(buf: Buffer): Promise<string> {
  try {
    // 使用 sharp 压缩图片以避免内存限制问题
    const compressedBuffer = await sharp(buf)
      .resize(1024, 1024, { 
        fit: 'inside', 
        withoutEnlargement: true 
      })
      .jpeg({ quality: 85 })
      .toBuffer();

    return new Promise((resolve, reject) => {
      imageHash({
        data: compressedBuffer,
        ext: 'image/jpeg'
      }, 16, true, (err: any, hash: any) => {
        if (err) {
          reject(err);
        } else {
          resolve(hash);
        }
      });
    });
  } catch (error) {
    throw new Error(`Failed to process image for hashing: ${error}`);
  }
}
