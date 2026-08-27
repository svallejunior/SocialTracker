import { NextRequest, NextResponse } from 'next/server';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function resolveDbPath() {
  if (process.env.DB_PATH && fs.existsSync(process.env.DB_PATH)) return process.env.DB_PATH;
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
  
  // Migrações
  try {
    const colsCheck = await db.all("PRAGMA table_info(perfis_monitorados)");
    const cols = new Set(colsCheck.map((c: any) => c.name));

    if (!cols.has("meu_perfil")) {
      await db.exec(`ALTER TABLE perfis_monitorados ADD COLUMN meu_perfil INTEGER NOT NULL DEFAULT 0`);
    }
    if (!cols.has("primeira_postagem")) {
      await db.exec(`ALTER TABLE perfis_monitorados ADD COLUMN primeira_postagem TEXT`);
    }
    if (!cols.has("exibir")) {
      await db.exec(`ALTER TABLE perfis_monitorados ADD COLUMN exibir INTEGER NOT NULL DEFAULT 1`);
    }
    if (!cols.has("favorito")) {
      await db.exec(`ALTER TABLE perfis_monitorados ADD COLUMN favorito INTEGER NOT NULL DEFAULT 0`);
    }
    if (!cols.has("tipo_conta")) {
      await db.exec(`ALTER TABLE perfis_monitorados ADD COLUMN tipo_conta TEXT DEFAULT 'Geral'`);
    }
    if (!cols.has("tipo_trafego")) {
      await db.exec(`ALTER TABLE perfis_monitorados ADD COLUMN tipo_trafego TEXT DEFAULT 'ORGANICO'`);
    }
  } catch (err) {
    console.error("Migration error in perfis_monitorados:", err);
  }

  return db;
}

export async function GET() {
  try {
    const db = await getDb();
    
    const profiles = await db.all(`
      SELECT 
        p.*,
        cp.status as status_controle,
        cp.foto_url,
        cp.nome as nome_controle
      FROM perfis_monitorados p
      LEFT JOIN controle_perfis cp ON LOWER(p.username) = LOWER(cp.username)
      ORDER BY p.username ASC
    `);
    
    const history = await db.all(
      "SELECT * FROM perfis_historico ORDER BY data_coleta ASC, id ASC"
    );

    const posts = await db.all(
      "SELECT * FROM posts_historico ORDER BY data_postagem DESC"
    );

    // Mapeia status de cada perfil para saber se morreu/inativo
    const statusPerfilMap: Record<string, boolean> = {};
    for (const p of profiles) {
      const u = (p.username || '').toLowerCase();
      const isM = p.status === 'MORREU' || p.status === 'INATIVO' || p.status_controle === '☠️ Morreu' || (p.status_controle || '').includes('Morreu') || (p.status || '').toUpperCase() === 'MORREU';
      statusPerfilMap[u] = isM;
    }

    // Agrupa histórico por username ordenado cronologicamente com forward-fill para quedas transitórias
    const historyByUser: Record<string, any[]> = {};
    for (const h of history) {
      const u = (h.username || '').toLowerCase();
      if (!historyByUser[u]) historyByUser[u] = [];
      historyByUser[u].push(h);
    }

    const followersHistory: Record<string, any[]> = {};
    const coletasMap: Record<string, { inicio_monitoramento: string; data_coleta: string; ultimosSeguidores: number; ultimosPosts: number; ultimosSeguindo: number }> = {};

    for (const [u, list] of Object.entries(historyByUser)) {
      // Deduplica: para cada dia, mantém o registro mais recente pelo timestamp/id
      const porDia: Record<string, any> = {};
      for (const h of list) {
        const dia = (h.data_coleta || '').substring(0, 10); // 'YYYY-MM-DD'
        if (!dia) continue;
        const cur = porDia[dia];
        if (!cur) {
          porDia[dia] = h;
        } else {
          const curTs = cur.data_carga || cur.data_coleta || '';
          const newTs = h.data_carga || h.data_coleta || '';
          if (newTs > curTs || (newTs === curTs && (h.id || 0) >= (cur.id || 0))) {
            porDia[dia] = h;
          }
        }
      }
      const listaDiaria = Object.values(porDia).sort((a, b) => {
        const dComp = (a.data_coleta || '').localeCompare(b.data_coleta || '');
        return dComp !== 0 ? dComp : (a.id || 0) - (b.id || 0);
      });

      const isDead = statusPerfilMap[u] || false;
      let lastValidSeguidores = 0;
      let lastValidPosts = 0;
      let lastValidSeguindo = 0;
      followersHistory[u] = [];

      for (const h of listaDiaria) {
        let seg = Number(h.seguidores) || 0;
        if (seg > 0) {
          lastValidSeguidores = seg;
          lastValidPosts = h.total_posts || lastValidPosts;
          lastValidSeguindo = h.seguindo || lastValidSeguindo;
        } else if (!isDead && lastValidSeguidores > 0) {
          // Se a conta está viva e houve queda temporária para 0: assume o último valor válido
          seg = lastValidSeguidores;
        }

        followersHistory[u].push({
          ...h,
          data: h.data_coleta || '',
          total_seguidores: seg
        });

        if (!coletasMap[u]) {
          coletasMap[u] = {
            inicio_monitoramento: h.data_coleta,
            data_coleta: h.data_coleta,
            ultimosSeguidores: lastValidSeguidores,
            ultimosPosts: lastValidPosts,
            ultimosSeguindo: lastValidSeguindo
          };
        } else {
          if (h.data_coleta < coletasMap[u].inicio_monitoramento) {
            coletasMap[u].inicio_monitoramento = h.data_coleta;
          }
          if (h.data_coleta > coletasMap[u].data_coleta) {
            coletasMap[u].data_coleta = h.data_coleta;
          }
          coletasMap[u].ultimosSeguidores = lastValidSeguidores;
          coletasMap[u].ultimosPosts = lastValidPosts;
          coletasMap[u].ultimosSeguindo = lastValidSeguindo;
        }
      }
    }


    // Enriquece cada perfil com as colunas de primeira coleta, última coleta e seguidores mais recentes válidos
    const profilesEnriquecidos = profiles.map((p: any) => {
      const u = (p.username || '').toLowerCase();
      const c = coletasMap[u];
      const fotoEfetiva = (p.foto_perfil_meta && String(p.foto_perfil_meta).trim().length > 0)
        ? p.foto_perfil_meta
        : (p.foto_url || '');

      return {
        ...p,
        foto_url: fotoEfetiva,
        foto_perfil: fotoEfetiva,
        foto_perfil_meta: p.foto_perfil_meta || null,
        foto_local: p.foto_url || null,
        inicio_monitoramento: c ? c.inicio_monitoramento : null,
        data_coleta: c ? c.data_coleta : null,
        seguidores: c ? c.ultimosSeguidores : 0,
        total_posts: c ? c.ultimosPosts : 0,
        seguindo: c ? c.ultimosSeguindo : 0
      };
    });

    return NextResponse.json({
      success: true,
      profiles: profilesEnriquecidos,
      history: history || [],
      followersHistory: followersHistory,
      posts: posts || []
    });
  } catch (error: any) {
    console.error("Erro no /api/data GET:", error);
    return NextResponse.json({
      success: false,
      error: error.message,
      profiles: [],
      history: [],
      followersHistory: {},
      posts: []
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username } = body;

    if (!username) {
      return NextResponse.json({ success: false, error: "Username é obrigatório" }, { status: 400 });
    }

    const cleanUsername = username.trim().toLowerCase().replace('@', '');
    const db = await getDb();

    const existing = await db.get("SELECT * FROM perfis_monitorados WHERE LOWER(username) = ?", [cleanUsername]);

    if (existing) {
      await db.run("UPDATE perfis_monitorados SET status = 'ATIVO', exibir = 1 WHERE LOWER(username) = ?", [cleanUsername]);
    } else {
      await db.run(
        "INSERT INTO perfis_monitorados (username, status, exibir, meu_perfil) VALUES (?, 'ATIVO', 1, 0)",
        [cleanUsername]
      );
    }

    return NextResponse.json({ success: true, message: `Perfil @${cleanUsername} adicionado com sucesso.` });
  } catch (error: any) {
    console.error("Erro no /api/data POST:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const db = await getDb();

    const {
      username,
      newUsername,
      favorito,
      meu_perfil,
      meuPerfil,
      primeira_postagem,
      primeiraPostagem,
      tipo_conta,
      tipoConta,
      tipo_trafego,
      tipoTrafego,
      exibir,
      status,
      seguidores,
      inativo,
      is_verified,
      isVerified
    } = body;

    if (!username) {
      return NextResponse.json({ success: false, error: "Username é obrigatório" }, { status: 400 });
    }

    const cleanUsername = username.trim().toLowerCase().replace('@', '');

    // Renomear username
    if (newUsername) {
      const cleanNewUsername = newUsername.trim().toLowerCase().replace('@', '');
      await db.run("UPDATE perfis_monitorados SET username = ? WHERE LOWER(username) = ?", [cleanNewUsername, cleanUsername]);
      await db.run("UPDATE perfis_historico SET username = ? WHERE LOWER(username) = ?", [cleanNewUsername, cleanUsername]);
      await db.run("UPDATE posts_historico SET username = ? WHERE LOWER(username) = ?", [cleanNewUsername, cleanUsername]);
      await db.run("UPDATE controle_perfis SET username = ? WHERE LOWER(username) = ?", [cleanNewUsername, cleanUsername]);
      await db.run("UPDATE lancamentos SET username = ? WHERE LOWER(username) = ?", [cleanNewUsername, cleanUsername]);
      return NextResponse.json({ success: true, message: `Username alterado para @${cleanNewUsername}` });
    }

    // Gravação manual de seguidores no histórico
    if (seguidores !== undefined && seguidores !== null) {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      const dataColeta = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

      const inativoVal = inativo !== undefined && inativo !== null ? (inativo ? 1 : 0) : 0;

      // Busca últimos valores de seguindo, total_posts e seguidores para calcular variação
      const lastRow = await db.get(
        `SELECT seguindo, total_posts, seguidores FROM perfis_historico WHERE LOWER(username) = ? AND inativo = 0 ORDER BY data_coleta DESC LIMIT 1`,
        [cleanUsername]
      );
      const seguindoVal = lastRow ? (lastRow.seguindo || 0) : 0;
      const postsVal = lastRow ? (lastRow.total_posts || 0) : 0;

      // Verifica se a variação está dentro dos parâmetros de validação automática
      // Regra: variação > 2% E > 10 seguidores → requer análise manual (ADS ou viral)
      const segAnterior = lastRow ? (lastRow.seguidores || 0) : 0;
      const deltaS = Number(seguidores) - segAnterior;
      const pctDeltaS = segAnterior > 0 ? (deltaS / segAnterior) * 100 : 0;
      const precisaAnalise = segAnterior > 0 && pctDeltaS > 2.0 && deltaS > 10;

      // Se fora dos parâmetros: pendente de revisão (ADS ou viral ainda desconhecido)
      // Se dentro dos parâmetros (ou primeira coleta): auto-validado como ORGÂNICO
      const tipoJanelaInicial = precisaAnalise ? 'ADS' : 'ORGANICO';
      const revisadoInicial = precisaAnalise ? 0 : 1;

      await db.run(
        `INSERT INTO perfis_historico (username, data_coleta, seguidores, seguindo, total_posts, inativo, tipo_janela, revisado_manualmente) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [cleanUsername, dataColeta, Number(seguidores), seguindoVal, postsVal, inativoVal, tipoJanelaInicial, revisadoInicial]
      );
    }

    // Atualização de propriedades do perfil
    const fields: string[] = [];
    const params: any[] = [];

    if (favorito !== undefined) {
      fields.push("favorito = ?");
      params.push(favorito ? 1 : 0);
    }

    const meuPerfilVal = meu_perfil !== undefined ? meu_perfil : meuPerfil;
    if (meuPerfilVal !== undefined) {
      fields.push("meu_perfil = ?");
      params.push(meuPerfilVal ? 1 : 0);
      try {
        await db.run('INSERT OR IGNORE INTO controle_perfis (username) VALUES (?)', [cleanUsername]);
      } catch (e) {}
    }

    const primeiraPostagemVal = primeira_postagem !== undefined ? primeira_postagem : primeiraPostagem;
    if (primeiraPostagemVal !== undefined) {
      fields.push("primeira_postagem = ?");
      params.push(primeiraPostagemVal);
    }

    const tipoContaVal = tipo_conta !== undefined ? tipo_conta : tipoConta;
    if (tipoContaVal !== undefined) {
      fields.push("tipo_conta = ?");
      params.push(tipoContaVal);
    }

    const tipoTrafegoVal = tipo_trafego !== undefined ? tipo_trafego : tipoTrafego;
    if (tipoTrafegoVal !== undefined) {
      fields.push("tipo_trafego = ?");
      params.push(tipoTrafegoVal);
    }

    const isVerifiedVal = is_verified !== undefined ? is_verified : isVerified;
    if (isVerifiedVal !== undefined) {
      fields.push("is_verified = ?");
      params.push(isVerifiedVal ? 1 : 0);
    }

    if (exibir !== undefined) {
      fields.push("exibir = ?");
      params.push(exibir ? 1 : 0);
    }

    if (status !== undefined) {
      fields.push("status = ?");
      params.push(status);
      if (status === 'MORREU' || status === '☠️ Morreu') {
        await db.run(`
          INSERT INTO controle_perfis (username, status) VALUES (?, '☠️ Morreu')
          ON CONFLICT(username) DO UPDATE SET status = '☠️ Morreu'
        `, [cleanUsername]);
      } else {
        const rowCtrl = await db.get(`SELECT status FROM controle_perfis WHERE LOWER(username) = ?`, [cleanUsername]);
        if (rowCtrl && rowCtrl.status && rowCtrl.status.includes('Morreu')) {
          await db.run(`UPDATE controle_perfis SET status = '⏳ Aguardando' WHERE LOWER(username) = ?`, [cleanUsername]);
        }
      }
      if (status === 'INDISPONIVEL') {
        try {
          const dateStr = new Date().toLocaleDateString('pt-BR');
          await db.run(
            `INSERT INTO controle_perfis_obs (username, texto) VALUES (?, ?)`,
            [cleanUsername, `[SISTEMA] Perfil marcado como INDISPONÍVEL / SUSPENSO em ${dateStr}`]
          );
        } catch (e) {
          // ignora se a tabela não existir
        }
      }
    }

    if (fields.length > 0) {
      params.push(cleanUsername);
      await db.run(`UPDATE perfis_monitorados SET ${fields.join(', ')} WHERE LOWER(username) = ?`, params);
    }

    return NextResponse.json({ success: true, message: "Perfil atualizado com sucesso" });

  } catch (error: any) {
    console.error("Erro no /api/data PUT:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json({ success: false, error: "Username é obrigatório" }, { status: 400 });
    }

    const cleanUsername = username.trim().toLowerCase().replace('@', '');
    const db = await getDb();

    await db.run("UPDATE perfis_monitorados SET status = 'INATIVO', exibir = 0 WHERE LOWER(username) = ?", [cleanUsername]);

    return NextResponse.json({ success: true, message: `Perfil @${cleanUsername} desativado.` });
  } catch (error: any) {
    console.error("Erro no /api/data DELETE:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}