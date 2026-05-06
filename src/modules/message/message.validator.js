/**
 * Validates the body for POST /messages.
 * Returns an array of error strings; empty array means valid.
 */
export function validateCreateMessage(body) {
  const errors = [];

  if (!body.group_name || typeof body.group_name !== 'string' || !body.group_name.trim()) {
    errors.push('group_name is required and must be a non-empty string');
  } else if (body.group_name.length > 150) {
    errors.push('group_name must be 150 characters or fewer');
  }

  if (!body.sender || typeof body.sender !== 'string' || !body.sender.trim()) {
    errors.push('sender is required and must be a non-empty string');
  } else if (body.sender.length > 100) {
    errors.push('sender must be 100 characters or fewer');
  }

  // Either message text OR image_url must be present — an image-only message
  // (no caption) is valid; a completely empty message is not.
  const hasMessage  = body.message   && typeof body.message   === 'string' && body.message.trim();
  const hasImageUrl = body.image_url && typeof body.image_url === 'string' && body.image_url.trim();

  if (!hasMessage && !hasImageUrl) {
    errors.push('At least one of "message" or "image_url" is required');
  }

  // Size guards — prevent unbounded payloads reaching the DB or disk.
  // 10 KB for text is generous for any real chat message.
  // 50 MB for image_url matches the Express body-parser limit.
  if (hasMessage && body.message.length > 10_000) {
    errors.push('message must be 10,000 characters or fewer');
  }
  if (hasImageUrl && body.image_url.length > 50 * 1024 * 1024) {
    errors.push('image_url exceeds the 50 MB limit');
  }

  // message_type is intentionally NOT accepted from the client — it is always
  // derived server-side from the presence of message + image_url to prevent
  // inconsistent DB state (e.g. type="image" with only text content).

  if (!body.message_time) {
    errors.push('message_time is required');
  } else {
    const ts = new Date(body.message_time);
    if (isNaN(ts.getTime())) {
      errors.push('message_time must be a valid ISO 8601 datetime string');
    }
  }

  return errors;
}

/**
 * Validates query params for GET /messages.
 * Returns an array of error strings; empty array means valid.
 */
export function validateGetMessages(query) {
  const errors = [];

  if (!query.group_name || typeof query.group_name !== 'string' || !query.group_name.trim()) {
    errors.push('query param group_name is required');
  }

  if (query.from && isNaN(new Date(query.from).getTime())) {
    errors.push('query param from must be a valid ISO 8601 datetime string');
  }

  if (query.to && isNaN(new Date(query.to).getTime())) {
    errors.push('query param to must be a valid ISO 8601 datetime string');
  }

  const limit = Number(query.limit);
  if (query.limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 500)) {
    errors.push('query param limit must be an integer between 1 and 500');
  }

  const page = Number(query.page);
  if (query.page !== undefined && (!Number.isInteger(page) || page < 1)) {
    errors.push('query param page must be a positive integer');
  }

  return errors;
}
