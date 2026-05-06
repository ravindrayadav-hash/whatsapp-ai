import { launchMainSession, openGroupPage, closeGroupPage, closeSession } from './whatsapp.session.js';
import { scrapeGroupMessages } from './whatsapp.scraper.js';

/**
 * High-level helper: launch a session, scrape all groups sequentially, close.
 *
 * WA Web does not support multiple active tabs in the same browser profile —
 * groups are scraped one at a time.
 *
 * @param {string[]} groupNames
 * @param {object}   [opts]
 * @param {number}   [opts.limit]   max messages per group
 * @param {string}   [opts.cursor]  ISO timestamp — only extract messages after
 *                                  this point. null (default) = full history.
 * @returns {Promise<Record<string, Array<{ sender, message, image_url, timestamp }>>>}
 */
export async function scrapeGroups(groupNames, opts = {}) {
  const context = await launchMainSession();
  const results = {};

  try {
    for (const group of groupNames) {
      const page = await openGroupPage(context);
      try {
        results[group] = await scrapeGroupMessages(
          page,
          group,
          opts.cursor ?? null,
          opts.limit,
        );
      } catch (err) {
        console.error(`[Scraper] Failed to scrape "${group}": ${err.message}`);
        results[group] = [];
      } finally {
        await closeGroupPage(page);
      }
    }
  } finally {
    await closeSession(context);
  }

  return results;
}

export { launchMainSession, openGroupPage, closeGroupPage, closeSession, scrapeGroupMessages };
