import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { User } from '../entities/User.js';
import { Message } from '../entities/Message.js';
import { Summary } from '../entities/Summary.js';
import { ProcessingLog } from '../entities/ProcessingLog.js';
import { AiLog } from '../entities/AiLog.js';

const isDev = process.env.NODE_ENV === 'development';

export const AppDataSource = new DataSource({
  type: 'mysql',

  // ── Connection ──────────────────────────────────────────────
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,

  // ── Connection Pool ─────────────────────────────────────────
  // mysql2 driver exposes these via the `extra` field
  extra: {
    connectionLimit: isDev ? 5 : 20,      // max simultaneous connections
    waitForConnections: true,              // queue requests when pool is full
    queueLimit: 0,                         // 0 = unlimited queue (adjust per load)
    connectTimeout: 10_000,               // fail fast if DB unreachable (ms)
    idleTimeoutMillis: 30_000,            // release idle connections after 30s
  },

  // ── Schema Management ────────────────────────────────────────
  // synchronize: NEVER true in production — use migrations instead
  synchronize: isDev,
  migrationsRun: !isDev,                  // auto-run pending migrations in prod
  migrations: ['src/migrations/*.js'],

  // ── Logging ──────────────────────────────────────────────────
  // In dev: log all queries. In prod: log only slow/error queries.
  // Exclude 'query' in dev to reduce noise — duplicate key errors from TypeORM
  // are handled at the controller level; we don't need every INSERT logged.
  logging: isDev ? ['error', 'warn'] : ['error', 'warn'],
  maxQueryExecutionTime: 1000,            // log queries taking > 1s in all envs

  // ── Entities ─────────────────────────────────────────────────
  entities: [User, Message, Summary, ProcessingLog, AiLog],
});
