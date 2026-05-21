// Authentication middleware.
//
// Accepts two token types so the scraper (ADMIN_TOKEN) and browser clients
// (JWT) can both reach /api/* without changes:
//
//   1. Static ADMIN_TOKEN  — if JWT_SECRET is not set, falls back to the old
//      bearer-string comparison (backwards compat for the internal scraper).
//   2. JWT issued by /auth/login or /auth/register — verified with JWT_SECRET.
//      The decoded payload is attached to req.user for downstream handlers.
//
// Auth is fully disabled when neither ADMIN_TOKEN nor JWT_SECRET is set
// (local dev without any auth configured).

import jwt from 'jsonwebtoken';

export function authMiddleware(req, res, next) {
  const adminToken = process.env.ADMIN_TOKEN;
  const jwtSecret = process.env.JWT_SECRET;

  // Auth completely disabled — pass through (local dev)
  if (!adminToken && !jwtSecret) return next();

  const header = req.headers['authorization'] ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

  if (!provided) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized — Bearer token required',
    });
  }

  // Try JWT first when a secret is configured
  if (jwtSecret) {
    try {
      req.user = jwt.verify(provided, jwtSecret);
      return next();
    } catch {
      // Not a valid JWT — fall through to ADMIN_TOKEN check below
    }
  }

  // Fallback: static admin token (scraper / internal calls)
  if (adminToken && provided === adminToken) {
    return next();
  }

  return res.status(401).json({
    success: false,
    message: 'Unauthorized — invalid or expired token',
  });
}
