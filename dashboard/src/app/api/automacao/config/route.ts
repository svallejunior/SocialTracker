import { NextRequest, NextResponse } from 'next/server';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function resolveDbPath() {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  const parentDb = path.resolve(process.cwd(), '..', 'instagram_tracker.db');
  if (fs.existsSync(parentDb)) return parentDb;
  const cwdDb = path.resolve(process.cwd(), 'instagram_tracker.db');
  if (fs.existsSync(cwdDb)) return cwdDb;
  return parentDb;
}

async function getDb() {
  const db = await open({ filename: resolveDbPath(), driver: sqlite3.Database });

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
  } catch (e) {}

  try {
    await db.exec(`ALTER TABLE automacao_agendamentos ADD COLUMN meta_media_id TEXT DEFAULT ''`);
    await db.exec(`ALTER TABLE automacao_agendamentos ADD COLUMN publicado_em DATETIME`);
    await db.exec(`ALTER TABLE automacao_agendamentos ADD COLUMN erro_detalhe TEXT DEFAULT ''`);
  } catch (e) {}

  return db;
}

// GET: Retorna a configuração da Meta API e dispara o daemon se estiver inativo
export async function GET(req: NextRequest) {
  try {
    const db = await getDb();
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');

    let config;
    if (username) {
      config = await db.get(
        `SELECT * FROM automacao_config WHERE LOWER(username) = LOWER(?) ORDER BY atualizado_em DESC LIMIT 1`,
        [username]
      );
    }

    if (!config) {
      config = await db.get(`SELECT * FROM automacao_config ORDER BY atualizado_em DESC LIMIT 1`);
    }

    let daemonStatus = null;
    try {
      daemonStatus = await db.get(`SELECT * FROM automacao_daemon_status WHERE id = 1`);
    } catch (e) {}

    // Auto-start do daemon Python se a última verificação tiver mais de 25 segundos
    try {
      let lastCheckMs = 0;
      if (daemonStatus?.ultima_verificacao) {
        const parts = daemonStatus.ultima_verificacao.split(' ');
        if (parts.length === 2) {
          const [d, t] = parts;
          const [year, month, day] = d.split('-');
          const [hour, min, sec] = t.split(':');
          const dt = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(min), Number(sec));
          lastCheckMs = dt.getTime();
        }
      }

      const diffSec = Math.floor((Date.now() - lastCheckMs) / 1000);
      if (diffSec > 25) {
        const { spawn } = await import('child_process');
        const parentDir = path.resolve(process.cwd(), '..');
        let scriptPath = path.join(parentDir, 'publicador_instagram.py');
        if (!fs.existsSync(scriptPath)) {
          scriptPath = path.resolve(process.cwd(), 'publicador_instagram.py');
        }

        if (fs.existsSync(scriptPath)) {
          const pyExe = process.platform === 'win32' ? 'python' : 'python3';
          const child = spawn(pyExe, [scriptPath], {
            cwd: path.dirname(scriptPath),
            detached: true,
            stdio: 'ignore'
          });
          child.unref();
        }
      }
    } catch (spawnErr) {
      console.warn('Erro ao auto-disparar publicador Python:', spawnErr);
    }

    return NextResponse.json({
      success: true,
      config: {
        app_id: config?.app_id || process.env.META_APP_ID || '',
        app_secret: config?.app_secret || process.env.META_APP_SECRET || '',
        access_token: config?.access_token || process.env.META_ACCESS_TOKEN || '',
        meta_account_id: config?.meta_account_id || process.env.META_ACCOUNT_ID || '',
        public_base_url: config?.public_base_url || process.env.PUBLIC_BASE_URL || ''
      },
      daemon_status: daemonStatus
    });
  } catch (error: any) {
    console.error('Erro ao buscar configuração Meta API:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST: Salva ou atualiza a configuração da Meta API
export async function POST(req: NextRequest) {
  try {
    const db = await getDb();
    const body = await req.json();

    const appId = (body.appId || body.app_id || '1052113504109684').trim();
    const appSecret = (body.appSecret || body.app_secret || '14c2d6a38c7955a854aab0d1e486fdc5').trim();
    let accessToken = (body.accessToken || body.access_token || '').trim();
    const metaAccountId = (body.metaAccountId || body.meta_account_id || '').trim();
    const username = (body.username || '').toLowerCase().trim();
    const publicBaseUrl = (body.publicBaseUrl || body.public_base_url || '').trim();

    // Se veio apenas o meta_account_id sem token real, só garante que a pasta existe
    // (evita sobrescrever uma config existente com token vazio/inválido)
    const hasRealToken = accessToken && accessToken.length > 30 && accessToken !== 'fake_token';
    if (!hasRealToken && metaAccountId) {
      try {
        const automacaoDir = path.resolve(process.cwd(), '..', 'automacao', String(metaAccountId));
        if (!fs.existsSync(automacaoDir)) {
          fs.mkdirSync(automacaoDir, { recursive: true });
          console.log(`[Config] Pasta criada (sem token): ${automacaoDir}`);
        }
      } catch (dirErr) {
        console.warn('[Config] Não foi possível criar pasta de automação:', dirErr);
      }
      await db.close();
      return NextResponse.json({
        success: true,
        is_extended: false,
        message: 'Pasta de mídia criada. Configure o Access Token para habilitar publicações.'
      });
    }

    // ── Tenta converter Token de 1h para Long-Lived Token de 60 Dias ──────────
    let isExtended = false;
    if (appId && appSecret && accessToken && accessToken.length > 20) {
      try {
        const exchangeUrl = `https://graph.facebook.com/v20.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${accessToken}`;
        const exRes = await fetch(exchangeUrl);
        const exJson = await exRes.json();
        if (exJson.access_token) {
          accessToken = exJson.access_token;
          isExtended = true;
          console.log('✅ Token convertido automaticamente para Long-Lived Token (60 Dias)!');
        }
      } catch (exErr) {
        console.warn('Tentativa de estender token ignorada:', exErr);
      }
    }

    const id = metaAccountId || username || 'default_config';

    // Atualiza a tabela automacao_config (tanto a chave específica quanto atualiza o token global em todas as linhas)
    await db.run(
      `
      INSERT INTO automacao_config (id, meta_account_id, username, app_id, app_secret, access_token, public_base_url, atualizado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        meta_account_id = excluded.meta_account_id,
        username = excluded.username,
        app_id = excluded.app_id,
        app_secret = excluded.app_secret,
        access_token = excluded.access_token,
        public_base_url = excluded.public_base_url,
        atualizado_em = datetime('now')
      `,
      [id, metaAccountId, username, appId, appSecret, accessToken, publicBaseUrl]
    );

    // Se for salvamento global, propaga o novo token e URL para todas as linhas cadastradas
    if (id === 'default_config' || !username) {
      await db.run(
        `UPDATE automacao_config SET access_token = ?, public_base_url = ?, app_id = ?, app_secret = ?, atualizado_em = datetime('now')`,
        [accessToken, publicBaseUrl, appId, appSecret]
      );
    }

    // Também atualiza no .env na raiz do projeto se for a config padrão/geral
    try {
      const rootEnvPath = path.resolve(process.cwd(), '..', '.env');
      if (fs.existsSync(rootEnvPath) && accessToken) {
        let envContent = fs.readFileSync(rootEnvPath, 'utf8');
        if (envContent.includes('META_ACCESS_TOKEN=')) {
          envContent = envContent.replace(/META_ACCESS_TOKEN=.*/g, `META_ACCESS_TOKEN=${accessToken}`);
        } else {
          envContent += `\nMETA_ACCESS_TOKEN=${accessToken}\n`;
        }
        if (publicBaseUrl) {
          if (envContent.includes('PUBLIC_BASE_URL=')) {
            envContent = envContent.replace(/PUBLIC_BASE_URL=.*/g, `PUBLIC_BASE_URL=${publicBaseUrl}`);
          } else {
            envContent += `PUBLIC_BASE_URL=${publicBaseUrl}\n`;
          }
        }
        fs.writeFileSync(rootEnvPath, envContent, 'utf8');
      }
    } catch (envWriteErr) {
      console.warn('Erro ao atualizar .env:', envWriteErr);
    }

    // Garante que a pasta local de mídia para esta conta Meta existe
    // (o publicador usa automacao/<meta_account_id> como diretório de trabalho)
    if (metaAccountId) {
      try {
        const automacaoDir = path.resolve(process.cwd(), '..', 'automacao', String(metaAccountId));
        if (!fs.existsSync(automacaoDir)) {
          fs.mkdirSync(automacaoDir, { recursive: true });
          console.log(`[Config] Pasta criada automaticamente: ${automacaoDir}`);
        }
      } catch (dirErr) {
        console.warn('[Config] Não foi possível criar pasta de automação:', dirErr);
      }
    }

    return NextResponse.json({
      success: true,
      access_token: accessToken,
      is_extended: isExtended,
      message: isExtended
        ? 'Configurações salvas! Token convertido com sucesso para Long-Lived Token (válido por 60 dias)!'
        : 'Configurações salvas com sucesso!'
    });
  } catch (error: any) {
    console.error('Erro ao salvar configuração Meta API:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
