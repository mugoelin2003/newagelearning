/**
 * storage.js — object storage for uploaded files (PDF, audio, video, images).
 *
 * S3-compatible: works with AWS S3, Cloudflare R2, DigitalOcean Spaces,
 * Backblaze B2, or MinIO — just set the env vars below. If they aren't set,
 * enabled() returns false and the server falls back to placeholder URLs, so
 * nothing breaks before you've configured storage.
 *
 * Env vars:
 *   S3_BUCKET             (required)  bucket name
 *   S3_ACCESS_KEY_ID      (required)
 *   S3_SECRET_ACCESS_KEY  (required)
 *   S3_REGION             default "auto" (use e.g. "ap-south-1" for AWS Mumbai)
 *   S3_ENDPOINT           set for R2/Spaces/B2/MinIO; OMIT for AWS S3
 *   S3_PUBLIC_BASE        optional CDN/public base, e.g. https://cdn.newagelearning.in
 *                         If set, files are served from there. If not, the API
 *                         hands out short-lived signed URLs instead.
 */
const {
  S3_BUCKET,
  S3_REGION = 'auto',
  S3_ENDPOINT,
  S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY,
  S3_PUBLIC_BASE,
} = process.env;

const CONFIGURED = !!(S3_BUCKET && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY);

let _client;
function client() {
  if (_client) return _client;
  const { S3Client } = require('@aws-sdk/client-s3');
  _client = new S3Client({
    region: S3_REGION,
    endpoint: S3_ENDPOINT || undefined,   // AWS: leave unset. R2/Spaces/B2/MinIO: set it.
    forcePathStyle: !!S3_ENDPOINT,         // path-style for non-AWS endpoints
    credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
  });
  return _client;
}

function enabled() { return CONFIGURED; }

// upload a buffer; returns the object key
async function put(key, buffer, contentType) {
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  await client().send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType || 'application/octet-stream',
  }));
  return key;
}

// public URL when a CDN/public base is configured (or default AWS virtual-host URL); else null
function publicUrl(key) {
  if (S3_PUBLIC_BASE) return `${S3_PUBLIC_BASE.replace(/\/$/, '')}/${key}`;
  if (!S3_ENDPOINT && S3_BUCKET) return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`;
  return null;
}

// short-lived signed GET (used when there's no public base — keeps private buckets working)
async function signedGetUrl(key, expiresIn = 300) {
  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }), { expiresIn });
}

module.exports = { enabled, put, publicUrl, signedGetUrl };
