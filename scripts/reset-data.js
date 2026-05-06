/**
 * Full data reset script.
 * Clears all messages, summaries, and processing logs so the scraper
 * will re-read the full WhatsApp history on next run.
 *
 * Usage: node scripts/reset-data.js
 */
import 'dotenv/config';
import { AppDataSource } from '../src/config/database.js';

await AppDataSource.initialize();
console.log('DB connected');

const runner = AppDataSource.createQueryRunner();
await runner.connect();
await runner.startTransaction();

try {
  // Disable FK checks so truncate order doesn't matter
  await runner.query('SET FOREIGN_KEY_CHECKS = 0');

  const [msgResult]  = await runner.query('SELECT COUNT(*) AS cnt FROM messages');
  const [sumResult]  = await runner.query('SELECT COUNT(*) AS cnt FROM summaries');
  const [logResult]  = await runner.query('SELECT COUNT(*) AS cnt FROM processing_logs');

  console.log(`Rows before reset:`);
  console.log(`  messages:        ${msgResult.cnt}`);
  console.log(`  summaries:       ${sumResult.cnt}`);
  console.log(`  processing_logs: ${logResult.cnt}`);

  await runner.query('TRUNCATE TABLE summaries');
  await runner.query('TRUNCATE TABLE processing_logs');
  await runner.query('TRUNCATE TABLE messages');

  await runner.query('SET FOREIGN_KEY_CHECKS = 1');

  await runner.commitTransaction();
  console.log('\nAll tables cleared successfully.');
  console.log('Next scraper run will load full WhatsApp history.');
} catch (err) {
  await runner.rollbackTransaction();
  console.error('Reset failed — rolled back:', err.message);
  process.exit(1);
} finally {
  await runner.release();
  await AppDataSource.destroy();
}
