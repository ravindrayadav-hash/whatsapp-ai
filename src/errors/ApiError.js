/**
 * Structured application error thrown by controllers and services.
 *
 * Usage:
 *   throw new ApiError(400, 'group_name is required');
 *   throw new ApiError(404, 'Group not found');
 *   throw new ApiError(409, 'Duplicate message', { detail: err.sqlMessage });
 *
 * The global error handler in app.js catches these and returns:
 *   { success: false, message, ...extra }
 */
export class ApiError extends Error {
  /**
   * @param {number} status  HTTP status code
   * @param {string} message Human-readable error description
   * @param {object} [extra] Additional fields merged into the response body
   */
  constructor(status, message, extra = {}) {
    super(message);
    this.name    = 'ApiError';
    this.status  = status;
    this.extra   = extra;
  }
}
