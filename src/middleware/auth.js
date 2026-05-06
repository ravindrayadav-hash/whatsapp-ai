/**
 * Bearer-token authentication middleware.
 *
 * Reads ADMIN_TOKEN from env. If not set, auth is disabled and all requests
 * pass through (safe for local dev without a token configured).
 *
 * Expected header from clients:
 *   Authorization: Bearer <ADMIN_TOKEN>
 *
 * The scraper sends the same token via API_SECRET env var so internal
 * server-to-server calls are also authenticated.
 */
export function authMiddleware(req, res, next) {
  const token = process.env.ADMIN_TOKEN;

  // Auth disabled — skip check entirely (local dev mode)
  if (!token) return next();

  const header = req.headers['authorization'] ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

  if (!provided || provided !== token) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized — valid Bearer token required',
    });
  }

  next();
}
