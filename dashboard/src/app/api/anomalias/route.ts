import { NextRequest, NextResponse } from 'next/server';
import { getDb as getDbBase } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function getDb() {
  const db = await getDbBase();

  // Garante que as colunas necessárias existem
  const colsHist = await db.all("PRAGMA table_info(perfis_historico)");
  const hasTipoJanela = colsHist.some((c: { name: string }) => c.name === "tipo_janela");
  if (!hasTipoJanela) {
    await db.exec(`ALTER TABLE perfis_historico ADD COLUMN tipo_janela TEXT DEFAULT 'ORGANICO'`);
  }
  const hasRevisado = colsHist.some((c: { name: string }) => c.name === "revisado_manualmente");
  if (!hasRevisado) {
    await db.exec(`ALTER TABLE perfis_historico ADD COLUMN revisado_manualmente INTEGER DEFAULT 0`);
  }

  return db;
}

// ─────────────────────────────────────────────
// GET — Central de Anomalias & Triagem por Perfil
// Retorna estatísticas globais, lista de perfis sumarizada e registros detalhados
// ─────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filterUsername = searchParams.get('username') || '';
    const filterTipoJanela = searchParams.get('tipo_janela') || '';
    const mode = searchParams.get('mode') || '';

    const db = await getDb();

    // 1. Cards Score Globais
    const statsQuery = await db.get(`
      SELECT 
        COUNT(DISTINCT SUBSTR(data_coleta, 1, 10)) as dias_coletados,
        COUNT(DISTINCT username) as contas_coletadas,
        SUM(CASE WHEN COALESCE(revisado_manualmente, 0) = 0 THEN 1 ELSE 0 END) as pendentes_validacao,
        SUM(CASE WHEN tipo_janela IN ('ORGANICO', 'VIRAL_ORGANICO') OR tipo_janela IS NULL THEN 1 ELSE 0 END) as dias_organicos,
        SUM(CASE WHEN tipo_janela = 'ADS' THEN 1 ELSE 0 END) as dias_ads
      FROM perfis_historico
      WHERE inativo = 0
    `);

    const stats = {
      dias_coletados: Number(statsQuery?.dias_coletados || 0),
      contas_coletadas: Number(statsQuery?.contas_coletadas || 0),
      pendentes_validacao: Number(statsQuery?.pendentes_validacao || 0),
      dias_organicos: Number(statsQuery?.dias_organicos || 0),
      dias_ads: Number(statsQuery?.dias_ads || 0)
    };

    // 2. Lista Sumarizada de Perfis (para barra de navegação/seleção)
    const perfisSumarioRows = await db.all(`
      SELECT 
        h.username,
        COUNT(h.id) as total_coletas,
        SUM(CASE WHEN COALESCE(h.revisado_manualmente, 0) = 0 THEN 1 ELSE 0 END) as pendentes,
        SUM(CASE WHEN h.tipo_janela = 'ADS' THEN 1 ELSE 0 END) as ads_count,
        SUM(CASE WHEN h.tipo_janela IN ('ORGANICO', 'VIRAL_ORGANICO') OR h.tipo_janela IS NULL THEN 1 ELSE 0 END) as organicos_count,
        COALESCE(pm.primeira_postagem, cp.inicio) as primeira_postagem,
        COALESCE(cp.foto_url, '') as foto_url,
        COALESCE(pm.meu_perfil, 0) as meu_perfil,
        MAX(h.data_coleta) as ultima_coleta,
        COALESCE(com.total_comentarios, 0) as comentarios_pendentes,
        COALESCE(msg.total_mensagens, 0) as mensagens_pendentes,
        CASE WHEN (COALESCE(com.total_comentarios, 0) + COALESCE(msg.total_mensagens, 0)) > 0 THEN 1 ELSE 0 END as tem_pendencias
      FROM perfis_historico h
      LEFT JOIN perfis_monitorados pm ON LOWER(pm.username) = LOWER(h.username)
      LEFT JOIN controle_perfis cp ON LOWER(cp.username) = LOWER(h.username)
      LEFT JOIN (
        SELECT LOWER(modelo_username) as uname, COUNT(*) as total_comentarios
        FROM instagram_comentarios
        WHERE COALESCE(respondido, 0) = 0
        GROUP BY LOWER(modelo_username)
      ) com ON com.uname = LOWER(h.username)
      LEFT JOIN (
        SELECT LOWER(modelo_username) as uname, COUNT(*) as total_mensagens
        FROM instagram_mensagens
        WHERE COALESCE(respondida, 0) = 0
        GROUP BY LOWER(modelo_username)
      ) msg ON msg.uname = LOWER(h.username)
      WHERE h.inativo = 0
      GROUP BY h.username
      ORDER BY pendentes DESC, meu_perfil DESC, total_coletas DESC, h.username COLLATE NOCASE ASC
    `);

    const perfis_sumario = perfisSumarioRows.map((p: any) => ({
      username: p.username,
      total_coletas: Number(p.total_coletas || 0),
      pendentes: Number(p.pendentes || 0),
      ads_count: Number(p.ads_count || 0),
      organicos_count: Number(p.organicos_count || 0),
      primeira_postagem: p.primeira_postagem || null,
      foto_url: p.foto_url || '',
      meu_perfil: Number(p.meu_perfil || 0),
      ultima_coleta: p.ultima_coleta || null,
      comentarios_pendentes: Number(p.comentarios_pendentes || 0),
      mensagens_pendentes: Number(p.mensagens_pendentes || 0),
      tem_pendencias: Boolean(Number(p.tem_pendencias || 0))
    }));

    // 3. Registros de Coleta Detalhados (para o perfil selecionado ou modo especificado)
    let query = `
      SELECT 
        h.id,
        h.username,
        h.data_coleta,
        h.seguidores,
        h.total_posts,
        COALESCE(h.tipo_janela, 'ORGANICO') AS tipo_janela,
        COALESCE(h.revisado_manualmente, 0) AS revisado_manualmente,
        COALESCE(cp.foto_url, '') as foto_url,
        COALESCE(pm.primeira_postagem, cp.inicio) as primeira_postagem,
        COALESCE(pm.meu_perfil, 0) as meu_perfil
      FROM perfis_historico h
      LEFT JOIN perfis_monitorados pm ON LOWER(pm.username) = LOWER(h.username)
      LEFT JOIN controle_perfis cp ON LOWER(cp.username) = LOWER(h.username)
      WHERE h.inativo = 0
    `;
    const params: any[] = [];

    if (filterUsername) {
      query += ` AND LOWER(h.username) = LOWER(?)`;
      params.push(filterUsername);
    } else if (mode === 'pendentes') {
      query += ` AND COALESCE(h.revisado_manualmente, 0) = 0`;
    }

    if (filterTipoJanela && filterTipoJanela !== 'TODOS') {
      query += ` AND h.tipo_janela = ?`;
      params.push(filterTipoJanela);
    }

    query += ` ORDER BY h.data_coleta DESC, h.id DESC`;

    // Se nenhum perfil for especificado, impõe limite para não sobrecarregar
    if (!filterUsername) {
      query += ` LIMIT 300`;
    }

    const rows = await db.all(query, params);

    // 4. Calcula as métricas comparando com a coleta anterior do mesmo perfil
    const resultado = [];

    for (const item of rows) {
      const anterior = await db.get(`
        SELECT seguidores, total_posts, data_coleta FROM perfis_historico
        WHERE LOWER(username) = LOWER(?) AND id < ? AND inativo = 0
        ORDER BY data_coleta DESC, id DESC
        LIMIT 1
      `, [item.username, item.id]);

      const segAnterior = anterior?.seguidores || 0;
      const postsAnterior = anterior?.total_posts || 0;

      const deltaS = (item.seguidores || 0) - segAnterior;
      const deltaPosts = (item.total_posts || 0) - postsAnterior;
      const pctDeltaS = segAnterior > 0
        ? ((item.seguidores - segAnterior) / segAnterior) * 100
        : 0;

      // Calcular intervalo de dias entre coletas para obter média diária em dias em branco
      let diasIntervalo = 1;
      if (anterior?.data_coleta && item.data_coleta) {
        const dAnt = new Date(anterior.data_coleta).getTime();
        const dAtual = new Date(item.data_coleta).getTime();
        if (!isNaN(dAnt) && !isNaN(dAtual) && dAtual > dAnt) {
          const diffDays = (dAtual - dAnt) / (1000 * 3600 * 24);
          if (diffDays >= 1.2) {
            diasIntervalo = Math.max(2, Math.round(diffDays));
          }
        }
      }

      const mediaDiariaDeltaS = diasIntervalo > 1 ? Math.round(deltaS / diasIntervalo) : deltaS;
      const pctMediaDiariaDeltaS = diasIntervalo > 1 ? Math.round((pctDeltaS / diasIntervalo) * 10) / 10 : Math.round(pctDeltaS * 10) / 10;

      const gatilhos: string[] = [];
      if (pctDeltaS > 2.0 && deltaS > 10) {
        gatilhos.push('CRESCIMENTO_ALTO');
      }
      if (deltaS > 150 && deltaPosts === 0) {
        gatilhos.push('VOLUME_SEM_CONTEUDO');
      }
      if (pctDeltaS >= 25 && segAnterior > 500) {
        gatilhos.push('EXPLOSAO_PERCENTUAL');
      }

      resultado.push({
        id: item.id,
        username: item.username,
        data_coleta: item.data_coleta,
        seguidores: item.seguidores,
        total_posts: item.total_posts,
        foto_url: item.foto_url || '',
        primeira_postagem: item.primeira_postagem || null,
        meu_perfil: item.meu_perfil || 0,
        tipo_janela: item.tipo_janela,
        revisado_manualmente: item.revisado_manualmente,
        delta_s: deltaS,
        pct_delta_s: Math.round(pctDeltaS * 10) / 10,
        delta_posts: deltaPosts,
        seg_anterior: segAnterior,
        gatilhos,
        dias_intervalo: diasIntervalo,
        media_diaria_delta_s: mediaDiariaDeltaS,
        pct_media_diaria_delta_s: pctMediaDiariaDeltaS
      });
    }

    return NextResponse.json({
      success: true,
      stats,
      perfis_sumario,
      items: resultado,
      total_pendentes: stats.pendentes_validacao
    }, {
      headers: { 'Cache-Control': 'no-store' }
    });

  } catch (error: any) {
    console.error("Erro GET /api/anomalias:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ─────────────────────────────────────────────
// POST — Executa varrida retroativa no histórico de coletas
// Regra:
// - Variação > 2% e > 10 seguidores → enviado para análise/validação manual
// - Dentro do parâmetro (<= 2% ou <= 10 seg) → automaticamente marcado como ORGANICO e validado
// ─────────────────────────────────────────────
export async function POST() {
  try {
    const db = await getDb();

    const allRows = await db.all(`
      SELECT id, username, data_coleta, seguidores, total_posts, inativo, tipo_janela, revisado_manualmente
      FROM perfis_historico
      ORDER BY username, datetime(data_coleta) ASC, id ASC
    `);

    const ultimoPorPerfil: { [u: string]: { seguidores: number; total_posts: number } } = {};
    let marcadosAnalise = 0;
    let autoValidados = 0;

    for (const r of allRows) {
      if (r.inativo === 1 || !r.seguidores) continue;

      if (ultimoPorPerfil[r.username]) {
        const segAnt = ultimoPorPerfil[r.username].seguidores;
        const postsAnt = ultimoPorPerfil[r.username].total_posts;

        const deltaS = r.seguidores - segAnt;
        const deltaPosts = (r.total_posts || 0) - postsAnt;
        const pctDeltaS = segAnt > 0 ? ((r.seguidores - segAnt) / segAnt) * 100 : 0;

        // Regra: variação > 2% e > 10 seguidores
        const precisaAnalise = pctDeltaS > 2.0 && deltaS > 10;

        if (precisaAnalise) {
          // Se ainda não foi revisado manualmente pelo usuário, marca para análise
          if (Number(r.revisado_manualmente || 0) === 0) {
            await db.run(
              `UPDATE perfis_historico SET tipo_janela = 'ADS', revisado_manualmente = 0 WHERE id = ?`,
              [r.id]
            );
            marcadosAnalise++;
          }
        } else {
          // Dentro do parâmetro normal: marca automaticamente como ORGANICO e validado
          await db.run(
            `UPDATE perfis_historico SET tipo_janela = 'ORGANICO', revisado_manualmente = 1 WHERE id = ?`,
            [r.id]
          );
          autoValidados++;
        }
      } else {
        // Primeira coleta do perfil: automaticamente validado como ORGANICO
        await db.run(
          `UPDATE perfis_historico SET tipo_janela = 'ORGANICO', revisado_manualmente = 1 WHERE id = ?`,
          [r.id]
        );
        autoValidados++;
      }

      ultimoPorPerfil[r.username] = { seguidores: r.seguidores, total_posts: r.total_posts || 0 };
    }

    const countRow = await db.get(`
      SELECT COUNT(*) as total FROM perfis_historico
      WHERE COALESCE(revisado_manualmente, 0) = 0 AND inativo = 0
    `);

    return NextResponse.json({
      success: true,
      marcados: marcadosAnalise,
      auto_validados: autoValidados,
      total_pendentes: countRow?.total || 0
    });

  } catch (error: any) {
    console.error("Erro POST /api/anomalias:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ─────────────────────────────────────────────
// PUT — Atualiza a classificação ou revisão de um registro
// Body: { id: number, tipo_janela?: string, revisado_manualmente?: number }
// ─────────────────────────────────────────────
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, tipo_janela, revisado_manualmente } = body;

    if (!id) {
      return NextResponse.json(
        { error: "id é obrigatório" },
        { status: 400 }
      );
    }

    const db = await getDb();

    if (tipo_janela !== undefined) {
      const valoresPermitidos = ['ORGANICO', 'ADS', 'VIRAL_ORGANICO', 'IGNORAR'];
      if (!valoresPermitidos.includes(tipo_janela)) {
        return NextResponse.json(
          { error: `tipo_janela inválido. Valores permitidos: ${valoresPermitidos.join(', ')}` },
          { status: 400 }
        );
      }
      const newRevisado = revisado_manualmente !== undefined ? (revisado_manualmente ? 1 : 0) : 1;
      await db.run(
        `UPDATE perfis_historico SET tipo_janela = ?, revisado_manualmente = ? WHERE id = ?`,
        [tipo_janela, newRevisado, id]
      );
    } else if (revisado_manualmente !== undefined) {
      const newRevisado = revisado_manualmente ? 1 : 0;
      await db.run(
        `UPDATE perfis_historico SET revisado_manualmente = ? WHERE id = ?`,
        [newRevisado, id]
      );
    }

    return NextResponse.json({
      success: true,
      id,
      tipo_janela,
      revisado_manualmente: revisado_manualmente !== undefined ? (revisado_manualmente ? 1 : 0) : 1
    });

  } catch (error: any) {
    console.error("Erro PUT /api/anomalias:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
