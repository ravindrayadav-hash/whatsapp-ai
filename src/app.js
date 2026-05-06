import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import messageRoutes from './modules/message/message.routes.js';
import summaryRoutes from './modules/summary/summary.routes.js';
import groupsRoutes from './modules/summary/groups.routes.js';
import aiRoutes from './modules/ai/ai.routes.js';
import { authMiddleware } from './middleware/auth.js';
import { ApiError } from './errors/ApiError.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();

// Images are sent as base64 data URLs — raise the body limit accordingly.
// A WhatsApp image is typically 1–3 MB; base64 overhead is ~33 %, so 50 MB
// is a safe upper bound that still prevents runaway request bodies.
app.use(express.json({ limit: '50mb' }));

// Serve uploaded images as static files.
// e.g. GET /uploads/images/abc123.jpg → uploads/images/abc123.jpg on disk
app.use('/uploads', express.static(join(__dirname, '..', 'uploads')));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Global rate limit — 200 requests per 15 minutes per IP.
// Prevents bulk scraping of message data or brute-forcing the token.
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests — please slow down' },
});

// Tighter limit on AI endpoints — each call costs Gemini quota.
// 15 requests per minute per IP is generous for interactive use.
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'AI rate limit reached — wait a moment and retry' },
});

app.use('/api', globalLimiter);
app.use('/api/ai', aiLimiter);

// Protect all /api/* routes with Bearer-token auth.
// Pass-through when ADMIN_TOKEN is not set (local dev without auth).
app.use('/api', authMiddleware);

app.use('/api/messages', messageRoutes);
app.use('/api/summaries', summaryRoutes);
app.use('/api/groups', groupsRoutes);
app.use('/api/ai', aiRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Global error handler
app.use((err, _req, res, _next) => {
  const isDev = process.env.NODE_ENV === 'development';

  console.error(`[ERROR] ${err.message}`, isDev ? err.stack : '');

  // Structured application errors thrown via `throw new ApiError(status, msg)`
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      success: false,
      message: err.message,
      ...err.extra,
    });
  }

  // TypeORM constraint violations
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ success: false, message: 'Duplicate entry', detail: err.sqlMessage });
  }

  if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(422).json({ success: false, message: 'Referenced record does not exist' });
  }

  res.status(500).json({
    success: false,
    message: 'Internal server error',
    ...(isDev && { detail: err.message }),
  });
});

export default app;
