/**
 * Retryable error codes from the Gemini API.
 * 429 = quota exceeded, 500/503 = transient server errors.
 */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 503]);

/**
 * Default retryability check — transient API errors only.
 * @param {Error} err
 * @returns {boolean}
 */
function defaultIsRetryable(err) {
  const statusCode =
    err.status ?? err.statusCode ?? err?.errorDetails?.[0]?.status;
  return (
    RETRYABLE_STATUS_CODES.has(statusCode) ||
    !!err.message?.includes("quota") ||
    !!err.message?.includes("overloaded") ||
    !!err.message?.includes("rate limit")
  );
}

/**
 * Executes an async function with exponential backoff retry.
 *
 * @param {() => Promise<T>} fn           Async function to execute
 * @param {object}           opts
 * @param {number}           opts.maxRetries    Max retry attempts (default 3)
 * @param {number}           opts.baseDelayMs   Initial delay in ms (default 1000)
 * @param {number}           opts.maxTotalMs    Hard wall-clock cap across all attempts (default 30 s).
 *   Prevents runaway loops if GEMINI_MAX_RETRIES is set to a large value by mistake.
 * @param {string}           [opts.label]       Label for log messages
 * @param {(err: Error) => boolean} [opts.isRetryable]
 *   Optional override — return true to retry, false to throw immediately.
 *   When omitted, only transient API errors (429 / 500 / 503) are retried.
 * @returns {Promise<T>}
 */
export async function withRetry(
  fn,
  {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxTotalMs = 30_000,
    label = "operation",
    isRetryable = defaultIsRetryable,
  } = {},
) {
  let lastError;
  const deadline = Date.now() + maxTotalMs;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      const timeLeft = deadline - Date.now();
      if (!isRetryable(err) || attempt === maxRetries || timeLeft <= 0) {
        if (timeLeft <= 0) {
          console.warn(
            `[Retry] ${label} — wall-clock deadline exceeded after ${attempt} attempt(s). Giving up.`,
          );
        }
        break;
      }

      // Exponential backoff: 1s → 2s → 4s, capped to remaining time
      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), timeLeft);
      console.warn(
        `[Retry] ${label} failed (attempt ${attempt}/${maxRetries}). Retrying in ${delay}ms. Error: ${err.message}`,
      );
      await sleep(delay);
    }
  }

  throw lastError;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
