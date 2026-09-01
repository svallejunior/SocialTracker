import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import fs from 'fs';

export function resolveDbPath(): string {
  if (process.env.DB_PATH && fs.existsSync(process.env.DB_PATH)) return process.env.DB_PATH;
  const parentDb = path.resolve(process.cwd(), '..', 'instagram_tracker.db');
  if (fs.existsSync(parentDb)) return parentDb;
  const cwdDb = path.resolve(process.cwd(), 'instagram_tracker.db');
  if (fs.existsSync(cwdDb)) return cwdDb;
  return parentDb;
}

/**
 * Abre conexão SQLite com busyTimeout de 10 segundos (10000ms) e modo WAL
 * para concorrência segura com scripts Python e o daemon.
 */
export async function getDb(): Promise<Database<sqlite3.Database, sqlite3.Statement>> {
  const db = await open({
    filename: resolveDbPath(),
    driver: sqlite3.Database
  });

  // Configura busyTimeout de 10s no driver nativo sqlite3
  db.getDatabaseInstance().configure('busyTimeout', 10000);

  // Garante WAL e timeout a nível de PRAGMA
  try {
    await db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA busy_timeout = 10000;
    `);
  } catch (e) {
    // Silencia se PRAGMA já estiver ativo
  }

  return db;
}
