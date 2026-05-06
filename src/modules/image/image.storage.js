import { writeFile, mkdir, access } from 'fs/promises';
import { constants } from 'fs';
import { join, dirname } from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = join(__dirname, '..', '..', '..', 'uploads', 'images');

// MIME type → file extension
const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/jpg':  'jpg',
  'image/png':  'png',
  'image/gif':  'gif',
  'image/webp': 'webp',
};

/**
 * Returns true if the value is a base64 data URL.
 * @param {unknown} url
 * @returns {boolean}
 */
export function isBase64DataUrl(url) {
  return typeof url === 'string' && url.startsWith('data:image') && url.includes(';base64,');
}

/**
 * Saves a base64 data URL to the local uploads directory.
 *
 * - Content-addressed filename: MD5(base64) — same image always maps to the
 *   same file, so no duplicate files accumulate across process restarts.
 * - Write is skipped (EEXIST) if the file is already on disk.
 *
 * @param {string} dataUrl  e.g. "data:image/jpeg;base64,/9j/..."
 * @returns {Promise<string>} Public path e.g. "/uploads/images/<hash>.jpg"
 */
// Maximum allowed decoded image size in bytes (default 10 MB).
// Configured via IMAGE_MAX_BYTES env var.
const IMAGE_MAX_BYTES = Number(process.env.IMAGE_MAX_BYTES) || 10 * 1024 * 1024;

export async function saveImageFromDataUrl(dataUrl) {
  const commaIdx  = dataUrl.indexOf(',');
  const header    = dataUrl.slice(0, commaIdx);
  const base64    = dataUrl.slice(commaIdx + 1);

  // Guard against memory spikes from very large images.
  // base64 length * 0.75 gives the approximate decoded byte size.
  const approxBytes = base64.length * 0.75;
  if (approxBytes > IMAGE_MAX_BYTES) {
    throw new Error(
      `Image too large: ~${Math.round(approxBytes / 1024 / 1024)}MB exceeds limit of ${Math.round(IMAGE_MAX_BYTES / 1024 / 1024)}MB`
    );
  }

  const mimeMatch = header.match(/data:([^;]+);base64/);
  const mimeType  = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const ext       = MIME_EXT[mimeType] || 'jpg';

  // MD5 of the full base64 string → same image = same filename (content-addressed)
  const hash     = createHash('md5').update(base64).digest('hex');
  const filename = `${hash}.${ext}`;
  const filepath = join(UPLOADS_DIR, filename);

  await mkdir(UPLOADS_DIR, { recursive: true });

  try {
    // 'wx' flag: create file exclusively — fails with EEXIST if it already exists
    await writeFile(filepath, Buffer.from(base64, 'base64'), { flag: 'wx' });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    // File already exists — verify it is actually readable before returning.
    // A previous partial write (e.g. process crash mid-write) could leave a
    // zero-byte or unreadable file behind; re-throw so the caller can retry.
    await access(filepath, constants.R_OK).catch(() => {
      throw new Error(`Image file ${filename} exists but is not readable — possible corrupt write`);
    });
  }

  return `/uploads/images/${filename}`;
}
