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

    // 2. Perfis Monitorados da Equipe (Minhas Modelos)
    const perfis = await db.all(`
      SELECT 
        p.username,
        p.status,
        p.foto_url,
        p.foto_perfil_meta,
        cp.nome,
        cp.status as status_controle,
        cp.inicio
      FROM perfis_monitorados p
      LEFT JOIN controle_perfis cp ON LOWER(p.username) = LOWER(cp.username)
      WHERE p.meu_perfil = 1 OR cp.username IS NOT NULL
      ORDER BY p.username ASC
    `);

    // 3. Histórico dos Perfis para calcular:
    // - Variação na última atualização (diferença entre a última coleta e a penúltima)
    // - Variação no dia (diferença entre o valor atual e a primeira coleta do dia de hoje)
    // - Total de posts e novos posts no dia
    const historico = await db.all(`
      SELECT id, username, data_coleta, seguidores, total_posts
      FROM perfis_historico
      ORDER BY data_coleta ASC, id ASC
    `);

    // Agrupa histórico por username
    const histByUser: Record<string, any[]> = {};
    for (const h of historico) {
      const u = (h.username || '').toLowerCase();
      if (!histByUser[u]) histByUser[u] = [];
      histByUser[u].push(h);
    }

    const hojeStr = new Date().toISOString().split('T')[0];

    const perfisProcessados = perfis.map((p: any) => {
      const u = (p.username || '').toLowerCase();
      const userHistory = histByUser[u] || [];

      // Filtra coletas com seguidores válidos
      const validHist = userHistory.filter((h: any) => h.seguidores !== null && h.seguidores !== undefined && Number(h.seguidores) > 0);

      const totalColetas = validHist.length;
      const atual = totalColetas > 0 ? validHist[totalColetas - 1] : null;
      const penultimo = totalColetas > 1 ? validHist[totalColetas - 2] : null;

      const seguidoresAtuais = atual ? Number(atual.seguidores) : 0;
      const postsAtuais = atual ? Number(atual.total_posts) : 0;

      // 1) Evolução na última atualização
      let variacaoUltima = 0;
      if (atual && penultimo) {
        variacaoUltima = seguidoresAtuais - Number(penultimo.seguidores);
      }

      // 2) Evolução no dia de hoje
      const coletasHoje = validHist.filter((h: any) => (h.data_coleta || '').startsWith(hojeStr));
      let variacaoDia = 0;
      let postsDia = 0;

      if (coletasHoje.length > 0) {
        const primeiraHoje = coletasHoje[0];
        const ultimaHoje = coletasHoje[coletasHoje.length - 1];
        variacaoDia = Number(ultimaHoje.seguidores) - Number(primeiraHoje.seguidores);
        postsDia = Number(ultimaHoje.total_posts) - Number(primeiraHoje.total_posts);
      } else if (atual && penultimo && (atual.data_coleta || '').startsWith(hojeStr)) {
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
        posts_dia: postsDia,
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
