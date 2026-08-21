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
  const db = await open({
    filename: resolveDbPath(),
    driver: sqlite3.Database
  });
  
  // Migração: adiciona coluna meu_perfil se não existir
  const columnsMeuPerfil = await db.all("PRAGMA table_info(perfis_monitorados)");
  const hasMeuPerfil = columnsMeuPerfil.some((c: { name: string }) => c.name === "meu_perfil");
  if (!hasMeuPerfil) {
    await db.exec(`ALTER TABLE perfis_monitorados ADD COLUMN meu_perfil INTEGER NOT NULL DEFAULT 0`);
  }

  // Migração: adiciona coluna primeira_postagem se não existir
  const colsCheck = await db.all("PRAGMA table_info(perfis_monitorados)");
  const hasPrimeiraPostagem = colsCheck.some((c: { name: string }) => c.name === "primeira_postagem");
  if (!hasPrimeiraPostagem) {
    await db.exec(`ALTER TABLE perfis_monitorados ADD COLUMN primeira_postagem TEXT`);
  }

  // Migração: adiciona coluna tipo_conta se não existir
  const hasTipoConta = colsCheck.some((c: { name: string }) => c.name === "tipo_conta");
  if (!hasTipoConta) {
    await db.exec(`ALTER TABLE perfis_monitorados ADD COLUMN tipo_conta TEXT DEFAULT 'HUMANO'`);
  }

  // Migração: adiciona coluna tipo_trafego se não existir
  const hasTipoTrafego = colsCheck.some((c: { name: string }) => c.name === "tipo_trafego");
  if (!hasTipoTrafego) {
    await db.exec(`ALTER TABLE perfis_monitorados ADD COLUMN tipo_trafego TEXT DEFAULT 'NA'`);
  }

  // Migração: adiciona coluna inativo em perfis_historico se não existir
  const colsHist = await db.all("PRAGMA table_info(perfis_historico)");
  const hasInativo = colsHist.some((c: { name: string }) => c.name === "inativo");
  if (!hasInativo) {
    await db.exec(`ALTER TABLE perfis_historico ADD COLUMN inativo INTEGER DEFAULT 0`);
  }

  // Migração: adiciona colunas de classificação dinâmica por janela
  const hasTipoJanela = colsHist.some((c: { name: string }) => c.name === "tipo_janela");
  if (!hasTipoJanela) {
    await db.exec(`ALTER TABLE perfis_historico ADD COLUMN tipo_janela TEXT DEFAULT 'ORGANICO'`);
  }
  const hasRevisado = colsHist.some((c: { name: string }) => c.name === "revisado_manualmente");
  if (!hasRevisado) {
    await db.exec(`ALTER TABLE perfis_historico ADD COLUMN revisado_manualmente INTEGER DEFAULT 0`);
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS perfis_monitorados (
      username TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'ATIVO',
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migração para bancos onde perfis_monitorados já existia sem a coluna status.
  const columns = await db.all("PRAGMA table_info(perfis_monitorados)");
  const hasStatus = columns.some((column: { name: string }) => column.name === "status");

  if (!hasStatus) {
    await db.exec(`
      ALTER TABLE perfis_monitorados
      ADD COLUMN status TEXT NOT NULL DEFAULT 'ATIVO'
    `);
  }

  // Garante que registros antigos sem status se tornem ATIVO.
  await db.run(`
    UPDATE perfis_monitorados
    SET status = 'ATIVO'
    WHERE status IS NULL OR status = ''
  `);

  // Migração: adiciona coluna exibir (visibilidade na UI) se não existir
  const colsMonit = await db.all("PRAGMA table_info(perfis_monitorados)");
  const hasExibir = colsMonit.some((c: { name: string }) => c.name === "exibir");
  if (!hasExibir) {
    await db.exec(`ALTER TABLE perfis_monitorados ADD COLUMN exibir INTEGER NOT NULL DEFAULT 1`);
  }
  // Garante que todos os registros existentes tenham exibir = 1
  await db.run(`UPDATE perfis_monitorados SET exibir = 1 WHERE exibir IS NULL`);

  // Migração: adiciona coluna is_verified (perfil verificado) se não existir
  const hasIsVerified = colsMonit.some((c: { name: string }) => c.name === "is_verified");
  if (!hasIsVerified) {
    await db.exec(`ALTER TABLE perfis_monitorados ADD COLUMN is_verified INTEGER NOT NULL DEFAULT 0`);
  }

  return db;
}

export async function GET() {
  try {
    const db = await getDb();

    // Busca os perfis monitorados e une com os dados mais recentes de histórico
    const profiles = await db.all(`
      WITH historico_ordenado AS (
        SELECT
          username,
          data_coleta,
          seguidores,
          total_posts,
          inativo,
          ROW_NUMBER() OVER (
            PARTITION BY username
            ORDER BY datetime(data_coleta) DESC, id DESC
          ) AS ordem
        FROM perfis_historico
      )
      SELECT
        m.username,
        m.status,
        m.meu_perfil,
        COALESCE(m.is_verified, 0) AS is_verified,
        m.exibir,
        m.criado_em AS inicio_monitoramento,
        m.primeira_postagem,
        m.tipo_conta,
        COALESCE(m.tipo_trafego, 'NA') AS tipo_trafego,
        cp.foto_url,
        cp.status AS status_controle,
        h.data_coleta,
        h.seguidores,
        h.total_posts,
        h.inativo AS ultimo_inativo
      FROM perfis_monitorados m
      LEFT JOIN controle_perfis cp ON cp.username = m.username
      LEFT JOIN historico_ordenado h
        ON h.username = m.username
        AND h.ordem = 1
      ORDER BY m.exibir DESC, m.username COLLATE NOCASE
    `);

    const perfisFavoritos = await db.all(`
      SELECT username 
      FROM perfis_monitorados 
      WHERE favorito = 1 
      ORDER BY username COLLATE NOCASE
    `);

    const posts = await db.all('SELECT * FROM posts_historico ORDER BY data_postagem DESC LIMIT 100');
    const history = await db.all('SELECT * FROM perfis_historico ORDER BY data_coleta ASC');

    // Agrupa por dia e mantém apenas o valor máximo de seguidores de cada dia
    const histPorDia: any = {};
    history.forEach(row => {
      const username = row.username;
      const dia = row.data_coleta ? row.data_coleta.substring(0, 10) : null; // "2026-07-11"
      if (!dia) return;

      if (!histPorDia[username]) histPorDia[username] = {};
      const atual = histPorDia[username][dia]?.total_seguidores || 0;
      if ((row.seguidores || 0) >= atual) {
        histPorDia[username][dia] = {
          data: dia,
          total_seguidores: row.seguidores
        };
      }
    });

    // Agrupamento por dia pegando o MAIOR valor de seguidores de cada data
    const histAgrupadoInterno: { [username: string]: { [data: string]: number } } = {};

    history.forEach(row => {
      const username = row.username;
      // Extrai apenas a data (AAAA-MM-DD) da string "2026-07-11 16:02:48"
      const dataSoDia = row.data_coleta ? row.data_coleta.split(' ')[0] : null;

      if (dataSoDia && row.seguidores !== null) {
        if (!histAgrupadoInterno[username]) {
          histAgrupadoInterno[username] = {};
        }

        // Se já existe um valor para esse dia, mantém apenas o maior
        const valorExistente = histAgrupadoInterno[username][dataSoDia] || 0;
        if (row.seguidores > valorExistente) {
          histAgrupadoInterno[username][dataSoDia] = row.seguidores;
        }
      }
    });

    // Converte o objeto de volta para o formato de array que o gráfico espera
    const followersHistory: any = {};
    Object.keys(histAgrupadoInterno).forEach(username => {
      followersHistory[username] = Object.entries(histAgrupadoInterno[username])
        .map(([data, total_seguidores]) => ({
          data,
          total_seguidores
        }))
        // Garante que o gráfico siga a ordem cronológica
        .sort((a, b) => a.data.localeCompare(b.data));
    });

    // Calcula novosSeguidores (evolução entre o penúltimo e o último registro)

    const profilesComDelta = profiles.map((perfil: any) => {
      const hist = (followersHistory[perfil.username] || [])
        .slice()
        .sort((a: any, b: any) => new Date(a.data).getTime() - new Date(b.data).getTime());

      // Usa o valor mais recente do followersHistory como seguidores (fonte mais confiável)
      const seguidoresAtual = hist.length > 0
        ? Number(hist[hist.length - 1].total_seguidores)
        : (perfil.seguidores || 0);

      // Evolução = último registro - penúltimo registro (diferença entre as duas últimas coletas)
      const novosSeguidores24h = hist.length > 1
        ? seguidoresAtual - Number(hist[hist.length - 2].total_seguidores)
        : 0;

      // Calcula quantos dias de monitoramento (desde criado_em ou inicio_monitoramento)
      const dataInicio = perfil.inicio_monitoramento
        ? new Date(perfil.inicio_monitoramento)
        : new Date();
      const diaMonitoramento = Math.max(0, Math.floor((Date.now() - dataInicio.getTime()) / (1000 * 60 * 60 * 24)));

      return { ...perfil, seguidores: seguidoresAtual, novosSeguidores24h, diaMonitoramento };
    });

    await db.close();
    return NextResponse.json({ success: true, profiles: profilesComDelta, posts, followersHistory });
  } catch (error: any) {
    console.error("Erro no GET /api/data:", error);

    return NextResponse.json(
      {
        error: "Falha ao ler dados do SQLite",
        details: error?.message ?? String(error),
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { username } = await req.json();
    const db = await getDb();
    // Adiciona como ATIVO por padrão, ressuscitando se já existir como INATIVO
    await db.run(
      `INSERT INTO perfis_monitorados (username, status, exibir) VALUES (?, 'ATIVO', 1)
       ON CONFLICT(username) DO UPDATE SET status = 'ATIVO', exibir = 1`,
      [username.toLowerCase()]
    );
    await db.close();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { username, status, newUsername, meuPerfil, primeiraPostagem, tipoConta, tipoTrafego, tipo_trafego, seguidores, inativo, is_verified, isVerified } = await req.json();
    const db = await getDb();
    const tipoTrafegoVal = tipoTrafego !== undefined ? tipoTrafego : tipo_trafego;
    
    if (newUsername) {
      await db.run('UPDATE perfis_monitorados SET username = ? WHERE username = ?', [newUsername, username]);
      await db.run('UPDATE perfis_historico SET username = ? WHERE username = ?', [newUsername, username]);
      await db.run('UPDATE controle_perfis SET username = ? WHERE username = ?', [newUsername, username]);
      await db.run('UPDATE controle_perfis_obs SET username = ? WHERE username = ?', [newUsername, username]);
      await db.run('UPDATE lancamentos SET username = ? WHERE username = ?', [newUsername, username]);
      await db.run('UPDATE posts_historico SET username = ? WHERE username = ?', [newUsername, username]);
    } else if (seguidores !== undefined && seguidores !== null) {
      const now = new Date();
      // Formata como YYYY-MM-DD HH:MM:SS local
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      const dataColeta = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

      const inativoVal = inativo !== undefined && inativo !== null ? (inativo ? 1 : 0) : 0;

      await db.run(
        `INSERT INTO perfis_historico (username, data_coleta, seguidores, seguindo, total_posts, inativo) VALUES (?, ?, ?, 0, 0, ?)`,
        [username, dataColeta, Number(seguidores), inativoVal]
      );
    } else if (status) {
      await db.run('UPDATE perfis_monitorados SET status = ? WHERE username = ?', [status, username]);
      if (status === 'MORREU' || status === '☠️ Morreu') {
        await db.run(`
          INSERT INTO controle_perfis (username, status) VALUES (?, '☠️ Morreu')
          ON CONFLICT(username) DO UPDATE SET status = '☠️ Morreu'
        `, [username]);
      } else {
        const rowCtrl = await db.get(`SELECT status FROM controle_perfis WHERE username = ?`, [username]);
        if (rowCtrl && rowCtrl.status && rowCtrl.status.includes('Morreu')) {
          await db.run(`UPDATE controle_perfis SET status = '⏳ Aguardando' WHERE username = ?`, [username]);
        }
      }
      if (status === 'INDISPONIVEL') {
        try {
          const dateStr = new Date().toLocaleDateString('pt-BR');
          await db.run(
            `INSERT INTO controle_perfis_obs (username, texto) VALUES (?, ?)`,
            [username, `[SISTEMA] Perfil marcado como INDISPONÍVEL / SUSPENSO em ${dateStr}`]
          );
        } catch (e) {
          // ignora se a tabela não existir
        }
      }
    } else if (typeof meuPerfil === 'number') {
      await db.run('UPDATE perfis_monitorados SET meu_perfil = ? WHERE username = ?', [meuPerfil, username]);
      await db.run('INSERT OR IGNORE INTO controle_perfis (username) VALUES (?)', [username]);
    } else if (is_verified !== undefined || isVerified !== undefined) {
      const val = (is_verified !== undefined ? is_verified : isVerified) ? 1 : 0;
      await db.run('UPDATE perfis_monitorados SET is_verified = ? WHERE username = ?', [val, username]);
    } else if (primeiraPostagem !== undefined) {
      // primeiraPostagem pode ser string (data) ou null (limpar)
      await db.run('UPDATE perfis_monitorados SET primeira_postagem = ? WHERE username = ?', [primeiraPostagem, username]);
    } else if (tipoConta !== undefined) {
      await db.run('UPDATE perfis_monitorados SET tipo_conta = ? WHERE username = ?', [tipoConta, username]);
    } else if (tipoTrafegoVal !== undefined) {
      await db.run('UPDATE perfis_monitorados SET tipo_trafego = ? WHERE username = ?', [tipoTrafegoVal, username]);
    }
    
    await db.close();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');
    const db = await getDb();
    // Oculta o perfil da UI (exibir=0) e marca como INATIVO. Histórico permanece intacto.
    await db.run("UPDATE perfis_monitorados SET status = 'INATIVO', exibir = 0 WHERE username = ?", [username]);
    await db.close();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}