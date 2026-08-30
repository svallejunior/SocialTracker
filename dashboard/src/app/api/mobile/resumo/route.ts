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

export async function GET(req: NextRequest) {
  try {
    const db = await open({
      filename: resolveDbPath(),
      driver: sqlite3.Database
    });

    // 1. Data e Hora da Última Atualização Geral
    const lastUpdateRow = await db.get(`
      SELECT MAX(data_coleta) as ultima_coleta FROM perfis_historico
    `);
    const ultimaAtualizacao = lastUpdateRow?.ultima_coleta || null;

    // 2. Perfis Monitorados ATIVOS que possuem Meta ID (os que aparecem na Automatização)
    const perfis = await db.all(`
      SELECT 
        p.username,
        p.status,
        p.foto_perfil_meta,
        ac.meta_account_id,
        cp.nome,
        cp.foto_url,
        cp.status as status_controle,
        cp.inicio
      FROM perfis_monitorados p
      JOIN automacao_config ac ON (LOWER(p.username) = LOWER(ac.username) AND ac.id != 'default_config' AND LENGTH(TRIM(COALESCE(ac.meta_account_id, ''))) > 0)
      LEFT JOIN controle_perfis cp ON LOWER(p.username) = LOWER(cp.username)
      WHERE UPPER(COALESCE(p.status, 'ATIVO')) = 'ATIVO'
      ORDER BY p.username ASC
    `);

    // 3. Histórico dos Perfis para calcular evoluções:
    const historico = await db.all(`
      SELECT id, username, data_coleta, seguidores, total_posts, data_carga
      FROM perfis_historico
      ORDER BY data_coleta ASC, id ASC
    `);

    // Agrupa histórico por username e deduplica por dia (preservando o registro mais recente do dia)
    const histByUser: Record<string, any[]> = {};
    for (const h of historico) {
      const u = (h.username || '').toLowerCase();
      if (!histByUser[u]) histByUser[u] = [];
      histByUser[u].push(h);
    }

    const perfisProcessados = perfis.map((p: any) => {
      const u = (p.username || '').toLowerCase();
      const userHistory = histByUser[u] || [];

      // Deduplica por dia (mantendo a última coleta do dia)
      const porDia: Record<string, any> = {};
      for (const h of userHistory) {
        if (!h.seguidores || Number(h.seguidores) <= 0) continue;
        const dia = (h.data_coleta || '').substring(0, 10);
        if (!dia) continue;
        const cur = porDia[dia];
        if (!cur) {
          porDia[dia] = h;
        } else {
          const curTs = cur.data_carga || cur.data_coleta || '';
          const newTs = h.data_carga || h.data_coleta || '';
          if (newTs >= curTs) porDia[dia] = h;
        }
      }

      const listaDiaria = Object.values(porDia).sort((a: any, b: any) => {
        return (a.data_coleta || '').localeCompare(b.data_coleta || '');
      });

      // Lista de todas as coletas válidas ordem cronológica
      const validHist = userHistory.filter((h: any) => Number(h.seguidores) > 0);
      const totalColetas = validHist.length;

      const atual = totalColetas > 0 ? validHist[totalColetas - 1] : null;
      const penultimo = totalColetas > 1 ? validHist[totalColetas - 2] : null;

      const seguidoresAtuais = atual ? Number(atual.seguidores) : 0;
      const postsAtuais = atual ? Number(atual.total_posts) : 0;

      // 1) Evolução na última atualização (diferença entre última e penúltima coleta real)
      let variacaoUltima = 0;
      if (atual && penultimo) {
        variacaoUltima = seguidoresAtuais - Number(penultimo.seguidores);
      }

      // 2) Evolução no dia (diferença entre o último valor de hoje e o último valor do dia anterior no histórico diário)
      let variacaoDia = 0;
      let postsDia = 0;

      if (listaDiaria.length > 1) {
        const ultDiario = listaDiaria[listaDiaria.length - 1];
        const penultDiario = listaDiaria[listaDiaria.length - 2];
        variacaoDia = Number(ultDiario.seguidores) - Number(penultDiario.seguidores);
        postsDia = Number(ultDiario.total_posts) - Number(penultDiario.total_posts);
      } else if (variacaoUltima !== 0) {
        variacaoDia = variacaoUltima;
      }

      const foto = p.foto_perfil_meta || p.foto_url || null;

      return {
        username: p.username,
        nome: p.nome || p.username,
        foto_url: foto,
        seguidores: seguidoresAtuais,
        total_posts: postsAtuais,
        variacao_ultima: variacaoUltima,
        variacao_dia: variacaoDia,
        posts_dia: postsDia > 0 ? postsDia : 0,
        ultima_coleta: atual ? atual.data_coleta : null
      };
    });

    // 4. Agendamentos: "O que tem pra fazer" vs "O que foi feito"
    // "O que tem pra fazer": automacao_agendamentos com status AGENDADO ou PUBLICANDO
    let aFazer: any[] = [];
    try {
      const rowsAFazer = await db.all(`
        SELECT 
          id, username, tipo_postagem, tipo_agendamento, data_especifica,
          data_inicio, data_fim, dias_selecionados, modo_hora, hora_fixa,
          hora_janela_inicio, hora_janela_fim, legenda, status, criado_em, arquivos
        FROM automacao_agendamentos
        WHERE status IN ('AGENDADO', 'PUBLICANDO')
        ORDER BY criado_em DESC
      `);

      aFazer = rowsAFazer.map((item: any) => ({
        ...item,
        arquivos: (() => {
          try { return JSON.parse(item.arquivos || '[]'); } catch { return []; }
        })(),
        dias_selecionados: (() => {
          try { return JSON.parse(item.dias_selecionados || '[]'); } catch { return []; }
        })()
      }));
    } catch (e) {
      aFazer = [];
    }

    // "O que foi feito": automacao_publicacoes recentes ou agendamentos PUBLICADOS
    let concluidos: any[] = [];
    try {
      const rowsFeitos = await db.all(`
        SELECT 
          id, agendamento_id, username, tipo_postagem, data_local, hora_local,
          publicado_em, status, meta_media_id, arquivos, legenda
        FROM automacao_publicacoes
        ORDER BY publicado_em DESC, data_local DESC, hora_local DESC
        LIMIT 15
      `);

      concluidos = rowsFeitos.map((item: any) => ({
        ...item,
        arquivos: (() => {
          try { return JSON.parse(item.arquivos || '[]'); } catch { return []; }
        })()
      }));
    } catch (e) {
      concluidos = [];
    }

    await db.close();

    return NextResponse.json({
      success: true,
      ultima_atualizacao: ultimaAtualizacao,
      perfis: perfisProcessados,
      agendamentos: {
        a_fazer: aFazer,
        concluidos: concluidos
      }
    });

  } catch (error: any) {
    console.error('Erro no /api/mobile/resumo:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
