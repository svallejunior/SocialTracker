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

type Db = Database<sqlite3.Database, sqlite3.Statement>;

// Conexão única reaproveitada por todas as requisições: o processo do Next.js
// roda continuamente sob PM2 (não é serverless), então abrir e fechar uma
// conexão a cada request só desperdiçava tempo e vazava handles nas rotas que
// esqueciam de fechar. Se a abertura inicial falhar, dbPromise volta a null
// para a próxima chamada tentar de novo em vez de ficar presa numa promise
// rejeitada para sempre.
let dbPromise: Promise<Db> | null = null;

async function abrirConexao(): Promise<Db> {
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

/**
 * Retorna a conexão SQLite compartilhada do processo (busyTimeout de 10s e
 * modo WAL, para concorrência segura com scripts Python e o daemon). Não
 * feche a conexão retornada — ela é reaproveitada por todas as rotas.
 */
export async function getDb(): Promise<Db> {
  if (!dbPromise) {
    dbPromise = abrirConexao().catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}
