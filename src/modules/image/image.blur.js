import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..', '..');

// How much to blur before forwarding to the LLM.
// Override with LLM_IMAGE_BLUR_SIGMA env var (0 = no blur, higher = stronger blur).
const BLUR_SIGMA = Number(process.env.LLM_IMAGE_BLUR_SIGMA ?? 3);

/**
 * Returns true if the value is a local upload path written by image.storage.js.
 * @param {unknown} url
 * @returns {boolean}
 */
export function isLocalUploadPath(url) {
  return typeof url === 'string' && url.startsWith('/uploads/');
}

/**
 * Reads a locally-stored image from disk, applies a Gaussian blur, and
 * returns the result as a base64 data URL suitable for Gemini inlineData.
 *
 * Blurring reduces PII exposure (faces, names, screenshots) before the image
 * leaves the local server and is forwarded to the external LLM API.
 *
 * @param {string} uploadPath  e.g. "/uploads/images/abc123.jpg"
 * @returns {Promise<string>}  "data:image/jpeg;base64,..."
 */
export async function blurImageForLLM(uploadPath) {
  const filePath = join(PROJECT_ROOT, uploadPath);

  const pipeline = sharp(filePath);

  // Apply blur only when BLUR_SIGMA > 0
  if (BLUR_SIGMA > 0) {
    pipeline.blur(BLUR_SIGMA);
  }

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  const mimeType = `image/${info.format || 'jpeg'}`;
  return `data:${mimeType};base64,${data.toString('base64')}`;
}
