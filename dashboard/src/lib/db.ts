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

// Migrações defensivas (CREATE TABLE IF NOT EXISTS / ALTER TABLE ADD COLUMN)
// que antes viviam duplicadas em getDb() locais de cada rota (data, comentarios,
// respostas, controle, automacao/config, automacao/agendamentos) e rodavam a
// CADA request. Centralizadas aqui e chamadas uma única vez por abrirConexao()
// — o processo do Next.js roda continuamente sob PM2, então "uma vez" já basta
// pra vida inteira do processo. Onde duas rotas definiam a mesma tabela com
// colunas diferentes (instagram_comentarios/instagram_mensagens), a versão
// mais completa foi usada como definição canônica.
async function ensureSchema(db: Db): Promise<void> {
  // --- perfis_monitorados: colunas dinâmicas ---
  try {
    const cols = await db.all("PRAGMA table_info(perfis_monitorados)");
    const colNames = new Set(cols.map((c: any) => c.name));
    if (!colNames.has("meu_perfil")) {
      await db.exec(`ALTER TABLE perfis_monitorados ADD COLUMN meu_perfil INTEGER NOT NULL DEFAULT 0`);
    }
    if (!colNames.has("primeira_postagem")) {
      await db.exec(`ALTER TABLE perfis_monitorados ADD COLUMN primeira_postagem TEXT`);
    }
    if (!colNames.has("exibir")) {
      await db.exec(`ALTER TABLE perfis_monitorados ADD COLUMN exibir INTEGER NOT NULL DEFAULT 1`);
    }
    if (!colNames.has("favorito")) {
      await db.exec(`ALTER TABLE perfis_monitorados ADD COLUMN favorito INTEGER NOT NULL DEFAULT 0`);
    }
    if (!colNames.has("tipo_conta")) {
      await db.exec(`ALTER TABLE perfis_monitorados ADD COLUMN tipo_conta TEXT DEFAULT 'Geral'`);
    }
    if (!colNames.has("tipo_trafego")) {
      await db.exec(`ALTER TABLE perfis_monitorados ADD COLUMN tipo_trafego TEXT DEFAULT 'ORGANICO'`);
    }
  } catch (err) {
    console.error("[ensureSchema] Erro em perfis_monitorados:", err);
  }

  // --- perfis_historico: colunas de classificação dinâmica (o lado Python/meta_ingestion.py também garante isso) ---
  try {
    const histCols = await db.all("PRAGMA table_info(perfis_historico)");
    const histColNames = new Set(histCols.map((c: any) => c.name));
    if (!histColNames.has("tipo_janela")) {
      await db.exec(`ALTER TABLE perfis_historico ADD COLUMN tipo_janela TEXT DEFAULT 'ORGANICO'`);
    }
    if (!histColNames.has("revisado_manualmente")) {
      await db.exec(`ALTER TABLE perfis_historico ADD COLUMN revisado_manualmente INTEGER DEFAULT 0`);
    }
  } catch (err) {
    console.error("[ensureSchema] Erro em perfis_historico:", err);
  }

  // --- posts_historico: colunas de mídia (o lado Python/meta_ingestion.py também garante isso) ---
  try {
    const postCols = await db.all("PRAGMA table_info(posts_historico)");
    const postColNames = new Set(postCols.map((c: any) => c.name));
    if (!postColNames.has("media_url")) {
      await db.exec(`ALTER TABLE posts_historico ADD COLUMN media_url TEXT`);
    }
    if (!postColNames.has("thumbnail_url")) {
      await db.exec(`ALTER TABLE posts_historico ADD COLUMN thumbnail_url TEXT`);
    }
  } catch (err) {
    console.error("[ensureSchema] Erro em posts_historico:", err);
  }

  // --- Engajamento: comentários e mensagens do Instagram ---
  await db.exec(`
    CREATE TABLE IF NOT EXISTS instagram_comentarios (
      id TEXT PRIMARY KEY,
      media_id TEXT NOT NULL,
      modelo_username TEXT NOT NULL,
      autor_username TEXT,
      autor_id TEXT,
      texto TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      like_count INTEGER DEFAULT 0,
      curtido INTEGER DEFAULT 0,
      respondido INTEGER DEFAULT 0,
      resposta_texto TEXT,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  try {
    const cols = await db.all("PRAGMA table_info(instagram_comentarios)");
    const colNames = new Set(cols.map((c: any) => c.name));
    if (!colNames.has("like_count")) {
      await db.exec(`ALTER TABLE instagram_comentarios ADD COLUMN like_count INTEGER DEFAULT 0`);
    }
    if (!colNames.has("resposta_texto")) {
      await db.exec(`ALTER TABLE instagram_comentarios ADD COLUMN resposta_texto TEXT`);
    }
    if (!colNames.has("autor_id")) {
      await db.exec(`ALTER TABLE instagram_comentarios ADD COLUMN autor_id TEXT`);
    }
  } catch (err) {
    console.error("[ensureSchema] Erro em instagram_comentarios:", err);
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS instagram_mensagens (
      id TEXT PRIMARY KEY,
      conversation_id TEXT,
      modelo_username TEXT NOT NULL,
      remetente_username TEXT NOT NULL,
      remetente_id TEXT DEFAULT '',
      direcao TEXT DEFAULT 'recebida',
      texto TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      lida INTEGER DEFAULT 0,
      respondida INTEGER DEFAULT 0,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  try {
    const cols = await db.all("PRAGMA table_info(instagram_mensagens)");
    const colNames = new Set(cols.map((c: any) => c.name));
    if (!colNames.has("direcao")) {
      await db.exec(`ALTER TABLE instagram_mensagens ADD COLUMN direcao TEXT DEFAULT 'recebida'`);
    }
    if (!colNames.has("remetente_id")) {
      await db.exec(`ALTER TABLE instagram_mensagens ADD COLUMN remetente_id TEXT DEFAULT ''`);
    }
  } catch (err) {
    console.error("[ensureSchema] Erro em instagram_mensagens:", err);
  }

  // --- automacao_config (precisa existir antes do backfill de controle_perfis abaixo) ---
  await db.exec(`
    CREATE TABLE IF NOT EXISTS automacao_config (
      id TEXT PRIMARY KEY,
      meta_account_id TEXT,
      username TEXT,
      app_id TEXT,
      app_secret TEXT,
      access_token TEXT,
      public_base_url TEXT DEFAULT '',
      atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  try {
    await db.exec(`ALTER TABLE automacao_config ADD COLUMN public_base_url TEXT DEFAULT ''`);
  } catch (e) {
    // Coluna já existe
  }

  // --- automacao_agendamentos ---
  await db.exec(`
    CREATE TABLE IF NOT EXISTS automacao_agendamentos (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      meta_account_id TEXT NOT NULL,
      tipo_postagem TEXT NOT NULL,
      arquivos TEXT DEFAULT '[]',
      ordem_arquivos TEXT DEFAULT 'ORDEM_SELECAO',
      tipo_agendamento TEXT DEFAULT 'DATA_ESPECIFICA',
      data_especifica TEXT DEFAULT '',
      duracao_recorrencia TEXT DEFAULT 'SEMPRE',
      data_inicio TEXT DEFAULT '',
      data_fim TEXT DEFAULT '',
      dias_selecionados TEXT DEFAULT '[]',
      modo_hora TEXT DEFAULT 'FIXA',
      hora_fixa TEXT DEFAULT '18:00',
      hora_janela_inicio TEXT DEFAULT '18:00',
      hora_janela_fim TEXT DEFAULT '21:00',
      variacao_minutos INTEGER DEFAULT 15,
      recorrencia TEXT DEFAULT 'UNICA',
      legenda TEXT DEFAULT '',
      status TEXT DEFAULT 'AGENDADO',
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  try { await db.exec(`ALTER TABLE automacao_agendamentos ADD COLUMN tipo_agendamento TEXT DEFAULT 'DATA_ESPECIFICA'`); } catch (e) {}
  try { await db.exec(`ALTER TABLE automacao_agendamentos ADD COLUMN data_especifica TEXT DEFAULT ''`); } catch (e) {}
  try { await db.exec(`ALTER TABLE automacao_agendamentos ADD COLUMN duracao_recorrencia TEXT DEFAULT 'SEMPRE'`); } catch (e) {}
  try { await db.exec(`ALTER TABLE automacao_agendamentos ADD COLUMN data_inicio TEXT DEFAULT ''`); } catch (e) {}
  try { await db.exec(`ALTER TABLE automacao_agendamentos ADD COLUMN data_fim TEXT DEFAULT ''`); } catch (e) {}
  try { await db.exec(`ALTER TABLE automacao_agendamentos ADD COLUMN ultima_execucao DATETIME`); } catch (e) {}
  try { await db.exec(`ALTER TABLE automacao_agendamentos ADD COLUMN meta_media_id TEXT DEFAULT ''`); } catch (e) {}
  try { await db.exec(`ALTER TABLE automacao_agendamentos ADD COLUMN publicado_em DATETIME`); } catch (e) {}
  try { await db.exec(`ALTER TABLE automacao_agendamentos ADD COLUMN erro_detalhe TEXT DEFAULT ''`); } catch (e) {}

  // --- automacao_publicacoes (definição canônica também em publicador_instagram.py) ---
  await db.exec(`
    CREATE TABLE IF NOT EXISTS automacao_publicacoes (
      id TEXT PRIMARY KEY,
      agendamento_id TEXT,
      username TEXT NOT NULL,
      meta_account_id TEXT DEFAULT '',
      tipo_postagem TEXT NOT NULL,
      data_local TEXT NOT NULL,
      hora_local TEXT NOT NULL,
      publicado_em DATETIME NOT NULL,
      status TEXT NOT NULL DEFAULT 'PUBLICADO',
      meta_media_id TEXT DEFAULT '',
      erro_detalhe TEXT DEFAULT '',
      arquivos TEXT DEFAULT '[]',
      legenda TEXT DEFAULT '',
      origem TEXT DEFAULT 'AGENDADOR'
    );
  `);
  try {
    const cols = await db.all("PRAGMA table_info(automacao_publicacoes)");
    const colNames = new Set(cols.map((c: any) => c.name));
    if (!colNames.has("is_deleted")) {
      await db.exec(`ALTER TABLE automacao_publicacoes ADD COLUMN is_deleted INTEGER DEFAULT 0`);
    }
  } catch (err) {
    console.error("[ensureSchema] Erro em automacao_publicacoes:", err);
  }

  // --- controle_perfis: foto_url + meta_account_id (com backfill único a partir de automacao_config) ---
  try {
    const columns = await db.all("PRAGMA table_info(controle_perfis)");
    const colNames = new Set(columns.map((c: any) => c.name));
    if (!colNames.has("foto_url")) {
      await db.exec(`ALTER TABLE controle_perfis ADD COLUMN foto_url TEXT`);
    }
    if (!colNames.has("meta_account_id")) {
      await db.exec(`ALTER TABLE controle_perfis ADD COLUMN meta_account_id TEXT`);

      await db.exec(`
        INSERT INTO controle_perfis (username, meta_account_id)
        SELECT ac.username, ac.meta_account_id
        FROM automacao_config ac
        WHERE ac.meta_account_id IS NOT NULL AND ac.meta_account_id != ''
        ON CONFLICT(username) DO UPDATE SET meta_account_id = excluded.meta_account_id
      `);

      await db.exec(`
        UPDATE controle_perfis
        SET meta_account_id = (
          SELECT ac.meta_account_id FROM automacao_config ac
          WHERE LOWER(ac.username) = LOWER(controle_perfis.username)
            AND ac.meta_account_id IS NOT NULL AND ac.meta_account_id != ''
        )
        WHERE (meta_account_id IS NULL OR meta_account_id = '')
          AND EXISTS (
            SELECT 1 FROM automacao_config ac
            WHERE LOWER(ac.username) = LOWER(controle_perfis.username)
              AND ac.meta_account_id IS NOT NULL AND ac.meta_account_id != ''
          )
      `);
    }
  } catch (err) {
    console.error("[ensureSchema] Erro em controle_perfis:", err);
  }

  // --- controle_perfis_obs (+ backfill único a partir de controle_perfis.obs) ---
  await db.exec(`
    CREATE TABLE IF NOT EXISTS controle_perfis_obs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      texto TEXT NOT NULL,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  try {
    const countObs = await db.get("SELECT COUNT(*) as count FROM controle_perfis_obs");
    if (countObs && countObs.count === 0) {
      await db.exec(`
        INSERT INTO controle_perfis_obs (username, texto, criado_em)
        SELECT username, obs, datetime('now')
        FROM controle_perfis
        WHERE obs IS NOT NULL AND obs != ''
      `);
    }
  } catch (err) {
    console.error("[ensureSchema] Erro no backfill de controle_perfis_obs:", err);
  }
}

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

  // Migrações de schema: rodam uma única vez aqui (não a cada request, como
  // antes) porque abrirConexao() só é chamada uma vez por processo — ver dbPromise abaixo.
  await ensureSchema(db);

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
