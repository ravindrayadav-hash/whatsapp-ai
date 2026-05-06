/**
 * One-time script to remove duplicate message rows from the DB.
 * Keeps the row with the lowest id for each (group_name, sender, message_time) combo.
 * Run ONCE before restarting the server with the new unique constraint.
 *
 * Usage: node scripts/dedupe-messages.js
 */
import 'dotenv/config';
import { AppDataSource } from '../src/config/database.js';

await AppDataSource.initialize();
console.log('DB connected');

const result = await AppDataSource.query(`
  DELETE m1
  FROM messages m1
  INNER JOIN messages m2
    ON  m1.group_name    = m2.group_name
    AND m1.sender        = m2.sender
    AND m1.message_time  = m2.message_time
    AND m1.id            > m2.id
`);

console.log(`Deleted ${result.affectedRows} duplicate rows`);
await AppDataSource.destroy();
