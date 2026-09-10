// app/api/controle/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getDb as getDbBase } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function getDb() {
  const db = await getDbBase();
  
  // Migration: ensure table has foto_url column
  try {
    const columns = await db.all("PRAGMA table_info(controle_perfis)");
    const hasFotoUrl = columns.some((c: any) => c.name === "foto_url");
    if (!hasFotoUrl) {
      await db.exec(`ALTER TABLE controle_perfis ADD COLUMN foto_url TEXT`);
    }

    // Meta Account ID precisa ficar arquivado junto com o resto do cadastro da
    // modelo (não só em automacao_config, que é config de automação). Na
    // primeira vez que a coluna é criada, faz backfill a partir do que já
    // existe em automacao_config, pra não depender de re-digitar tudo.
    const hasMetaAccountId = columns.some((c: any) => c.name === "meta_account_id");
    if (!hasMetaAccountId) {
      await db.exec(`ALTER TABLE controle_perfis ADD COLUMN meta_account_id TEXT`);

      await db.exec(`
        INSERT INTO controle_perfis (username, meta_account_id)
        SELECT ac.username, ac.meta_account_id
        FROM automacao_config ac
        WHERE ac.meta_account_id IS NOT NULL AND ac.meta_account_id != ''
        ON CONFLICT(username) DO UPDATE SET meta_account_id = excluded.meta_account_id
      `);

      // Contas cujo username no cadastro difere só em maiúsculas/minúsculas do
      // usado em automacao_config (o ON CONFLICT acima é exato) — casa por
      // LOWER() pra não deixar essas de fora do backfill.
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
    console.error("Migration error:", err);
  }

  // Create table for observations history
  await db.exec(`
    CREATE TABLE IF NOT EXISTS controle_perfis_obs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      texto TEXT NOT NULL,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migrate existing observations from controle_perfis if any
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
    console.error("Observation migration error:", err);
  }

  return db;
}

// ─────────────────────────────────────────────
// GET — busca todos os dados da aba Controle (Tratado para o Frontend)
// ─────────────────────────────────────────────
export async function GET() {
  try {
    const db = await getDb();

    // 1. Busca os perfis favoritados e junta com os dados manuais
    const linhasBanco = await db.all(`
      SELECT 
        pm.username,
        pm.foto_perfil_meta,
        ph.seguidores,
        ph.data_coleta,
        cp.nome,
        cp.nascimento,
        cp.email,
        cp.reserva,
        cp.linktree,
        cp.inicio,
        cp.telegram,
        cp.fotos_estoque,
        cp.status as status_controle,
        cp.obs,
        cp.foto_url,
        cp.meta_account_id
      FROM perfis_monitorados pm
      LEFT JOIN controle_perfis cp ON pm.username = cp.username
      LEFT JOIN (
        SELECT id, username, seguidores, data_coleta
        FROM perfis_historico
        WHERE id IN (
          SELECT MAX(id)
          FROM perfis_historico
          GROUP BY username
        )
      ) ph ON LOWER(pm.username) = LOWER(ph.username)
      WHERE pm.meu_perfil = 1 
      ORDER BY pm.username COLLATE NOCASE
    `);

    // 2. Busca todos os lançamentos para poder vincular aos perfis
    const todosLancamentos = await db.all(`SELECT * FROM lancamentos ORDER BY data_lancamento ASC`);

    // 3. Busca todo o histórico de observações
    const todasObs = await db.all(`SELECT * FROM controle_perfis_obs ORDER BY datetime(criado_em) DESC`);

    // 4. Busca quantidade de agendamentos futuros (status = 'AGENDADO') por username na tabela automacao_agendamentos
    const contagemReserva: { [username: string]: number } = {};
    try {
      const reservas = await db.all(`
        SELECT LOWER(username) as uname, COUNT(*) as total
        FROM automacao_agendamentos
        WHERE status = 'AGENDADO'
        GROUP BY LOWER(username)
      `);
      reservas.forEach((r: any) => {
        contagemReserva[r.uname] = r.total || 0;
      });
    } catch (err) {
      // Caso a tabela ainda não exista no banco
    }

    // 4.1 Busca quantidade de comentários e mensagens pendentes
    const contagemComentarios: { [username: string]: number } = {};
    const contagemMensagens: { [username: string]: number } = {};
    try {
      const coms = await db.all(`
        SELECT LOWER(modelo_username) as uname, COUNT(*) as total
        FROM instagram_comentarios
        WHERE COALESCE(respondido, 0) = 0
        GROUP BY LOWER(modelo_username)
      `);
      coms.forEach((c: any) => { contagemComentarios[c.uname] = Number(c.total || 0); });

      const msgs = await db.all(`
        SELECT LOWER(modelo_username) as uname, COUNT(*) as total
        FROM instagram_mensagens
        WHERE COALESCE(respondida, 0) = 0
        GROUP BY LOWER(modelo_username)
      `);
      msgs.forEach((m: any) => { contagemMensagens[m.uname] = Number(m.total || 0); });
    } catch (err) {
      // Tabelas podem não ter registros ainda
    }

    // 4.2 Busca a data/hora da última execução da Ingestão da Meta API
    let ultimaExecucaoMeta: string | null = null;
    try {
      const snapMeta = await db.get(`
        SELECT MAX(data_carga) as max_data
        FROM posts_metricas_snapshots
        WHERE data_carga IS NOT NULL
      `);
      if (snapMeta?.max_data) {
        ultimaExecucaoMeta = snapMeta.max_data;
      } else {
        const perfMeta = await db.get(`
          SELECT MAX(data_carga) as max_data
          FROM perfis_historico
          WHERE data_carga IS NOT NULL
        `);
        if (perfMeta?.max_data) {
          ultimaExecucaoMeta = perfMeta.max_data;
        }
      }
    } catch (err) {
      console.warn("Aviso ao buscar última execução Meta:", err);
    }

    // 4.3 Métricas de visualizações dos posts e variação de seguidores por modelo
    const viewsDiaMap: Record<string, number> = {};
    const viewsDeltaMap: Record<string, number> = {};
    const segDeltaColetaMap: Record<string, number> = {};
    const segDeltaDiaMap: Record<string, number> = {};

    try {
      const hojeStr = new Date().toISOString().substring(0, 10);
      const limiteHoje = `${hojeStr} 00:00:00`;

      // 1) Duas últimas cargas de snapshots para delta do último ciclo
      const ultimasCargas = await db.all(`
        SELECT DISTINCT data_carga
        FROM posts_metricas_snapshots
        WHERE data_carga IS NOT NULL
        ORDER BY data_carga DESC
        LIMIT 2
      `).catch(() => []);

      if (ultimasCargas.length >= 2) {
        const uCarga = ultimasCargas[0].data_carga;
        const pCarga = ultimasCargas[1].data_carga;

        const diffRows = await db.all(`
          SELECT 
            LOWER(username) as uname,
            SUM(CASE WHEN data_carga = ? THEN views ELSE 0 END) -
            SUM(CASE WHEN data_carga = ? THEN views ELSE 0 END) as diff
          FROM posts_metricas_snapshots
          WHERE data_carga IN (?, ?)
          GROUP BY LOWER(username)
        `, [uCarga, pCarga, uCarga, pCarga]).catch(() => []);

        for (const row of diffRows) {
          viewsDeltaMap[row.uname] = Math.max(0, Number(row.diff) || 0);
        }
      }

      // 2) Views ganhas hoje
      const snapHoje = await db.all(`
        SELECT 
          LOWER(username) as uname,
          post_id,
          MAX(views) as max_views,
          MIN(views) as min_views
        FROM posts_metricas_snapshots
        WHERE data_carga >= ?
        GROUP BY LOWER(username), post_id
      `, [limiteHoje]).catch(() => []);

      const snapAntes = await db.all(`
        SELECT post_id, views
        FROM posts_metricas_snapshots
        WHERE data_carga < ?
        ORDER BY data_carga DESC
      `, [limiteHoje]).catch(() => []);

      const antesMap: Record<string, number> = {};
      for (const s of snapAntes) {
        if (antesMap[s.post_id] === undefined) {
          antesMap[s.post_id] = Number(s.views) || 0;
        }
      }

      for (const s of snapHoje) {
        const u = s.uname;
        const maxV = Number(s.max_views) || 0;
        const baseV = antesMap[s.post_id] !== undefined ? antesMap[s.post_id] : (Number(s.min_views) || 0);
        const delta = maxV - baseV;
        if (delta > 0) {
          viewsDiaMap[u] = (viewsDiaMap[u] || 0) + delta;
        }
      }

      // 3) Histórico de seguidores para variação da última coleta e no dia
      const phRows = await db.all(`
        SELECT LOWER(username) as uname, data_coleta, seguidores
        FROM perfis_historico
        WHERE seguidores > 0
        ORDER BY data_coleta ASC, id ASC
      `).catch(() => []);

      const shRows = await db.all(`
        SELECT LOWER(username) as uname, data_coleta, total_seguidores as seguidores
        FROM seguidores_historico
        WHERE total_seguidores > 0
        ORDER BY data_coleta ASC, id ASC
      `).catch(() => []);

      const coletasByUser: Record<string, Record<string, number>> = {};
      for (const r of phRows) {
        (coletasByUser[r.uname] ??= {})[r.data_coleta] = Number(r.seguidores);
      }
      for (const r of shRows) {
        (coletasByUser[r.uname] ??= {})[r.data_coleta] = Number(r.seguidores);
      }

      for (const [u, mapDt] of Object.entries(coletasByUser)) {
        const arr = Object.entries(mapDt).sort((a, b) => a[0].localeCompare(b[0])).map(([dt, seg]) => ({ dt, seg }));
        if (arr.length > 0) {
          const atual = arr[arr.length - 1];
          if (arr.length > 1) {
            segDeltaColetaMap[u] = atual.seg - arr[arr.length - 2].seg;
          }
          const limite00 = `${atual.dt.substring(0, 10)} 00:00:00`;
          const antes00 = arr.filter(x => x.dt < limite00);
          const deHoje = arr.filter(x => x.dt >= limite00);
          const base = antes00.length > 0 ? antes00[antes00.length - 1] : (deHoje.length > 0 ? deHoje[0] : atual);
          if (base) {
            segDeltaDiaMap[u] = atual.seg - base.seg;
          }
        }
      }
    } catch (err) {
      console.warn("Aviso ao calcular métricas de controle:", err);
    }

    // 5. Tratamento de Dados: Transforma 'null' em valores seguros que o React aceita

    // Agrupa lançamentos e observações por username uma única vez (O(n)) em vez de
    // filtrar os arrays inteiros para cada perfil dentro do .map() abaixo (O(perfis × n)).
    const lancamentosPorUsername: Record<string, any[]> = {};
    for (const l of todosLancamentos) {
      (lancamentosPorUsername[l.username] ??= []).push(l);
    }
    const obsPorUsername: Record<string, any[]> = {};
    for (const o of todasObs) {
      (obsPorUsername[o.username] ??= []).push(o);
    }

    const perfisTratados = linhasBanco.map((p: any) => {
      const u = (p.username || '').toLowerCase();
      const lancamentosDoPerfil = lancamentosPorUsername[p.username] || [];
      const obsDoPerfil = obsPorUsername[p.username] || [];

      // Quantidade de agendamentos futuros (reserva de posts)
      const totalReserva = contagemReserva[u] || 0;

      const nCom = contagemComentarios[u] || 0;
      const nMsg = contagemMensagens[u] || 0;
      const totalPend = nCom + nMsg;

      // Define uma data padrão segura de hoje caso o início seja nulo
      // para evitar que funções como calcDias(p.inicio) quebrem o componente
      const dataHoje = new Date().toISOString().split('T')[0];

      const fotoEfetiva = (p.foto_perfil_meta && String(p.foto_perfil_meta).trim().length > 0)
        ? p.foto_perfil_meta
        : (p.foto_url || '');

      return {
        username: p.username,
        seguidores: p.seguidores || 0,
        ultima_coleta: p.data_coleta || null,
        nome: p.nome || '',
        nascimento: p.nascimento || '',
        email: p.email || '',
        reserva: totalReserva,
        linktree: p.linktree || '',
        inicio: p.inicio || dataHoje, 
        telegram: p.telegram || '',
        fotos_estoque: p.fotos_estoque || 0,
        status: p.status_controle || '⏳ Aguardando',
        obs_historico: obsDoPerfil, // Histórico de observações
        foto_url: fotoEfetiva,
        meta_account_id: p.meta_account_id || '',
        foto_perfil_meta: p.foto_perfil_meta || null,
        foto_local: p.foto_url || null,
        comentarios_pendentes: nCom,
        mensagens_pendentes: nMsg,
        total_pendencias: totalPend,
        tem_pendencias: totalPend > 0,
        views_dia: viewsDiaMap[u] || 0,
        views_delta_ultima_carga: viewsDeltaMap[u] || 0,
        novos_seguidores_coleta: segDeltaColetaMap[u] || 0,
        novos_seguidores_dia: segDeltaDiaMap[u] || 0,
        lancamentos: lancamentosDoPerfil // Injeta obrigatoriamente um array []
      };
    });

    // Retorna a lista perfeitamente segura para o Frontend mapear sem erros
    return NextResponse.json({ 
      success: true, 
      perfis: perfisTratados,
      ultima_execucao_meta: ultimaExecucaoMeta
    }, {
      headers: { 'Cache-Control': 'no-store' }
    });

  } catch (error: any) {
    console.error("Erro GET /api/controle:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// ─────────────────────────────────────────────
// PUT — salva/atualiza dados manuais de um perfil
// Body: { username, nome, nascimento, email, reserva,
//         linktree, inicio, telegram, fotos_estoque, status, obs }
// ─────────────────────────────────────────────
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    // ==========================================
    // EDIÇÃO DE LANÇAMENTO
    // ==========================================
    if (body.id) {

      const db = await getDb();

      await db.run(`
        UPDATE lancamentos
        SET
          username = ?,
          tipo = ?,
          valor_brl = ?,
          valor_original = ?,
          moeda = ?,
          taxa_conversao = ?,
          data_lancamento = ?,
          descricao = ?
        WHERE id = ?
      `, [
        body.username,
        body.tipo,
        body.valor_brl,
        body.valor_original,
        body.moeda,
        body.taxa_conversao ?? 1,
        body.data_lancamento,
        body.descricao,
        body.id
      ]);

      return NextResponse.json({
        success: true,
        modo: "lancamento_editado"
      });
    }

    // ==========================================
    // EDIÇÃO DOS DADOS DO PERFIL
    // ==========================================

    const {
      username,
      nome,
      nascimento,
      email,
      reserva,
      linktree,
      inicio,
      telegram,
      fotos_estoque,
      status,
      foto_url,
      meta_account_id,
      nova_obs
    } = body;

    if (!username) throw new Error("username é obrigatório");

    const db = await getDb();

    // Insere nova observação se preenchida
    if (nova_obs && nova_obs.trim() !== '') {
      await db.run(`
        INSERT INTO controle_perfis_obs (username, texto)
        VALUES (?, ?)
      `, [username, nova_obs.trim()]);
    }

    await db.run(`
      INSERT INTO controle_perfis
        (username, nome, nascimento, email, reserva, linktree, inicio, telegram, fotos_estoque, status, foto_url, meta_account_id, atualizado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(username) DO UPDATE SET
        nome           = excluded.nome,
        nascimento     = excluded.nascimento,
        email          = excluded.email,
        reserva        = excluded.reserva,
        linktree       = excluded.linktree,
        inicio         = excluded.inicio,
        telegram       = excluded.telegram,
        fotos_estoque  = excluded.fotos_estoque,
        status         = excluded.status,
        foto_url       = excluded.foto_url,
        meta_account_id = excluded.meta_account_id,
        atualizado_em  = datetime('now')
    `, [username, nome, nascimento, email, reserva, linktree, inicio, telegram, fotos_estoque, status, foto_url, meta_account_id ?? '']);

    if (status && (status.includes('Morreu') || status === 'MORREU')) {
      await db.run(`UPDATE perfis_monitorados SET status = 'MORREU' WHERE username = ?`, [username]);
    } else if (status) {
      const perfMon = await db.get(`SELECT status FROM perfis_monitorados WHERE username = ?`, [username]);
      if (perfMon && perfMon.status === 'MORREU') {
        await db.run(`UPDATE perfis_monitorados SET status = 'ATIVO' WHERE username = ?`, [username]);
      }
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("Erro PUT /api/controle:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// ─────────────────────────────────────────────
// POST — registra um lançamento (despesa ou recebido)
// Body: { username, tipo, valor_brl, valor_original, moeda,
//         taxa_conversao, data_lancamento, descricao,
//         rateio: boolean, perfis_rateio?: string[] }
// ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      username, tipo, valor_brl, valor_original, moeda,
      taxa_conversao, data_lancamento, descricao,
      rateio, perfis_rateio
    } = body;

    if (!username || !tipo || valor_brl == null) {
      throw new Error("username, tipo e valor_brl são obrigatórios");
    }

    const db = await getDb();
    const grupoRateio = rateio ? randomUUID() : null;

    if (rateio && perfis_rateio && perfis_rateio.length > 0) {
      // Insere um lançamento para cada perfil do rateio
      const valorPorPerfil = valor_brl / perfis_rateio.length;
      const valorOriginalPorPerfil = valor_original / perfis_rateio.length;

      const stmt = await db.prepare(`
        INSERT INTO lancamentos
          (username, tipo, valor_brl, valor_original, moeda, taxa_conversao,
           data_lancamento, descricao, rateado, grupo_rateio)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `);

      for (const u of perfis_rateio) {
        await stmt.run([
          u, tipo, valorPorPerfil, valorOriginalPorPerfil,
          moeda, taxa_conversao ?? 1,
          data_lancamento, descricao, grupoRateio
        ]);
      }
      await stmt.finalize();

    } else {
      // Lançamento individual
      await db.run(`
        INSERT INTO lancamentos
          (username, tipo, valor_brl, valor_original, moeda, taxa_conversao,
           data_lancamento, descricao, rateado, grupo_rateio)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)
      `, [
        username, tipo, valor_brl, valor_original,
        moeda, taxa_conversao ?? 1,
        data_lancamento, descricao
      ]);
    }

    return NextResponse.json({ success: true, grupo_rateio: grupoRateio });

  } catch (error: any) {
    console.error("Erro POST /api/controle:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// ─────────────────────────────────────────────
// DELETE — remove um lançamento pelo id
// ou um grupo de rateio inteiro pelo grupo_rateio
// Query params: ?id=123  ou  ?grupo_rateio=uuid
// ─────────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const grupo = searchParams.get('grupo_rateio');

    if (!id && !grupo) throw new Error("Informe id ou grupo_rateio");

    const db = await getDb();

    if (grupo) {
      await db.run('DELETE FROM lancamentos WHERE grupo_rateio = ?', [grupo]);
    } else {
      await db.run('DELETE FROM lancamentos WHERE id = ?', [id]);
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("Erro DELETE /api/controle:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}